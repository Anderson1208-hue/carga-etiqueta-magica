// Edge function: okentrega-sync
// Processa okentrega_queue e envia baixas de entrega (IOD + POD) para a OK Entrega.
//
// Fluxo por execução:
//  1. Obtém/renova TOKEN via ws.0.loginapp.php (cache em okentrega_token, TTL 14 dias)
//  2. Para cada item pendente: baixa a foto do canhoto, converte para JPEG 1536x240 @150dpi
//  3. POST em ws.0.ocorrenciaentregacache_api.php?access_token=...
//  4. Grava retorno (ocorrenciaentregaId, statusbaixa, statuscomprovante, motivorecusa)
//
// Secrets: OKENTREGA_EMAIL_HOMOLOG/PASSWORD_HOMOLOG, OKENTREGA_EMAIL_PRODUCAO/PASSWORD_PRODUCAO
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { prepararCanhoto, paraBase64, type ModoImagem } from "../_shared/okentrega-image.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BASES = {
  homolog: "https://hml.okentrega.com.br/assets/ws",
  producao: "https://www.okentrega.com.br/assets/ws",
} as const;

// 1 item por invocação: o preparo da imagem (decode + resize) é pesado em memória
// e o worker estoura o limite de recursos se acumular mais de um canhoto por run.
const BATCH_SIZE = 1;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function credenciais(ambiente: string) {
  if (ambiente === "producao") {
    return {
      email: (Deno.env.get("OKENTREGA_EMAIL_PRODUCAO") ?? "").trim(),
      password: (Deno.env.get("OKENTREGA_PASSWORD_PRODUCAO") ?? "").trim(),
    };
  }
  return {
    email: (Deno.env.get("OKENTREGA_EMAIL_HOMOLOG") ?? "").trim(),
    password: (Deno.env.get("OKENTREGA_PASSWORD_HOMOLOG") ?? "").trim(),
  };
}

