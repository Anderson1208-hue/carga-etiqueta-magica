// Edge function: enviar-canhotos-manual
// Envio sob demanda dos canhotos de entrega por e-mail.
//
// Ações (body.acao):
//   "previa"  { filtro }                          → relação das notas encontradas (nada é gravado)
//   "criar"   { filtro, destinatarios, observacao } → cria o envio e devolve o id
//   "passo"   { envio_id }                        → processa um passo (imagem / volume / finalização+e-mail)
//
// O processamento é feito em passos porque redimensionar fotos de ~3 MB consome
// quase todo o orçamento de CPU da invocação (mesmo padrão do relatorio-canhotos-diario).
// A tela chama "passo" repetidamente até status = concluido.
//
// Nada é apagado: as fotos originais permanecem no bucket `comprovantes`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1?target=deno";
import { zipSync } from "https://esm.sh/fflate@0.8.2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { Image as ImageLib } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "relatorios-canhotos";
const BUCKET_FOTOS = "comprovantes";
const PAGINA = 500;
const VOLUME = 10; // canhotos por arquivo (PDF e ZIP)
const LIMITE_NOTAS = 500; // trava de segurança por envio
const SIGNED_TTL = 60 * 60 * 24 * 90; // 90 dias
const LARGURA_IMG = 1000;
const QUALIDADE_IMG = 70;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dataHoraBr(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function sanitizar(v: string) {
  return (v || "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60);
}

/** pdf-lib usa WinAnsi nas fontes padrão. */
function winAnsi(t: string) {
  return (t || "").replace(/[^\x20-\xFF]/g, "-");
}

type Filtro = {
  embarcador?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  nfs?: string[] | null;
};

type Linha = {
  path: string | null;
  registrado_em: string | null;
  recebedor_nome: string | null;
  ocorrencia: string | null;
  observacao: string | null;
  canhoto_pendente_motivo: string | null;
  canhoto_pendente_obs: string | null;
  status: string | null;
  numero_nf: string;
  dest: string;
  cidade: string;
  uf: string;
  emitente: string;
  placa: string;
  motorista: string;
};

function normalizarFiltro(bruto: any): Filtro {
  const nfs = Array.isArray(bruto?.nfs)
    ? bruto.nfs.map((n: any) => String(n).replace(/\D/g, "")).filter(Boolean).slice(0, LIMITE_NOTAS)
    : null;
  const dia = (v: any) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    embarcador: typeof bruto?.embarcador === "string" && bruto.embarcador.trim() ? bruto.embarcador.trim() : null,
    data_inicio: dia(bruto?.data_inicio),
    data_fim: dia(bruto?.data_fim),
    nfs: nfs && nfs.length ? nfs : null,
  };
}

function fatias<T>(arr: T[], n = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Consulta em etapas simples (sem joins/filtros aninhados no PostgREST, que
 * estouravam o tempo limite do banco):
 *   1) resolve as notas fiscais (por número e/ou emitente);
 *   2) busca as baixas por nf_id em fatias de 100;
 *   3) busca as placas dos veículos em fatias de 100.
 */
