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
const IBAC_API_URL = (Deno.env.get("IBAC_API_URL") ?? "").trim();
const IBAC_API_KEY = (Deno.env.get("IBAC_API_KEY") ?? "").trim();

const DEFAULT_MAX_TENTATIVAS = 5;
const BATCH_SIZE = 25;
// Compressão do canhoto antes do base64 (não altera o arquivo no bucket)
const MAX_LARGURA_PX = 1600;
const JPEG_QUALIDADE = 72;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Modo dry-run: se IBAC ainda não respondeu URL/Key, apenas retorna status da fila
  const credenciaisConfiguradas = !!IBAC_API_URL && !!IBAC_API_KEY;

  // Configuração de envio (kill switch + whitelist de NFs de teste + modo da imagem)
  const { data: envioCfg } = await supabase
    .from("ibac_config_envio")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  const envioAtivo = envioCfg?.envio_ativo ?? false;
  const modoImagem = envioCfg?.modo_imagem ?? "url";
  const whitelist: string[] = (envioCfg?.whitelist_nfs ?? []).map((v: string) => String(v).trim()).filter(Boolean);
  const codigoEventoEntrega = (envioCfg?.codigo_evento_entrega ?? "01").trim();
  const maxImagemKb = envioCfg?.max_imagem_kb ?? 1024;

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


  // Com whitelist ativa, filtra direto no banco pelas notas de teste
  // (evita que fiquem fora da janela por trás de eventos antigos).
  const janela = whitelist.length > 0 ? 1000 : BATCH_SIZE;

  let query = supabase
    .from("ibac_eventos_queue")
    .select("*")
    .eq("status", "pendente")
    .lt("tentativas", maxTentativas);

  if (whitelist.length > 0) {
    const lista = whitelist.map((v) => `"${v.replace(/"/g, "")}"`).join(",");
    query = query.or(`payload->>numero_nf.in.(${lista}),chave_acesso.in.(${lista})`);
  }

  const { data: pendentesRaw, error: errSelect } = await query
    .order("created_at", { ascending: true })
    .limit(janela);



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

  // KILL SWITCH: envio bloqueado até liberação manual (teste controlado)
  if (!envioAtivo) {
    return new Response(
      JSON.stringify({
        status: "envio_bloqueado",
        mensagem: "Envio à IBAC desativado em Integração IBAC → Envio. A fila continua acumulando sem perda.",
        pendentes_na_fila: pendentesRaw?.length ?? 0,
        whitelist_nfs: whitelist,
        modo_imagem: modoImagem,
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
  let pendentes = (pendentesRaw ?? []).filter((item) => {
    if (!backoffAtivo || item.tentativas === 0 || !item.ultima_tentativa_em) return true;
    const espera = Math.min(backoffBase * Math.pow(2, item.tentativas - 1), backoffMax) * 1000;
    return agora - new Date(item.ultima_tentativa_em).getTime() >= espera;
  });
  const adiados = (pendentesRaw?.length ?? 0) - pendentes.length;

  // Whitelist de NFs: se preenchida, só envia essas notas (teste controlado)
  let foraDaWhitelist = 0;
  if (whitelist.length > 0) {
    const antes = pendentes.length;
    pendentes = pendentes.filter((item) => {
      const numero = String((item.payload as any)?.numero_nf ?? "").trim();
      const chave = String(item.chave_acesso ?? "").trim();
      return whitelist.includes(numero) || whitelist.includes(chave);
    });
    foraDaWhitelist = antes - pendentes.length;
    pendentes = pendentes.slice(0, BATCH_SIZE);
  }


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

    const payload: Record<string, unknown> = { ...(item.payload as any) };
    let erroPreparo: string | null = null;

    // Canhoto: IBAC exige a imagem junto ao evento de entrega (cód. 01 por padrão).
    if (item.evento_interno === "envio_canhoto") {
      if (modoImagem === "base64" && payload.foto_path) {
        const { data: file, error: dlErr } = await supabase.storage
          .from("comprovantes")
          .download(String(payload.foto_path));
        if (dlErr || !file) {
          erroPreparo = `Falha ao baixar canhoto: ${dlErr?.message ?? "arquivo vazio"}`;
        } else {
          const originais = new Uint8Array(await file.arrayBuffer());
          const tamanhoOriginalKb = originais.byteLength / 1024;

          // Compacta antes do base64 (não altera a foto armazenada no bucket).
          // Largura máx. 1600px + JPEG q72: preserva legibilidade do canhoto para IA.
          let bytes = originais;
          let comprimida = false;
          if (originais.byteLength > maxImagemKb * 1024) {
            try {
              const { Image } = await import("https://deno.land/x/imagescript@1.2.15/mod.ts");
              const img = await Image.decode(originais);
              if (img.width > MAX_LARGURA_PX) {
                img.resize(MAX_LARGURA_PX, Image.RESIZE_AUTO);
              }
              const jpeg = await img.encodeJPEG(JPEG_QUALIDADE);
              if (jpeg.byteLength < originais.byteLength) {
                bytes = jpeg;
                comprimida = true;
              }
            } catch (e) {
              console.error("[ibac-sync] Falha ao comprimir canhoto:", e);
            }
          }

          const tamanhoFinalKb = bytes.byteLength / 1024;

          if (bytes.byteLength > maxImagemKb * 1024) {
            erroPreparo = `Imagem ${tamanhoFinalKb.toFixed(0)} KB excede o limite de ${maxImagemKb} KB (original ${tamanhoOriginalKb.toFixed(0)} KB${comprimida ? ", já comprimida" : ", compressão indisponível"}).`;
          } else {
            let bin = "";
            const CHUNK = 8192;
            for (let i = 0; i < bytes.length; i += CHUNK) {
              bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
            }
            payload.imagem_base64 = btoa(bin);
            payload.imagem_nome = String(payload.foto_path).split("/").pop();
            payload.imagem_mime = comprimida ? "image/jpeg" : (file.type || "image/jpeg");
            payload.imagem_kb = Number(tamanhoFinalKb.toFixed(0));
            payload.imagem_kb_original = Number(tamanhoOriginalKb.toFixed(0));
            delete payload.foto_url;
            delete payload.foto_url_expira_em;
          }
        }
      }
    }


    if (erroPreparo) {
      const statusPreparo = item.tentativas + 1 >= maxTentativas ? "erro" : "pendente";
      await supabase
        .from("ibac_eventos_queue")
        .update({
          status: statusPreparo,
          erro_mensagem: erroPreparo,
          tentativas: item.tentativas + 1,
          ultima_tentativa_em: new Date().toISOString(),
        })
        .eq("id", item.id);
      resultados.push({ id: item.id, sucesso: false });
      continue;
    }

    const body = {
      codigo_evento: item.evento_interno === "envio_canhoto" ? codigoEventoEntrega : codigoIbac,
      ...payload,
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
          "Api-Key": IBAC_API_KEY,
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

    const novoStatus = sucesso ? "enviado" : (item.tentativas + 1 >= maxTentativas ? "erro" : "pendente");

    await supabase
      .from("ibac_eventos_queue")
      .update({
        status: novoStatus,
        tentativas: item.tentativas + 1,
        ultima_tentativa_em: new Date().toISOString(),
        enviado_em: sucesso ? new Date().toISOString() : null,
        erro_mensagem: erroMsg,
      })
      .eq("id", item.id);

    // Reflete envio do canhoto em baixas_entrega
    if (item.evento_interno === "envio_canhoto" && item.baixa_id) {
      if (sucesso) {
        await supabase
          .from("baixas_entrega")
          .update({
            imagem_ibac_enviada_em: new Date().toISOString(),
            imagem_ibac_ultimo_erro: null,
          })
          .eq("id", item.baixa_id);
      } else if (novoStatus === "erro") {
        await supabase
          .from("baixas_entrega")
          .update({ imagem_ibac_ultimo_erro: erroMsg ?? "erro desconhecido" })
          .eq("id", item.baixa_id);
      }
    }

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
      adiados_por_backoff: adiados,
      fora_da_whitelist: foraDaWhitelist,
      modo_imagem: modoImagem,
      whitelist_ativa: whitelist.length > 0,

    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
