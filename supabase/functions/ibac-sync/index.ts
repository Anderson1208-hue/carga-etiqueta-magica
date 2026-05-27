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

const DEFAULT_MAX_TENTATIVAS = 5;
const BATCH_SIZE = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Modo dry-run: se IBAC ainda não respondeu URL/Key, apenas retorna status da fila
  const credenciaisConfiguradas = !!IBAC_API_URL && !!IBAC_API_KEY;

  // Carrega política de retry configurável
  const { data: retryCfg } = await supabase
    .from("ibac_config_retry")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  const maxTentativas = retryCfg?.max_tentativas ?? DEFAULT_MAX_TENTATIVAS;
  const backoffBase = retryCfg?.backoff_base_segundos ?? 60;
  const backoffMax = retryCfg?.backoff_max_segundos ?? 3600;
  const backoffAtivo = retryCfg?.ativo ?? true;

  const { data: pendentesRaw, error: errSelect } = await supabase
    .from("ibac_eventos_queue")
    .select("*")
    .eq("status", "pendente")
    .lt("tentativas", maxTentativas)
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
        pendentes_na_fila: pendentesRaw?.length ?? 0,
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

  // Aplica backoff exponencial: pula itens cuja próxima janela ainda não chegou
  const agora = Date.now();
  const pendentes = (pendentesRaw ?? []).filter((item) => {
    if (!backoffAtivo || item.tentativas === 0 || !item.ultima_tentativa_em) return true;
    const espera = Math.min(backoffBase * Math.pow(2, item.tentativas - 1), backoffMax) * 1000;
    return agora - new Date(item.ultima_tentativa_em).getTime() >= espera;
  });
  const adiados = (pendentesRaw?.length ?? 0) - pendentes.length;

  const resultados: Array<{ id: string; sucesso: boolean }> = [];

  for (const item of pendentes) {
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
        status: sucesso ? "enviado" : (item.tentativas + 1 >= maxTentativas ? "erro" : "pendente"),
        tentativas: item.tentativas + 1,
        ultima_tentativa_em: new Date().toISOString(),
        enviado_em: sucesso ? new Date().toISOString() : null,
        erro_mensagem: erroMsg,
      })
      .eq("id", item.id);

    resultados.push({ id: item.id, sucesso });
  }

  // -------- Verificação de alertas automáticos --------
  try {
    const { data: cfg } = await supabase
      .from("ibac_config_alertas")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (cfg?.ativo) {
      const cooldownMs = (cfg.cooldown_minutos ?? 30) * 60_000;
      const cooldownIso = new Date(Date.now() - cooldownMs).toISOString();

      // 1) Fila pendente muito alta
      const { count: pendentesCount } = await supabase
        .from("ibac_eventos_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente");

      if ((pendentesCount ?? 0) >= (cfg.limite_pendentes ?? 100)) {
        const { data: jaExiste } = await supabase
          .from("ibac_alertas")
          .select("id")
          .eq("tipo", "fila_pendentes_alta")
          .gte("created_at", cooldownIso)
          .limit(1);
        if (!jaExiste || jaExiste.length === 0) {
          await supabase.from("ibac_alertas").insert({
            tipo: "fila_pendentes_alta",
            mensagem: `Fila IBAC com ${pendentesCount} eventos pendentes (limite: ${cfg.limite_pendentes}).`,
            valor_atual: pendentesCount,
            limite: cfg.limite_pendentes,
          });
        }
      }

      // 2) Taxa de erro alta nos últimos 15 minutos
      const quinzeMinAtras = new Date(Date.now() - 15 * 60_000).toISOString();
      const { count: errosCount } = await supabase
        .from("ibac_log_envios")
        .select("id", { count: "exact", head: true })
        .eq("sucesso", false)
        .gte("created_at", quinzeMinAtras);

      if ((errosCount ?? 0) >= (cfg.limite_erros_15min ?? 10)) {
        const { data: jaExiste } = await supabase
          .from("ibac_alertas")
          .select("id")
          .eq("tipo", "erros_alta_taxa")
          .gte("created_at", cooldownIso)
          .limit(1);
        if (!jaExiste || jaExiste.length === 0) {
          await supabase.from("ibac_alertas").insert({
            tipo: "erros_alta_taxa",
            mensagem: `${errosCount} falhas de envio à IBAC nos últimos 15 minutos (limite: ${cfg.limite_erros_15min}).`,
            valor_atual: errosCount,
            limite: cfg.limite_erros_15min,
          });
        }
      }
    }
  } catch (err) {
    console.error("[ibac-sync] Falha ao verificar alertas:", err);
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
