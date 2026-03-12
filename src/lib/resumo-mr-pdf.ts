import jsPDF from "jspdf";
import { format } from "date-fns";
import { calculateBoxes } from "@/lib/xml-parser";
import { getMacroRegiaoLabel } from "@/lib/macro-regioes";

interface NfResumoMR {
  numeroNf: string;
  cnpjDestinatario: string;
  destBairro: string;
  itens: { cProd: string; xProd: string; qCom: number }[];
}

interface ResumoMRData {
  placa: string;
  motorista: string;
  data: string;
  macroRegiao: number;
  nfs: NfResumoMR[];
}

export function generateResumoMRPDF(data: ResumoMRData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const M = 10;
  const CW = PW - 2 * M;
  let y = M;

  const mrLabel = getMacroRegiaoLabel(data.macroRegiao);

  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, PW, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`RESUMO ${mrLabel}`, M, 9);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${data.placa} | ${data.motorista} | ${format(new Date(data.data + "T12:00:00"), "dd/MM/yyyy")}`,
    M, 16
  );
  y = 24;

  // Totals
  const totalNfs = data.nfs.length;
  const totalCaixas = data.nfs.reduce(
    (s, nf) => s + nf.itens.reduce((si, it) => si + calculateBoxes(it.qCom), 0), 0
  );

  doc.setTextColor(30, 30, 30);
  doc.setFillColor(230, 237, 250);
  doc.rect(M, y, CW, 7, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`${totalNfs} NFs  •  ${totalCaixas} caixas`, M + 3, y + 5);
  y += 10;

  // Table header
  const col = { nf: M, cod: M + 22, desc: M + 52, cx: PW - M };

  doc.setFillColor(37, 99, 235);
  doc.rect(M, y, CW, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("NF", col.nf + 2, y + 4.2);
  doc.text("CÓD", col.cod, y + 4.2);
  doc.text("PRODUTO", col.desc, y + 4.2);
  doc.text("CX", col.cx - 2, y + 4.2, { align: "right" });
  y += 7;

  doc.setTextColor(30, 30, 30);

  let lastNf = "";
  let rowIdx = 0;

  for (const nf of data.nfs) {
    const sortedItens = [...nf.itens].sort((a, b) => {
      const numA = parseFloat(a.cProd.replace(/\D/g, "")) || 0;
      const numB = parseFloat(b.cProd.replace(/\D/g, "")) || 0;
      return numA - numB;
    });

    let nfTotalCx = 0;

    for (const item of sortedItens) {
      const cx = calculateBoxes(item.qCom);
      nfTotalCx += cx;

      if (y > 280) {
        doc.addPage();
        y = M;
        // Repeat header
        doc.setFillColor(37, 99, 235);
        doc.rect(M, y, CW, 6, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text("NF", col.nf + 2, y + 4.2);
        doc.text("CÓD", col.cod, y + 4.2);
        doc.text("PRODUTO", col.desc, y + 4.2);
        doc.text("CX", col.cx - 2, y + 4.2, { align: "right" });
        y += 7;
        doc.setTextColor(30, 30, 30);
      }

      // Zebra stripe
      if (rowIdx % 2 === 0) {
        doc.setFillColor(248, 249, 252);
        doc.rect(M, y - 0.5, CW, 4.5, "F");
      }

      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");

      // Show NF number only on first row of each NF
      if (nf.numeroNf !== lastNf) {
        doc.setFont("helvetica", "bold");
        doc.text(nf.numeroNf, col.nf + 2, y + 3);
        doc.setFont("helvetica", "normal");
        lastNf = nf.numeroNf;
      }

      doc.text(String(parseInt(item.cProd, 10) || item.cProd), col.cod, y + 3);
      const descTrunc = item.xProd.length > 55 ? item.xProd.substring(0, 52) + "..." : item.xProd;
      doc.text(descTrunc, col.desc, y + 3);
      doc.text(String(cx), col.cx - 2, y + 3, { align: "right" });

      y += 4.5;
      rowIdx++;
    }

    // NF subtotal line
    if (y > 283) { doc.addPage(); y = M; }
    doc.setDrawColor(200, 200, 200);
    doc.line(M, y, M + CW, y);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text(`Total NF ${nf.numeroNf}: ${nfTotalCx} cx`, col.cx - 2, y + 3.5, { align: "right" });
    y += 5;
  }

  // Grand total
  if (y + 10 > 290) { doc.addPage(); y = M; }
  doc.setFillColor(37, 99, 235);
  doc.rect(M, y, CW, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL: ${totalNfs} NFs  •  ${totalCaixas} caixas`, M + 3, y + 5.5);

  // Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i}/${totalPages}`, PW - M, 297 - 6, { align: "right" });
    doc.text(mrLabel, M, 297 - 6);
    doc.setTextColor(0, 0, 0);
  }

  return doc.output("blob");
}
