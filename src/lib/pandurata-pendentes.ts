import type { Tables } from "@/integrations/supabase/types";
import { formularioColetaVazio, type OrdemColetaForm } from "@/lib/ordem-coleta";

export type CargaPendentePandurata = Tables<"pandurata_otm_cargas">;
type Parada = { seq?: number; tipo?: string; local?: string; nome?: string; chegada?: string | null };

function dataHoraBrasilia(iso: string | null) {
  if (!iso) return { data: "", hora: "" };
  const d = new Date(iso);
  const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { data, hora };
}

// "C1043 PANDURATA ALIMENTOS LTDA EXTREMA MG 37640000" -> cidade/UF/CEP
export function localDaParada(local: string, nome: string) {
  const m = local.match(/^\S+\s+(.*)\s+([A-Z]{2})\s+(\d{8})$/);
  if (!m) return { cidade: "", uf: "", cep: "" };
  const resto = m[1].startsWith(nome) ? m[1].slice(nome.length).trim() : m[1];
  return { cidade: resto, uf: m[2], cep: m[3] };
}

export function coletaDePendentePandurata(
  carga: CargaPendentePandurata,
  embarcador: { id: string; nome: string } | null,
): OrdemColetaForm {
  const paradas = (Array.isArray(carga.paradas) ? carga.paradas : []) as Parada[];
  const coleta = paradas.find((p) => p.tipo === "COLETA");
  const local = coleta ? localDaParada(coleta.local ?? "", coleta.nome ?? "") : { cidade: "", uf: "", cep: "" };
  const { data, hora } = dataHoraBrasilia(carga.inicio_viagem);
  const entregas = paradas.filter((p) => p.tipo === "ENTREGA").map((p) => p.nome).filter(Boolean);
  const obs = [
    carga.remessas?.length ? `Remessas: ${carga.remessas.join(" | ")}` : "",
    carga.peso_liquido_kg !== null ? `Peso líquido: ${carga.peso_liquido_kg} kg` : "",
    carga.tipo_carga ? `Tipo de carga: ${carga.tipo_carga}` : "",
    carga.tipo_equipamento ? `Equipamento: ${carga.tipo_equipamento}` : "",
    entregas.length ? `Entregas: ${entregas.join("; ")}` : "",
  ].filter(Boolean).join("\n");
  return {
    ...formularioColetaVazio(),
    data_coleta: data || formularioColetaVazio().data_coleta,
    hora_prevista: hora,
    embarcador_id: embarcador?.id ?? "",
    embarcador_nome: embarcador?.nome ?? "",
    endereco: coleta ? `${coleta.nome ?? ""}${local.cep ? ` - CEP ${local.cep}` : ""}`.trim() : "",
    cidade: local.cidade,
    uf: local.uf,
    codigo_otm: carga.remessa_id ?? carga.shipment_id.replace(/^BAU\./, ""),
    numero_roteiro: carga.numero_dt ?? "",
    volumes: String(carga.qtd_pallets ?? 0),
    peso_kg: String(carga.peso_bruto_kg ?? 0),
    cubagem_m3: carga.volume_bruto_m3 === null ? "" : String(carga.volume_bruto_m3),
    volume_liquido_m3: carga.volume_liquido_m3 === null ? "" : String(carga.volume_liquido_m3),
    observacoes: obs,
    pandurata_otm_id: carga.id,
  };
}
