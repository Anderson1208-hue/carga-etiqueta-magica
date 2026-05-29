// Parser do relatório Pré-CT-e a partir do arquivo NOTFIS 3.1 (PROCEDA).
// Layout fixo de 240 colunas por registro. Cada registro 313 (DNF) = uma NF.
//
// Registros usados:
//   000  UNB  cabeçalho de intercâmbio
//   310  UNH  cabeçalho do documento
//   311  DEM  dados da embarcadora     (pos 4-17  = CNPJ embarcador)
//   312  DES  dados do destinatário    (pos 44-57 = CNPJ destinatário)
//   313  DNF  dados da nota fiscal:
//              pos  33-40  (N 8)        número da NF
//              pos  41-48  (N 8)        data emissão DDMMAAAA
//              pos  86-100 (N 13,2)     valor total da NF
//              pos 198-212 (N 13,2)     VALOR TOTAL DO FRETE  (peso-volume + ad valorem + taxas)
//              pos 214-225 (N 10,2)     VALOR DO ICMS DA NOTA
//              pos 239-282 (A 44)       chave de acesso NF-e
//
// Observações:
//   • Posições do layout são 1-indexed. Em JS usamos substring(pos-1, pos-1+len).
//   • Sem rateio: cada 313 é uma NF com seus próprios valores.

export interface PreCteLinha {
  numero_nf: string;
  cnpj_emitente: string | null;
  cnpj_destinatario: string | null;
  chave_acesso: string | null;
  valor_frete: number;
  valor_icms: number;
  valor_total: number;        // = valor_frete (total da prestação sugerido pela embarcadora)
  grupo_id: string;
  nfs_no_grupo: number;
  rateado: boolean;           // sempre false em NOTFIS
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
  const t = (s ?? "").replace(/\s+/g, "");
  if (!/^\d+$/.test(t)) return 0;
  return +(parseInt(t, 10) / Math.pow(10, decimals)).toFixed(decimals);
}

/** Detecta arquivo NOTFIS 3.1 (PROCEDA): registro 000 inicia o intercâmbio. */
export function isPreCteEbenezerContent(text: string): boolean {
  const head = text.substring(0, 2400);
  // 000 no início + presença de pelo menos um 313 nas primeiras linhas
  return /^000/m.test(head) && /^313/m.test(head + text.substring(2400, 12000));
}

