import type { CargaPendentePandurata } from "@/lib/pandurata-pendentes";

export async function gerarPdfPendentesPandurata(cargas: CargaPendentePandurata[], pesquisa: string, canceladas = false) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const numero = (valor: number | null) => valor === null ? "—" : Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const dataHora = (valor: string | null) => valor ? new Date(valor.length === 10 ? `${valor}T00:00:00` : valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  doc.setFontSize(14);
  doc.text(`Orkestria — Cargas ${canceladas ? "canceladas" : "pendentes"} Pandurata`, 14, 14);
  doc.setFontSize(9);
  doc.text(`Gerado em ${dataHora(new Date().toISOString())} | ${cargas.length} carga(s)`, 14, 21);
  if (pesquisa) doc.text(doc.splitTextToSize(`Pesquisa: ${pesquisa}`, 269), 14, 27);
  autoTable(doc, {
    startY: pesquisa ? 27 + doc.splitTextToSize(`Pesquisa: ${pesquisa}`, 269).length * 4 : 26,
    head: [canceladas ? ["DT / remessa", "Início da viagem", "Cliente / destino", "Retirada em", "Motivo da exclusão"] : ["DT / remessa", "Início da viagem", "Cliente / destino", "Pallets / caixas", "Peso líq. / bruto (kg)", "Vol. líq. / bruto (m³)", "Paradas"]],
    body: cargas.map((c) => canceladas ? [
      `${c.numero_dt ?? "—"}\nRemessa ${c.remessa_id ?? c.shipment_id}`,
      dataHora(c.inicio_viagem),
      `${c.cliente ?? "—"}\n${[c.cidade_destino, c.uf_destino].filter(Boolean).join(" / ")}`,
      dataHora(c.excluida_em),
      c.motivo_exclusao ?? "—",
    ] : [
      `${c.numero_dt ?? "—"}\nRemessa ${c.remessa_id ?? c.shipment_id}`,
      dataHora(c.inicio_viagem),
      `${c.cliente ?? "—"}\n${[c.cidade_destino, c.uf_destino].filter(Boolean).join(" / ")}`,
      `${numero(c.qtd_pallets)} / ${numero(c.qtd_caixas)}`,
      `${numero(c.peso_liquido_kg)} / ${numero(c.peso_bruto_kg)}`,
      `${numero(c.volume_liquido_m3)} / ${numero(c.volume_bruto_m3)}`,
      numero(c.num_paradas),
    ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    columnStyles: canceladas ? { 0: { cellWidth: 37 }, 1: { cellWidth: 32 }, 2: { cellWidth: 66 }, 3: { cellWidth: 32 }, 4: { cellWidth: 102 } } : { 0: { cellWidth: 37 }, 1: { cellWidth: 32 }, 2: { cellWidth: 66 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    margin: { bottom: 16 },
  });
  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina++) {
    doc.setPage(pagina);
    doc.setFontSize(8);
    doc.text(`Página ${pagina} de ${paginas}`, 283, 202, { align: "right" });
  }
  doc.save(`cargas_${canceladas ? "canceladas" : "pendentes"}_pandurata.pdf`);
}