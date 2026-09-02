// Edge function: relatorio-canhotos-diario
// Gera, por dia, três arquivos consolidados das baixas de entrega:
//   1. PDF  — 1 página por NF entregue com foto de canhoto (imagem + cabeçalho)
//   2. ZIP  — fotos originais nomeadas NF_<numero>_<placa>.jpg
//   3. XLSX — NFs entregues no dia SEM foto de canhoto (pendências)
// Os arquivos vão para o bucket privado `relatorios-canhotos` em YYYY/MM/YYYY-MM-DD/
// e o resumo é registrado em public.relatorios_canhotos_diarios.
// Nada é apagado: não existe rotina de limpeza nem expiração.
//
// Body (todos opcionais):
//   { data: "2026-09-01", dry_run: true, enviar_email: false, forcar: true }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
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
const PAGINA = 500; // paginação determinística
const SIGNED_TTL = 60 * 60 * 24 * 90; // 90 dias
const LARGURA_MAX_PDF = 1000; // px — imagem redimensionada antes de embutir

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Data (YYYY-MM-DD) de "ontem" no fuso America/Sao_Paulo. */
function ontemBrasilia(): string {
  const agora = new Date(Date.now() - 3 * 3600_000); // BRT = UTC-3
  agora.setUTCDate(agora.getUTCDate() - 1);
  return agora.toISOString().slice(0, 10);
}

