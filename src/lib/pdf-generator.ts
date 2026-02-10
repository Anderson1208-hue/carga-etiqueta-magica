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
  cnpjDestinatario: string;
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
  cnpjDestinatario: string;
}

// A4 dimensions in mm (landscape)
const A4_LANDSCAPE_WIDTH = 297;
const A4_LANDSCAPE_HEIGHT = 210;
const MARGIN = 15;

// Helper function for real numeric sorting
function numericSort(a: string, b: string): number {
  // Extract only digits for numeric comparison
  const numA = parseFloat(a.replace(/\D/g, '')) || 0;
  const numB = parseFloat(b.replace(/\D/g, '')) || 0;
  if (numA !== numB) return numA - numB;
  return a.localeCompare(b); // fallback to string comparison if equal
}

export async function generateRomaneioPDF(
  carregamentoInfo: { data: string; placa: string; motorista: string },
  itens: RomaneioItem[]
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = A4_LANDSCAPE_WIDTH - MARGIN * 2;
  let y = MARGIN;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("ROMANEIO TOTALIZADO", A4_LANDSCAPE_WIDTH / 2, y, { align: "center" });
  y += 12;

  // Load info
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Data: ${formatDate(carregamentoInfo.data)}`, MARGIN, y);
  doc.text(`Placa: ${carregamentoInfo.placa}`, MARGIN + 80, y);
  doc.text(`Motorista: ${carregamentoInfo.motorista}`, MARGIN + 150, y);
  y += 10;

  // Separator line
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, A4_LANDSCAPE_WIDTH - MARGIN, y);
  y += 8;

  // Table header - expanded column widths for landscape
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  const colWidths = [60, 160, 47]; // Expanded widths
  const headers = ["Cód. Produto", "Descrição", "Qtd Caixas"];

  doc.setFillColor(220, 220, 220);
  doc.rect(MARGIN, y - 5, pageWidth, 9, "F");

  let x = MARGIN;
  headers.forEach((header, i) => {
    doc.text(header, x + 4, y);
    x += colWidths[i];
  });
  y += 9;

  // Sort items by cProd numerically (real numeric sort)
  const sortedItens = [...itens].sort((a, b) => numericSort(a.cProd, b.cProd));

  // Table rows with zebra striping
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  let totalCaixas = 0;
  const rowHeight = 7;

  sortedItens.forEach((item, index) => {
    // Check if we need a new page
    if (y > A4_LANDSCAPE_HEIGHT - 30) {
      doc.addPage();
      y = MARGIN;
    }

    // Zebra striping: even rows get light gray background
    if (index % 2 === 1) {
      doc.setFillColor(245, 245, 245);
      doc.rect(MARGIN, y - 5, pageWidth, rowHeight, "F");
    }

    x = MARGIN;

    // Cod Produto (display without leading zeros)
    doc.text(truncateText(formatCProdDisplay(item.cProd), 35), x + 4, y);
    x += colWidths[0];

    // Descrição
    doc.text(truncateText(item.xProd, 90), x + 4, y);
    x += colWidths[1];

    // Quantidade
    doc.text(item.quantidadeTotal.toString(), x + colWidths[2] - 8, y, {
      align: "right",
    });

    totalCaixas += item.quantidadeTotal;
    y += rowHeight;

    // Light separator
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN, y - 2, A4_LANDSCAPE_WIDTH - MARGIN, y - 2);
  });

  // Total row
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setFillColor(200, 200, 200);
  doc.rect(MARGIN, y - 5, pageWidth, 9, "F");
  doc.text("TOTAL", MARGIN + colWidths[0] + colWidths[1] - 25, y);
  doc.text(totalCaixas.toString(), MARGIN + pageWidth - 8, y, {
    align: "right",
  });

  // TOTAL GERAL DE CAIXAS DA CARGA (at the end, prominent)
  y += 15;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(
    `TOTAL GERAL DE CAIXAS: ${totalCaixas}`,
    A4_LANDSCAPE_WIDTH - MARGIN,
    y,
    { align: "right" }
  );

  return doc.output("blob");
}

export async function generateNotaDeCargaPDF(
  carregamentoInfo: { data: string; placa: string; motorista: string },
  notasFiscais: NotaFiscalPDF[]
): Promise<Blob> {
  // A4 Portrait dimensions
  const A4_WIDTH = 210;
  const A4_HEIGHT = 297;
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = A4_WIDTH - MARGIN * 2;

  // CRITICAL: Sort NFs by CNPJ destinatário (numeric), then by numero_nf (numeric)
  const sortedNFs = [...notasFiscais].sort((a, b) => {
    // First sort by CNPJ destinatário (numeric)
    const cnpjCompare = numericSort(a.cnpjDestinatario, b.cnpjDestinatario);
    if (cnpjCompare !== 0) return cnpjCompare;
    // Then by numero_nf (numeric)
    return numericSort(a.numeroNf, b.numeroNf);
  });

  sortedNFs.forEach((nf, nfIndex) => {
    if (nfIndex > 0) {
      doc.addPage();
    }

    let y = MARGIN;

    // Header with NF info
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text(`NF: ${nf.numeroNf}`, MARGIN, y);
    y += 9;

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Emitente: ${nf.razaoSocialEmitente}`, MARGIN, y);
    y += 7;
    doc.text(`CNPJ Emitente: ${nf.cnpjEmitente}`, MARGIN, y);
    y += 7;
    // Include CNPJ destinatário
    doc.text(`CNPJ Destinatário: ${nf.cnpjDestinatario || "N/A"}`, MARGIN, y);
    if (nf.dataEmissao) {
      doc.text(`Data Emissão: ${formatDate(nf.dataEmissao)}`, MARGIN + 100, y);
    }
    y += 9;

    // Separator
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, A4_WIDTH - MARGIN, y);
    y += 8;

    // Items table header
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    const colWidths = [40, 110, 30];
    const headers = ["Cód. Produto", "Descrição", "Qtd Caixas"];

    doc.setFillColor(220, 220, 220);
    doc.rect(MARGIN, y - 5, pageWidth, 9, "F");

    let x = MARGIN;
    headers.forEach((header, i) => {
      doc.text(header, x + 3, y);
      x += colWidths[i];
    });
    y += 9;

    // Items sorted by cProd numerically
    const sortedItens = [...nf.itens].sort((a, b) => numericSort(a.cProd, b.cProd));

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const rowHeight = 7;

    let totalCaixasNF = 0;

    sortedItens.forEach((item, index) => {
      if (y > A4_HEIGHT - 35) {
        doc.addPage();
        y = MARGIN;
      }

      // Zebra striping: even rows get light gray background
      if (index % 2 === 1) {
        doc.setFillColor(245, 245, 245);
        doc.rect(MARGIN, y - 5, pageWidth, rowHeight, "F");
      }

      x = MARGIN;
      doc.text(truncateText(formatCProdDisplay(item.cProd), 25), x + 3, y);
      x += colWidths[0];
      doc.text(truncateText(item.xProd, 65), x + 3, y);
      x += colWidths[1];
      doc.text(item.qtdCaixas.toString(), x + colWidths[2] - 5, y, {
        align: "right",
      });
      
      totalCaixasNF += item.qtdCaixas;
      y += rowHeight;

      doc.setDrawColor(200, 200, 200);
      doc.line(MARGIN, y - 2, A4_WIDTH - MARGIN, y - 2);
    });

    // Total de caixas da NF (at the end of each NF)
    y += 5;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(
      `TOTAL DE CAIXAS DA NF: ${totalCaixasNF}`,
      A4_WIDTH - MARGIN,
      y,
      { align: "right" }
    );
  });

  return doc.output("blob");
}

