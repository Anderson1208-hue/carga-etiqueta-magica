import jsPDF from "jspdf";
import { format } from "date-fns";
import { calculateBoxes } from "@/lib/xml-parser";

export interface AgendamentoResumoItem {
  data_agendamento: string | null; // yyyy-MM-dd
  status: string;
  numero_nf: string;
  cnpj_destinatario: string | null;
  dest_razao_social: string | null;
  dest_bairro: string | null;
  dest_cidade: string | null;
  dest_uf: string | null;
  peso_bruto: number;
  volume_m3: number;
  caixas: number;
}

function fmtCnpj(cnpj: string | null): string {
  if (!cnpj) return "—";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function trunc(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export async function generateAgendamentosResumoPDF(items: AgendamentoResumoItem[]): Promise<Blob> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = 297;
  const PH = 210;
  const M = 8;
  let y = M;

  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, PW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMO DE AGENDAMENTOS", M, 9);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}  •  ${items.length} agendamentos`, M, 14);
  y = 22;

  // Sort by date asc (null/sem data por último)
  const sorted = [...items].sort((a, b) => {
    if (!a.data_agendamento && !b.data_agendamento) return 0;
    if (!a.data_agendamento) return 1;
    if (!b.data_agendamento) return -1;
    return a.data_agendamento.localeCompare(b.data_agendamento);
  });

  // Group by date
  const grupos = new Map<string, AgendamentoResumoItem[]>();
  for (const it of sorted) {
    const k = it.data_agendamento || "SEM_DATA";
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(it);
  }

  // Column layout (mm) — total ~281
  const cols = [
    { label: "NF", w: 16 },
    { label: "CNPJ", w: 38 },
    { label: "Razão Social", w: 70 },
    { label: "Bairro", w: 38 },
    { label: "Cidade/UF", w: 38 },
    { label: "Status", w: 28 },
    { label: "Peso (kg)", w: 18 },
    { label: "M³", w: 14 },
    { label: "Cx", w: 12 },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);

  let totGeralPeso = 0, totGeralM3 = 0, totGeralCx = 0, totGeralNfs = 0;

  for (const [dataKey, grupo] of grupos) {
    // Date header
    if (y + 8 > PH - M) { doc.addPage(); y = M; }
    const dataLabel = dataKey === "SEM_DATA"
      ? "SEM DATA DE AGENDAMENTO"
      : format(new Date(dataKey + "T12:00:00"), "dd/MM/yyyy");
    doc.setFillColor(30, 64, 175);
    doc.rect(M, y, tableW, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Data: ${dataLabel}  (${grupo.length} NFs)`, M + 2, y + 4.2);
    y += 6;

    // Column header
    doc.setFillColor(230, 237, 250);
    doc.rect(M, y, tableW, 5.5, "F");
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    let cx = M;
    for (const c of cols) {
      doc.text(c.label, cx + 1, y + 3.8);
      cx += c.w;
    }
    y += 5.5;

    // Rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    let dPeso = 0, dM3 = 0, dCx = 0;
    let zebra = false;
    for (const it of grupo) {
      if (y + 5 > PH - 12) {
        doc.addPage();
        y = M;
      }
      if (zebra) {
        doc.setFillColor(248, 250, 252);
        doc.rect(M, y, tableW, 4.6, "F");
      }
      zebra = !zebra;

      const cidade = it.dest_cidade ? `${it.dest_cidade}/${it.dest_uf || ""}` : "—";
      const vals = [
        it.numero_nf,
        fmtCnpj(it.cnpj_destinatario),
        trunc(it.dest_razao_social || "—", 45),
        trunc(it.dest_bairro || "—", 22),
        trunc(cidade, 22),
        it.status,
        it.peso_bruto.toFixed(1),
        it.volume_m3.toFixed(2),
        String(it.caixas),
      ];
      let xcur = M;
      doc.setTextColor(30, 30, 30);
      for (let i = 0; i < cols.length; i++) {
        const align = i >= 6 ? "right" : "left";
        const txt = vals[i];
        if (align === "right") {
          doc.text(txt, xcur + cols[i].w - 1, y + 3.2, { align: "right" });
        } else {
          doc.text(txt, xcur + 1, y + 3.2);
        }
        xcur += cols[i].w;
      }
      y += 4.6;

      dPeso += it.peso_bruto;
      dM3 += it.volume_m3;
      dCx += it.caixas;
    }

    // Subtotal por data
    if (y + 6 > PH - 12) { doc.addPage(); y = M; }
    doc.setFillColor(220, 230, 245);
    doc.rect(M, y, tableW, 5.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    const subTxt = `Subtotal ${dataLabel}: ${grupo.length} NFs`;
    doc.text(subTxt, M + 2, y + 3.6);
    // valores alinhados nas colunas
    let xcur = M + cols.slice(0, 6).reduce((s, c) => s + c.w, 0);
    doc.text(dPeso.toFixed(1), xcur + cols[6].w - 1, y + 3.6, { align: "right" });
    xcur += cols[6].w;
    doc.text(dM3.toFixed(2), xcur + cols[7].w - 1, y + 3.6, { align: "right" });
    xcur += cols[7].w;
    doc.text(String(dCx), xcur + cols[8].w - 1, y + 3.6, { align: "right" });
    y += 7;

    totGeralPeso += dPeso;
    totGeralM3 += dM3;
    totGeralCx += dCx;
    totGeralNfs += grupo.length;
  }

  // Total geral
  if (y + 8 > PH - 12) { doc.addPage(); y = M; }
  doc.setFillColor(37, 99, 235);
  doc.rect(M, y, tableW, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(`TOTAL GERAL: ${totGeralNfs} NFs`, M + 2, y + 4.2);
  let xcur = M + cols.slice(0, 6).reduce((s, c) => s + c.w, 0);
  doc.text(totGeralPeso.toFixed(1) + " kg", xcur + cols[6].w - 1, y + 4.2, { align: "right" });
  xcur += cols[6].w;
  doc.text(totGeralM3.toFixed(2) + " m³", xcur + cols[7].w - 1, y + 4.2, { align: "right" });
  xcur += cols[7].w;
  doc.text(String(totGeralCx) + " cx", xcur + cols[8].w - 1, y + 4.2, { align: "right" });

  // Footer
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Página ${p}/${total}  •  Resumo de Agendamentos`, PW / 2, PH - 5, { align: "center" });
  }

  return doc.output("blob");
}

export { calculateBoxes };