/** Janela UTC correspondente ao dia BRT informado. */
function janelaUtc(dia: string) {
  const inicio = new Date(`${dia}T03:00:00.000Z`);
  const fim = new Date(inicio.getTime() + 24 * 3600_000);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

function dataHoraBr(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function sanitizar(v: string) {
  return (v || "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60);
}

type Linha = {
  id: string;
  foto_path: string | null;
  foto_recibo_path: string | null;
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
        id: b.id,
        foto_path: b.foto_path,
        foto_recibo_path: b.foto_recibo_path,
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

async function baixarFoto(supabase: any, path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(BUCKET_FOTOS).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Redimensiona para largura máxima e devolve JPEG (base64) + dimensões. */
async function paraJpegPdf(bytes: Uint8Array) {
  const img = await ImageLib.decode(bytes);
  let final = img;
  if (img.width > LARGURA_MAX_PDF) {
    final = img.resize(LARGURA_MAX_PDF, ImageLib.RESIZE_AUTO);
  }
  const jpeg = await final.encodeJPEG(78);
  let bin = "";
  for (let i = 0; i < jpeg.length; i += 8192) {
    bin += String.fromCharCode(...jpeg.subarray(i, i + 8192));
  }
  return { base64: btoa(bin), largura: final.width, altura: final.height };
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

    const { data: existente } = await supabase
      .from("relatorios_canhotos_diarios")
      .select("*")
      .eq("data_referencia", dia)
      .maybeSingle();

    if (existente?.status === "concluido" && !forcar && !dryRun) {
      return json({ ok: true, dia, ja_gerado: true, relatorio: existente });
    }

    const linhas = await buscarBaixas(supabase, dia);
    const comFoto = linhas.filter((l) => !!(l.foto_path || l.foto_recibo_path));
    const semFoto = linhas.filter((l) => !(l.foto_path || l.foto_recibo_path));

    if (dryRun) {
      return json({
        ok: true,
        dry_run: true,
        dia,
        total_entregas: linhas.length,
        total_com_canhoto: comFoto.length,
        total_sem_canhoto: semFoto.length,
        amostra_sem_canhoto: semFoto.slice(0, 10).map((l) => l.numero_nf),
      });
    }

    if (!existente) {
      await supabase.from("relatorios_canhotos_diarios").insert({ data_referencia: dia, status: "processando" });
    } else {
      await supabase
        .from("relatorios_canhotos_diarios")
        .update({ status: "processando", erro: null })
        .eq("data_referencia", dia);
    }

    // ---------- PDF + ZIP ----------
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const arquivosZip: Record<string, Uint8Array> = {};
    let paginas = 0;
    const falhasImagem: string[] = [];

    for (const l of comFoto) {
      const path = (l.foto_path || l.foto_recibo_path)!;
      const bytes = await baixarFoto(supabase, path);
      if (!bytes) {
        falhasImagem.push(l.numero_nf);
        continue;
      }
      const nomeZip = `NF_${sanitizar(l.numero_nf)}_${sanitizar(l.placa || "SEMPLACA")}.jpg`;
      arquivosZip[nomeZip] = bytes;

      let img: { base64: string; largura: number; altura: number };
      try {
        img = await paraJpegPdf(bytes);
      } catch {
        falhasImagem.push(l.numero_nf);
        continue;
      }

      if (paginas > 0) pdf.addPage();
      paginas++;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text(`NF ${l.numero_nf}`, 12, 14);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const cab = [
        `Destinatario: ${l.dest || "—"}`,
        `Cidade: ${l.cidade || "—"}/${l.uf || "—"}    Emitente: ${l.emitente || "—"}`,
        `Placa: ${l.placa || "—"}    Motorista: ${l.motorista || "—"}`,
        `Baixa: ${dataHoraBr(l.registrado_em)}    Recebedor: ${l.recebedor_nome || "—"}`,
      ];
      cab.forEach((t, i) => pdf.text(t.slice(0, 120), 12, 20 + i * 5));
      pdf.setDrawColor(200);
      pdf.line(12, 42, 198, 42);

      const maxW = 186;
      const maxH = 235;
      const escala = Math.min(maxW / img.largura, maxH / img.altura);
      const w = img.largura * escala;
      const h = img.altura * escala;
      pdf.addImage(`data:image/jpeg;base64,${img.base64}`, "JPEG", 12 + (maxW - w) / 2, 46, w, h);
    }

    if (paginas === 0) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(`Sem canhotos registrados em ${dia.split("-").reverse().join("/")}`, 14, 20);
    }

    const pdfBytes = new Uint8Array(pdf.output("arraybuffer"));
    const zipBytes = Object.keys(arquivosZip).length
      ? zipSync(arquivosZip, { level: 0 })
      : zipSync({ "SEM-CANHOTOS.txt": new TextEncoder().encode(`Nenhum canhoto em ${dia}`) }, { level: 0 });

    // ---------- XLSX de pendências ----------
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
      "Observacao pendencia": l.canhoto_pendente_obs ?? l.observacao ?? "",
      Ocorrencia: l.ocorrencia ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(planilha.length ? planilha : [{ NF: "Nenhuma pendencia no dia" }]),
      "Sem canhoto",
    );
    const xlsxBytes = new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));

    // ---------- Upload ----------
    const pasta = `${dia.slice(0, 4)}/${dia.slice(5, 7)}/${dia}`;
    const pdfPath = `${pasta}/canhotos-${dia}.pdf`;
    const zipPath = `${pasta}/canhotos-imagens-${dia}.zip`;
    const xlsxPath = `${pasta}/sem-canhoto-${dia}.xlsx`;

    const uploads = [
      supabase.storage.from(BUCKET).upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true }),
      supabase.storage.from(BUCKET).upload(zipPath, zipBytes, { contentType: "application/zip", upsert: true }),
      supabase.storage.from(BUCKET).upload(xlsxPath, xlsxBytes, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      }),
    ];
    for (const r of await Promise.all(uploads)) {
      if ((r as any).error) throw new Error(`Falha no upload: ${(r as any).error.message}`);
    }

    await supabase
      .from("relatorios_canhotos_diarios")
      .update({
        total_entregas: linhas.length,
        total_com_canhoto: comFoto.length,
        total_sem_canhoto: semFoto.length,
        pdf_path: pdfPath,
        zip_path: zipPath,
        xlsx_path: xlsxPath,
        pdf_bytes: pdfBytes.length,
        zip_bytes: zipBytes.length,
        xlsx_bytes: xlsxBytes.length,
        status: "concluido",
        erro: falhasImagem.length ? `Imagens não lidas: ${falhasImagem.join(", ")}` : null,
        gerado_em: new Date().toISOString(),
      })
      .eq("data_referencia", dia);

    // ---------- E-mail ----------
    let email: any = { enviado: false, motivo: "envio desativado na chamada" };
    if (enviarEmail) {
      email = await enviarResumo(supabase, dia, {
        total: linhas.length,
        comFoto: comFoto.length,
        semFoto: semFoto.length,
        pdfPath,
        zipPath,
        xlsxPath,
      });
    }

    return json({
      ok: true,
      dia,
      total_entregas: linhas.length,
      total_com_canhoto: comFoto.length,
      total_sem_canhoto: semFoto.length,
      paginas_pdf: paginas,
      arquivos: { pdf: pdfPath, zip: zipPath, xlsx: xlsxPath },
      tamanhos_kb: {
        pdf: Math.round(pdfBytes.length / 1024),
        zip: Math.round(zipBytes.length / 1024),
        xlsx: Math.round(xlsxBytes.length / 1024),
      },
      falhas_imagem: falhasImagem,
      email,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("relatorios_canhotos_diarios")
      .upsert({ data_referencia: dia, status: "erro", erro: msg }, { onConflict: "data_referencia" });
    console.error("relatorio-canhotos-diario", msg);
    return json({ ok: false, dia, error: msg }, 500);
  }
});

async function enviarResumo(
  supabase: any,
  dia: string,
  info: { total: number; comFoto: number; semFoto: number; pdfPath: string; zipPath: string; xlsxPath: string },
) {
  const { data: destinatarios } = await supabase
    .from("relatorios_canhotos_destinatarios")
    .select("email")
    .eq("ativo", true);
  const emails: string[] = (destinatarios ?? []).map((d: any) => d.email);
  if (!emails.length) return { enviado: false, motivo: "nenhum destinatário ativo" };

  const links: Record<string, string> = {};
  for (const [chave, path] of Object.entries({ pdf: info.pdfPath, zip: info.zipPath, xlsx: info.xlsxPath })) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
    if (data?.signedUrl) links[chave] = data.signedUrl;
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
          linkPdf: links.pdf ?? "",
          linkZip: links.zip ?? "",
          linkXlsx: links.xlsx ?? "",
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
