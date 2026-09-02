// Edge function: relatorio-canhotos-diario
// Gera, por dia, os arquivos consolidados das baixas de entrega:
//   1. PDF  — 1 página por NF entregue com foto de canhoto (imagem + cabeçalho),
//             dividido em volumes de VOLUME canhotos para manter arquivos abríveis
//   2. ZIP  — pacotes com as fotos (mesmos volumes), NF_<numero>_<placa>.jpg
//   3. XLSX — NFs entregues no dia SEM foto de canhoto (pendências)
// Arquivos gravados no bucket privado `relatorios-canhotos` em YYYY/MM/YYYY-MM-DD/.
// Nada é apagado: não existe rotina de limpeza nem expiração.
//
// As fotos originais têm ~3 MB (até 8 MB) e o redimensionamento em JS é pesado:
// cada invocação processa apenas LOTE canhotos e re-invoca a si mesma até concluir
// (mesmo padrão do okentrega-sync). Na última rodada gera a planilha de pendências
// e dispara o e-mail para os destinatários ativos.
//
// Body (todos opcionais):
//   { data: "2026-09-01", dry_run: true, enviar_email: false, forcar: true, encadear: false }
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
const PAGINA = 500; // paginação determinística na leitura das baixas
const LOTE = 1; // canhotos por invocação (decode+resize é caro em CPU/memória)
const VOLUME = 10; // canhotos por arquivo (PDF e ZIP) — mantém o append leve
const SIGNED_TTL = 60 * 60 * 24 * 90; // 90 dias
const LARGURA_IMG = 1000;
const QUALIDADE_IMG = 70;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Data (YYYY-MM-DD) de "ontem" no fuso America/Sao_Paulo. */
function ontemBrasilia(): string {
  const agora = new Date(Date.now() - 3 * 3600_000);
  agora.setUTCDate(agora.getUTCDate() - 1);
  return agora.toISOString().slice(0, 10);
}

/** Janela UTC correspondente ao dia BRT informado. */
function janelaUtc(dia: string) {
  const inicio = new Date(`${dia}T03:00:00.000Z`);
  return { inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 24 * 3600_000).toISOString() };
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

/** pdf-lib usa WinAnsi nas fontes padrão: remove o que estiver fora do Latin-1. */
function winAnsi(t: string) {
  return (t || "").replace(/[^\x20-\xFF]/g, "-");
}

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

async function buscarBaixas(supabase: any, dia: string): Promise<Linha[]> {
  const { inicio, fim } = janelaUtc(dia);
  const linhas: Linha[] = [];
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await supabase
      .from("baixas_entrega")
      .select(
        "id, foto_path, foto_recibo_path, registrado_em, recebedor_nome, ocorrencia, observacao, canhoto_pendente_motivo, canhoto_pendente_obs, status, " +
          "notas_fiscais!inner(numero_nf, dest_razao_social, dest_cidade, dest_uf, razao_social_emitente), " +
          "veiculos(placa, motorista)",
      )
      .gte("registrado_em", inicio)
      .lt("registrado_em", fim)
      .order("registrado_em", { ascending: true })
      .order("id", { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) throw new Error(`Falha ao buscar baixas: ${error.message}`);
    if (!data?.length) break;
    for (const b of data as any[]) {
      linhas.push({
        path: b.foto_path || b.foto_recibo_path || null,
        registrado_em: b.registrado_em,
        recebedor_nome: b.recebedor_nome,
        ocorrencia: b.ocorrencia,
        observacao: b.observacao,
        canhoto_pendente_motivo: b.canhoto_pendente_motivo,
        canhoto_pendente_obs: b.canhoto_pendente_obs,
        status: b.status,
        numero_nf: b.notas_fiscais?.numero_nf ?? "",
        dest: b.notas_fiscais?.dest_razao_social ?? "",
        cidade: b.notas_fiscais?.dest_cidade ?? "",
        uf: b.notas_fiscais?.dest_uf ?? "",
        emitente: b.notas_fiscais?.razao_social_emitente ?? "",
        placa: b.veiculos?.placa ?? "",
        motorista: b.veiculos?.motorista ?? "",
      });
    }
    if (data.length < PAGINA) break;
  }
  return linhas;
}

async function jpegReduzido(bytes: Uint8Array) {
  const img = await ImageLib.decode(bytes);
  const final = img.width > LARGURA_IMG ? img.resize(LARGURA_IMG, ImageLib.RESIZE_AUTO) : img;
  const jpeg = await final.encodeJPEG(QUALIDADE_IMG);
  return { jpeg, largura: final.width, altura: final.height };
}