async function obterToken(supabase: any, ambiente: "homolog" | "producao") {
  const { data: cache } = await supabase
    .from("okentrega_token")
    .select("*")
    .eq("ambiente", ambiente)
    .maybeSingle();

  // margem de 1h antes do vencimento
  if (cache?.token && new Date(cache.expira_em).getTime() - Date.now() > 3_600_000) {
    return { token: cache.token as string, renovado: false };
  }

  const { email, password } = credenciais(ambiente);
  if (!email || !password) throw new Error(`Credenciais OK Entrega ausentes para o ambiente ${ambiente}`);

  const resp = await fetch(`${BASES[ambiente]}/ws.0.loginapp.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const texto = await resp.text();
  let body: any = {};
  try {
    body = JSON.parse(texto);
  } catch {
    throw new Error(`Login OK Entrega retornou resposta não-JSON (HTTP ${resp.status}): ${texto.slice(0, 200)}`);
  }
  if (!resp.ok || !body?.id) {
    throw new Error(`Login OK Entrega falhou (HTTP ${resp.status}): ${texto.slice(0, 200)}`);
  }

  const ttlSeg = Number(body.ttl ?? 1209600);
  const expira = new Date(Date.now() + ttlSeg * 1000).toISOString();

  await supabase
    .from("okentrega_token")
    .upsert({ ambiente, token: body.id, expira_em: expira }, { onConflict: "ambiente" });

  return { token: body.id as string, renovado: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let opts: {
    dry_run?: boolean;
    limite?: number;
    queue_id?: string;
    testar_login?: boolean;
    // Imagem já ajustada (1536x240 @150dpi) pelo cliente. Evita decodificar
    // fotos de 12 MP aqui dentro, o que estoura o limite de CPU do worker.
    imagem_base64?: string;
  } = {};
  try {
    opts = (await req.json()) ?? {};
  } catch {
    opts = {};
  }

  const { data: cfg } = await supabase
    .from("okentrega_config")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  const ambiente = ((cfg?.ambiente ?? "homolog") === "producao" ? "producao" : "homolog") as
    | "homolog"
    | "producao";
  const envioAtivo = cfg?.envio_ativo ?? false;
  const modoImagem = (cfg?.modo_imagem ?? "contain") as ModoImagem;
  const maxTentativas = cfg?.max_tentativas ?? 5;
  const entregadorId = ambiente === "producao" ? cfg?.entregador_id_producao : cfg?.entregador_id_homolog;
  const cnpjTransportadora = String(cfg?.cnpj_transportadora ?? "").replace(/\D/g, "");
  const whitelist: string[] = (cfg?.whitelist_nfs ?? []).map((v: string) => String(v).trim()).filter(Boolean);

  const dryRun = !!opts.dry_run;

  // Teste isolado de credenciais: faz login e informa só se obteve token (nunca expõe o valor)
  if (opts.testar_login) {
    try {
      const t = await obterToken(supabase, ambiente);
      const { data: cache } = await supabase
        .from("okentrega_token")
        .select("expira_em")
        .eq("ambiente", ambiente)
        .maybeSingle();
      return json({
        status: "login_ok",
        ambiente,
        token_renovado: t.renovado,
        token_expira_em: cache?.expira_em ?? null,
      });
    } catch (e) {
      return json(
        { status: "login_falhou", ambiente, mensagem: e instanceof Error ? e.message : String(e) },
        502,
      );
    }
  }


  if (!entregadorId) {
    return json({ status: "config_incompleta", mensagem: `Informe o entregadorId de ${ambiente}.` }, 400);
  }
  if (!cnpjTransportadora) {
    return json({ status: "config_incompleta", mensagem: "Informe o CNPJ da transportadora (emitente do CT-e)." }, 400);
  }

  let q = supabase
    .from("okentrega_queue")
    .select("*")
    .eq("status", "pendente")
    .lt("tentativas", maxTentativas)
    .order("created_at", { ascending: true })
    .limit(whitelist.length > 0 ? 500 : BATCH_SIZE);

  if (opts.queue_id) q = supabase.from("okentrega_queue").select("*").eq("id", opts.queue_id).limit(1);

  const { data: pendentesRaw, error: errSelect } = await q;
  if (errSelect) return json({ error: errSelect.message }, 500);

  let pendentes = pendentesRaw ?? [];
  let foraDaWhitelist = 0;
  if (whitelist.length > 0 && !opts.queue_id) {
    const antes = pendentes.length;
    pendentes = pendentes.filter(
      (i) => whitelist.includes(String(i.numero_nf ?? "").trim()) || whitelist.includes(String(i.chave_acesso ?? "").trim()),
    );
    foraDaWhitelist = antes - pendentes.length;
    pendentes = pendentes.slice(0, BATCH_SIZE);
  }

  if (!envioAtivo && !dryRun) {
    return json({
      status: "envio_bloqueado",
      mensagem: "Envio à OK Entrega desativado. A fila continua acumulando sem perda.",
      ambiente,
      pendentes_na_fila: pendentes.length,
      whitelist_nfs: whitelist,
    });
  }

  let token = "";
  if (!dryRun) {
    try {
      const t = await obterToken(supabase, ambiente);
      token = t.token;
    } catch (e) {
      return json({ status: "erro_login", mensagem: e instanceof Error ? e.message : String(e) }, 502);
    }
  }

  const endpoint = `${BASES[ambiente]}/ws.0.ocorrenciaentregacache_api.php`;
  const resultados: Array<{ id: string; sucesso: boolean; status_baixa?: string | null }> = [];
  const amostras: unknown[] = [];

  for (const item of pendentes) {
    const p = (item.payload ?? {}) as any;
    let erroPreparo: string | null = null;
    const fotos: Array<Record<string, string>> = [];

    if (opts.imagem_base64) {
      fotos.push({
        tipofoto: "C",
        foto: opts.imagem_base64.startsWith("data:")
          ? opts.imagem_base64
          : `data:image/jpeg;base64,${opts.imagem_base64}`,
        mime: "data:image/jpeg;base64",
        extensao: "jpeg",
      });
    } else if (p.foto_path) {
      const { data: file, error: dlErr } = await supabase.storage
        .from("comprovantes")
        .download(String(p.foto_path));
      if (dlErr || !file) {
        erroPreparo = `Falha ao baixar canhoto: ${dlErr?.message ?? "arquivo vazio"}`;
      } else {
        try {
          const { bytes } = await prepararCanhoto(new Uint8Array(await file.arrayBuffer()), modoImagem);
          fotos.push({
            tipofoto: "C",
            foto: `data:image/jpeg;base64,${paraBase64(bytes)}`,
            mime: "data:image/jpeg;base64",
            extensao: "jpeg",
          });
        } catch (e) {
          erroPreparo = `Falha ao preparar imagem 1536x240: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    } else {
      erroPreparo = "Baixa sem foto de canhoto — a OK Entrega recusaria o comprovante.";
    }

    if (erroPreparo) {
      if (!dryRun) {
        const statusPreparo = item.tentativas + 1 >= maxTentativas ? "erro" : "pendente";
        await supabase
          .from("okentrega_queue")
          .update({
            status: statusPreparo,
            erro_mensagem: erroPreparo,
            tentativas: item.tentativas + 1,
            ultima_tentativa_em: new Date().toISOString(),
          })
          .eq("id", item.id);
        if (item.baixa_id) {
          await supabase
            .from("baixas_entrega")
            .update({
              okentrega_ultimo_erro: erroPreparo,
              okentrega_tentativas: (item.tentativas ?? 0) + 1,
            })
            .eq("id", item.baixa_id);
        }
      }
      resultados.push({ id: item.id, sucesso: false });
      continue;
    }

    const body = {
      documento: String(item.chave_acesso ?? p.documento ?? "").replace(/\D/g, ""),
      tipoocorrenciaId: item.tipo_ocorrencia_id ?? 1,
      tipoentrega: item.tipo_entrega ?? "F",
      cnpjtransportadora: cnpjTransportadora,
      entregadorId: Number(entregadorId),
      dtentrega: new Date(p.dtentrega ?? p.registrado_em ?? item.created_at).toISOString(),
      dtreentrega: null,
      dtsinistro: null,
      dtregistro: new Date(p.registrado_em ?? item.created_at).toISOString(),
      tipoentrada: "I",
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      motivoocorrenciaId: null,
      ocorrenciaentregafoto: fotos,
    };

    if (dryRun) {
      amostras.push({
        queue_id: item.id,
        numero_nf: item.numero_nf,
        request: { ...body, ocorrenciaentregafoto: fotos.map((f) => ({ ...f, foto: `${f.foto.slice(0, 120)}...[${f.foto.length} chars]` })) },
      });
      resultados.push({ id: item.id, sucesso: true });
      continue;
    }

    const t0 = Date.now();
    let respStatus = 0;
    let respBody: any = null;
    let sucesso = false;
    let erroMsg: string | null = null;

    try {
      const resp = await fetch(`${endpoint}?access_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      respStatus = resp.status;
      const texto = await resp.text();
      try {
        respBody = JSON.parse(texto);
      } catch {
        respBody = { raw: texto.slice(0, 2000) };
      }
      sucesso = resp.ok;
      if (!resp.ok) erroMsg = `HTTP ${resp.status}`;
    } catch (e) {
      erroMsg = e instanceof Error ? e.message : String(e);
    }

    await supabase.from("okentrega_log_envios").insert({
      queue_id: item.id,
      endpoint,
      request_body: { ...body, ocorrenciaentregafoto: fotos.map((f) => ({ tipofoto: f.tipofoto, mime: f.mime, extensao: f.extensao, bytes_base64: f.foto.length })) },
      response_status: respStatus,
      response_body: respBody,
      duracao_ms: Date.now() - t0,
      sucesso,
    });

    const novoStatus = sucesso ? "enviado" : item.tentativas + 1 >= maxTentativas ? "erro" : "pendente";
    const statusBaixa = respBody?.statusbaixa ?? null;
    const statusComprovante = respBody?.statuscomprovante != null ? String(respBody.statuscomprovante) : null;

    await supabase
      .from("okentrega_queue")
      .update({
        status: novoStatus,
        tentativas: item.tentativas + 1,
        ultima_tentativa_em: new Date().toISOString(),
        enviado_em: sucesso ? new Date().toISOString() : null,
        erro_mensagem: erroMsg,
        ocorrencia_entrega_id: respBody?.ocorrenciaentregaId ?? null,
        status_baixa: statusBaixa,
        status_comprovante: statusComprovante,
        motivo_recusa: respBody?.motivorecusa ?? null,
      })
      .eq("id", item.id);

    if (item.baixa_id) {
      if (sucesso) {
        await supabase
          .from("baixas_entrega")
          .update({ okentrega_enviada_em: new Date().toISOString(), okentrega_ultimo_erro: null })
          .eq("id", item.baixa_id);
      } else {
        await supabase
          .from("baixas_entrega")
          .update({
            okentrega_ultimo_erro: erroMsg ?? "erro desconhecido",
            okentrega_tentativas: (item.tentativas ?? 0) + 1,
          })
          .eq("id", item.baixa_id);
      }
    }

    resultados.push({ id: item.id, sucesso, status_baixa: statusBaixa });
  }

  return json({
    status: dryRun ? "dry_run" : "ok",
    ambiente,
    endpoint,
    processados: resultados.length,
    sucessos: resultados.filter((r) => r.sucesso).length,
    falhas: resultados.filter((r) => !r.sucesso).length,
    fora_da_whitelist: foraDaWhitelist,
    restantes: Math.max(0, (pendentesRaw?.length ?? 0) - resultados.length - foraDaWhitelist),
    modo_imagem: modoImagem,
    resultados,
    ...(dryRun ? { amostras } : {}),
  });
});
