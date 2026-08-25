// Edge function: ibac-enfileirar-canhotos
// Roda 1x/dia via cron (23h BRT). Enfileira em ibac_eventos_queue as fotos de canhoto
// (baixas_entrega.foto_path) de NFs cujo CNPJ destinatário está em
// cnpj_envio_canhoto_auto.ativo=true e que ainda não foram enviadas.
// O envio real para a IBAC é feito pela edge ibac-sync (cron 2 em 2 min), que
// agora reconhece evento_interno='envio_canhoto' e atualiza imagem_ibac_enviada_em.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 500;
const MAX_TENTATIVAS = 5;
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 dias

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Filtro opcional por NFs específicas (teste controlado): { nfs: ["3897130", "chave..."] }
  let nfsAlvo: string[] = [];
  let veiculoIdAlvo: string | null = null;
  try {
    const body = await req.json();
    nfsAlvo = (body?.nfs ?? []).map((v: unknown) => String(v).trim()).filter(Boolean);
    veiculoIdAlvo = typeof body?.veiculo_id === "string" && /^[0-9a-f-]{36}$/i.test(body.veiculo_id)
      ? body.veiculo_id
      : null;
  } catch {
    nfsAlvo = [];
  }

  // 1. CNPJs ativos
  const { data: cnpjsCfg, error: cnpjErr } = await supabase
    .from("cnpj_envio_canhoto_auto")
    .select("cnpj")
    .eq("ativo", true);

  if (cnpjErr) {
    return new Response(JSON.stringify({ error: cnpjErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const prefixos = (cnpjsCfg ?? []).map((c) => (c.cnpj ?? "").replace(/\D/g, "")).filter(Boolean);
  if (prefixos.length === 0 && nfsAlvo.length === 0) {
    return new Response(
      JSON.stringify({ status: "sem_cnpjs_configurados", enfileirados: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 2. Buscar baixas candidatas
  // OBS: cnpj_destinatario é gravado FORMATADO ("24.765.278/0001-18"), por isso o
  // match por prefixo é feito em JS sobre os dígitos, não via LIKE no Postgres.
  let query = supabase
    .from("baixas_entrega")
    .select("id, nf_id, foto_path, recebedor_nome, registrado_em, validacao_status, latitude, longitude, veiculo_id, imagem_ibac_tentativas, notas_fiscais:nf_id!inner(numero_nf, chave_acesso, cnpj_destinatario, dest_razao_social, carga_id)")
    .not("foto_path", "is", null)
    .is("imagem_ibac_enviada_em", null)
    .lt("imagem_ibac_tentativas", MAX_TENTATIVAS);

  if (veiculoIdAlvo) {
    query = query.eq("veiculo_id", veiculoIdAlvo);
  }

  if (nfsAlvo.length > 0) {
    query = query.or(
      `numero_nf.in.(${nfsAlvo.join(",")}),chave_acesso.in.(${nfsAlvo.join(",")})`,
      { foreignTable: "notas_fiscais" },
    );
  }

  const { data: baixas, error: bErr } = await query
    .order("registrado_em", { ascending: true })
    .limit(BATCH_SIZE * 4);

  if (bErr) {
    return new Response(JSON.stringify({ error: bErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Evita duplicar itens que já estão pendentes na fila
  const { data: jaNaFila } = await supabase
    .from("ibac_eventos_queue")
    .select("baixa_id")
    .eq("evento_interno", "envio_canhoto")
    .in("status", ["pendente", "enviado"]);
  const baixasNaFila = new Set((jaNaFila ?? []).map((r) => r.baixa_id).filter(Boolean));

  const elegiveis = (baixas ?? []).filter((b) => {
    if (baixasNaFila.has(b.id)) return false;
    if (nfsAlvo.length > 0) return true;
    const cnpj = ((b as any).notas_fiscais?.cnpj_destinatario ?? "").replace(/\D/g, "");
    return prefixos.some((p) => cnpj.startsWith(p));
  }).slice(0, BATCH_SIZE);



  let candidatos = 0;
  let enfileirados = 0;
  let semFoto = 0;
  const erros: Array<{ baixa_id: string; erro: string }> = [];

  for (const b of elegiveis) {
    candidatos++;
    const nf = (b as any).notas_fiscais;
    if (!nf) continue;

    // Signed URL
    const { data: signed, error: sErr } = await supabase.storage
      .from("comprovantes")
      .createSignedUrl(b.foto_path!, SIGNED_URL_TTL_SEC);

    if (sErr || !signed?.signedUrl) {
      semFoto++;
      await supabase
        .from("baixas_entrega")
        .update({
          imagem_ibac_tentativas: ((b as any).imagem_ibac_tentativas ?? 0) + 1,
          imagem_ibac_ultimo_erro: `Falha signed URL: ${sErr?.message ?? "sem url"}`,
        })
        .eq("id", b.id);
      continue;
    }

    const payload = {
      baixa_id: b.id,
      nf_id: b.nf_id,
      numero_nf: nf.numero_nf,
      chave_acesso: nf.chave_acesso,
      cnpj_destinatario: nf.cnpj_destinatario,
      dest_razao_social: nf.dest_razao_social,
      recebedor_nome: b.recebedor_nome,
      registrado_em: b.registrado_em,
      validacao_status: b.validacao_status,
      latitude: b.latitude,
      longitude: b.longitude,
      veiculo_id: b.veiculo_id,
      foto_path: b.foto_path,
      foto_url: signed.signedUrl,
      foto_url_expira_em: new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString(),
    };

    // Insere diretamente (preserva queue_id para gravar na baixa)
    const { data: inserted, error: iErr } = await supabase
      .from("ibac_eventos_queue")
      .insert({
        evento_interno: "envio_canhoto",
        nf_id: b.nf_id,
        carga_id: nf.carga_id,
        baixa_id: b.id,
        chave_acesso: nf.chave_acesso,
        payload,
        status: "pendente",
      })
      .select("id")
      .single();

    if (iErr || !inserted) {
      erros.push({ baixa_id: b.id, erro: iErr?.message ?? "insert vazio" });
      await supabase
        .from("baixas_entrega")
        .update({
          imagem_ibac_tentativas: ((b as any).imagem_ibac_tentativas ?? 0) + 1,
          imagem_ibac_ultimo_erro: iErr?.message ?? "insert vazio",
        })
        .eq("id", b.id);
      continue;
    }

    await supabase
      .from("baixas_entrega")
      .update({
        imagem_ibac_queue_id: inserted.id,
        imagem_ibac_tentativas: ((b as any).imagem_ibac_tentativas ?? 0) + 1,
        imagem_ibac_ultimo_erro: null,
      })
      .eq("id", b.id);

    enfileirados++;
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      veiculo_id: veiculoIdAlvo,
      cnpjs_configurados: prefixos.length,
      candidatos,
      enfileirados,
      falhas_signed_url: semFoto,
      erros,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
