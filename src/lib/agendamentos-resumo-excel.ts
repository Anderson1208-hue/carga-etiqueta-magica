import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { AgendamentoResumoItem } from "./agendamentos-resumo-pdf";

function fmtCnpj(cnpj: string | null): string {
  if (!cnpj) return "";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function generateAgendamentosResumoExcel(items: AgendamentoResumoItem[]): Blob {
  // Sort by date asc
  const sorted = [...items].sort((a, b) => {
    if (!a.data_agendamento && !b.data_agendamento) return 0;
    if (!a.data_agendamento) return 1;
    if (!b.data_agendamento) return -1;
    return a.data_agendamento.localeCompare(b.data_agendamento);
  });

  const rows: (string | number)[][] = [];
  rows.push([
    "Data Agendamento",
    "NF",
    "CNPJ",
    "Razão Social",
    "Bairro",
    "Cidade",
    "UF",
    "Status",
    "Peso (kg)",
    "M³",
    "Caixas",
  ]);

  // Group by date with subtotals
  const grupos = new Map<string, AgendamentoResumoItem[]>();
  for (const it of sorted) {
    const k = it.data_agendamento || "SEM_DATA";
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(it);
  }

  let totPeso = 0, totM3 = 0, totCx = 0, totNfs = 0;

  for (const [dataKey, grupo] of grupos) {
    const dataLabel = dataKey === "SEM_DATA"
      ? "SEM DATA"
      : format(new Date(dataKey + "T12:00:00"), "dd/MM/yyyy");

    let dPeso = 0, dM3 = 0, dCx = 0;
    for (const it of grupo) {
      rows.push([
        dataLabel,
        it.numero_nf,
        fmtCnpj(it.cnpj_destinatario),
        it.dest_razao_social || "",
        it.dest_bairro || "",
        it.dest_cidade || "",
        it.dest_uf || "",
        it.status,
        Number(it.peso_bruto.toFixed(2)),
        Number(it.volume_m3.toFixed(3)),
        it.caixas,
      ]);
      dPeso += it.peso_bruto;
      dM3 += it.volume_m3;
      dCx += it.caixas;
    }
    rows.push([
      "",
      `Subtotal ${dataLabel}`,
      "",
      "",
      "",
      "",
      "",
      `${grupo.length} NFs`,
      Number(dPeso.toFixed(2)),
      Number(dM3.toFixed(3)),
      dCx,
    ]);
    rows.push([]);
    totPeso += dPeso;
    totM3 += dM3;
    totCx += dCx;
    totNfs += grupo.length;
  }

  rows.push([
    "",
    "TOTAL GERAL",
    "",
    "",
    "",
    "",
    "",
    `${totNfs} NFs`,
    Number(totPeso.toFixed(2)),
    Number(totM3.toFixed(3)),
    totCx,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 16 }, { wch: 10 }, { wch: 20 }, { wch: 40 },
    { wch: 22 }, { wch: 22 }, { wch: 5 }, { wch: 22 },
    { wch: 12 }, { wch: 10 }, { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resumo Agendamentos");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
