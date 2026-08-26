export interface IbacFilaPdfLinha {
  nf: string | null;
  cte: string | null;
  destinatario: string | null;
  evento: string;
  status: string;
  tentativas: number | null;
  criadoEm: string;
  erro: string | null;
}

export interface IbacFilaPdfFiltros {
  status: string;
  evento: string;
  busca: string;
  dataIni: string;
  dataFim: string;
}

/** Relatório da fila de eventos IBAC (paisagem, com NF e CT-e). */
export async function gerarPdfFilaIbac(
  linhas: IbacFilaPdfLinha[],
  filtros: IbacFilaPdfFiltros,
) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const geradoEm = new Date().toLocaleString("pt-BR");

  doc.setFontSize(14);
  doc.text("Integração IBAC — Fila de eventos", 14, 14);
  doc.setFontSize(9);

  const filtrosTxt = [
    `Status: ${filtros.status}`,
    `Evento: ${filtros.evento}`,
    filtros.busca ? `Busca: ${filtros.busca}` : null,
    filtros.dataIni ? `De: ${filtros.dataIni.split("-").reverse().join("/")}` : null,
    filtros.dataFim ? `Até: ${filtros.dataFim.split("-").reverse().join("/")}` : null,
  ]
    .filter(Boolean)
    .join("  |  ");

  doc.text(filtrosTxt, 14, 20);
  doc.text(`Gerado em ${geradoEm} — ${linhas.length} evento(s)`, 14, 25);

  autoTable(doc, {
    startY: 29,
    head: [["NF", "CT-e", "Destinatário", "Evento", "Status", "Tent.", "Criado em", "Erro"]],
    body: linhas.map((l) => [
      l.nf ?? "—",
      l.cte ?? "—",
      l.destinatario ?? "—",
      l.evento,
      l.status,
      String(l.tentativas ?? 0),
      l.criadoEm,
      l.erro ?? "",
    ]),
    styles: { fontSize: 7.5, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      2: { cellWidth: 62 },
      3: { cellWidth: 42 },
      4: { cellWidth: 20 },
      5: { cellWidth: 12, halign: "right" },
      6: { cellWidth: 32 },
      7: { cellWidth: 55 },
    },
  });

  doc.save(`ibac_fila_${new Date().toISOString().slice(0, 10)}.pdf`);
}
