import jsPDF from "jspdf";
import QRCode from "qrcode";
import { getMacroRegiaoLabel } from "@/lib/macro-regioes";

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
  destRazaoSocial?: string;
  destLogradouro?: string;
  destNumero?: string;
  destBairro?: string;
  destCidade?: string;
  destUf?: string;
  destCep?: string;
  macroRegiao?: number;
  dataEmissao: string | null;
  ordemEntrega?: number;
  totalEntregas?: number;
  enderecamentos?: string[];
  reentrega?: boolean;
  reentregaObservacao?: string;
  itens: {
    cProd: string;
    xProd: string;
    qtdCaixas: number;
  }[];
}

function buildEnderecoCompleto(nf: NotaFiscalPDF): string {
  const partes: string[] = [];
  const ruaNum = [nf.destLogradouro, nf.destNumero].filter(Boolean).join(", ");
  if (ruaNum) partes.push(ruaNum);
  if (nf.destBairro) partes.push(nf.destBairro);
  const cidadeUf = [nf.destCidade, nf.destUf].filter(Boolean).join("/");
  if (cidadeUf) partes.push(cidadeUf);
  if (nf.destCep) partes.push(`CEP ${nf.destCep}`);
  return partes.join(" - ");
}

function ordinalPt(n: number): string {
  return `${n}ª`;
}

interface EtiquetaData {
  numeroNf: string;
  cProd: string;
  xProd: string;
  seq: number;
  total: number;
  qrPayload: string;
  cnpjDestinatario: string;
  destBairro?: string;
  macroRegiao?: number;
}

// A4 dimensions in mm (landscape)
const A4_LANDSCAPE_WIDTH = 297;
const A4_LANDSCAPE_HEIGHT = 210;
const MARGIN = 15;