async function buscarBaixas(supabase: any, filtro: Filtro): Promise<Linha[]> {
  const camposNf = "id, numero_nf, dest_razao_social, dest_cidade, dest_uf, razao_social_emitente";
  const notas = new Map<string, any>();

  if (filtro.nfs?.length) {
    for (const lote of fatias(filtro.nfs)) {
      let q = supabase.from("notas_fiscais").select(camposNf).in("numero_nf", lote);
      if (filtro.embarcador) q = q.ilike("razao_social_emitente", `%${filtro.embarcador}%`);
      const { data, error } = await q;
      if (error) throw new Error(`Falha ao buscar notas: ${error.message}`);
      for (const n of data ?? []) notas.set(n.id, n);
    }
  }

  const baixas: any[] = [];
  const camposBaixa =
    "id, nf_id, veiculo_id, foto_path, foto_recibo_path, registrado_em, recebedor_nome, ocorrencia, " +
    "observacao, canhoto_pendente_motivo, canhoto_pendente_obs, status";

  if (filtro.nfs?.length) {
    if (!notas.size) return [];
    for (const lote of fatias([...notas.keys()])) {
      const { data, error } = await supabase
        .from("baixas_entrega")
        .select(camposBaixa)
        .in("nf_id", lote)
        .order("registrado_em", { ascending: true });
      if (error) throw new Error(`Falha ao buscar baixas: ${error.message}`);
      baixas.push(...(data ?? []));
    }
  } else {
    for (let pagina = 0; ; pagina++) {
      let q = supabase
        .from("baixas_entrega")
        .select(camposBaixa)
        .order("registrado_em", { ascending: true })
        .order("id", { ascending: true })
        .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
      if (filtro.data_inicio) q = q.gte("registrado_em", `${filtro.data_inicio}T03:00:00.000Z`);
      if (filtro.data_fim) {
        const fim = new Date(`${filtro.data_fim}T03:00:00.000Z`);
        fim.setUTCDate(fim.getUTCDate() + 1);
        q = q.lt("registrado_em", fim.toISOString());
      }
      const { data, error } = await q;
      if (error) throw new Error(`Falha ao buscar baixas: ${error.message}`);
      if (!data?.length) break;
      baixas.push(...data);
      if (data.length < PAGINA) break;
      if (baixas.length >= 5000) break;
    }
    const ids = [...new Set(baixas.map((b) => b.nf_id).filter(Boolean))];
    for (const lote of fatias(ids)) {
      const { data, error } = await supabase.from("notas_fiscais").select(camposNf).in("id", lote);
      if (error) throw new Error(`Falha ao buscar notas: ${error.message}`);
      for (const n of data ?? []) notas.set(n.id, n);
    }
  }

  // veículos (placa/motorista)
  const veiculos = new Map<string, any>();
  const vIds = [...new Set(baixas.map((b) => b.veiculo_id).filter(Boolean))];
  for (const lote of fatias(vIds)) {
    const { data } = await supabase.from("veiculos").select("id, placa, motorista").in("id", lote);
    for (const v of data ?? []) veiculos.set(v.id, v);
  }

  const linhas: Linha[] = [];
  for (const b of baixas) {
    const nf = notas.get(b.nf_id);
    if (!nf) continue; // fora do filtro de emitente/nota
    if (filtro.embarcador && !(nf.razao_social_emitente ?? "").toLowerCase().includes(filtro.embarcador.toLowerCase())) {
      continue;
    }
    const v = veiculos.get(b.veiculo_id);
    linhas.push({
      path: b.foto_path || b.foto_recibo_path || null,
      registrado_em: b.registrado_em,
      recebedor_nome: b.recebedor_nome,
      ocorrencia: b.ocorrencia,
      observacao: b.observacao,
      canhoto_pendente_motivo: b.canhoto_pendente_motivo,
      canhoto_pendente_obs: b.canhoto_pendente_obs,
      status: b.status,
      numero_nf: nf.numero_nf ?? "",
      dest: nf.dest_razao_social ?? "",
      cidade: nf.dest_cidade ?? "",
      uf: nf.dest_uf ?? "",
      emitente: nf.razao_social_emitente ?? "",
      placa: v?.placa ?? "",
      motorista: v?.motorista ?? "",
    });
  }
  linhas.sort((a, b) => String(a.registrado_em).localeCompare(String(b.registrado_em)));
  return linhas.slice(0, LIMITE_NOTAS + 1);
}

async function jpegReduzido(bytes: Uint8Array) {
  const img = await ImageLib.decode(bytes);
  const final = img.width > LARGURA_IMG ? img.resize(LARGURA_IMG, ImageLib.RESIZE_AUTO) : img;
  return await final.encodeJPEG(QUALIDADE_IMG);
}

