import type { Tables } from "@/integrations/supabase/types";

export type OrdemColeta = Tables<"ordens_coleta">;

export const STATUS_ORDEM_COLETA = [
  { value: "pendente", label: "Pendente" },
  { value: "agendada", label: "Agendada" },
  { value: "em_coleta", label: "Em coleta" },
  { value: "coletada", label: "Coletada" },
  { value: "cancelada", label: "Cancelada" },
] as const;

export type StatusOrdemColeta = (typeof STATUS_ORDEM_COLETA)[number]["value"];

export type OrdemColetaForm = {
  id?: string;
  numero?: number;
  data_coleta: string;
  hora_prevista: string;
  embarcador_id: string;
  embarcador_nome: string;
  endereco: string;
  cidade: string;
  uf: string;
  contato: string;
  telefone: string;
  motorista: string;
  placa: string;
  notas_fiscais: string;
  volumes: string;
  peso_kg: string;
  observacoes: string;
  status: StatusOrdemColeta;
};

export function dataHojeBrasilia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formularioColetaVazio(): OrdemColetaForm {
  return {
    data_coleta: dataHojeBrasilia(),
    hora_prevista: "",
    embarcador_id: "",
    embarcador_nome: "",
    endereco: "",
    cidade: "",
    uf: "",
    contato: "",
    telefone: "",
    motorista: "",
    placa: "",
    notas_fiscais: "",
    volumes: "0",
    peso_kg: "0",
    observacoes: "",
    status: "pendente",
  };
}

export function coletaParaFormulario(ordem: OrdemColeta): OrdemColetaForm {
  const status = STATUS_ORDEM_COLETA.some((item) => item.value === ordem.status)
    ? (ordem.status as StatusOrdemColeta)
    : "pendente";

  return {
    id: ordem.id,
    numero: ordem.numero,
    data_coleta: ordem.data_coleta,
    hora_prevista: ordem.hora_prevista?.slice(0, 5) ?? "",
    embarcador_id: ordem.embarcador_id ?? "",
    embarcador_nome: ordem.embarcador_nome,
    endereco: ordem.endereco,
    cidade: ordem.cidade ?? "",
    uf: ordem.uf ?? "",
    contato: ordem.contato ?? "",
    telefone: ordem.telefone ?? "",
    motorista: ordem.motorista ?? "",
    placa: ordem.placa ?? "",
    notas_fiscais: ordem.notas_fiscais ?? "",
    volumes: String(ordem.volumes),
    peso_kg: String(ordem.peso_kg),
    observacoes: ordem.observacoes ?? "",
    status,
  };
}

export function formatarNumeroColeta(numero: number) {
  return `OC-${String(numero).padStart(6, "0")}`;
}

export function formatarDataColeta(data: string) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

export function formatarPesoColeta(peso: number) {
  return Number(peso).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function normalizarPlacaColeta(placa: string) {
  return placa.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export function validarColeta(form: OrdemColetaForm) {
  if (!form.data_coleta) return "Informe a data da coleta.";
  if (!form.embarcador_id || !form.embarcador_nome.trim()) return "Selecione o embarcador.";
  if (!form.endereco.trim()) return "Informe o endereço da coleta.";
  if (form.uf && !/^[A-Z]{2}$/.test(form.uf)) return "Informe a UF com duas letras.";
  if (form.placa && !/^[A-Z0-9]{7}$/.test(form.placa)) return "A placa deve ter 7 letras e números.";

  const volumes = Number(form.volumes);
  if (!Number.isInteger(volumes) || volumes < 0) return "Volumes deve ser um número inteiro maior ou igual a zero.";

  const peso = Number(form.peso_kg);
  if (!Number.isFinite(peso) || peso < 0) return "O peso deve ser maior ou igual a zero.";

  return null;
}
