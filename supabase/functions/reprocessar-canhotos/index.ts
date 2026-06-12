// Reprocessa em lote a validação de canhotos com o critério novo.
// Cada chamada processa até `limit` baixas que ainda têm validacao_em <= validacao_em_v1
// (ou seja, não foram reavaliadas após o snapshot).
// Chama a edge function `validar-canhoto` para cada uma, com pequeno delay.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 25, 1), 100);
    const delayMs = Math.max(Number(body?.delay_ms) || 1100, 200);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Busca baixas com foto que ainda não foram reavaliadas no critério novo.
    // Critério "pendente": validacao_em_v1 existe (foi avaliada antes) e
    // validacao_em IS NULL OR validacao_em <= validacao_em_v1
    const { data: pendentes, error: errSel } = await supabase
      .from("baixas_entrega")
      .select("id, validacao_em, validacao_em_v1")
      .not("foto_path", "is", null)
      .not("validacao_em_v1", "is", null)
      .or("validacao_em.is.null,validacao_em.lte.validacao_em_v1")
      .order("registrado_em", { ascending: true })
      .limit(limit);

    if (errSel) throw errSel;

    const lote = (pendentes ?? []).filter((b) =>
      !b.validacao_em || (b.validacao_em_v1 && new Date(b.validacao_em) <= new Date(b.validacao_em_v1)),
    );

    let ok = 0;
    let falhas = 0;
    const erros: { id: string; erro: string }[] = [];

    for (const baixa of lote) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/validar-canhoto`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({ baixa_id: baixa.id }),
        });
        if (!r.ok) {
          falhas++;
          erros.push({ id: baixa.id, erro: `HTTP ${r.status}` });
        } else {
          ok++;
        }
      } catch (e) {
        falhas++;
        erros.push({ id: baixa.id, erro: e instanceof Error ? e.message : "erro" });
      }
      await sleep(delayMs);
    }

    // Quantas ainda faltam após este lote?
    const { count: restantes } = await supabase
      .from("baixas_entrega")
      .select("id", { count: "exact", head: true })
      .not("foto_path", "is", null)
      .not("validacao_em_v1", "is", null)
      .or("validacao_em.is.null,validacao_em.lte.validacao_em_v1");

    return new Response(
      JSON.stringify({
        processadas: lote.length,
        ok,
        falhas,
        restantes: restantes ?? 0,
        erros: erros.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("reprocessar-canhotos erro:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