async function baixarStorage(supabase: any, bucket: string, path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

function caminhos(id: string) {
  const pasta = `manuais/${id}`;
  const suf = (n: number) => String(n).padStart(2, "0");
  return {
    pasta,
    xlsx: `${pasta}/notas-sem-canhoto.xlsx`,
    pdfVol: (n: number) => `${pasta}/canhotos-parte-${suf(n)}.pdf`,
    zipVol: (n: number) => `${pasta}/canhotos-imagens-parte-${suf(n)}.zip`,
    tmp: (i: number) => `${pasta}/_tmp/${String(i).padStart(5, "0")}.jpg`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let envioId: string | null = null;

  try {
    // Autenticação: a função roda com verify_jwt = true, mas ainda precisamos saber
    // QUEM está enviando para registrar no histórico.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let usuario: { id: string; email: string | null } | null = null;
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      if (data?.user) usuario = { id: data.user.id, email: data.user.email ?? null };
    }

    const body = await req.json().catch(() => ({}));
    const acao = body?.acao ?? "passo";

    // ---------------- links assinados de um envio já concluído ----------------
    if (acao === "links") {
      const id = typeof body?.envio_id === "string" ? body.envio_id : null;
      if (!id) return json({ ok: false, error: "envio_id obrigatório." }, 400);
      const { data: reg } = await supabase
        .from("envios_canhoto_manuais")
        .select("partes, xlsx_path")
        .eq("id", id)
        .maybeSingle();
      if (!reg) return json({ ok: false, error: "Envio não encontrado." }, 404);
      async function url(path?: string | null) {
        if (!path) return "";
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
        return data?.signedUrl ?? "";
      }
      const partes: any[] = (reg.partes as any[]) ?? [];
      const out: { volume: number; pdf: string; zip: string }[] = [];
      for (const parte of partes) out.push({ volume: parte.volume, pdf: await url(parte.pdf), zip: await url(parte.zip) });
      return json({ ok: true, xlsx: await url(reg.xlsx_path), partes: out });
    }

    // ---------------- prévia ----------------
    if (acao === "previa") {
      const filtro = normalizarFiltro(body?.filtro);
      if (!filtro.nfs && !filtro.data_inicio && !filtro.data_fim && !filtro.embarcador) {
        return json({ ok: false, error: "Informe ao menos um filtro: embarcador, período ou NFs." }, 400);
      }
      const linhas = await buscarBaixas(supabase, filtro);
      const com = linhas.filter((l) => !!l.path);
      const sem = linhas.filter((l) => !l.path);
      const nfsEncontradas = new Set(linhas.map((l) => l.numero_nf));
      return json({
        ok: true,
        filtro,
        limite: LIMITE_NOTAS,
        excede_limite: linhas.length > LIMITE_NOTAS,
        total: linhas.length,
        total_com_canhoto: com.length,
        total_sem_canhoto: sem.length,
        volumes_previstos: Math.max(1, Math.ceil(com.length / VOLUME)),
        nfs_nao_encontradas: (filtro.nfs ?? []).filter((n) => !nfsEncontradas.has(n)),
        itens: linhas.slice(0, LIMITE_NOTAS).map((l) => ({
          numero_nf: l.numero_nf,
          destinatario: l.dest,
          cidade: l.cidade,
          uf: l.uf,
          emitente: l.emitente,
          placa: l.placa,
          baixa: dataHoraBr(l.registrado_em),
          tem_canhoto: !!l.path,
          status: l.status,
          motivo_pendencia: l.canhoto_pendente_motivo,
        })),
      });
    }

    // ---------------- criar envio ----------------
    if (acao === "criar") {
      const filtro = normalizarFiltro(body?.filtro);
      const destinatarios: string[] = Array.isArray(body?.destinatarios)
        ? body.destinatarios
            .map((e: any) => String(e).trim().toLowerCase())
            .filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        : [];
      if (!destinatarios.length) return json({ ok: false, error: "Informe ao menos um e-mail válido." }, 400);
      if (!filtro.nfs && !filtro.data_inicio && !filtro.data_fim && !filtro.embarcador) {
        return json({ ok: false, error: "Informe ao menos um filtro: embarcador, período ou NFs." }, 400);
      }

      const linhas = await buscarBaixas(supabase, filtro);
      if (!linhas.length) return json({ ok: false, error: "Nenhuma nota encontrada para o filtro informado." }, 400);
      if (linhas.length > LIMITE_NOTAS) {
        return json(
          { ok: false, error: `Seleção com ${linhas.length} notas excede o limite de ${LIMITE_NOTAS} por envio. Reduza o período.` },
          400,
        );
      }
      const comFoto = linhas.filter((l) => !!l.path);
      const semFoto = linhas.filter((l) => !l.path);

      const { data: criado, error } = await supabase
        .from("envios_canhoto_manuais")
        .insert({
          criado_por: usuario?.id ?? null,
          criado_por_email: usuario?.email ?? null,
          destinatarios,
          observacao: typeof body?.observacao === "string" ? body.observacao.slice(0, 500) : null,
          filtro,
          status: "processando",
          itens: { com_foto: comFoto, sem_foto: semFoto },
          total_notas: linhas.length,
          total_com_canhoto: comFoto.length,
          total_sem_canhoto: semFoto.length,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      return json({
        ok: true,
        envio_id: criado.id,
        total: linhas.length,
        total_com_canhoto: comFoto.length,
        total_sem_canhoto: semFoto.length,
        passos_previstos: comFoto.length + Math.ceil(comFoto.length / VOLUME) + 1,
      });
    }

    // ---------------- passo do processamento ----------------
    envioId = typeof body?.envio_id === "string" ? body.envio_id : null;
    if (!envioId) return json({ ok: false, error: "envio_id obrigatório." }, 400);

    const { data: envio, error: erroEnvio } = await supabase
      .from("envios_canhoto_manuais")
      .select("*")
      .eq("id", envioId)
      .maybeSingle();
    if (erroEnvio) throw new Error(erroEnvio.message);
    if (!envio) return json({ ok: false, error: "Envio não encontrado." }, 404);
    if (envio.status === "concluido") return json({ ok: true, fase: "concluido", envio });

    const p = caminhos(envioId);
    const guardado = (envio.itens as any) ?? {};
    const itens: Linha[] = guardado.com_foto ?? [];
    const semFoto: Linha[] = guardado.sem_foto ?? [];
    let offset: number = envio.progresso_offset ?? 0;
    let partes: { volume: number; pdf: string; zip: string }[] = (envio.partes as any[]) ?? [];

    // FASE A — prepara 1 imagem por invocação
    if (offset < itens.length) {
      const l = itens[offset];
      let falha: string | null = null;
      const original = l.path ? await baixarStorage(supabase, BUCKET_FOTOS, l.path) : null;
      if (!original) {
        falha = l.numero_nf;
      } else {
        try {
          const jpeg = await jpegReduzido(original);
          const up = await supabase.storage
            .from(BUCKET)
            .upload(p.tmp(offset), jpeg, { contentType: "image/jpeg", upsert: true });
          if (up.error) throw new Error(up.error.message);
        } catch (e) {
          console.error("falha ao preparar imagem", l.numero_nf, e);
          falha = l.numero_nf;
        }
      }
      offset += 1;
      const erroAcum =
        [envio.erro, falha ? `Imagem nao lida: ${falha}` : null].filter(Boolean).join(" | ") || null;
      await supabase
        .from("envios_canhoto_manuais")
        .update({ progresso_offset: offset, erro: erroAcum })
        .eq("id", envioId);

      return json({ ok: true, fase: "imagens", processados: offset, total: itens.length, restam: itens.length - offset });
    }

    // FASE B — monta 1 volume (PDF + ZIP) por invocação
    const totalVolumes = Math.ceil(itens.length / VOLUME);
    if (partes.length < totalVolumes) {
      const volume = partes.length + 1;
      const inicio = (volume - 1) * VOLUME;
      const doVolume = itens.slice(inicio, inicio + VOLUME);
      const pdfPath = p.pdfVol(volume);
      const zipPath = p.zipVol(volume);

      const pdfDoc = await PDFDocument.create();
      const fonte = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fonteBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const arquivosZip: Record<string, Uint8Array> = {};
      const usados = new Set<string>();

      for (let i = 0; i < doVolume.length; i++) {
        const l = doVolume[i];
        const jpeg = await baixarStorage(supabase, BUCKET, p.tmp(inicio + i));
        if (!jpeg) continue;

        let nome = `NF_${sanitizar(l.numero_nf)}_${sanitizar(l.placa || "SEMPLACA")}.jpg`;
        if (usados.has(nome)) nome = nome.replace(/\.jpg$/, `_${inicio + i}.jpg`);
        usados.add(nome);
        arquivosZip[nome] = jpeg;

        const embed = await pdfDoc.embedJpg(jpeg);
        const page = pdfDoc.addPage([595, 842]);
        page.drawText(winAnsi(`NF ${l.numero_nf}`), { x: 34, y: 800, size: 14, font: fonteBold });
        [
          `Destinatario: ${l.dest || "-"}`,
          `Cidade: ${l.cidade || "-"}/${l.uf || "-"}   Emitente: ${l.emitente || "-"}`,
          `Placa: ${l.placa || "-"}   Motorista: ${l.motorista || "-"}`,
          `Baixa: ${dataHoraBr(l.registrado_em)}   Recebedor: ${l.recebedor_nome || "-"}`,
        ].forEach((t, i2) =>
          page.drawText(winAnsi(t).slice(0, 105), { x: 34, y: 782 - i2 * 13, size: 9, font: fonte }),
        );
        page.drawLine({
          start: { x: 34, y: 722 },
          end: { x: 561, y: 722 },
          thickness: 0.6,
          color: rgb(0.75, 0.75, 0.75),
        });
        const maxW = 527;
        const maxH = 660;
        const escala = Math.min(maxW / embed.width, maxH / embed.height);
        const w = embed.width * escala;
        const h = embed.height * escala;
        page.drawImage(embed, { x: 34 + (maxW - w) / 2, y: 706 - h, width: w, height: h });
      }

      const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
      const upPdf = await supabase.storage
        .from(BUCKET)
        .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (upPdf.error) throw new Error(`Falha no upload do PDF: ${upPdf.error.message}`);

      const zipBytes = zipSync(arquivosZip, { level: 0 });
      const upZip = await supabase.storage
        .from(BUCKET)
        .upload(zipPath, zipBytes, { contentType: "application/zip", upsert: true });
      if (upZip.error) throw new Error(`Falha no upload do ZIP: ${upZip.error.message}`);

      // só os arquivos temporários de trabalho saem; as fotos originais ficam intactas
      await supabase.storage.from(BUCKET).remove(doVolume.map((_, i) => p.tmp(inicio + i)));

      if (!partes.some((x) => x.volume === volume)) partes = [...partes, { volume, pdf: pdfPath, zip: zipPath }];
      await supabase.from("envios_canhoto_manuais").update({ partes }).eq("id", envioId);

      return json({ ok: true, fase: "volumes", volume, total_volumes: totalVolumes });
    }

    // FASE C — planilha de pendências + e-mail
    const planilha = semFoto.map((l) => ({
      NF: l.numero_nf,
      Emitente: l.emitente,
      Destinatario: l.dest,
      Cidade: l.cidade,
      UF: l.uf,
      Placa: l.placa,
      Motorista: l.motorista,
      "Data da baixa": dataHoraBr(l.registrado_em),
      "Status da baixa": l.status ?? "",
      "Motivo pendencia": l.canhoto_pendente_motivo ?? "",
      "Observacao": l.canhoto_pendente_obs ?? l.observacao ?? "",
      Ocorrencia: l.ocorrencia ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(planilha.length ? planilha : [{ NF: "Nenhuma nota sem canhoto nesta selecao" }]),
      "Sem canhoto",
    );
    const xlsxBytes = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
    const upXlsx = await supabase.storage.from(BUCKET).upload(p.xlsx, xlsxBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
    if (upXlsx.error) throw new Error(`Falha no upload da planilha: ${upXlsx.error.message}`);

    async function assinar(path: string) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
      return data?.signedUrl ?? "";
    }
    const linkXlsx = await assinar(p.xlsx);
    const links: { volume: number; pdf: string; zip: string }[] = [];
    for (const parte of partes) {
      links.push({ volume: parte.volume, pdf: await assinar(parte.pdf), zip: await assinar(parte.zip) });
    }

    const destinatarios: string[] = envio.destinatarios ?? [];
    const erros: string[] = [];
    let enviados = 0;
    for (const email of destinatarios) {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "canhotos-envio-manual",
          recipientEmail: email,
          idempotencyKey: `canhotos-manual-${envioId}-${email}`,
          templateData: {
            periodo: descreverFiltro(envio.filtro as Filtro),
            observacao: envio.observacao ?? "",
            total: envio.total_notas,
            comCanhoto: envio.total_com_canhoto,
            semCanhoto: envio.total_sem_canhoto,
            linkXlsx,
            links,
          },
        },
      });
      if (error) erros.push(`${email}: ${error.message ?? String(error)}`);
      else enviados++;
    }

    await supabase
      .from("envios_canhoto_manuais")
      .update({
        status: enviados > 0 ? "concluido" : "erro",
        xlsx_path: p.xlsx,
        partes,
        emails_enviados: enviados,
        enviado_em: enviados > 0 ? new Date().toISOString() : null,
        erro: erros.length ? erros.join(" | ").slice(0, 1000) : envio.erro,
        itens: null,
      })
      .eq("id", envioId);

    return json({
      ok: enviados > 0,
      fase: "concluido",
      envio_id: envioId,
      enviados,
      destinatarios: destinatarios.length,
      erros,
      arquivos: { xlsx: p.xlsx, partes },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("enviar-canhotos-manual", msg);
    if (envioId) {
      await supabase.from("envios_canhoto_manuais").update({ status: "erro", erro: msg }).eq("id", envioId);
    }
    return json({ ok: false, error: msg }, 500);
  }
});

function descreverFiltro(filtro: Filtro | null) {
  if (!filtro) return "-";
  const partes: string[] = [];
  if (filtro.embarcador) partes.push(`Embarcador: ${filtro.embarcador}`);
  if (filtro.nfs?.length) partes.push(`NFs selecionadas: ${filtro.nfs.length}`);
  else if (filtro.data_inicio || filtro.data_fim) {
    const br = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "-");
    partes.push(`Período: ${br(filtro.data_inicio)} a ${br(filtro.data_fim)}`);
  }
  return partes.join(" • ") || "-";
}
