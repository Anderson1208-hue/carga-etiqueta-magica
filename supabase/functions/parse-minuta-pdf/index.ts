// Parse de PDF de Minuta (CT-e) via Lovable AI Gateway (Gemini)
// Extrai: numero_cte, chave_cte, chave_nf_referenciada, cnpj_emitente, razao_social_emitente, valor_frete

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface MinutaParsed {
  numeroCte: string;
  chaveCte: string;
  chaveNfReferenciada: string;
  cnpjEmitente: string;
  razaoSocialEmitente: string;
  valorFrete: number;
}

const SYSTEM_PROMPT = `Você é um extrator de dados de Minutas/CT-e brasileiros em PDF.
Extraia EXATAMENTE os campos pedidos, sem inventar dados.
Regras:
- "chave_cte": chave de acesso do CT-e (44 dígitos numéricos). Remova espaços e pontos.
- "chave_nf_referenciada": chave da NF-e referenciada/transportada (44 dígitos). Se houver múltiplas, retorne a primeira.
- "numero_cte": número do CT-e (apenas dígitos, sem zeros à esquerda).
- "cnpj_emitente": CNPJ da transportadora emitente do CT-e (14 dígitos, sem máscara).
- "razao_social_emitente": razão social da transportadora.
- "valor_frete": valor total da prestação do serviço (vTPrest), número decimal com ponto (ex: 123.45).
Se algum campo não for encontrado, retorne string vazia ou 0.
Responda APENAS com a função fornecida.`;

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
                text: `Extraia os dados desta minuta/CT-e (arquivo: ${fileName || "minuta.pdf"}).`,
              },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${pdfBase64}` },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "registrar_minuta",
              description: "Registra os dados extraídos da minuta/CT-e",
              parameters: {
                type: "object",
                properties: {
                  numero_cte: { type: "string" },
                  chave_cte: { type: "string" },
                  chave_nf_referenciada: { type: "string" },
                  cnpj_emitente: { type: "string" },
                  razao_social_emitente: { type: "string" },
                  valor_frete: { type: "number" },
                },
                required: [
                  "numero_cte",
                  "chave_cte",
                  "chave_nf_referenciada",
                  "cnpj_emitente",
                  "razao_social_emitente",
                  "valor_frete",
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
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Recarregue para continuar." }), {
          status: 402,
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
    const result: MinutaParsed = {
      numeroCte: String(args.numero_cte || "").replace(/\D/g, "").replace(/^0+/, "") || "",
      chaveCte: String(args.chave_cte || "").replace(/\D/g, ""),
      chaveNfReferenciada: String(args.chave_nf_referenciada || "").replace(/\D/g, ""),
      cnpjEmitente: String(args.cnpj_emitente || "").replace(/\D/g, ""),
      razaoSocialEmitente: String(args.razao_social_emitente || "").trim(),
      valorFrete: Number(args.valor_frete) || 0,
    };

    // Validações
    const errors: string[] = [];
    if (result.chaveCte.length !== 44) errors.push("chave_cte inválida (precisa 44 dígitos)");
    if (result.chaveNfReferenciada.length !== 44) errors.push("chave_nf_referenciada inválida");
    if (!result.numeroCte) errors.push("numero_cte vazio");

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
