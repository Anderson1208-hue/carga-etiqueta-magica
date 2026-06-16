// Parse de PDF de Minuta de Transporte via Lovable AI Gateway (Gemini)
// Extrai dados de minutas de coleta/expedição (não confundir com CT-e completo).
// Campos extraídos: numero_minuta, numero_nf_referenciada, cnpj_emitente,
// razao_social_emitente, valor_frete. Chaves de 44 dígitos são opcionais.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface MinutaParsed {
  numeroMinuta: string;
  chaveCte: string; // opcional, vazio se não houver
  numeroNfReferenciada: string;
  chaveNfReferenciada: string; // opcional, vazio se não houver
  cnpjEmitente: string;
  razaoSocialEmitente: string;
  valorFrete: number;
  dataEmissao: string; // ISO date "YYYY-MM-DD" ou ""
}

const SYSTEM_PROMPT = `Você é um extrator de dados de Minutas de Transporte brasileiras em PDF.
Estas minutas (também chamadas de "minuta de coleta", "minuta de expedição" ou "via UNI")
NÃO são CT-e completos — geralmente trazem apenas números, sem chaves de 44 dígitos.

Extraia EXATAMENTE os campos solicitados, sem inventar dados:

- "numero_minuta": número da minuta/UNI (ex: "000003187" → retorne "3187", apenas dígitos sem zeros à esquerda).
- "chave_cte": chave de acesso do CT-e SE existir explicitamente no documento (44 dígitos numéricos).
   Se NÃO existir uma sequência de 44 dígitos rotulada como chave/CT-e, retorne string vazia "".
- "numero_nf_referenciada": número da Nota Fiscal transportada/referenciada
   (ex: "0000107164" → retorne "107164", apenas dígitos sem zeros à esquerda).
   Se houver múltiplas NFs, retorne a primeira.
- "chave_nf_referenciada": chave de acesso da NF-e SE existir (44 dígitos). Caso contrário, "".
- "cnpj_emitente": CNPJ da transportadora emitente da minuta (14 dígitos, sem máscara).
- "razao_social_emitente": razão social da transportadora emitente.
- "valor_frete": valor do frete em decimal com ponto (ex: "R$ 75,14" → 75.14). 0 se ausente.
- "data_emissao": data de emissão da minuta no formato ISO "YYYY-MM-DD" (ex: "29/04/2026" → "2026-04-29"). Vazio se ausente.

NUNCA invente uma chave de 44 dígitos. Se não houver no documento, retorne string vazia.
Responda APENAS através da função fornecida.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { pdfBase64, fileName } = await req.json();
    if (!pdfBase64) {
      return new Response(JSON.stringify({ error: "pdfBase64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extraia os dados desta minuta de transporte (arquivo: ${fileName || "minuta.pdf"}).`,
              },
              {
                type: "file",
                file: {
                  filename: fileName || "minuta.pdf",
                  file_data: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "registrar_minuta",
              description: "Registra os dados extraídos da minuta de transporte",
              parameters: {
                type: "object",
                properties: {
                  numero_minuta: { type: "string", description: "Número da minuta/UNI sem zeros à esquerda" },
                  chave_cte: { type: "string", description: "Chave CT-e 44 dígitos OU string vazia" },
                  numero_nf_referenciada: { type: "string", description: "Número da NF sem zeros à esquerda" },
                  chave_nf_referenciada: { type: "string", description: "Chave NF-e 44 dígitos OU string vazia" },
                  cnpj_emitente: { type: "string" },
                  razao_social_emitente: { type: "string" },
                  valor_frete: { type: "number" },
                  data_emissao: { type: "string", description: "Data emissão YYYY-MM-DD ou vazio" },
                },
                required: [
                  "numero_minuta",
                  "chave_cte",
                  "numero_nf_referenciada",
                  "chave_nf_referenciada",
                  "cnpj_emitente",
                  "razao_social_emitente",
                  "valor_frete",
                  "data_emissao",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "registrar_minuta" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI Gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso atingido. Tente novamente em instantes." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Recarregue para continuar." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Falha na IA: " + errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "IA não retornou dados estruturados" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const args = JSON.parse(toolCall.function.arguments);

    const numeroMinuta = String(args.numero_minuta || "").replace(/\D/g, "").replace(/^0+/, "");
    const numeroNf = String(args.numero_nf_referenciada || "").replace(/\D/g, "").replace(/^0+/, "");
    const chaveCteRaw = String(args.chave_cte || "").replace(/\D/g, "");
    const chaveNfRaw = String(args.chave_nf_referenciada || "").replace(/\D/g, "");

    // Normaliza data: aceita YYYY-MM-DD ou DD/MM/YYYY
    let dataEmissao = String(args.data_emissao || "").trim();
    const brMatch = dataEmissao.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) dataEmissao = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEmissao)) dataEmissao = "";

    const result: MinutaParsed = {
      numeroMinuta,
      // Aceita chave somente se tiver exatamente 44 dígitos
      chaveCte: chaveCteRaw.length === 44 ? chaveCteRaw : "",
      numeroNfReferenciada: numeroNf,
      chaveNfReferenciada: chaveNfRaw.length === 44 ? chaveNfRaw : "",
      cnpjEmitente: String(args.cnpj_emitente || "").replace(/\D/g, ""),
      razaoSocialEmitente: String(args.razao_social_emitente || "").trim(),
      valorFrete: Number(args.valor_frete) || 0,
      dataEmissao,
    };

    // Validações: minuta precisa ter ao menos número da minuta e número da NF
    const errors: string[] = [];
    if (!result.numeroMinuta) errors.push("número da minuta não encontrado");
    if (!result.numeroNfReferenciada) errors.push("número da NF referenciada não encontrado");

    return new Response(JSON.stringify({ data: result, warnings: errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("parse-minuta-pdf error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
