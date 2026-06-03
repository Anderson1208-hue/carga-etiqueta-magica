import jsPDF from "jspdf";
import { format } from "date-fns";
import { calculateBoxes } from "@/lib/xml-parser";

interface VeiculoResumoData {
  placa: string;
  motorista: string;
  data: string;
  accessCode?: string | null;
  totalEntregasRota?: number;
  nfs: {
    numero_nf: string;
    dest_razao_social: string;
    dest_logradouro: string;
    dest_numero: string;
    dest_bairro: string;
    dest_cidade: string;
    dest_uf: string;
    dest_cep: string;
    cnpj_destinatario: string;
    razao_social_emitente?: string;
    peso_bruto: number;
    volume_m3: number;
    itens_nf: { q_com: number }[];
    ctes: { numero_cte: string }[];
    ordem_entrega?: number;
  }[];
}

export async function generateResumoVeiculoPDF(data: VeiculoResumoData): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const M = 12;
  const CW = PW - 2 * M;
  let y = M;

  // Header bar
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, PW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMO DE ENTREGAS", M, 10);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${data.placa} | ${data.motorista || "Sem motorista"} | ${format(new Date(data.data + "T12:00:00"), "dd/MM/yyyy")}`,
    M, 18
  );
  if (data.accessCode) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const codeLabel = `Código: ${data.accessCode}`;
    doc.text(codeLabel, PW - M - doc.getTextWidth(codeLabel), 10);
  }
  y = 27;

  // Group by CNPJ, capturando ordem de entrega da rota
  const entregas = new Map<string, { razaoSocial: string; endereco: string; nfs: VeiculoResumoData["nfs"]; ordem: number | undefined }>();
  data.nfs.forEach((nf) => {
    const cnpj = nf.cnpj_destinatario || "SEM_CNPJ";
    if (!entregas.has(cnpj)) {
      const end = [nf.dest_logradouro, nf.dest_numero, nf.dest_bairro, nf.dest_cidade, nf.dest_uf].filter(Boolean).join(", ");
      entregas.set(cnpj, { razaoSocial: nf.dest_razao_social || "—", endereco: end || "—", nfs: [], ordem: nf.ordem_entrega });
    }
    const grp = entregas.get(cnpj)!;
    grp.nfs.push(nf);
    if (grp.ordem === undefined && nf.ordem_entrega !== undefined) grp.ordem = nf.ordem_entrega;
  });

  // Ordena entregas pela ordem da rota (sem ordem vai pro fim)
  const entregasOrdenadas = Array.from(entregas.entries()).sort((a, b) => {
    const oa = a[1].ordem ?? Number.POSITIVE_INFINITY;
    const ob = b[1].ordem ?? Number.POSITIVE_INFINITY;
    return oa - ob;
  });

  const totalRota = data.totalEntregasRota || entregas.size;
  let gtNfs = 0, gtCx = 0, gtPeso = 0, gtVol = 0;
  let fallbackIdx = 0;

  for (const [, group] of entregasOrdenadas) {
    fallbackIdx++;
    const ordemNum = group.ordem ?? fallbackIdx;
    const totalNfs = group.nfs.length;
    const totalCx = group.nfs.reduce((s, nf) => s + nf.itens_nf.reduce((si, it) => si + calculateBoxes(Number(it.q_com)), 0), 0);
    const totalPeso = group.nfs.reduce((s, nf) => s + Number(nf.peso_bruto || 0), 0);
    const totalVol = group.nfs.reduce((s, nf) => s + Number(nf.volume_m3 || 0), 0);
    gtNfs += totalNfs; gtCx += totalCx; gtPeso += totalPeso; gtVol += totalVol;

    // Estimate height: header(8) + nfs(4.5 each) + margin(3)
    const blockH = 8 + totalNfs * 4.5 + 3;
    if (y + blockH > 285) { doc.addPage(); y = M; }

    // Entrega header
    doc.setFillColor(230, 237, 250);
    doc.rect(M, y, CW, 7, "F");
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(`Entrega ${ordemNum} de ${totalRota} — ${truncate(group.razaoSocial, 36)}`, M + 2, y + 4.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    const summary = `${totalNfs} NFs | ${totalCx} cx | ${totalPeso.toFixed(1)} kg | ${totalVol.toFixed(2)} m³`;
    doc.text(summary, PW - M - doc.getTextWidth(summary), y + 4.5);
    y += 7;

    // Address line
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text(truncate(group.endereco, 90), M + 2, y + 3);
    y += 4;

    // NFs
    doc.setFontSize(6.5);
    for (const nf of group.nfs) {
      if (y > 285) { doc.addPage(); y = M; }
      const cx = nf.itens_nf.reduce((s, it) => s + calculateBoxes(Number(it.q_com)), 0);
      const cteStr = nf.ctes.length > 0 ? `  CT-e ${nf.ctes.map(c => c.numero_cte).join(", ")}` : "";
      const embStr = nf.razao_social_emitente ? `  •  Emb: ${truncate(nf.razao_social_emitente, 32)}` : "";

      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "normal");
      doc.text(`NF ${nf.numero_nf}${cteStr}${embStr}`, M + 4, y + 3);

      const detail = `${cx} cx   ${Number(nf.peso_bruto || 0).toFixed(1)} kg   ${Number(nf.volume_m3 || 0).toFixed(2)} m³`;
      doc.text(detail, PW - M - doc.getTextWidth(detail), y + 3);
      y += 4.5;
    }
    y += 2;
  }

  // Footer totals
  if (y + 10 > 290) { doc.addPage(); y = M; }
  doc.setFillColor(37, 99, 235);
  doc.rect(M, y, CW, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(
    `TOTAL: ${entregas.size} entregas | ${gtNfs} NFs | ${gtCx} cx | ${gtPeso.toFixed(1)} kg | ${gtVol.toFixed(2)} m³`,
    M + 3, y + 5.5
  );

  return doc.output("blob");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.substring(0, max - 2) + "…";
}