async function baixarStorage(supabase: any, bucket: string, path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

function caminhos(dia: string) {
  const pasta = `${dia.slice(0, 4)}/${dia.slice(5, 7)}/${dia}`;
  const suf = (n: number) => String(n).padStart(2, "0");
  return {
    pasta,
    xlsx: `${pasta}/sem-canhoto-${dia}.xlsx`,
    pdfVol: (n: number) => `${pasta}/canhotos-${dia}-parte-${suf(n)}.pdf`,
    zipVol: (n: number) => `${pasta}/canhotos-imagens-${dia}-parte-${suf(n)}.zip`,
    tmp: (i: number) => `${pasta}/_tmp/${String(i).padStart(5, "0")}.jpg`,
  };
}

/**
 * Continua a rotina em nova invocação (cada rodada tem CPU limitada).
 * O agendamento sai pelo pg_net (RPC no banco) ANTES do trabalho pesado: um
 * setTimeout morreria junto com o worker quando o limite de CPU é atingido em
 * fotos de 8 MB. O progresso é gravado por valor absoluto, então uma eventual
 * sobreposição de rodadas não pula item.
 */
async function reinvocar(supabase: any, dia: string, enviarEmail: boolean) {
  const { error } = await supabase.rpc("fn_relatorio_canhotos_kick", { p_dia: dia, p_email: enviarEmail });
  if (error) console.error("auto-encadeamento falhou", error.message);
}




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let dia = ontemBrasilia();

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch { /* sem body */ }
    if (typeof body?.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.data)) dia = body.data;
    const dryRun = body?.dry_run === true;
    const enviarEmail = body?.enviar_email !== false;
    const forcar = body?.forcar === true;
    const encadear = body?.encadear !== false;
    const p = caminhos(dia);

    const { data: atual } = await supabase
      .from("relatorios_canhotos_diarios")
      .select("*")
      .eq("data_referencia", dia)
      .maybeSingle();

    // ---------- amostra: 1 página só para conferência visual ----------
    // Usa uma imagem já preparada em _tmp (não relê baixas, não altera estado).
    if (body?.amostra === true) {
      const guardadas: Linha[] = ((atual?.itens as any)?.com_foto ?? []) as Linha[];
      const idx = Number.isInteger(body?.indice) ? body.indice : 0;
      const l = guardadas[idx];
      if (!l) return json({ ok: false, error: "sem itens preparados para amostra" }, 400);
      const jpeg = await baixarStorage(supabase, BUCKET, p.tmp(idx));
      if (!jpeg) return json({ ok: false, error: `imagem temporaria ${idx} indisponivel` }, 404);

      const pdfDoc = await PDFDocument.create();
      const fonte = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fonteBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const embed = await pdfDoc.embedJpg(jpeg);
      const page = pdfDoc.addPage([595, 842]);
      page.drawText(winAnsi(`NF ${l.numero_nf}`), { x: 34, y: 800, size: 14, font: fonteBold });
      [
        `Destinatario: ${l.dest || "-"}`,
        `Cidade: ${l.cidade || "-"}/${l.uf || "-"}   Emitente: ${l.emitente || "-"}`,
        `Placa: ${l.placa || "-"}   Motorista: ${l.motorista || "-"}`,
        `Baixa: ${dataHoraBr(l.registrado_em)}   Recebedor: ${l.recebedor_nome || "-"}`,
      ].forEach((t, i2) => page.drawText(winAnsi(t).slice(0, 105), { x: 34, y: 782 - i2 * 13, size: 9, font: fonte }));
      page.drawLine({ start: { x: 34, y: 722 }, end: { x: 561, y: 722 }, thickness: 0.6, color: rgb(0.75, 0.75, 0.75) });
      const escala = Math.min(527 / embed.width, 660 / embed.height);
      const w = embed.width * escala;
      const h = embed.height * escala;
      page.drawImage(embed, { x: 34 + (527 - w) / 2, y: 706 - h, width: w, height: h });

      const bytes = await pdfDoc.save({ useObjectStreams: false });
      const path = `${p.pasta}/_amostra/amostra-${dia}-${idx}.pdf`;
      const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(up.error.message);
      const { data: assinado } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
      return json({ ok: true, amostra: true, dia, indice: idx, nf: l.numero_nf, bytes: bytes.length, url: assinado?.signedUrl ?? null });
    }

    if (dryRun) {
      const linhas = await buscarBaixas(supabase, dia);
      const com = linhas.filter((l) => !!l.path);
      return json({
        ok: true,
        dry_run: true,
        dia,
        total_entregas: linhas.length,
        total_com_canhoto: com.length,
        total_sem_canhoto: linhas.length - com.length,
        volumes_previstos: Math.max(1, Math.ceil(com.length / VOLUME)),
        rodadas_previstas: Math.ceil(com.length / LOTE),
        amostra_sem_canhoto: linhas.filter((l) => !l.path).slice(0, 10).map((l) => l.numero_nf),
      });
    }

    if (atual?.status === "concluido" && !forcar) {
      return json({ ok: true, dia, ja_gerado: true, relatorio: atual });
    }

    // ---------- estado do dia ----------
    let itens: Linha[] = [];
    let semFoto: Linha[] = [];
    let offset = 0;
    let partes: { volume: number; pdf: string; zip: string }[] = [];

    const emAndamento = atual?.status === "processando" && atual?.itens && !forcar;
    if (emAndamento) {
      const guardado = atual!.itens as any;
      itens = guardado.com_foto ?? [];
      semFoto = guardado.sem_foto ?? [];
      offset = atual!.progresso_offset ?? 0;
      partes = (atual!.zip_partes as any[]) ?? [];
    } else {
      const linhas = await buscarBaixas(supabase, dia);
      itens = linhas.filter((l) => !!l.path);
      semFoto = linhas.filter((l) => !l.path);
      await supabase.from("relatorios_canhotos_diarios").upsert(
        {
          data_referencia: dia,
          status: "processando",
          erro: null,
          progresso_offset: 0,
          zip_partes: [],
          itens: { com_foto: itens, sem_foto: semFoto },
          total_entregas: itens.length + semFoto.length,
          total_com_canhoto: itens.length,
          total_sem_canhoto: semFoto.length,
          pdf_path: null,
          zip_path: null,
          xlsx_path: null,
          gerado_em: null,
          enviado_em: null,
        },
        { onConflict: "data_referencia" },
      );
      // a leitura das baixas já consome boa parte do orçamento de CPU:
      // o processamento das imagens começa na próxima invocação
      if (encadear) await reinvocar(supabase, dia, enviarEmail);
      return json({
        ok: true,
        dia,
        fase: "preparo",
        total_entregas: itens.length + semFoto.length,
        total_com_canhoto: itens.length,
        total_sem_canhoto: semFoto.length,
        encadeado: encadear,
      });
    }


    // ---------- FASE A: preparar 1 imagem por invocação ----------
    // Redimensionar (imagescript, JS puro) consome quase todo o orçamento de CPU
    // da invocação: nada de montar PDF/ZIP na mesma rodada.
    if (offset < itens.length) {
      if (encadear) await reinvocar(supabase, dia, enviarEmail);
      const l = itens[offset];
      let falha: string | null = null;
      const original = await baixarStorage(supabase, BUCKET_FOTOS, l.path!);
      if (!original) {
        falha = l.numero_nf;
      } else {
        try {
          const img = await jpegReduzido(original);
          const up = await supabase.storage
            .from(BUCKET)
            .upload(p.tmp(offset), img.jpeg, { contentType: "image/jpeg", upsert: true });
          if (up.error) throw new Error(up.error.message);
        } catch (e) {
          console.error("falha ao preparar imagem", l.numero_nf, e);
          falha = l.numero_nf;
        }
      }

      offset += 1;
      const erroAcum = [atual?.erro, falha ? `Imagem nao lida: ${falha}` : null].filter(Boolean).join(" | ") || null;
      await supabase
        .from("relatorios_canhotos_diarios")
        .update({ progresso_offset: offset, erro: erroAcum })
        .eq("data_referencia", dia);

      return json({
        ok: true,
        dia,
        fase: "imagens",
        processados: offset,

        total: itens.length,
        restam: itens.length - offset,
        encadeado: encadear,
      });
    }

    // ---------- FASE B: montar 1 volume (PDF + ZIP) por invocação ----------
    const totalVolumes = Math.ceil(itens.length / VOLUME);
    if (partes.length < totalVolumes) {
      if (encadear) await reinvocar(supabase, dia, enviarEmail);
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
        const page = pdfDoc.addPage([595, 842]); // A4 em pontos
        page.drawText(winAnsi(`NF ${l.numero_nf}`), { x: 34, y: 800, size: 14, font: fonteBold });
        const cab = [
          `Destinatario: ${l.dest || "-"}`,
          `Cidade: ${l.cidade || "-"}/${l.uf || "-"}   Emitente: ${l.emitente || "-"}`,
          `Placa: ${l.placa || "-"}   Motorista: ${l.motorista || "-"}`,
          `Baixa: ${dataHoraBr(l.registrado_em)}   Recebedor: ${l.recebedor_nome || "-"}`,
        ];
        cab.forEach((t, i2) =>
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

      // as fotos originais permanecem intactas no bucket de comprovantes;
      // aqui só saem os arquivos temporários de trabalho já embutidos no volume
      await supabase.storage
        .from(BUCKET)
        .remove(doVolume.map((_, i) => p.tmp(inicio + i)));

      if (!partes.some((x) => x.volume === volume)) partes = [...partes, { volume, pdf: pdfPath, zip: zipPath }];
      await supabase
        .from("relatorios_canhotos_diarios")
        .update({ zip_partes: partes, pdf_path: partes[0]?.pdf ?? null, zip_path: partes[0]?.zip ?? null })
        .eq("data_referencia", dia);


      return json({
        ok: true,
        dia,
        fase: "volumes",
        volume,
        total_volumes: totalVolumes,
        encadeado: encadear,
      });
    }


    // ---------- finalização: planilha de pendências ----------
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
      XLSX.utils.json_to_sheet(planilha.length ? planilha : [{ NF: "Nenhuma pendencia no dia" }]),
      "Sem canhoto",
    );
    const xlsxBytes = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
    const upXlsx = await supabase.storage.from(BUCKET).upload(p.xlsx, xlsxBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
    if (upXlsx.error) throw new Error(`Falha no upload da planilha: ${upXlsx.error.message}`);

    await supabase
      .from("relatorios_canhotos_diarios")
      .update({
        status: "concluido",
        xlsx_path: p.xlsx,
        xlsx_bytes: xlsxBytes.length,
        pdf_path: partes[0]?.pdf ?? null,
        zip_path: partes[0]?.zip ?? null,
        zip_partes: partes,
        total_entregas: itens.length + semFoto.length,
        total_com_canhoto: itens.length,
        total_sem_canhoto: semFoto.length,
        gerado_em: new Date().toISOString(),
        itens: null,
      })
      .eq("data_referencia", dia);

    let email: any = { enviado: false, motivo: "envio desativado na chamada" };
    if (enviarEmail) {
      email = await enviarResumo(supabase, dia, {
        total: itens.length + semFoto.length,
        comFoto: itens.length,
        semFoto: semFoto.length,
        xlsxPath: p.xlsx,
        partes,
      });
    }

    return json({
      ok: true,
      dia,
      concluido: true,
      total_entregas: itens.length + semFoto.length,
      total_com_canhoto: itens.length,
      total_sem_canhoto: semFoto.length,
      arquivos: { xlsx: p.xlsx, partes },
      email,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("relatorio-canhotos-diario", msg);
    await supabase
      .from("relatorios_canhotos_diarios")
      .update({ status: "erro", erro: msg })
      .eq("data_referencia", dia);
    return json({ ok: false, dia, error: msg }, 500);
  }
});