// Helper function for real numeric sorting
function numericSort(a: string, b: string): number {
  const numA = parseFloat(a.replace(/\D/g, '')) || 0;
  const numB = parseFloat(b.replace(/\D/g, '')) || 0;
  if (numA !== numB) return numA - numB;
  return a.localeCompare(b);
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

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Data: ${formatDate(carregamentoInfo.data)}`, MARGIN, y);
  doc.text(`Placa: ${carregamentoInfo.placa}`, MARGIN + 80, y);
  doc.text(`Motorista: ${carregamentoInfo.motorista}`, MARGIN + 150, y);
  y += 10;

  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, A4_LANDSCAPE_WIDTH - MARGIN, y);
  y += 8;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  const colWidths = [60, 160, 47];
  const headers = ["Cód. Produto", "Descrição", "Qtd Caixas"];

  doc.setFillColor(220, 220, 220);
  doc.rect(MARGIN, y - 5, pageWidth, 9, "F");

  let x = MARGIN;
  headers.forEach((header, i) => {
    doc.text(header, x + 4, y);
    x += colWidths[i];
  });
  y += 9;

  const sortedItens = [...itens].sort((a, b) => numericSort(a.cProd, b.cProd));

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  let totalCaixas = 0;
  const rowHeight = 7;

  sortedItens.forEach((item, index) => {
    if (y > A4_LANDSCAPE_HEIGHT - 30) {
      doc.addPage();
      y = MARGIN;
    }

    if (index % 2 === 1) {
      doc.setFillColor(245, 245, 245);
      doc.rect(MARGIN, y - 5, pageWidth, rowHeight, "F");
    }

    x = MARGIN;
    doc.text(truncateText(formatCProdDisplay(item.cProd), 35), x + 4, y);
    x += colWidths[0];
    doc.text(truncateText(item.xProd, 90), x + 4, y);
    x += colWidths[1];
    doc.text(item.quantidadeTotal.toString(), x + colWidths[2] - 8, y, {
      align: "right",
    });

    totalCaixas += item.quantidadeTotal;
    y += rowHeight;

    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN, y - 2, A4_LANDSCAPE_WIDTH - MARGIN, y - 2);
  });

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setFillColor(200, 200, 200);
  doc.rect(MARGIN, y - 5, pageWidth, 9, "F");
  doc.text("TOTAL", MARGIN + colWidths[0] + colWidths[1] - 25, y);
  doc.text(totalCaixas.toString(), MARGIN + pageWidth - 8, y, {
    align: "right",
  });

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
  const A4_WIDTH = 210;
  const A4_HEIGHT = 297;
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = A4_WIDTH - MARGIN * 2;

  // Sort NFs by MR → bairro → CNPJ → NF number
  // Se houver ordem de entrega (vinda da roteirização), ela tem prioridade absoluta.
  // Caso contrário, ordena por MR → bairro → CNPJ → NF.
  const sortedNFs = [...notasFiscais].sort((a, b) => {
    const oa = a.ordemEntrega ?? Number.POSITIVE_INFINITY;
    const ob = b.ordemEntrega ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    const mrA = a.macroRegiao ?? 99;
    const mrB = b.macroRegiao ?? 99;
    if (mrA !== mrB) return mrA - mrB;
    const bairroCompare = (a.destBairro || "").localeCompare(b.destBairro || "");
    if (bairroCompare !== 0) return bairroCompare;
    const cnpjCompare = numericSort(a.cnpjDestinatario, b.cnpjDestinatario);
    if (cnpjCompare !== 0) return cnpjCompare;
    return numericSort(a.numeroNf, b.numeroNf);
  });

  let currentMR: number | null = null;

  sortedNFs.forEach((nf, nfIndex) => {
    if (nfIndex > 0) {
      doc.addPage();
    }

    let y = MARGIN;
    const mr = nf.macroRegiao ?? 99;

    // MR header when group changes
    if (mr !== currentMR) {
      currentMR = mr;
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(60, 60, 60);
      doc.rect(MARGIN, y - 5, pageWidth, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(getMacroRegiaoLabel(mr), MARGIN + 4, y + 1);
      doc.setTextColor(0, 0, 0);
      y += 12;
    }

    // NF header
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text(`NF: ${nf.numeroNf}`, MARGIN, y);
    y += 9;

    // Destaque REENTREGA (banner vermelho)
    if (nf.reentrega) {
      const obs = (nf.reentregaObservacao || "").trim();
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      const obsLines = obs ? doc.splitTextToSize(`Obs.: ${obs}`, pageWidth - 6) : [];
      const boxH = 12 + (obsLines.length > 0 ? 5 * obsLines.length + 2 : 0);

      doc.setFillColor(220, 38, 38);
      doc.setDrawColor(127, 29, 29);
      doc.setLineWidth(0.6);
      doc.rect(MARGIN, y - 2, pageWidth, boxH, "FD");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("REENTREGA", MARGIN + pageWidth / 2, y + 6, { align: "center" });

      if (obsLines.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(obsLines, MARGIN + 3, y + 13);
      }
      doc.setTextColor(0, 0, 0);
      y += boxH + 4;
    }


    // Destaque de ordem de entrega (1ª/2ª/...) baseado na rota
    if (nf.ordemEntrega && nf.ordemEntrega > 0) {
      const totalStr = nf.totalEntregas && nf.totalEntregas > 0 ? ` DE ${nf.totalEntregas}` : "";
      const label = `${ordinalPt(nf.ordemEntrega)} ENTREGA${totalStr}`;
      const boxH = 14;
      const boxW = pageWidth;
      doc.setFillColor(255, 230, 0); // amarelo destaque
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.6);
      doc.rect(MARGIN, y - 2, boxW, boxH, "FD");
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text(label, MARGIN + boxW / 2, y + 8, { align: "center" });
      y += boxH + 4;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Emitente: ${nf.razaoSocialEmitente}`, MARGIN, y);
    y += 7;
    doc.text(`CNPJ Emitente: ${nf.cnpjEmitente}`, MARGIN, y);
    y += 7;
    doc.text(`CNPJ Destinatário: ${nf.cnpjDestinatario || "N/A"}`, MARGIN, y);
    if (nf.dataEmissao) {
      doc.text(`Data Emissão: ${formatDate(nf.dataEmissao)}`, MARGIN + 100, y);
    }
    y += 6;

    // Destinatário (razão social)
    if (nf.destRazaoSocial) {
      doc.setFont("helvetica", "bold");
      doc.text("Destinatário:", MARGIN, y);
      doc.setFont("helvetica", "normal");
      const destLines = doc.splitTextToSize(nf.destRazaoSocial, pageWidth - 28);
      doc.text(destLines, MARGIN + 28, y);
      y += 5 * destLines.length + 1;
    }

    // Endereço completo
    const endereco = buildEnderecoCompleto(nf);
    if (endereco) {
      doc.setFont("helvetica", "bold");
      doc.text("Endereço:", MARGIN, y);
      doc.setFont("helvetica", "normal");
      const endLines = doc.splitTextToSize(endereco, pageWidth - 22);
      doc.text(endLines, MARGIN + 22, y);
      y += 5 * endLines.length;
    } else if (nf.destBairro) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.text(`Bairro: ${nf.destBairro} — MR ${mr}`, MARGIN, y + 2);
      y += 6;
    }
    if (endereco && nf.destBairro) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.text(`MR ${mr}`, MARGIN, y + 2);
      y += 6;
    }
    y += 3;

    // Bloco destacado: MR (sempre) + Endereçamento no CD (posições)
    {
      const mrText = `MR ${mr} — ${getMacroRegiaoLabel(mr)}`;
      const posicoes = (nf.enderecamentos || []).filter((p) => p && p.trim().length > 0);
      const posLabel = posicoes.length > 0 ? `Endereçamento CD: ${posicoes.join("  •  ")}` : "Endereçamento CD: — (não cadastrado)";

      doc.setFontSize(11);
      const posLines = doc.splitTextToSize(posLabel, pageWidth - 6);
      const boxH = 8 + 5 * posLines.length;

      doc.setFillColor(232, 244, 255); // azul claro
      doc.setDrawColor(60, 120, 200);
      doc.setLineWidth(0.4);
      doc.rect(MARGIN, y - 2, pageWidth, boxH, "FD");

      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(mrText, MARGIN + 3, y + 3);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(posLines, MARGIN + 3, y + 8);

      y += boxH + 4;
    }

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

      if (index % 2 === 1) {
        doc.setFillColor(245, 245, 245);
        doc.rect(MARGIN, y - 5, pageWidth, rowHeight, "F");
      }

      x = MARGIN;
      doc.text(truncateText(formatCProdDisplay(item.cProd), 25), x + 3, y);
      x += colWidths[0];
      // Limita a descrição à largura real da coluna (com folga de 2mm para não invadir a Qtd)
      const descMaxWidth = colWidths[1] - 5;
      let descText = item.xProd || "";
      while (descText.length > 0 && doc.getTextWidth(descText) > descMaxWidth) {
        descText = descText.slice(0, -1);
      }
      if (descText.length < (item.xProd || "").length) {
        // troca os 3 últimos chars por "..." mantendo dentro da largura
        while (descText.length > 3 && doc.getTextWidth(descText.slice(0, -3) + "...") > descMaxWidth) {
          descText = descText.slice(0, -1);
        }
        descText = descText.slice(0, -3) + "...";
      }
      doc.text(descText, x + 3, y);
      x += colWidths[1];
      doc.text(item.qtdCaixas.toString(), x + colWidths[2] - 5, y, {
        align: "right",
      });
      
      totalCaixasNF += item.qtdCaixas;
      y += rowHeight;

      doc.setDrawColor(200, 200, 200);
      doc.line(MARGIN, y - 2, A4_WIDTH - MARGIN, y - 2);
    });

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
  // Zebra ZD220: physical label 60x40mm
  // The printer + browser print dialog consume ~2-3mm per edge
  // Safe printable area: 50x30mm (5mm margin each side)
  const LABEL_WIDTH = 60;
  const LABEL_HEIGHT = 40;
  const SAFE = 5; // 5mm safe margin for ZD220

  // jsPDF format expects [shorter, longer] side; orientation controls layout
  const doc = new jsPDF({
    orientation: "l",
    unit: "mm",
    format: [LABEL_HEIGHT, LABEL_WIDTH],
  });

  const qrSize = 20; // 20mm QR - still scannable, fits safely
  const safeRight = LABEL_WIDTH - SAFE;
  const safeBottom = LABEL_HEIGHT - SAFE;
  const qrX = safeRight - qrSize;
  const textMaxX = qrX - 2; // 2mm gap before QR
  const textAreaWidth = textMaxX - SAFE;

  // Sort: MR → bairro → CNPJ → NF → cProd → seq (same as Nota de Carga)
  const sortedEtiquetas = [...etiquetas].sort((a, b) => {
    const mrA = a.macroRegiao ?? 99;
    const mrB = b.macroRegiao ?? 99;
    if (mrA !== mrB) return mrA - mrB;
    const bairroCompare = (a.destBairro || "").localeCompare(b.destBairro || "");
    if (bairroCompare !== 0) return bairroCompare;
    const cnpjCompare = numericSort(a.cnpjDestinatario, b.cnpjDestinatario);
    if (cnpjCompare !== 0) return cnpjCompare;
    const nfCompare = numericSort(a.numeroNf, b.numeroNf);
    if (nfCompare !== 0) return nfCompare;
    const prodCompare = numericSort(a.cProd, b.cProd);
    if (prodCompare !== 0) return prodCompare;
    return a.seq - b.seq;
  });

  // Compute total boxes per NF for global sequencing
  const totalPorNf = new Map<string, number>();
  for (const et of sortedEtiquetas) {
    totalPorNf.set(et.numeroNf, (totalPorNf.get(et.numeroNf) || 0) + 1);
  }

  // Track global sequence per NF
  const seqGlobalPorNf = new Map<string, number>();

  for (let i = 0; i < sortedEtiquetas.length; i++) {
    const etiqueta = sortedEtiquetas[i];
    const currentSeqGlobal = (seqGlobalPorNf.get(etiqueta.numeroNf) || 0) + 1;
    seqGlobalPorNf.set(etiqueta.numeroNf, currentSeqGlobal);
    const totalGlobalNf = totalPorNf.get(etiqueta.numeroNf) || 0;

    if (i > 0) {
      doc.addPage([LABEL_HEIGHT, LABEL_WIDTH], "l");
    }

    // QR Code - vertically centered in safe area
    const qrY = SAFE + (safeBottom - SAFE - qrSize) / 2;

    try {
      const qrDataUrl = await QRCode.toDataURL(etiqueta.qrPayload, {
        width: 100,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }

    // Text area on the left side - all within safe margins
    let y = SAFE + 1.5;

    doc.setFontSize(5);
    doc.setFont("helvetica", "bold");
    doc.text("Expresso Ebenezer", SAFE, y);
    y += 2.5;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`NF: ${truncateText(etiqueta.numeroNf, 8)}`, SAFE, y);
    y += 3;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(SAFE, y, textMaxX, y);
    y += 3;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(truncateText(formatCProdDisplay(etiqueta.cProd), 12), SAFE, y);
    y += 3;

    doc.setFontSize(5);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(etiqueta.xProd, textAreaWidth);
    doc.text(descLines.slice(0, 2).join("\n"), SAFE, y);

    // Global NF sequence (top-right of text area)
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(`${currentSeqGlobal}/${totalGlobalNf}`, textMaxX, SAFE + 1.5, { align: "right" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(
      `CX ${etiqueta.seq}/${etiqueta.total}`,
      SAFE,
      safeBottom - 3
    );
  }

  return doc.output("blob");
}

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
