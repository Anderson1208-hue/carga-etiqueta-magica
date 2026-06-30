import jsPDF from "jspdf";
import { format } from "date-fns";

export interface AgendamentoFornecedorItem {
  numero_nf: string;
  razao_social_emitente: string | null;
  cnpj_emitente: string | null;
  dest_razao_social: string | null;
  dest_cidade: string | null;
  dest_uf: string | null;
  data_emissao: string | null; // yyyy-MM-dd
  data_agendamento: string | null; // yyyy-MM-dd
  status: string;
  status_entrega?: string | null;
  peso_bruto: number;
  volume_m3: number;
  valor_nf: number;
  caixas: number;
}

function fmtCnpj(cnpj: string | null): string {
  if (!cnpj) return "—";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso + "T12:00:00"), "dd/MM/yyyy");
  } catch {
    return iso;
  }
}

function trunc(s: string | null, n: number): string {
  const v = s || "—";
  return v.length <= n ? v : v.slice(0, n - 1) + "…";
}

export async function generateAgendamentosFornecedorPDF(
  items: AgendamentoFornecedorItem[],
  filtros: { de?: string; ate?: string; status?: string } = {}
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = 297;
  const PH = 210;
  const M = 8;
  let y = M;

  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, PW, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("AGENDAMENTOS POR FORNECEDOR", M, 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const sub = [
    `Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
    filtros.de ? `De ${fmtDate(filtros.de)}` : null,
    filtros.ate ? `Até ${fmtDate(filtros.ate)}` : null,
    filtros.status && filtros.status !== "todos" ? `Status: ${filtros.status}` : null,
    `${items.length} NFs`,
  ]
    .filter(Boolean)
    .join("  •  ");
  doc.text(sub, M, 16);
  y = 24;

  // Sort and group by fornecedor
  const sorted = [...items].sort((a, b) => {
    const fa = a.razao_social_emitente || "";
    const fb = b.razao_social_emitente || "";
    if (fa !== fb) return fa.localeCompare(fb);
    const da = a.data_agendamento || "";
    const db = b.data_agendamento || "";
    return da.localeCompare(db);
  });

  const grupos = new Map<string, AgendamentoFornecedorItem[]>();
  for (const it of sorted) {
    const k = it.razao_social_emitente || "FORNECEDOR NÃO INFORMADO";
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(it);
  }

  const cols = [
    { label: "NF", w: 16 },
    { label: "Destinatário", w: 60 },
    { label: "Cidade/UF", w: 36 },
    { label: "Faturamento", w: 22 },
    { label: "Agenda", w: 22 },
    { label: "Status", w: 28 },
    { label: "Peso (kg)", w: 20 },
    { label: "M³", w: 16 },
    { label: "Valor (R$)", w: 24 },
    { label: "Cx", w: 12 },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);

  let totGeralPeso = 0,
    totGeralM3 = 0,
    totGeralValor = 0,
    totGeralCx = 0,
    totGeralNfs = 0;

  for (const [fornecedor, grupo] of grupos) {
    if (y + 10 > PH - M) {
      doc.addPage();
      y = M;
    }

    // Fornecedor header
    doc.setFillColor(30, 64, 175);
    doc.rect(M, y, tableW, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const cnpjForn = grupo[0]?.cnpj_emitente ? ` (${fmtCnpj(grupo[0].cnpj_emitente)})` : "";
    doc.text(`${trunc(fornecedor, 75)}${cnpjForn}  —  ${grupo.length} NF(s)`, M + 2, y + 4.8);
    y += 7;

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
    let dPeso = 0,
      dM3 = 0,
      dValor = 0,
      dCx = 0;
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
        trunc(it.dest_razao_social, 38),
        trunc(cidade, 22),
        fmtDate(it.data_emissao),
        fmtDate(it.data_agendamento),
        it.status,
        it.peso_bruto.toFixed(1),
        it.volume_m3.toFixed(3),
        it.valor_nf.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
      dValor += it.valor_nf;
      dCx += it.caixas;
    }

    // Subtotal fornecedor
    if (y + 6 > PH - 12) {
      doc.addPage();
      y = M;
    }
    doc.setFillColor(220, 230, 245);
    doc.rect(M, y, tableW, 5.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    doc.text(`Subtotal ${trunc(fornecedor, 40)}: ${grupo.length} NFs`, M + 2, y + 3.6);
    let xcur = M + cols.slice(0, 6).reduce((s, c) => s + c.w, 0);
    doc.text(dPeso.toFixed(1), xcur + cols[6].w - 1, y + 3.6, { align: "right" });
    xcur += cols[6].w;
    doc.text(dM3.toFixed(3), xcur + cols[7].w - 1, y + 3.6, { align: "right" });
    xcur += cols[7].w;
    doc.text(
      dValor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      xcur + cols[8].w - 1,
      y + 3.6,
      { align: "right" }
    );
    xcur += cols[8].w;
    doc.text(String(dCx), xcur + cols[9].w - 1, y + 3.6, { align: "right" });
    y += 7;

    totGeralPeso += dPeso;
    totGeralM3 += dM3;
    totGeralValor += dValor;
    totGeralCx += dCx;
    totGeralNfs += grupo.length;
  }

  // Total geral
  if (y + 8 > PH - 12) {
    doc.addPage();
    y = M;
  }
  doc.setFillColor(37, 99, 235);
  doc.rect(M, y, tableW, 6.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(`TOTAL GERAL: ${totGeralNfs} NFs`, M + 2, y + 4.5);
  let xcur = M + cols.slice(0, 6).reduce((s, c) => s + c.w, 0);
  doc.text(totGeralPeso.toFixed(1) + " kg", xcur + cols[6].w - 1, y + 4.5, { align: "right" });
  xcur += cols[6].w;
  doc.text(totGeralM3.toFixed(3) + " m³", xcur + cols[7].w - 1, y + 4.5, { align: "right" });
  xcur += cols[7].w;
  doc.text(
    totGeralValor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    xcur + cols[8].w - 1,
    y + 4.5,
    { align: "right" }
  );
  xcur += cols[8].w;
  doc.text(String(totGeralCx) + " cx", xcur + cols[9].w - 1, y + 4.5, { align: "right" });

  // Footer
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Página ${p}/${total}  •  Agendamentos por Fornecedor`, PW / 2, PH - 5, { align: "center" });
  }

  return doc.output("blob");
}
