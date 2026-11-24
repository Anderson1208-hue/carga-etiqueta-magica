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
  cpf_motorista: string;
  placa: string;
  placa_carreta: string;
  placa_carreta_2: string;
  codigo_otm: string;
  numero_roteiro: string;
  notas_fiscais: string;
  volumes: string;
  peso_kg: string;
  cubagem_m3: string;
  volume_liquido_m3: string;
  observacoes: string;
  status: StatusOrdemColeta;
  pandurata_otm_id?: string;
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
    cpf_motorista: "",
    placa: "",
    placa_carreta: "",
    placa_carreta_2: "",
    codigo_otm: "",
    numero_roteiro: "",
    notas_fiscais: "",
    volumes: "0",
    peso_kg: "0",
    cubagem_m3: "",
    volume_liquido_m3: "",
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
    cpf_motorista: ordem.cpf_motorista ?? "",
    placa: ordem.placa ?? "",
    placa_carreta: ordem.placa_carreta ?? "",
    placa_carreta_2: ordem.placa_carreta_2 ?? "",
    codigo_otm: ordem.codigo_otm ?? "",
    numero_roteiro: ordem.numero_roteiro ?? "",
    notas_fiscais: ordem.notas_fiscais ?? "",
    volumes: String(ordem.volumes),
    peso_kg: String(ordem.peso_kg),
    cubagem_m3: ordem.cubagem_m3 === null ? "" : String(ordem.cubagem_m3),
    volume_liquido_m3: ordem.volume_liquido_m3 === null ? "" : String(ordem.volume_liquido_m3),
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

export function formatarCubagemColeta(cubagem: number) {
  return Number(cubagem).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function normalizarPlacaColeta(placa: string) {
  return placa.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export function placasCarretaColeta(ordem: { placa_carreta: string | null; placa_carreta_2: string | null }) {
  return [ordem.placa_carreta, ordem.placa_carreta_2].filter((placa): placa is string => Boolean(placa && placa.trim())).map((placa) => placa.trim());
}

export function normalizarCpfColeta(cpf: string) {
  return cpf.replace(/\D/g, "").slice(0, 11);
}

export function formatarCpfColeta(cpf: string) {
  const digitos = normalizarCpfColeta(cpf);
  return digitos
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function validarColeta(form: OrdemColetaForm) {
  if (!form.data_coleta) return "Informe a data da coleta.";
  if (!form.embarcador_id || !form.embarcador_nome.trim()) return "Selecione o embarcador.";
  if (!form.endereco.trim()) return "Informe o endereço da coleta.";
  if (form.uf && !/^[A-Z]{2}$/.test(form.uf)) return "Informe a UF com duas letras.";
  if (form.placa && !/^[A-Z0-9]{7}$/.test(form.placa)) return "A placa do cavalo deve ter 7 letras e números.";
  if (form.placa_carreta && !/^[A-Z0-9]{7}$/.test(form.placa_carreta)) return "A placa da carreta deve ter 7 letras e números.";
  if (form.placa_carreta_2 && !form.placa_carreta) return "Informe a placa da carreta antes de usar o campo rodotrem.";
  if (form.placa_carreta_2 && !/^[A-Z0-9]{7}$/.test(form.placa_carreta_2)) return "A placa da carreta (rodotrem) deve ter 7 letras e números.";
  if (form.cpf_motorista && !/^[0-9]{11}$/.test(form.cpf_motorista)) return "O CPF do motorista deve ter 11 números.";

  const volumes = Number(form.volumes);
  if (!Number.isInteger(volumes) || volumes < 0) return "Volumes deve ser um número inteiro maior ou igual a zero.";

  const peso = Number(form.peso_kg);
  if (!Number.isFinite(peso) || peso < 0) return "O peso deve ser maior ou igual a zero.";

  if (form.cubagem_m3.trim()) {
    const cubagem = Number(form.cubagem_m3);
    if (!Number.isFinite(cubagem) || cubagem < 0) return "A cubagem deve ser maior ou igual a zero.";
  }
  if (form.volume_liquido_m3.trim()) {
    const liquido = Number(form.volume_liquido_m3);
    if (!Number.isFinite(liquido) || liquido < 0) return "O volume líquido deve ser maior ou igual a zero.";
  }

  return null;
}
