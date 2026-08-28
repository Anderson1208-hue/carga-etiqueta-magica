// Edge function: okentrega-enfileirar
// Enfileira em okentrega_queue as baixas de entrega (IOD + POD) elegíveis ao envio
// para a Torre de Controle OK Entrega. O envio real é feito pela edge okentrega-sync.
//
// Elegibilidade: baixa com foto do canhoto, ainda não enviada, tentativas < max,
// e CNPJ do EMITENTE (embarcador) presente em okentrega_config.cnpjs_emitente.
// Body opcional: { nfs: ["3934679", "chave44..."] } para teste controlado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 500;
// Go-live da integração em produção: baixas anteriores a esta data não são
// transmitidas (evita reenviar histórico de homologação/backlog).
const CUTOFF_PRODUCAO = "2026-08-28T00:00:00-03:00";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

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

  const { data: cfg } = await supabase
    .from("okentrega_config")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  const ambiente = cfg?.ambiente ?? "homolog";
  const maxTentativas = cfg?.max_tentativas ?? 5;
  const prefixos = (cfg?.cnpjs_emitente ?? [])
    .map((c: string) => String(c).replace(/\D/g, ""))
    .filter(Boolean);

  if (prefixos.length === 0) {
    return json({ status: "sem_cnpjs_configurados", enfileirados: 0, candidatos: 0 });
  }

  // REGRA PANDURATA: ocorrência + imagem só saem depois que a prestação de contas
  // do veículo for encerrada (veiculos.prestacao_contas_em preenchido).
  let query = supabase
    .from("baixas_entrega")
    .select(
      "id, nf_id, foto_path, recebedor_nome, registrado_em, latitude, longitude, okentrega_tentativas, conferencia_status, " +
        "veiculos:veiculo_id!inner(id, placa, prestacao_contas_em), " +
        "notas_fiscais:nf_id!inner(numero_nf, chave_acesso, cnpj_emitente, cnpj_destinatario, dest_razao_social, carga_id)",
    )
    .not("foto_path", "is", null)
    .is("okentrega_enviada_em", null)
    .lt("okentrega_tentativas", maxTentativas)
    .not("veiculos.prestacao_contas_em", "is", null)
    .or("conferencia_status.is.null,conferencia_status.neq.canhoto_pendente")
    // Amarração do embarcador no BANCO (e não só em memória): sem isso o SELECT
    // trazia as baixas mais antigas de TODOS os emitentes e as da Pandurata do
    // dia ficavam fora da janela, nunca entrando na fila.
    .or(
      prefixos
        .map((p: string) => `cnpj_emitente.like.${p.slice(0, 2)}.${p.slice(2, 5)}.${p.slice(5, 8)}%`)
        .join(","),
      { foreignTable: "notas_fiscais" },
    )
    // Corte de produção: não reprocessar histórico anterior ao go-live.
    .gte("registrado_em", CUTOFF_PRODUCAO);

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

  if (bErr) return json({ error: bErr.message }, 500);

  const { data: jaNaFila } = await supabase
    .from("okentrega_queue")
    .select("baixa_id")
    .in("status", ["pendente", "enviado"]);
  const naFila = new Set((jaNaFila ?? []).map((r) => r.baixa_id).filter(Boolean));

  const elegiveis = (baixas ?? [])
    .filter((b) => {
      if (naFila.has(b.id)) return false;
      const nf = (b as any).notas_fiscais;
      if (!nf) return false;
      // chave da DANFE com 44 dígitos é obrigatória
      if (String(nf.chave_acesso ?? "").replace(/\D/g, "").length !== 44) return false;
      // Amarração por CNPJ do emitente é obrigatória mesmo em teste dirigido:
      // um canal por embarcador (Pandurata só recebe NF da Pandurata).
      const cnpj = String(nf.cnpj_emitente ?? "").replace(/\D/g, "");
      return prefixos.some((p: string) => cnpj.startsWith(p));
    })
    .slice(0, BATCH_SIZE);

  let enfileirados = 0;
  const erros: Array<{ baixa_id: string; erro: string }> = [];

  for (const b of elegiveis) {
    const nf = (b as any).notas_fiscais;
    const chave = String(nf.chave_acesso).replace(/\D/g, "");

    const payload = {
      baixa_id: b.id,
      nf_id: b.nf_id,
      numero_nf: nf.numero_nf,
      documento: chave,
      cnpj_destinatario: nf.cnpj_destinatario,
      dest_razao_social: nf.dest_razao_social,
      recebedor_nome: b.recebedor_nome,
      registrado_em: b.registrado_em,
      dtentrega: b.registrado_em,
      latitude: b.latitude != null ? String(b.latitude) : null,
      longitude: b.longitude != null ? String(b.longitude) : null,
      foto_path: b.foto_path,
    };

    const { data: inserted, error: iErr } = await supabase
      .from("okentrega_queue")
      .insert({
        nf_id: b.nf_id,
        baixa_id: b.id,
        chave_acesso: chave,
        numero_nf: String(nf.numero_nf ?? ""),
        tipo_ocorrencia_id: 1,
        tipo_entrega: "F",
        ambiente,
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
          okentrega_tentativas: ((b as any).okentrega_tentativas ?? 0) + 1,
          okentrega_ultimo_erro: iErr?.message ?? "insert vazio",
        })
        .eq("id", b.id);
      continue;
    }

    await supabase
      .from("baixas_entrega")
      .update({ okentrega_queue_id: inserted.id, okentrega_ultimo_erro: null })
      .eq("id", b.id);

    enfileirados++;
  }

  return json({
    status: "ok",
    ambiente,
    cnpjs_configurados: prefixos.length,
    candidatos: elegiveis.length,
    enfileirados,
    erros,
  });
});
