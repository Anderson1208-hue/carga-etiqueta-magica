// Divergência de recebimento IBAC/IBAE: montagem da planilha (modelo Cacau) e do pacote de fotos.
export type TipoDivergencia = "falta_parcial" | "avaria" | "falta_total" | "sobra";

export const TIPO_LABEL: Record<TipoDivergencia, string> = {
  falta_parcial: "Falta parcial",
  avaria: "Avaria",
  falta_total: "Falta total (NF cancelada)",
  sobra: "Sobra",
};

export const MOTIVO_DEVOLUCAO_FALTA_TOTAL = "Não veio produto — Falta oriunda da origem";
export const LIMITE_PACOTE_BYTES = 20 * 1024 * 1024;

export interface DivergenciaRow {
  id: string;
  numero_nf: string;
  c_prod: string | null;
  x_prod: string | null;
  tipo: TipoDivergencia;
  quantidade: number;
  observacao: string | null;
  fotos: string[];
  criado_em: string;
  criado_por_nome: string | null;
}

export interface ItemNf { c_prod: string; x_prod: string; q_com: number }

export const semZeros = (c: string | null | undefined) => String(c ?? "").replace(/^0+(?=\d)/, "");

/** Turno pelo horário de Brasília: 1° 06–14h, 2° 14–22h, 3° 22–06h. */
export function turnoDe(iso: string): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date(iso))) % 24;
  if (h >= 6 && h < 14) return "1° TURNO";
  if (h >= 14 && h < 22) return "2° TURNO";
  return "3° TURNO";
}

const extensao = (path: string) => {
  const m = /\.([a-z0-9]{2,5})$/i.exec(path);
  return m ? m[1].toLowerCase() : "jpg";
};

/** Nome de cada foto no pacote: identifica NF, código, tipo e ordem. */
export function nomesFotos(d: Pick<DivergenciaRow, "numero_nf" | "c_prod" | "tipo" | "fotos">): string[] {
  const base = `NF${d.numero_nf}${d.c_prod ? `_cProd${semZeros(d.c_prod)}` : ""}_${d.tipo}`;
  return d.fotos.map((p, i) => `${base}_${i + 1}.${extensao(p)}`);
}

export const CABECALHO = [
  "Data Carregamento", "Data Chegada veículo na base", "Conferente Transportador?", "Nome conferente", "Transporte",
  "Código", "Desc. Material", "Quantidade de caixas", "Ocorrência", "STATUS", "", "", "TURNO", "STATUS", "STATUS OCORRÊNCIA",
  "NF", "Fotos",
];

/** Nome do embarcador pela raiz do CNPJ (cada embarcador terá seu próprio modelo de planilha). */
export function embarcadorDe(cnpj: string | null | undefined, razao?: string | null): string {
  const raiz = String(cnpj ?? "").replace(/\D/g, "").slice(0, 8);
  if (raiz === "61472205") return "IBAC";
  if (raiz === "42431457") return "IBAE";
  return (razao ?? "").trim().split(/\s+/)[0]?.toUpperCase() || "OUTROS";
}

const dataBr = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

/** Linhas no modelo da planilha da Cacau. Falta total abre uma linha por código da NF com todas as caixas. */
export function linhasPlanilha(
  itens: DivergenciaRow[],
  ctx: { numeroCarga: string; placa: string; emissaoPorNf: Record<string, string | null>; itensPorNf: Record<string, ItemNf[]> },
): (string | number)[][] {
  const linhas: (string | number)[][] = [];
  for (const d of itens) {
    const fotos = nomesFotos(d).join(", ");
    const comum = (cod: string, desc: string, qtd: string, statusOc: string, obs = "") => [
      dataBr(ctx.emissaoPorNf[d.numero_nf]), dataBr(d.criado_em), "SIM", d.criado_por_nome ?? "", ctx.placa,
      cod, desc, qtd, ctx.numeroCarga, statusOc, "", "", turnoDe(d.criado_em), "", [obs, d.observacao].filter(Boolean).join(" — "),
      d.numero_nf, fotos,
    ];
    if (d.tipo === "falta_total") {
      const itensNf = ctx.itensPorNf[d.numero_nf] ?? [];
      if (!itensNf.length) linhas.push(comum("", "", "falta total", "FALTA ORIGEM", `NF CANCELADA — ${MOTIVO_DEVOLUCAO_FALTA_TOTAL}`));
      for (const it of itensNf) {
        const n = Math.ceil(Number(it.q_com) || 0);
        linhas.push(comum(semZeros(it.c_prod), it.x_prod, `${n} - falta total`, "FALTA ORIGEM", `NF CANCELADA — ${MOTIVO_DEVOLUCAO_FALTA_TOTAL}`));
      }
    } else {
      linhas.push(comum(semZeros(d.c_prod), d.x_prod ?? "", `${d.quantidade} - ${d.tipo === "avaria" ? "avaria" : d.tipo === "sobra" ? "sobra" : "falta"}`,
        d.tipo === "avaria" ? "AVARIA" : d.tipo === "sobra" ? "SOBRA" : "FALTA ORIGEM"));
    }
  }
  return linhas;
}

/** Divide arquivos em pacotes até o limite do e-mail; o primeiro pacote sempre leva a planilha. */
export function dividirPacotes<T extends { size: number }>(planilha: T, fotos: T[], limite = LIMITE_PACOTE_BYTES): T[][] {
  const pacotes: T[][] = [[planilha]];
  let atual = planilha.size;
  for (const f of fotos) {
    const p = pacotes[pacotes.length - 1];
    if (p.length > 0 && atual + f.size > limite) { pacotes.push([f]); atual = f.size; }
    else { p.push(f); atual += f.size; }
  }
  return pacotes;
}
