// Parser do relatório Pré-CT-e a partir da pré-fatura Ebenezer (layout 390/391/393/394/396).
// Para CADA prestação (393/394/396) extrai: valor do frete (base), valor do ICMS e total da prestação.
// Quando o 396 cobre múltiplas NFs, frete e ICMS são rateados igualmente entre elas (mesma regra
// usada na conciliação: somando as N linhas dá o total do CT-e).
//
// Validado contra arquivo da Ebenezer: ICMS = grupo de 15 dígitos #9 (0-indexed=8); total = último grupo.

export interface PreCteLinha {
  numero_nf: string;          // ex.: "107546" (sem zeros à esquerda)
  cnpj_emitente: string | null;
  cnpj_destinatario: string | null;
  valor_frete: number;        // R$ por NF (rateado se grupo > 1 NF)
  valor_icms: number;         // R$ por NF (rateado)
  valor_total: number;        // R$ por NF (rateado)
  grupo_id: string;           // identificador da prestação (linha do 393)
  nfs_no_grupo: number;       // quantas NFs o grupo cobre
  rateado: boolean;           // true quando grupo cobre > 1 NF
}

export interface PreCteReport {
  arquivo_nome: string;
  cnpj_transportador: string | null;
  cnpj_destinatario_principal: string | null;
  total_nfs: number;
  total_frete: number;
  total_icms: number;
  total_geral: number;
  linhas: PreCteLinha[];
}

async function readAsLatin1(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buf);
}

function dec(s: string, decimals: number): number {
  const t = s.replace(/\s+/g, "");
  if (!/^\d+$/.test(t)) return 0;
  return +(parseInt(t, 10) / Math.pow(10, decimals)).toFixed(decimals);
}

export function isPreCteEbenezerContent(text: string): boolean {
  const head = text.substring(0, 800);
  return /^390PREFAT/m.test(head);
}

export async function parsePreCteReport(file: File): Promise<PreCteReport> {
  const text = await readAsLatin1(file);
  const lines = text.split(/\r?\n/);

  const linhas: PreCteLinha[] = [];
  let cnpjTransp: string | null = null;
  let cnpjDestPrincipal: string | null = null;

  // Estado da prestação corrente
  let cur: {
    linha393: number;
    cnpj_emit: string | null;
    cnpj_dest: string | null;
    frete: number;
    icms: number;
    total: number;
  } | null = null;

  const flush396 = (numerosNf: string[]) => {
    if (!cur) return;
    const n = numerosNf.length || 1;
    const freteRateado = +(cur.frete / n).toFixed(2);
    const icmsRateado = +(cur.icms / n).toFixed(2);
    const totalRateado = +(cur.total / n).toFixed(2);
    const grupoId = `g_${cur.linha393}`;
    numerosNf.forEach((num) => {
      linhas.push({
        numero_nf: num.replace(/^0+/, "") || "0",
        cnpj_emitente: cur!.cnpj_emit,
        cnpj_destinatario: cur!.cnpj_dest,
        valor_frete: freteRateado,
        valor_icms: icmsRateado,
        valor_total: totalRateado,
        grupo_id: grupoId,
        nfs_no_grupo: n,
        rateado: n > 1,
      });
    });
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;
    const tipo = ln.substring(0, 3);

    if (tipo === "391") {
      const c = ln.substring(3, 17).replace(/\D/g, "");
      if (c.length === 14 && !cnpjTransp) cnpjTransp = c;
      continue;
    }

    if (tipo === "393") {
      if (ln.length < 137) continue;
      const cnpjEmit = ln.substring(76, 90).replace(/\D/g, "");
      const cnpjDest = ln.substring(91, 105).replace(/\D/g, "");
      const valorBaseFrete = dec(ln.substring(107, 122), 2);
      cur = {
        linha393: i + 1,
        cnpj_emit: cnpjEmit.length === 14 ? cnpjEmit : null,
        cnpj_dest: cnpjDest.length === 14 ? cnpjDest : null,
        frete: valorBaseFrete,
        icms: 0,
        total: 0,
      };
      if (!cnpjDestPrincipal && cur.cnpj_dest) cnpjDestPrincipal = cur.cnpj_dest;
      continue;
    }

    if (tipo === "394") {
      if (!cur) continue;
      // Captura todos os blocos de 15 dígitos
      const matches = [...ln.matchAll(/(\d{15})/g)].map((m) => dec(m[1], 2));
      if (matches.length >= 9) {
        cur.icms = matches[8];
      }
      if (matches.length >= 1) {
        cur.total = matches[matches.length - 1];
      }
      continue;
    }

    if (tipo === "396") {
      const matches = [...ln.matchAll(/ {2}(\d{8})/g)].map((m) => m[1]);
      flush396(matches);
      continue;
    }
  }

  if (cur) flush396([""]);

  const total_frete = +linhas.reduce((s, l) => s + l.valor_frete, 0).toFixed(2);
  const total_icms = +linhas.reduce((s, l) => s + l.valor_icms, 0).toFixed(2);
  const total_geral = +linhas.reduce((s, l) => s + l.valor_total, 0).toFixed(2);

  return {
    arquivo_nome: file.name,
    cnpj_transportador: cnpjTransp,
    cnpj_destinatario_principal: cnpjDestPrincipal,
    total_nfs: linhas.length,
    total_frete,
    total_icms,
    total_geral,
    linhas,
  };
}