async function enviarResumo(
  supabase: any,
  dia: string,
  info: {
    total: number;
    comFoto: number;
    semFoto: number;
    xlsxPath: string;
    partes: { volume: number; pdf: string; zip: string }[];
  },
) {
  const { data: destinatarios } = await supabase
    .from("relatorios_canhotos_destinatarios")
    .select("email")
    .eq("ativo", true);
  const emails: string[] = (destinatarios ?? []).map((d: any) => d.email);
  if (!emails.length) return { enviado: false, motivo: "nenhum destinatário ativo" };

  async function assinar(path: string) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
    return data?.signedUrl ?? "";
  }
  const linkXlsx = await assinar(info.xlsxPath);
  const links: { volume: number; pdf: string; zip: string }[] = [];
  for (const parte of info.partes) {
    links.push({ volume: parte.volume, pdf: await assinar(parte.pdf), zip: await assinar(parte.zip) });
  }

  const cobertura = info.total ? Math.round((info.comFoto / info.total) * 1000) / 10 : 0;
  const erros: string[] = [];
  let enviados = 0;

  for (const email of emails) {
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "relatorio-canhotos-diario",
        recipientEmail: email,
        idempotencyKey: `relatorio-canhotos-${dia}-${email}`,
        templateData: {
          data: dia.split("-").reverse().join("/"),
          total: info.total,
          comCanhoto: info.comFoto,
          semCanhoto: info.semFoto,
          cobertura,
          linkXlsx,
          links,
        },
      },
    });
    if (error) erros.push(`${email}: ${error.message ?? String(error)}`);
    else enviados++;
  }

  if (enviados > 0) {
    await supabase
      .from("relatorios_canhotos_diarios")
      .update({ enviado_em: new Date().toISOString() })
      .eq("data_referencia", dia);
  }
  return { enviado: enviados > 0, enviados, destinatarios: emails.length, erros };
}
