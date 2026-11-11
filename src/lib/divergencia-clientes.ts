// Divergência de recebimento dos demais clientes (Arcor/Bagley, Masterfoods, Pandurata): só relatório, nada bloqueado.
export const EMBARCADORES_CLIENTES = ["ARCOR/BAGLEY", "MASTERFOODS", "PANDURATA", "DOCILE", "HERSHEYS"] as const;
export type EmbarcadorCliente = (typeof EMBARCADORES_CLIENTES)[number];
export const STATUS_CLIENTE = ["FALTA", "AVARIA", "SOBRA", "INVERSÃO", "INV/AVARIA", "FALTA/AVARIA", "OUTROS"] as const;
/** Motivos aceitos no formulário próprio de cada cliente. */
export function statusDoCliente(e: EmbarcadorCliente): readonly string[] {
  if (e === "HERSHEYS") return ["FALTA", "AVARIA", "SOBRA", "CURTA VALIDADE", "PREÇO DIVERGENTE"];
  if (e === "DOCILE") return ["FALTA", "SOBRA", "AVARIA"];
  return STATUS_CLIENTE;
}
export const RETORNO_CD = ["PROCEDE DO CD", "NÃO PROCEDE DO CD"] as const;

export function embarcadorCliente(cnpj: string | null | undefined): EmbarcadorCliente | null {
  const raiz = String(cnpj ?? "").replace(/\D/g, "").slice(0, 8);
  if (raiz === "54360656" || raiz === "06042467") return "ARCOR/BAGLEY";
  if (raiz === "29737368") return "MASTERFOODS";
  if (raiz === "70940994") return "PANDURATA";
  if (raiz === "94261534") return "DOCILE";
  if (raiz === "04429377") return "HERSHEYS";
  return null;
}

export interface DivergenciaCliente {
  numero_nf: string; c_prod: string; x_prod: string; status: string;
  qtd_nf: number | null; qtd_recebida: number | null; quantidade: number; criado_em: string; cliente?: string | null;
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

const titulo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Hershey's — "Ocorrência de não conformidade": cabeçalho da carreta + linhas SKU/Descrição/QTDE (CX)/NF/MOTIVO. */
export function planilhaHersheys(itens: DivergenciaCliente[], ctx: { placa: string; motorista: string; recebimento: string; romaneio: string; lacre: string }): (string | number)[][] {
  return [
    ["Ocorrência de não conformidade"], ["Dados de transporte"], [],
    ["Transportadora de transferência:", ""], ["Transportadora de redespacho:", "Ebenezer"], ["Tipo de carga:", ""],
    ["Motorista:", ctx.motorista], ["Placa:", ctx.placa], [], ["Dados do romaneio"], [],
    ["Data e Hora de recebimento:", ctx.recebimento], ["Romaneio:", ctx.romaneio], ["Lacre:", ctx.lacre], [],
    ["SKU", "Descrição", "QTDE (CX)", "NF", "MOTIVO"],
    ...itens.map((d) => [semZeros(d.c_prod), d.x_prod, d.quantidade, d.numero_nf || "SEM NF", titulo(d.status)]),
  ];
}

export const CABECALHO_DOCILE = ["Data da Coleta", "Nº do Embarque", "NF", "NFD", "Cliente", "Transportadora", "Codigo SKU", "Qtde falta", "Qtde sobra", "Qtde avaria"];
/** Docile — "Formulário de Ocorrência": uma linha por código, quantidade na coluna do tipo. */
export function linhasDocile(itens: DivergenciaCliente[], ctx: { dataColeta: string; embarque: string }): (string | number)[][] {
  return itens.map((d) => [ctx.dataColeta, ctx.embarque, d.numero_nf || "SEM NF", "", d.cliente ?? "", "TLM", semZeros(d.c_prod),
    d.status === "FALTA" ? d.quantidade : "", d.status === "SOBRA" ? d.quantidade : "", d.status === "AVARIA" ? d.quantidade : ""]);
}