export async function generateEtiquetasPDF(
  etiquetas: EtiquetaData[]
): Promise<Blob> {
  // Label size: 60mm x 40mm for Zebra ZD220
  const LABEL_WIDTH = 60;
  const LABEL_HEIGHT = 40;
  // ZD220 unprintable margins: ~3mm top/bottom, ~2mm left/right
  const MARGIN_LEFT = 3;
  const MARGIN_RIGHT = 3;
  const MARGIN_TOP = 3;
  const MARGIN_BOTTOM = 3;

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [LABEL_WIDTH, LABEL_HEIGHT],
  });

  const qrSize = 18; // slightly smaller QR for better fit
  const printableWidth = LABEL_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const textAreaWidth = printableWidth - qrSize - 3; // text area left of QR

  // CRITICAL: Sort by CNPJ destinatário FIRST, then by numero_nf, then by cProd, then by seq
  const sortedEtiquetas = [...etiquetas].sort((a, b) => {
    const cnpjCompare = numericSort(a.cnpjDestinatario, b.cnpjDestinatario);
    if (cnpjCompare !== 0) return cnpjCompare;
    const nfCompare = numericSort(a.numeroNf, b.numeroNf);
    if (nfCompare !== 0) return nfCompare;
    const prodCompare = numericSort(a.cProd, b.cProd);
    if (prodCompare !== 0) return prodCompare;
    return a.seq - b.seq;
  });

  for (let i = 0; i < sortedEtiquetas.length; i++) {
    const etiqueta = sortedEtiquetas[i];

    if (i > 0) {
      doc.addPage([LABEL_WIDTH, LABEL_HEIGHT], "landscape");
    }

    // Border rectangle within printable area
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN_LEFT - 1, MARGIN_TOP - 1, LABEL_WIDTH - MARGIN_LEFT - MARGIN_RIGHT + 2, LABEL_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM + 2);

    let y = MARGIN_TOP + 2;

    // NF number - prominent
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`NF: ${etiqueta.numeroNf}`, MARGIN_LEFT, y);
    y += 5;

    // Thin separator under NF
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_LEFT, y - 1, LABEL_WIDTH - MARGIN_RIGHT - qrSize - 2, y - 1);

    // Product code
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Cód: ${truncateText(formatCProdDisplay(etiqueta.cProd), 16)}`, MARGIN_LEFT, y + 2);
    y += 6;

    // Product description (up to 2 lines, constrained to left of QR)
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(etiqueta.xProd, textAreaWidth);
    doc.text(descLines.slice(0, 2).join("\n"), MARGIN_LEFT, y);

    // Box number - prominent at bottom with safe offset for ZD220
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(
      `CX ${etiqueta.seq}/${etiqueta.total}`,
      MARGIN_LEFT,
      LABEL_HEIGHT - MARGIN_BOTTOM - 2
    );

    // QR Code (right side, vertically centered within printable area)
    try {
      const qrDataUrl = await QRCode.toDataURL(etiqueta.qrPayload, {
        width: 80,
        margin: 1,
        errorCorrectionLevel: "M",
      });

      const qrX = LABEL_WIDTH - MARGIN_RIGHT - qrSize;
      const qrY = (LABEL_HEIGHT - qrSize) / 2;
      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  }

  return doc.output("blob");
}

// Remove leading zeros for display only (does not affect stored value or QR code)
function formatCProdDisplay(cProd: string): string {
  const num = parseInt(cProd, 10);
  return isNaN(num) ? cProd : num.toString();
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

export function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 1000);
  };
}
