// Divergência de recebimento dos demais clientes (Arcor/Bagley, Masterfoods, Pandurata): só relatório, nada bloqueado.
export const EMBARCADORES_CLIENTES = ["ARCOR/BAGLEY", "MASTERFOODS", "PANDURATA"] as const;
export type EmbarcadorCliente = (typeof EMBARCADORES_CLIENTES)[number];
export const STATUS_CLIENTE = ["FALTA", "AVARIA", "SOBRA", "INVERSÃO", "INV/AVARIA", "FALTA/AVARIA", "OUTROS"] as const;
export const RETORNO_CD = ["PROCEDE DO CD", "NÃO PROCEDE DO CD"] as const;

export function embarcadorCliente(cnpj: string | null | undefined): EmbarcadorCliente | null {
  const raiz = String(cnpj ?? "").replace(/\D/g, "").slice(0, 8);
  if (raiz === "54360656" || raiz === "06042467") return "ARCOR/BAGLEY";
  if (raiz === "29737368") return "MASTERFOODS";
  if (raiz === "70940994") return "PANDURATA";
  return null;
}

export interface DivergenciaCliente {
  numero_nf: string; c_prod: string; x_prod: string; status: string;
  qtd_nf: number | null; qtd_recebida: number | null; quantidade: number; criado_em: string;
}

export const CABECALHO_PROTOCOLO = ["DT:", "NOTA FISCAL:", "PRODUTO:", "DESCRIÇÃO PRODUTO:", "Quant.NF.", "Quant.recebida", "Diver:", "STATUS:", "DATA DA OCORRÊNCIA:", "LACRE:", "MOTORISTA:"];

const semZeros = (c: string) => String(c ?? "").replace(/^0+(?=\d)/, "");
const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Linhas do "Protocolo de Divergências" (modelo da planilha de controle), sem valor de débito. */
export function linhasProtocolo(itens: DivergenciaCliente[], ctx: { dt: string; lacre: string; motorista: string }): (string | number)[][] {
  return itens.map((d) => [
    ctx.dt, d.numero_nf || "SEM NF", semZeros(d.c_prod), d.x_prod,
    d.qtd_nf ?? "", d.qtd_recebida ?? "", d.quantidade, d.status, dataBr(d.criado_em), ctx.lacre, ctx.motorista,
  ]);
}
