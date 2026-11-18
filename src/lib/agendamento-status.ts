export const STATUS_REENTREGA = [
  "REENTREGA",
  "REENTREGA COM CUSTO",
  "REENTREGA SEM CUSTO",
] as const;

export type AgendamentoStatus =
  | "AGENDAMENTO"
  | "AGUARDANDO AGENDA"
  | "AGUARDANDO REAGENDA"
  | "ENTREGA IMEDIATA AGUARDANDO DEFINIÇÃO"
  | (typeof STATUS_REENTREGA)[number]
  | "PERDA DE AGENDAMENTO, AGUARDANDO NOVA AGENDA"
  | "SINISTRO"
  | "DEVOLUCAO";

export function isReentregaStatus(status: string | null | undefined): boolean {
  return !!status && STATUS_REENTREGA.includes(status as (typeof STATUS_REENTREGA)[number]);
}

export function agendamentoExigeData(status: string | null | undefined): boolean {
  return status === "AGENDAMENTO" || status === "REENTREGA";
}

export function agendamentoLiberaParaDeposito(status: string | null | undefined): boolean {
  return status === "AGENDAMENTO" || isReentregaStatus(status);
}

export function agendamentoBloqueiaPreparacao(status: string | null | undefined): boolean {
  return !!status && [
    "AGUARDANDO AGENDA",
    "AGUARDANDO REAGENDA",
    "DEVOLUCAO",
    "PERDA DE AGENDAMENTO, AGUARDANDO NOVA AGENDA",
    "SINISTRO",
  ].includes(status);
}
