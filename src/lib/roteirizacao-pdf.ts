import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
}

interface NfDetail {
  numero_nf: string;
  peso_bruto: number;
  volume_m3: number;
}

interface CteDetail {
  numero_cte: string;
  razao_social_emitente: string;
  valor_frete: number;
}

interface Parada {
  cep: string;
  cnpjDestinatario: string;
  razaoSocial: string;
  enderecoCompleto: string;
  latitude: number | null;
  longitude: number | null;
  totalNfs: number;
  totalCaixas: number;
  pesoTotalKg: number;
  volumeTotalM3: number;
  ordem?: number;
  nfsDetail?: NfDetail[];
  ctesDetail?: CteDetail[];
}

interface RoteirizacaoData {
  carga: Carga;
  cdNome: string;
  cdLat: number;
  cdLng: number;
  distanciaTotalKm: number;
  tempoEstimadoMin: number;
  pesoTotalKg: number;
  volumeTotalM3: number;
  paradas: Parada[];
}

export async function generateRoteirizacaoPDF(data: RoteirizacaoData): Promise<Blob> {
  const {
    carga,
    cdNome,
    distanciaTotalKm,
    tempoEstimadoMin,
    pesoTotalKg,
    volumeTotalM3,
    paradas,
  } = data;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;
  const MARGIN = 15;
  const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

  let y = MARGIN;

  // Header
  doc.setFillColor(37, 99, 235); // Primary blue
  doc.rect(0, 0, PAGE_WIDTH, 35, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("ROTEIRIZAÇÃO DE ENTREGAS", MARGIN, 15);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Placa: ${carga.placa} | Motorista: ${carga.motorista} | Data: ${format(
      new Date(carga.data),
      "dd/MM/yyyy"
    )}`,
    MARGIN,
    24
  );

  doc.text(
    `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    MARGIN,
    31
  );

  y = 45;

  // Summary Card - Row 1
  doc.setTextColor(0, 0, 0);
  doc.setFillColor(240, 249, 255); // Light blue
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 35, 3, 3, "F");

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("PONTO DE PARTIDA", MARGIN + 5, y + 7);
  doc.text("PARADAS", MARGIN + 50, y + 7);
  doc.text("DISTÂNCIA", MARGIN + 80, y + 7);
  doc.text("TEMPO", MARGIN + 110, y + 7);
  doc.text("PESO TOTAL", MARGIN + 140, y + 7);
  doc.text("VOLUME", MARGIN + 170, y + 7);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(cdNome.substring(0, 18), MARGIN + 5, y + 16);
  doc.text(String(paradas.length), MARGIN + 50, y + 16);
  doc.text(`${distanciaTotalKm.toFixed(1)} km`, MARGIN + 80, y + 16);
  
  const hours = Math.floor(tempoEstimadoMin / 60);
  const mins = tempoEstimadoMin % 60;
  doc.text(`${hours}h ${mins}min`, MARGIN + 110, y + 16);
  doc.text(`${pesoTotalKg.toFixed(1)} kg`, MARGIN + 140, y + 16);
  doc.text(`${volumeTotalM3.toFixed(2)} m³`, MARGIN + 170, y + 16);

  // Summary totals row
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const totalNfs = paradas.reduce((sum, p) => sum + p.totalNfs, 0);
  const totalCaixas = paradas.reduce((sum, p) => sum + p.totalCaixas, 0);
  doc.text(`Total: ${totalNfs} NFs | ${totalCaixas} caixas`, MARGIN + 5, y + 28);

  y += 42;

  // Stops Table Header
  doc.setFillColor(51, 65, 85); // Slate-700
  doc.rect(MARGIN, y, CONTENT_WIDTH, 10, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  
  const colWidths = [10, 42, 48, 24, 24, 22, 10];
  let x = MARGIN;

  doc.text("#", x + 3, y + 7);
  x += colWidths[0];
  doc.text("CLIENTE / CEP", x + 2, y + 7);
  x += colWidths[1];
  doc.text("ENDEREÇO", x + 2, y + 7);
  x += colWidths[2];
  doc.text("NFs/CX", x + 2, y + 7);
  x += colWidths[3];
  doc.text("PESO", x + 2, y + 7);
  x += colWidths[4];
  doc.text("VOLUME", x + 2, y + 7);
  x += colWidths[5];
  doc.text("", x + 2, y + 7);

  y += 10;

  // Stops Rows
  doc.setTextColor(0, 0, 0);
  const sortedParadas = [...paradas].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  for (let i = 0; i < sortedParadas.length; i++) {
    const parada = sortedParadas[i];

    // Check page break
    if (y > PAGE_HEIGHT - 30) {
      doc.addPage();
      y = MARGIN;

      // Repeat header
      doc.setFillColor(51, 65, 85);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 10, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");

      x = MARGIN;
      doc.text("#", x + 3, y + 7);
      x += colWidths[0];
      doc.text("CLIENTE / CEP", x + 2, y + 7);
      x += colWidths[1];
      doc.text("ENDEREÇO", x + 2, y + 7);
      x += colWidths[2];
      doc.text("NFs/CX", x + 2, y + 7);
      x += colWidths[3];
      doc.text("PESO", x + 2, y + 7);
      x += colWidths[4];
      doc.text("VOLUME", x + 2, y + 7);
      x += colWidths[5];
      doc.text("", x + 2, y + 7);

      y += 10;
      doc.setTextColor(0, 0, 0);
    }

    // Zebra striping
    if (i % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 14, "F");
    }

    x = MARGIN;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(String(parada.ordem || i + 1), x + 3, y + 6);

    x += colWidths[0];
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(truncateText(parada.razaoSocial, 22), x + 2, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(parada.cep, x + 2, y + 10);

    x += colWidths[1];
    doc.setFontSize(6);
    // Split address into multiple lines if needed
    const addressLines = doc.splitTextToSize(parada.enderecoCompleto, colWidths[2] - 4);
    doc.text(addressLines.slice(0, 2), x + 2, y + 5);

    x += colWidths[2];
    doc.setFontSize(7);
    doc.text(`${parada.totalNfs} NFs`, x + 2, y + 5);
    doc.text(`${parada.totalCaixas} cx`, x + 2, y + 10);

    x += colWidths[3];
    doc.setFontSize(7);
    doc.text(`${parada.pesoTotalKg.toFixed(1)}kg`, x + 2, y + 7);

    x += colWidths[4];
    doc.text(`${parada.volumeTotalM3.toFixed(2)}m³`, x + 2, y + 7);

    x += colWidths[5];
    if (parada.latitude) {
      doc.setTextColor(22, 163, 74); // Green
      doc.text("✓", x + 3, y + 7);
    } else {
      doc.setTextColor(234, 179, 8); // Yellow
      doc.text("!", x + 3, y + 7);
    }
    doc.setTextColor(0, 0, 0);

    y += 14;
  }

  // Footer totals
  y += 5;
  doc.setFillColor(37, 99, 235);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 12, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");

  const totalNfsFooter = paradas.reduce((sum, p) => sum + p.totalNfs, 0);
  const totalCaixasFooter = paradas.reduce((sum, p) => sum + p.totalCaixas, 0);
  const totalPesoFooter = paradas.reduce((sum, p) => sum + p.pesoTotalKg, 0);
  const totalVolumeFooter = paradas.reduce((sum, p) => sum + p.volumeTotalM3, 0);

  doc.text(
    `TOTAL: ${paradas.length} paradas | ${totalNfsFooter} NFs | ${totalCaixasFooter} cx | ${totalPesoFooter.toFixed(1)} kg | ${totalVolumeFooter.toFixed(2)} m³`,
    MARGIN + 5,
    y + 8
  );

  return doc.output("blob");
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}
