import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { AgendamentoFornecedorItem } from "./agendamentos-fornecedor-pdf";

function fmtCnpj(cnpj: string | null): string {
  if (!cnpj) return "";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return format(new Date(iso + "T12:00:00"), "dd/MM/yyyy");
  } catch {
    return iso;
  }
}

export function generateAgendamentosFornecedorExcel(
  items: AgendamentoFornecedorItem[]
): Blob {
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

  const rows: (string | number)[][] = [];
  rows.push([
    "Fornecedor",
    "CNPJ Fornecedor",
    "NF",
    "Destinatário",
    "Cidade",
    "UF",
    "Data Faturamento",
    "Data Agenda",
    "Status",
    "Peso (kg)",
    "M³",
    "Valor NF (R$)",
    "Caixas",
  ]);

  let totPeso = 0,
    totM3 = 0,
    totValor = 0,
    totCx = 0,
    totNfs = 0;

  for (const [fornecedor, grupo] of grupos) {
    let dPeso = 0,
      dM3 = 0,
      dValor = 0,
      dCx = 0;

    for (const it of grupo) {
      rows.push([
        fornecedor,
        fmtCnpj(it.cnpj_emitente),
        it.numero_nf,
        it.dest_razao_social || "",
        it.dest_cidade || "",
        it.dest_uf || "",
        fmtDate(it.data_emissao),
        fmtDate(it.data_agendamento),
        it.status,
        Number(it.peso_bruto.toFixed(2)),
        Number(it.volume_m3.toFixed(3)),
        Number(it.valor_nf.toFixed(2)),
        it.caixas,
      ]);
      dPeso += it.peso_bruto;
      dM3 += it.volume_m3;
      dValor += it.valor_nf;
      dCx += it.caixas;
    }

    rows.push([
      `Subtotal ${fornecedor}`,
      "",
      `${grupo.length} NFs`,
      "",
      "",
      "",
      "",
      "",
      "",
      Number(dPeso.toFixed(2)),
      Number(dM3.toFixed(3)),
      Number(dValor.toFixed(2)),
      dCx,
    ]);
    rows.push([]);

    totPeso += dPeso;
    totM3 += dM3;
    totValor += dValor;
    totCx += dCx;
    totNfs += grupo.length;
  }

  rows.push([
    "TOTAL GERAL",
    "",
    `${totNfs} NFs`,
    "",
    "",
    "",
    "",
    "",
    "",
    Number(totPeso.toFixed(2)),
    Number(totM3.toFixed(3)),
    Number(totValor.toFixed(2)),
    totCx,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 40 }, { wch: 20 }, { wch: 10 }, { wch: 40 },
    { wch: 22 }, { wch: 5 }, { wch: 16 }, { wch: 16 },
    { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Agendamentos por Fornecedor");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
