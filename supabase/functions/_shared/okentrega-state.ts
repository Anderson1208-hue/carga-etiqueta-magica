export type EstadoOkEntrega =
  | "pendente"
  | "processando"
  | "aguardando_aprovacao"
  | "aprovado"
  | "recusado"
  | "revisao"
  | "erro"
  | "bloqueado";

export function classificarRetornoOkEntrega(input: {
  sucessoHttp: boolean;
  httpStatus: number;
  statusComprovante?: string | null;
  tentativasAtuais: number;
  maxTentativas: number;
}): EstadoOkEntrega {
  const statusComprovante = input.statusComprovante == null ? null : String(input.statusComprovante);
  if (input.sucessoHttp && statusComprovante === "1") return "aprovado";
  if (input.sucessoHttp && statusComprovante === "2") return "recusado";
  if (input.sucessoHttp) return "aguardando_aprovacao";
  if (input.httpStatus === 409) return "revisao";

  const transitorio = input.httpStatus === 0 || input.httpStatus === 429 || input.httpStatus >= 500;
  if (transitorio && input.tentativasAtuais + 1 < input.maxTentativas) return "pendente";
  return "erro";
}