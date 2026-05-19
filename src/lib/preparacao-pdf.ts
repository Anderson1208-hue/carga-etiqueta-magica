import jsPDF from "jspdf";
import { getMacroRegiaoLabel } from "@/lib/macro-regioes";
import { format } from "date-fns";

interface NfPrepPdf {
  id: string;
  numero_nf: string;
  cnpj_destinatario: string;
  dest_razao_social: string;
  dest_bairro: string;
  dest_cep: string;
  dest_logradouro: string;
  dest_numero: string;
  dest_cidade: string;
  dest_uf: string;
  peso_bruto: number;
  volume_m3: number;
  valor_nf: number;
  totalCaixas: number;
  macroRegiao: number;
  carga_placa: string;
  carga_tipo_carga: string;
  numero_cte: string;
}

const MARGIN = 12;
const PAGE_W = 210; // A4 portrait
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;

export function gerarPreparacaoPdf(nfs: NfPrepPdf[], mrLabel: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let y = MARGIN;

  function checkPage(needed: number) {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  // Group by entrega (CNPJ)
  const entregasMap = new Map<string, NfPrepPdf[]>();
  nfs.forEach((nf) => {
    const key = nf.cnpj_destinatario || nf.id;
    const list = entregasMap.get(key) || [];
    list.push(nf);
    entregasMap.set(key, list);
  });

  const totalEntregas = entregasMap.size;
  const totalNfs = nfs.length;
  const totalCaixas = nfs.reduce((s, n) => s + n.totalCaixas, 0);
  const totalPeso = nfs.reduce((s, n) => s + n.peso_bruto, 0);
  const totalVolume = nfs.reduce((s, n) => s + n.volume_m3, 0);

  // === HEADER ===

  // === HEADER ===
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(mrLabel, MARGIN, y);
  y += 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, MARGIN, y);
  y += 5;

  // Summary bar
  doc.setFillColor(230, 235, 245);
  doc.roundedRect(MARGIN, y, CONTENT_W, 10, 2, 2, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const summaryParts = [
    `${totalEntregas} entrega${totalEntregas > 1 ? "s" : ""}`,
    `${totalNfs} NFs`,
    `${totalCaixas} caixas`,
    `${totalPeso.toFixed(1)} kg`,
    `${totalVolume.toFixed(2)} m³`,
  ];
  doc.text(summaryParts.join("   •   "), MARGIN + 4, y + 7);
  y += 14;

  // === ENTREGAS ===
  let entregaIdx = 1;
  Array.from(entregasMap.entries()).forEach(([, nfsEntrega]) => {
    const first = nfsEntrega[0];
    const cx = nfsEntrega.reduce((s, n) => s + n.totalCaixas, 0);
    const peso = nfsEntrega.reduce((s, n) => s + n.peso_bruto, 0);
    const vol = nfsEntrega.reduce((s, n) => s + n.volume_m3, 0);
    const valor = nfsEntrega.reduce((s, n) => s + (n.valor_nf || 0), 0);
    const endereco = [first.dest_logradouro, first.dest_numero].filter(Boolean).join(", ");
    const cidadeUf = [first.dest_cidade, first.dest_uf].filter(Boolean).join("/");
    const nfNums = nfsEntrega.map((n) => n.numero_nf).join(", ");
    const cteNums = nfsEntrega.map((n) => n.numero_cte).filter(Boolean).join(", ");

    // Estimate height needed
    const entregaHeight = 28 + nfsEntrega.length * 5;
    checkPage(entregaHeight);

    // Entrega header background
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(MARGIN, y, CONTENT_W, 22, 1.5, 1.5, "F");
    doc.setDrawColor(200, 205, 215);
    doc.roundedRect(MARGIN, y, CONTENT_W, 22, 1.5, 1.5, "S");

    // Entrega number badge
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(MARGIN + 2, y + 2, 8, 6, 1, 1, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(String(entregaIdx), MARGIN + 6, y + 6.5, { align: "center" });
    doc.setTextColor(0, 0, 0);

    // Razão social
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const razaoTrunc = first.dest_razao_social.length > 60
      ? first.dest_razao_social.substring(0, 57) + "..."
      : first.dest_razao_social;
    doc.text(razaoTrunc, MARGIN + 12, y + 6.5);

    // NFs count badge
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const nfBadge = `${nfsEntrega.length} NF${nfsEntrega.length > 1 ? "s" : ""}`;
    const badgeX = MARGIN + CONTENT_W - 4;
    doc.text(nfBadge, badgeX, y + 6.5, { align: "right" });

    // Address line
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    const addrLine = [endereco, first.dest_bairro, cidadeUf, first.dest_cep].filter(Boolean).join(" – ");
    const addrTrunc = addrLine.length > 90 ? addrLine.substring(0, 87) + "..." : addrLine;
    doc.text(`📍 ${addrTrunc}`, MARGIN + 4, y + 12.5);

    // NFs list
    const nfsLine = `NFs: ${nfNums}`;
    const nfsTrunc = nfsLine.length > 95 ? nfsLine.substring(0, 92) + "..." : nfsLine;
    doc.text(nfsTrunc, MARGIN + 4, y + 17);

    // Totals on right
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7.5);
    const totalsLine = `${cx} cx  •  ${peso.toFixed(1)} kg${vol > 0 ? `  •  ${vol.toFixed(2)} m³` : ""}${valor > 0 ? `  •  ${fmtBRL(valor)}` : ""}`;
    doc.text(totalsLine, badgeX, y + 17, { align: "right" });

    doc.setTextColor(0, 0, 0);
    y += 24;

    // Individual NFs table
    if (nfsEntrega.length > 1) {
      nfsEntrega.forEach((nf) => {
        checkPage(5);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(`NF ${nf.numero_nf}`, MARGIN + 6, y + 3);
        if (nf.carga_tipo_carga === "CHOCOLATE") {
          doc.setTextColor(139, 69, 19);
          doc.text("CHOC", MARGIN + 40, y + 3);
          doc.setTextColor(80, 80, 80);
        }
        doc.text(`${nf.totalCaixas} cx`, MARGIN + 60, y + 3);
        doc.text(`${nf.peso_bruto.toFixed(1)} kg`, MARGIN + 80, y + 3);
        doc.text(nf.carga_placa, MARGIN + CONTENT_W - 4, y + 3, { align: "right" });
        doc.setDrawColor(230, 230, 230);
        doc.line(MARGIN + 4, y + 5, MARGIN + CONTENT_W - 2, y + 5);
        doc.setTextColor(0, 0, 0);
        y += 5;
      });
    }

    // CT-e line if present
    if (cteNums) {
      checkPage(5);
      doc.setFontSize(6.5);
      doc.setTextColor(100, 100, 100);
      doc.text(`CT-e: ${cteNums}`, MARGIN + 6, y + 3);
      doc.setTextColor(0, 0, 0);
      y += 5;
    }

    y += 3;
    entregaIdx++;
  });

  // Footer total
  checkPage(12);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  y += 5;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL: ${totalEntregas} entregas  •  ${totalNfs} NFs  •  ${totalCaixas} caixas  •  ${totalPeso.toFixed(1)} kg  •  ${totalVolume.toFixed(2)} m³  •  ${fmtBRL(totalValor)}`, MARGIN, y + 3);

  // Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i}/${totalPages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
    doc.text(mrLabel, MARGIN, PAGE_H - 8);
    doc.setTextColor(0, 0, 0);
  }

  const safeLabel = mrLabel.replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`preparacao_${safeLabel}_${format(new Date(), "yyyy-MM-dd_HHmm")}.pdf`);
}
