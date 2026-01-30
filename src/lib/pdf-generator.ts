import jsPDF from "jspdf";
import QRCode from "qrcode";

interface RomaneioItem {
  cProd: string;
  xProd: string;
  quantidadeTotal: number;
}

interface NotaFiscalPDF {
  numeroNf: string;
  razaoSocialEmitente: string;
  cnpjEmitente: string;
  dataEmissao: string | null;
  itens: {
    cProd: string;
    xProd: string;
    qtdCaixas: number;
  }[];
}

interface EtiquetaData {
  numeroNf: string;
  cProd: string;
  xProd: string;
  seq: number;
  total: number;
  qrPayload: string;
}

// A4 dimensions in mm
const A4_WIDTH = 210;
const A4_HEIGHT = 297;
const MARGIN = 15;

export async function generateRomaneioPDF(
  carregamentoInfo: { data: string; placa: string; motorista: string },
  itens: RomaneioItem[]
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = A4_WIDTH - MARGIN * 2;
  let y = MARGIN;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("ROMANEIO TOTALIZADO", A4_WIDTH / 2, y, { align: "center" });
  y += 12;

  // Load info
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Data: ${formatDate(carregamentoInfo.data)}`, MARGIN, y);
  doc.text(`Placa: ${carregamentoInfo.placa}`, MARGIN + 60, y);
  doc.text(`Motorista: ${carregamentoInfo.motorista}`, MARGIN + 110, y);
  y += 8;

  // Separator line
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, A4_WIDTH - MARGIN, y);
  y += 8;

  // Table header
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const colWidths = [35, 110, 35];
  const headers = ["Cód. Produto", "Descrição", "Qtd Caixas"];

  doc.setFillColor(240, 240, 240);
  doc.rect(MARGIN, y - 4, pageWidth, 8, "F");

  let x = MARGIN;
  headers.forEach((header, i) => {
    doc.text(header, x + 2, y);
    x += colWidths[i];
  });
  y += 8;

  // Table rows
  doc.setFont("helvetica", "normal");
  let totalCaixas = 0;

  itens.forEach((item) => {
    // Check if we need a new page
    if (y > A4_HEIGHT - 30) {
      doc.addPage();
      y = MARGIN;
    }

    x = MARGIN;

    // Cod Produto
    doc.text(truncateText(item.cProd, 30), x + 2, y);
    x += colWidths[0];

    // Descrição
    doc.text(truncateText(item.xProd, 65), x + 2, y);
    x += colWidths[1];

    // Quantidade
    doc.text(item.quantidadeTotal.toString(), x + colWidths[2] - 5, y, {
      align: "right",
    });

    totalCaixas += item.quantidadeTotal;
    y += 6;

    // Light separator
    doc.setDrawColor(220, 220, 220);
    doc.line(MARGIN, y - 2, A4_WIDTH - MARGIN, y - 2);
  });

  // Total
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFillColor(230, 230, 230);
  doc.rect(MARGIN, y - 4, pageWidth, 8, "F");
  doc.text("TOTAL", MARGIN + colWidths[0] + colWidths[1] - 20, y);
  doc.text(totalCaixas.toString(), MARGIN + pageWidth - 5, y, {
    align: "right",
  });

  return doc.output("blob");
}

export async function generateNotaDeCargaPDF(
  carregamentoInfo: { data: string; placa: string; motorista: string },
  notasFiscais: NotaFiscalPDF[]
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = A4_WIDTH - MARGIN * 2;

  notasFiscais.forEach((nf, nfIndex) => {
    if (nfIndex > 0) {
      doc.addPage();
    }

    let y = MARGIN;

    // Header with NF info
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`NF: ${nf.numeroNf}`, MARGIN, y);
    y += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Emitente: ${nf.razaoSocialEmitente}`, MARGIN, y);
    y += 6;
    doc.text(`CNPJ: ${nf.cnpjEmitente}`, MARGIN, y);
    if (nf.dataEmissao) {
      doc.text(`Data Emissão: ${formatDate(nf.dataEmissao)}`, MARGIN + 80, y);
    }
    y += 8;

    // Separator
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, A4_WIDTH - MARGIN, y);
    y += 8;

    // Items table header
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const colWidths = [35, 115, 30];
    const headers = ["Cód. Produto", "Descrição", "Qtd Caixas"];

    doc.setFillColor(240, 240, 240);
    doc.rect(MARGIN, y - 4, pageWidth, 8, "F");

    let x = MARGIN;
    headers.forEach((header, i) => {
      doc.text(header, x + 2, y);
      x += colWidths[i];
    });
    y += 8;

    // Items sorted by cProd
    const sortedItens = [...nf.itens].sort((a, b) =>
      a.cProd.localeCompare(b.cProd)
    );

    doc.setFont("helvetica", "normal");

    sortedItens.forEach((item) => {
      if (y > A4_HEIGHT - 20) {
        doc.addPage();
        y = MARGIN;
      }

      x = MARGIN;
      doc.text(truncateText(item.cProd, 30), x + 2, y);
      x += colWidths[0];
      doc.text(truncateText(item.xProd, 70), x + 2, y);
      x += colWidths[1];
      doc.text(item.qtdCaixas.toString(), x + colWidths[2] - 5, y, {
        align: "right",
      });
      y += 6;

      doc.setDrawColor(220, 220, 220);
      doc.line(MARGIN, y - 2, A4_WIDTH - MARGIN, y - 2);
    });
  });

  return doc.output("blob");
}

