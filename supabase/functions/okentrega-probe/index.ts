// Sonda SOMENTE LEITURA da API OK Entrega (Bauducco).
// Objetivo: descobrir como consultar o status de análise do comprovante (canhoto)
// de uma ocorrência já enviada, usando o ocorrenciaentregaId gravado na fila.
// Não grava nada no portal nem no banco — apenas tenta endpoints candidatos e
// devolve o que cada um respondeu.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function obterToken(supabase: any, ambiente: "homolog" | "producao") {
  const { data: cache } = await supabase
    .from("okentrega_token")
    .select("*")
    .eq("ambiente", ambiente)
    .maybeSingle();
  if (cache?.token && new Date(cache.expira_em).getTime() - Date.now() > 3_600_000) {
    return cache.token as string;
  }
  const email = (Deno.env.get(ambiente === "producao" ? "OKENTREGA_EMAIL_PRODUCAO" : "OKENTREGA_EMAIL_HOMOLOG") ?? "").trim();
  const password = (Deno.env.get(ambiente === "producao" ? "OKENTREGA_PASSWORD_PRODUCAO" : "OKENTREGA_PASSWORD_HOMOLOG") ?? "").trim();
  if (!email || !password) throw new Error(`Credenciais ausentes para ${ambiente}`);
  const resp = await fetch(`${BASES[ambiente]}/ws.0.loginapp.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || !body?.id) throw new Error(`Login falhou (HTTP ${resp.status})`);
  const ttlSeg = Number(body.ttl ?? 1209600);
  await supabase.from("okentrega_token").upsert(
    { ambiente, token: body.id, expira_em: new Date(Date.now() + ttlSeg * 1000).toISOString() },
    { onConflict: "ambiente" },
  );
  return body.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  let body: any = {};
  try { body = await req.json(); } catch { /* sem body */ }

  const ambiente = (body.ambiente === "homolog" ? "homolog" : "producao") as "homolog" | "producao";
  let ocorrenciaId = body.ocorrencia_id ? String(body.ocorrencia_id) : null;

  // Sem parâmetro: pega a ocorrência mais recente da fila que tenha id do portal.
  let chaveAcesso: string | null = null;
  {
    const q = supabase
      .from("okentrega_queue")
      .select("ocorrencia_entrega_id, chave_acesso, numero_nf")
      .not("ocorrencia_entrega_id", "is", null)
      .eq("ambiente", ambiente)
      .order("enviado_em", { ascending: false })
      .limit(1);
    const { data } = ocorrenciaId
      ? await supabase
          .from("okentrega_queue")
          .select("ocorrencia_entrega_id, chave_acesso, numero_nf")
          .eq("ocorrencia_entrega_id", ocorrenciaId)
          .maybeSingle()
      : await q.maybeSingle();
    ocorrenciaId = data?.ocorrencia_entrega_id ? String(data.ocorrencia_entrega_id) : null;
    chaveAcesso = data?.chave_acesso ? String(data.chave_acesso) : null;
  }
  if (!ocorrenciaId) return json({ erro: "nenhuma ocorrencia_entrega_id disponível" }, 400);

  let token: string;
  try {
    token = await obterToken(supabase, ambiente);
  } catch (e) {
    return json({ erro: String(e) }, 502);
  }

  const base = BASES[ambiente];
  const tentativas: unknown[] = [];
  const candidatos: Array<{ nome: string; url: string; method?: string; payload?: unknown }> = [];
  // Reenvio mínimo (sem foto): duplicado deve voltar 409 sem gravar nada —
  // queremos ver se o corpo da resposta traz o status atual da análise.
  if (chaveAcesso) {
    candidatos.push({
      nome: "POST cache mínimo {documento}",
      url: `${base}/ws.0.ocorrenciaentregacache_api.php?access_token=${token}`,
      method: "POST",
      payload: { documento: chaveAcesso },
    });
    candidatos.push({
      nome: "POST cache {documento, tipoocorrencia: consulta}",
      url: `${base}/ws.0.ocorrenciaentregacache_api.php?access_token=${token}`,
      method: "POST",
      payload: { documento: chaveAcesso, consulta: true },
    });
  }
  candidatos.push(
    { nome: "GET consulta_api ?documento=", url: `${base}/ws.0.consulta_api.php?access_token=${token}&documento=${chaveAcesso ?? ocorrenciaId}` },
    { nome: "GET ocorrenciaentregastatus_api ?id=", url: `${base}/ws.0.ocorrenciaentregastatus_api.php?access_token=${token}&id=${ocorrenciaId}` },
    { nome: "GET statuscomprovante_api ?ocorrenciaentregaId=", url: `${base}/ws.0.statuscomprovante_api.php?access_token=${token}&ocorrenciaentregaId=${ocorrenciaId}` },
  );

  for (const c of candidatos) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(c.url, { signal: ctl.signal });
      const txt = await r.text();
      tentativas.push({ nome: c.nome, http: r.status, corpo: txt.slice(0, 1500) });
    } catch (e) {
      tentativas.push({ nome: c.nome, erro: String(e) });
    } finally {
      clearTimeout(t);
    }
  }

  return json({ ambiente, ocorrencia_id: ocorrenciaId, tentativas });
});