// ───── Exportações ─────────────────────────────────────────────────────────

function fmtCNPJ(c: string | null): string {
  if (!c) return "";
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function fmtMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function exportPreCteExcel(report: PreCteReport, nomeArquivo: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const dados = report.linhas.map((l) => ({
    "NF": l.numero_nf,
    "Valor Frete (R$)": l.valor_frete,
    "Valor ICMS (R$)": l.valor_icms,
    "Valor Total (R$)": l.valor_total,
    "Rateado": l.rateado ? `Sim (${l.nfs_no_grupo} NFs)` : "Não",
  }));
  const ws = XLSX.utils.json_to_sheet(dados);
  ws["!cols"] = [
    { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Pré-CT-e");

  const resumo = [
    { Campo: "Arquivo", Valor: report.arquivo_nome },
    { Campo: "Transportador (CNPJ)", Valor: fmtCNPJ(report.cnpj_transportador) },
    { Campo: "Destinatário (CNPJ)", Valor: fmtCNPJ(report.cnpj_destinatario_principal) },
    { Campo: "Total de NFs", Valor: report.total_nfs },
    { Campo: "Total Frete", Valor: report.total_frete },
    { Campo: "Total ICMS", Valor: report.total_icms },
    { Campo: "Total Geral", Valor: report.total_geral },
  ];
  const wsResumo = XLSX.utils.json_to_sheet(resumo);
  wsResumo["!cols"] = [{ wch: 24 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  XLSX.writeFile(wb, nomeArquivo);
}

export async function exportPreCtePDF(report: PreCteReport, nomeArquivo: string) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const dataStr = new Date().toLocaleString("pt-BR");

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Relatório Pré-CT-e", 14, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Arquivo: ${report.arquivo_nome}`, 14, 22);
  doc.text(`Transportador: ${fmtCNPJ(report.cnpj_transportador)}`, 14, 27);
  doc.text(`Destinatário: ${fmtCNPJ(report.cnpj_destinatario_principal)}`, 14, 32);
  doc.text(`Gerado em: ${dataStr}`, 14, 37);

  autoTable(doc, {
    startY: 42,
    head: [["NF", "Frete (R$)", "ICMS (R$)", "Total (R$)", "Obs."]],
    body: report.linhas.map((l) => [
      l.numero_nf,
      fmtMoney(l.valor_frete),
      fmtMoney(l.valor_icms),
      fmtMoney(l.valor_total),
      l.rateado ? `Rateado (${l.nfs_no_grupo} NFs)` : "",
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "left" },
    },
    foot: [[
      `Total: ${report.total_nfs} NFs`,
      fmtMoney(report.total_frete),
      fmtMoney(report.total_icms),
      fmtMoney(report.total_geral),
      "",
    ]],
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
  });

  doc.save(nomeArquivo);
}
