// Edge function: ibac-sync
// Processa a fila ibac_eventos_queue e envia eventos para a API da IBAC.
// Requer secrets: IBAC_API_URL, IBAC_API_KEY (configuráveis após resposta da IBAC).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IBAC_API_URL = Deno.env.get("IBAC_API_URL") ?? "";
const IBAC_API_KEY = Deno.env.get("IBAC_API_KEY") ?? "";

const MAX_TENTATIVAS = 5;
const BATCH_SIZE = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Modo dry-run: se IBAC ainda não respondeu URL/Key, apenas retorna status da fila
  const credenciaisConfiguradas = !!IBAC_API_URL && !!IBAC_API_KEY;

  const { data: pendentes, error: errSelect } = await supabase
    .from("ibac_eventos_queue")
    .select("*")
    .eq("status", "pendente")
    .lt("tentativas", MAX_TENTATIVAS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (errSelect) {
    return new Response(JSON.stringify({ error: errSelect.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!credenciaisConfiguradas) {
    return new Response(
      JSON.stringify({
        status: "aguardando_configuracao",
        mensagem: "Defina os secrets IBAC_API_URL e IBAC_API_KEY para iniciar o envio.",
        pendentes_na_fila: pendentes?.length ?? 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Buscar de-para uma única vez
  const { data: deParaList } = await supabase
    .from("ibac_de_para_eventos")
    .select("evento_interno, codigo_ibac, ativo");

  const deParaMap = new Map(
    (deParaList ?? [])
      .filter((d) => d.ativo && d.codigo_ibac)
      .map((d) => [d.evento_interno, d.codigo_ibac]),
  );

  const resultados: Array<{ id: string; sucesso: boolean }> = [];

  for (const item of pendentes ?? []) {
    const codigoIbac = deParaMap.get(item.evento_interno);
    if (!codigoIbac) {
      await supabase
        .from("ibac_eventos_queue")
        .update({
          status: "erro",
          erro_mensagem: `Evento "${item.evento_interno}" sem código IBAC mapeado.`,
          tentativas: item.tentativas + 1,
          ultima_tentativa_em: new Date().toISOString(),
        })
        .eq("id", item.id);
      resultados.push({ id: item.id, sucesso: false });
      continue;
    }

    const body = {
      codigo_evento: codigoIbac,
      ...item.payload,
    };

    const t0 = Date.now();
    let respStatus = 0;
    let respBody: unknown = null;
    let sucesso = false;
    let erroMsg: string | null = null;

    try {
      const resp = await fetch(IBAC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${IBAC_API_KEY}`,
        },
        body: JSON.stringify(body),
      });
      respStatus = resp.status;
      respBody = await resp.json().catch(() => ({}));
      sucesso = resp.ok;
      if (!resp.ok) erroMsg = `HTTP ${resp.status}`;
    } catch (e) {
      erroMsg = e instanceof Error ? e.message : String(e);
    }

    const duracao = Date.now() - t0;

    await supabase.from("ibac_log_envios").insert({
      queue_id: item.id,
      endpoint: IBAC_API_URL,
      request_body: body,
      response_status: respStatus,
      response_body: respBody as any,
      duracao_ms: duracao,
      sucesso,
    });

    await supabase
      .from("ibac_eventos_queue")
      .update({
        status: sucesso ? "enviado" : (item.tentativas + 1 >= MAX_TENTATIVAS ? "erro" : "pendente"),
        tentativas: item.tentativas + 1,
        ultima_tentativa_em: new Date().toISOString(),
        enviado_em: sucesso ? new Date().toISOString() : null,
        erro_mensagem: erroMsg,
      })
      .eq("id", item.id);

    resultados.push({ id: item.id, sucesso });
  }

  return new Response(
    JSON.stringify({
      processados: resultados.length,
      sucessos: resultados.filter((r) => r.sucesso).length,
      falhas: resultados.filter((r) => !r.sucesso).length,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
