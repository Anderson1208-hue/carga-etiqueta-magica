// Edge function: validar-canhoto
// Recebe { baixa_id } - busca foto_path + NF esperada, chama Lovable AI Gateway (Gemini),
// extrai número da NF impresso no canhoto e compara. Grava resultado no banco.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ValidacaoResult = {
  score: number;
  status: "ok" | "alerta" | "ruim";
  problemas: string[];
  observacoes: string;
  numero_nf_detectado: string | null;
};

const SYSTEM_PROMPT = `Você é um auditor RIGOROSO de comprovantes de entrega (canhotos de nota fiscal) no Brasil.
Analise a imagem e avalie se o canhoto serve como PROVA DE ENTREGA válida.

REGRAS DE REPROVAÇÃO AUTOMÁTICA — se QUALQUER uma for atingida, status OBRIGATORIAMENTE "ruim" e score no máximo 30:
1. NÚMERO DA NF ausente, cortado pela borda da foto ou ilegível.
2. DATA do recebimento/emissão ausente, cortada pela borda da foto ou ilegível.
3. SEM ASSINATURA visível do recebedor (sem rabisco, sem traço, sem nome manuscrito). Carimbo sozinho NÃO substitui assinatura.
4. NITIDEZ da foto abaixo de 50% (borrada, tremida, muito escura, fora de foco, dedo na lente, ou imagem que não é um canhoto).
5. Canhoto cortado pelas bordas da foto — qualquer lateral faltando.

Justificativa: um canhoto sem número da NF, sem data, sem assinatura ou ilegível não tem valor como comprovante.

Se NENHUMA regra de reprovação for atingida, calcule o score (total 100):
1. ENQUADRAMENTO COMPLETO do canhoto, sem cortes — até 30 pts.
2. NÚMERO DA NF visível e legível — até 25 pts.
3. DATA visível e legível — até 20 pts.
4. ASSINATURA do recebedor (carimbo adicional bonifica) — até 15 pts.
5. NITIDEZ geral (foco, iluminação, contraste) — até 10 pts.

Classificação final:
- "ok": score >= 75 E nenhuma regra de reprovação atingida.
- "alerta": score entre 50 e 74, sem regra de reprovação.
- "ruim": qualquer regra de reprovação atingida, OU score < 50.

ADICIONALMENTE: leia o número da Nota Fiscal impresso no canhoto (6 a 9 dígitos). Retorne em "numero_nf_detectado" SOMENTE os dígitos (sem pontos, zeros à esquerda removidos). Se não conseguir ler com confiança, retorne null.

Liste problemas concretos encontrados, sendo ESPECÍFICO. Exemplos:
- "Número da NF cortado pela borda direita"
- "Data do recebimento não visível"
- "Sem assinatura do recebedor"
- "Foto borrada — nitidez insuficiente"
- "Canhoto cortado: lateral esquerda fora da foto"
- "Imagem não parece um canhoto"

Responda APENAS em JSON com este formato exato:
{"score": <0-100>, "status": "ok"|"alerta"|"ruim", "problemas": ["..."], "observacoes": "uma frase curta", "numero_nf_detectado": "<digitos>" | null}`;

async function validarComIA(imageUrl: string): Promise<ValidacaoResult> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Avalie este canhoto e extraia o número da NF impresso:" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`AI gateway ${response.status}: ${txt}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia do modelo");

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Resposta não-JSON: " + content.slice(0, 200));
    parsed = JSON.parse(match[0]);
  }

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  let status: ValidacaoResult["status"] = "ruim";
  if (score >= 75) status = "ok";
  else if (score >= 50) status = "alerta";

  let nfDet: string | null = null;
  if (parsed.numero_nf_detectado != null) {
    const onlyDigits = String(parsed.numero_nf_detectado).replace(/\D/g, "").replace(/^0+/, "");
    if (onlyDigits.length >= 3) nfDet = onlyDigits;
  }

  return {
    score,
    status,
    problemas: Array.isArray(parsed.problemas) ? parsed.problemas.slice(0, 10) : [],
    observacoes: typeof parsed.observacoes === "string" ? parsed.observacoes : "",
    numero_nf_detectado: nfDet,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { baixa_id } = await req.json();
    if (!baixa_id || typeof baixa_id !== "string") {
      return new Response(JSON.stringify({ error: "baixa_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: baixa, error: bErr } = await supabase
      .from("baixas_entrega")
      .select("id, foto_path, nf_id, notas_fiscais:nf_id(numero_nf)")
      .eq("id", baixa_id)
      .maybeSingle();

    if (bErr || !baixa) {
      return new Response(JSON.stringify({ error: "Baixa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!baixa.foto_path) {
      return new Response(JSON.stringify({ error: "Sem foto para validar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const numeroNfEsperado = (baixa as any).notas_fiscais?.numero_nf
      ? String((baixa as any).notas_fiscais.numero_nf).replace(/\D/g, "").replace(/^0+/, "")
      : null;

    const { data: signed, error: sErr } = await supabase.storage
      .from("comprovantes")
      .createSignedUrl(baixa.foto_path, 300);

    if (sErr || !signed?.signedUrl) {
      throw new Error("Falha ao gerar URL da foto");
    }

    const result = await validarComIA(signed.signedUrl);

    // Cross-check NF detectada vs esperada
    let status = result.status;
    const problemas = [...result.problemas];
    let nfMatch: "ok" | "divergente" | "nao_detectado" = "nao_detectado";

    if (result.numero_nf_detectado && numeroNfEsperado) {
      if (result.numero_nf_detectado === numeroNfEsperado) {
        nfMatch = "ok";
      } else {
        nfMatch = "divergente";
        status = "ruim";
        problemas.unshift(
          `NF divergente: canhoto mostra ${result.numero_nf_detectado}, esperado ${numeroNfEsperado}`,
        );
      }
    }

    await supabase
      .from("baixas_entrega")
      .update({
        validacao_score: result.score,
        validacao_status: status,
        validacao_problemas: {
          lista: problemas,
          observacoes: result.observacoes,
          numero_nf_detectado: result.numero_nf_detectado,
          numero_nf_esperado: numeroNfEsperado,
          nf_match: nfMatch,
        },
        validacao_em: new Date().toISOString(),
      })
      .eq("id", baixa_id);

    return new Response(
      JSON.stringify({ success: true, ...result, status, nf_match: nfMatch }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("validar-canhoto erro:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
