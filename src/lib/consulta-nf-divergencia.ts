export interface DivergenciaConsulta {
  tipo: string;
  observacao: string | null;
  criado_em: string;
  cancelado_em: string | null;
}

export function faltaTotalAtiva(
  divergencias: DivergenciaConsulta[] | null | undefined,
): DivergenciaConsulta | null {
  return (divergencias || [])
    .filter((divergencia) =>
      divergencia.tipo === "falta_total" && divergencia.cancelado_em === null
    )
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0] || null;
}