export async function generateEtiquetasPDF(
  etiquetas: EtiquetaData[]
): Promise<Blob> {
  // Label size: 60mm x 40mm
  const LABEL_WIDTH = 60;
  const LABEL_HEIGHT = 40;
  const LABEL_MARGIN = 2;

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [LABEL_WIDTH, LABEL_HEIGHT],
  });

  // Sort by cProd then by seq
  const sortedEtiquetas = [...etiquetas].sort((a, b) => {
    const prodCompare = a.cProd.localeCompare(b.cProd);
    if (prodCompare !== 0) return prodCompare;
    return a.seq - b.seq;
  });

  for (let i = 0; i < sortedEtiquetas.length; i++) {
    const etiqueta = sortedEtiquetas[i];

    if (i > 0) {
      doc.addPage([LABEL_WIDTH, LABEL_HEIGHT], "landscape");
    }

    const contentWidth = LABEL_WIDTH - LABEL_MARGIN * 2;
    let y = LABEL_MARGIN + 2;

    // NF number - prominent
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`NF: ${etiqueta.numeroNf}`, LABEL_MARGIN, y);
    y += 5;

    // Product code
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(`Cód: ${truncateText(etiqueta.cProd, 25)}`, LABEL_MARGIN, y);
    y += 4;

    // Product description (up to 2 lines)
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(etiqueta.xProd, contentWidth - 22);
    doc.text(descLines.slice(0, 2).join("\n"), LABEL_MARGIN, y);
    y += descLines.length > 1 ? 6 : 3;

    // Box number
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(
      `CAIXA ${etiqueta.seq}/${etiqueta.total}`,
      LABEL_MARGIN,
      LABEL_HEIGHT - LABEL_MARGIN - 2
    );

    // QR Code (right side)
    try {
      const qrDataUrl = await QRCode.toDataURL(etiqueta.qrPayload, {
        width: 80,
        margin: 1,
        errorCorrectionLevel: "M",
      });

      const qrSize = 20; // 20mm for QR with quiet zone
      doc.addImage(
        qrDataUrl,
        "PNG",
        LABEL_WIDTH - LABEL_MARGIN - qrSize,
        LABEL_MARGIN + 2,
        qrSize,
        qrSize
      );
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  }

  return doc.output("blob");
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR");
  } catch {
    return dateStr;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
