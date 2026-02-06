import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
}

interface Parada {
  cnpjDestinatario: string;
  razaoSocial: string;
  enderecoCompleto: string;
  latitude: number | null;
  longitude: number | null;
  totalNfs: number;
  totalCaixas: number;
  ordem?: number;
}

interface RoteirizacaoData {
  carga: Carga;
  cdNome: string;
  cdLat: number;
  cdLng: number;
  distanciaTotalKm: number;
  tempoEstimadoMin: number;
  paradas: Parada[];
}

export async function generateRoteirizacaoPDF(data: RoteirizacaoData): Promise<Blob> {
  const {
    carga,
    cdNome,
    distanciaTotalKm,
    tempoEstimadoMin,
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

  // Summary Card
  doc.setTextColor(0, 0, 0);
  doc.setFillColor(240, 249, 255); // Light blue
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 25, 3, 3, "F");

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("PONTO DE PARTIDA", MARGIN + 5, y + 8);
  doc.text("PARADAS", MARGIN + 60, y + 8);
  doc.text("DISTÂNCIA", MARGIN + 100, y + 8);
  doc.text("TEMPO ESTIMADO", MARGIN + 140, y + 8);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(cdNome.substring(0, 20), MARGIN + 5, y + 18);
  doc.text(String(paradas.length), MARGIN + 60, y + 18);
  doc.text(`${distanciaTotalKm.toFixed(1)} km`, MARGIN + 100, y + 18);
  
  const hours = Math.floor(tempoEstimadoMin / 60);
  const mins = tempoEstimadoMin % 60;
  doc.text(`${hours}h ${mins}min`, MARGIN + 140, y + 18);

  y += 35;

  // Stops Table Header
  doc.setFillColor(51, 65, 85); // Slate-700
  doc.rect(MARGIN, y, CONTENT_WIDTH, 10, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  
  const colWidths = [12, 50, 60, 28, 30];
  let x = MARGIN;

  doc.text("#", x + 4, y + 7);
  x += colWidths[0];
  doc.text("CLIENTE / CNPJ", x + 3, y + 7);
  x += colWidths[1];
  doc.text("ENDEREÇO", x + 3, y + 7);
  x += colWidths[2];
  doc.text("NFs | CAIXAS", x + 3, y + 7);
  x += colWidths[3];
  doc.text("STATUS", x + 3, y + 7);

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
      doc.text("#", x + 4, y + 7);
      x += colWidths[0];
      doc.text("CLIENTE / CNPJ", x + 3, y + 7);
      x += colWidths[1];
      doc.text("ENDEREÇO", x + 3, y + 7);
      x += colWidths[2];
      doc.text("NFs | CAIXAS", x + 3, y + 7);
      x += colWidths[3];
      doc.text("STATUS", x + 3, y + 7);

      y += 10;
      doc.setTextColor(0, 0, 0);
    }

    // Zebra striping
    if (i % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 14, "F");
    }

    x = MARGIN;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(String(parada.ordem || i + 1), x + 4, y + 6);

    x += colWidths[0];
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(truncateText(parada.razaoSocial, 25), x + 3, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(parada.cnpjDestinatario, x + 3, y + 10);

    x += colWidths[1];
    doc.setFontSize(7);
    // Split address into multiple lines if needed
    const addressLines = doc.splitTextToSize(parada.enderecoCompleto, colWidths[2] - 6);
    doc.text(addressLines.slice(0, 2), x + 3, y + 5);

    x += colWidths[2];
    doc.setFontSize(8);
    doc.text(`${parada.totalNfs} NFs`, x + 3, y + 5);
    doc.text(`${parada.totalCaixas} cx`, x + 3, y + 10);

    x += colWidths[3];
    if (parada.latitude) {
      doc.setTextColor(22, 163, 74); // Green
      doc.text("Geocodificado", x + 3, y + 7);
    } else {
      doc.setTextColor(234, 179, 8); // Yellow
      doc.text("Sem coord.", x + 3, y + 7);
    }
    doc.setTextColor(0, 0, 0);

    y += 14;
  }

  // Footer totals
  y += 5;
  doc.setFillColor(37, 99, 235);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 12, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");

  const totalNfs = paradas.reduce((sum, p) => sum + p.totalNfs, 0);
  const totalCaixas = paradas.reduce((sum, p) => sum + p.totalCaixas, 0);

  doc.text(
    `TOTAL: ${paradas.length} paradas | ${totalNfs} NFs | ${totalCaixas} caixas`,
    MARGIN + 5,
    y + 8
  );

  return doc.output("blob");
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}