export async function parsePreCteReport(file: File): Promise<PreCteReport> {
  const text = await readAsLatin1(file);
  // NOTFIS é de tamanho fixo (240). Algumas exportações vêm com quebras, outras não.
  // Tratamos os dois casos: se tem \n, usamos linhas; senão fatiamos a cada 240.
  let registros: string[];
  if (/\r?\n/.test(text)) {
    registros = text.split(/\r?\n/).filter((l) => l.length > 0);
  } else {
    registros = [];
    for (let i = 0; i < text.length; i += 240) registros.push(text.substring(i, i + 240));
  }

  const linhas: PreCteLinha[] = [];
  let cnpjEmbarcadora: string | null = null;
  let cnpjDestinatarioAtual: string | null = null;
  let cnpjDestPrincipal: string | null = null;

  for (let i = 0; i < registros.length; i++) {
    const ln = registros[i];
    if (!ln || ln.length < 3) continue;
    const tipo = ln.substring(0, 3);

    if (tipo === "311") {
      // CNPJ embarcadora: pos 4-17 (14 dígitos)
      const c = ln.substring(3, 17).replace(/\D/g, "");
      if (c.length === 14) cnpjEmbarcadora = c;
      continue;
    }

    if (tipo === "312") {
      // CNPJ destinatário: pos 44-57 (14 dígitos)
      const c = ln.substring(43, 57).replace(/\D/g, "");
      cnpjDestinatarioAtual = c.length === 14 ? c : null;
      if (!cnpjDestPrincipal && cnpjDestinatarioAtual) cnpjDestPrincipal = cnpjDestinatarioAtual;
      continue;
    }

    if (tipo === "313") {
      // Garante tamanho suficiente; se vier menor que 282, ainda tentamos extrair o que dá.
      const numeroNf = ln.substring(32, 40).replace(/\D/g, "");
      const valorFrete = ln.length >= 212 ? dec(ln.substring(197, 212), 2) : 0;
      const valorIcms = ln.length >= 225 ? dec(ln.substring(213, 225), 2) : 0;
      const chave = ln.length >= 282
        ? ln.substring(238, 282).replace(/\D/g, "")
        : "";

      if (!numeroNf) continue; // sem NF não vai pra tela

      linhas.push({
        numero_nf: numeroNf.replace(/^0+/, "") || "0",
        cnpj_emitente: cnpjEmbarcadora,
        cnpj_destinatario: cnpjDestinatarioAtual,
        chave_acesso: chave.length === 44 ? chave : null,
        valor_frete: valorFrete,
        valor_icms: valorIcms,
        // Em NOTFIS, "VALOR TOTAL DO FRETE" (campo 26) já é o total da prestação.
        // ICMS do registro 313 é o ICMS da NF (informativo) — não soma ao frete.
        valor_total: valorFrete,
        grupo_id: `nf_${i + 1}`,
        nfs_no_grupo: 1,
        rateado: false,
      });
      continue;
    }
  }

  const total_frete = +linhas.reduce((s, l) => s + l.valor_frete, 0).toFixed(2);
  const total_icms = +linhas.reduce((s, l) => s + l.valor_icms, 0).toFixed(2);
  const total_geral = +linhas.reduce((s, l) => s + l.valor_total, 0).toFixed(2);

  return {
    arquivo_nome: file.name,
    cnpj_transportador: null, // NOTFIS não carrega CNPJ da transportadora (ela é destinatária EDI)
    cnpj_destinatario_principal: cnpjEmbarcadora, // mostramos a embarcadora como "origem"
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
    "Chave NF-e": l.chave_acesso ?? "",
    "CNPJ Destinatário": fmtCNPJ(l.cnpj_destinatario),
    "Valor Frete (R$)": l.valor_frete,
    "Valor ICMS NF (R$)": l.valor_icms,
    "Valor Total (R$)": l.valor_total,
  }));
  const ws = XLSX.utils.json_to_sheet(dados);
  ws["!cols"] = [
    { wch: 12 }, { wch: 46 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Pré-CT-e");

  const resumo = [
    { Campo: "Arquivo", Valor: report.arquivo_nome },
    { Campo: "Embarcadora (CNPJ)", Valor: fmtCNPJ(report.cnpj_destinatario_principal) },
    { Campo: "Total de NFs", Valor: report.total_nfs },
    { Campo: "Total Frete", Valor: report.total_frete },
    { Campo: "Total ICMS NF", Valor: report.total_icms },
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
  doc.text("Relatório Pré-CT-e (NOTFIS)", 14, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Arquivo: ${report.arquivo_nome}`, 14, 22);
  doc.text(`Embarcadora: ${fmtCNPJ(report.cnpj_destinatario_principal)}`, 14, 27);
  doc.text(`Gerado em: ${dataStr}`, 14, 32);

  autoTable(doc, {
    startY: 38,
    head: [["NF", "Frete (R$)", "ICMS NF (R$)", "Total (R$)"]],
    body: report.linhas.map((l) => [
      l.numero_nf,
      fmtMoney(l.valor_frete),
      fmtMoney(l.valor_icms),
      fmtMoney(l.valor_total),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
    foot: [[
      `Total: ${report.total_nfs} NFs`,
      fmtMoney(report.total_frete),
      fmtMoney(report.total_icms),
      fmtMoney(report.total_geral),
    ]],
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
  });

  doc.save(nomeArquivo);
}
