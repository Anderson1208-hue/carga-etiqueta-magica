import jsPDF from "jspdf";
import { format } from "date-fns";
import { calculateBoxes } from "@/lib/xml-parser";

export interface VeiculoDiaData {
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

export interface ResumoDiaData {
  data: string; // yyyy-MM-dd
  veiculos: VeiculoDiaData[];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.substring(0, max - 2) + "…";
}

export async function generateResumoDiaPDF(data: ResumoDiaData): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const PH = 297;
  const M = 12;
  const CW = PW - 2 * M;
  let y = M;

  const dataFormatada = format(new Date(data.data + "T12:00:00"), "dd/MM/yyyy");

  // ===== Cover header =====
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, PW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMO DA PROGRAMAÇÃO DO DIA", M, 12);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Data: ${dataFormatada}`, M, 19);
  doc.text(`Veículos: ${data.veiculos.length}`, M, 24.5);
  y = 33;

  // ===== Totais gerais =====
  let gNfs = 0, gCx = 0, gPeso = 0, gVol = 0, gEntregas = 0;
  const veiculosCalc = data.veiculos.map((v) => {
    const entregas = new Map<string, { razaoSocial: string; endereco: string; nfs: VeiculoDiaData["nfs"]; ordem: number | undefined }>();
    v.nfs.forEach((nf) => {
      const cnpj = nf.cnpj_destinatario || "SEM_CNPJ";
      if (!entregas.has(cnpj)) {
        const end = [nf.dest_logradouro, nf.dest_numero, nf.dest_bairro, nf.dest_cidade, nf.dest_uf]
          .filter(Boolean).join(", ");
        entregas.set(cnpj, { razaoSocial: nf.dest_razao_social || "—", endereco: end || "—", nfs: [], ordem: nf.ordem_entrega });
      }
      const grp = entregas.get(cnpj)!;
      grp.nfs.push(nf);
      if (grp.ordem === undefined && nf.ordem_entrega !== undefined) grp.ordem = nf.ordem_entrega;
    });
    // Ordena entregas pela ordem da rota
    const entregasOrdenadas = new Map(
      Array.from(entregas.entries()).sort((a, b) => {
        const oa = a[1].ordem ?? Number.POSITIVE_INFINITY;
        const ob = b[1].ordem ?? Number.POSITIVE_INFINITY;
        return oa - ob;
      })
    );
    const totNfs = v.nfs.length;
    const totCx = v.nfs.reduce((s, nf) => s + nf.itens_nf.reduce((si, it) => si + calculateBoxes(Number(it.q_com)), 0), 0);
    const totPeso = v.nfs.reduce((s, nf) => s + Number(nf.peso_bruto || 0), 0);
    const totVol = v.nfs.reduce((s, nf) => s + Number(nf.volume_m3 || 0), 0);
    gNfs += totNfs; gCx += totCx; gPeso += totPeso; gVol += totVol; gEntregas += entregas.size;
    const totalRota = v.totalEntregasRota || entregas.size;
    return { v, entregas: entregasOrdenadas, totNfs, totCx, totPeso, totVol, totalRota };
  });

  doc.setFillColor(240, 245, 255);
  doc.rect(M, y, CW, 14, "F");
  doc.setDrawColor(200, 215, 240);
  doc.rect(M, y, CW, 14);
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAIS DO DIA", M + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const linha1 = `${data.veiculos.length} veículos  |  ${gNfs} NFs  |  ${gCx} caixas`;
  const linha2 = `${gPeso.toFixed(1)} kg  |  ${gVol.toFixed(2)} m³`;
  doc.text(linha1, M + 3, y + 9.5);
  doc.text(linha2, M + 3, y + 12.8);
  y += 18;

  // ===== Cada veículo =====
  for (let vi = 0; vi < veiculosCalc.length; vi++) {
    const { v, entregas, totNfs, totCx, totPeso, totVol } = veiculosCalc[vi];

    // estimate veiculo block min height
    const minBlockH = 14 + 6; // header + summary
    if (y + minBlockH > PH - 10) { doc.addPage(); y = M; }

    // Veículo header
    doc.setFillColor(37, 99, 235);
    doc.rect(M, y, CW, 9, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`VEÍCULO ${vi + 1}/${veiculosCalc.length}  •  ${v.placa}`, M + 3, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const motTxt = truncate(v.motorista || "Sem motorista", 50);
    const codeTxt = v.accessCode ? `  •  Código: ${v.accessCode}` : "";
    const rightTxt = motTxt + codeTxt;
    doc.text(rightTxt, PW - M - doc.getTextWidth(rightTxt) - 3, y + 6);
    y += 9;

    // Summary line
    doc.setFillColor(230, 237, 250);
    doc.rect(M, y, CW, 6, "F");
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    const sum = `${entregas.size} entregas  |  ${totNfs} NFs  |  ${totCx} cx  |  ${totPeso.toFixed(1)} kg  |  ${totVol.toFixed(2)} m³`;
    doc.text(sum, M + 3, y + 4);
    y += 6;

    // Entregas
    let fallbackIdx = 0;
    for (const [, group] of entregas) {
      fallbackIdx++;
      const ordemNum = group.ordem ?? fallbackIdx;
      const blockH = 7 + 4 + group.nfs.length * 4.2 + 2;
      if (y + blockH > PH - 10) { doc.addPage(); y = M; }

      // Entrega title
      doc.setFillColor(248, 250, 252);
      doc.rect(M, y, CW, 6.5, "F");
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(`Entrega ${ordemNum} — ${truncate(group.razaoSocial, 60)}`, M + 2, y + 4.3);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.2);
      const summary = `${group.nfs.length} NFs`;
      doc.text(summary, PW - M - doc.getTextWidth(summary) - 2, y + 4.3);
      y += 6.5;

      // Endereço
      doc.setFontSize(5.8);
      doc.setTextColor(100, 100, 100);
      doc.text(truncate(group.endereco, 110), M + 4, y + 3);
      y += 4;

      // NFs
      doc.setFontSize(6.2);
      for (const nf of group.nfs) {
        if (y > PH - 10) { doc.addPage(); y = M; }
        const cx = nf.itens_nf.reduce((s, it) => s + calculateBoxes(Number(it.q_com)), 0);
        const cteStr = nf.ctes.length > 0 ? `  CT-e ${nf.ctes.map((c) => c.numero_cte).join(", ")}` : "";

        doc.setTextColor(30, 30, 30);
        doc.setFont("helvetica", "normal");
        doc.text(`NF ${nf.numero_nf}${cteStr}`, M + 6, y + 3);
        const detail = `${cx} cx   ${Number(nf.peso_bruto || 0).toFixed(1)} kg   ${Number(nf.volume_m3 || 0).toFixed(2)} m³`;
        doc.text(detail, PW - M - doc.getTextWidth(detail) - 2, y + 3);
        y += 4.2;
      }
      y += 2;
    }
    y += 3;
  }

  // Footer page numbers
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Página ${p}/${total}  •  Resumo do Dia ${dataFormatada}`, PW / 2, PH - 5, { align: "center" });
  }

  return doc.output("blob");
}
