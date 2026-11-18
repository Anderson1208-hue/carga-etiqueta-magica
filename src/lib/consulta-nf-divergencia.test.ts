import { describe, expect, it } from "vitest";
import { faltaTotalAtiva, type DivergenciaConsulta } from "./consulta-nf-divergencia";

const faltaTotal: DivergenciaConsulta = {
  tipo: "falta_total",
  observacao: "Não veio produto",
  criado_em: "2026-11-18T12:00:00Z",
  cancelado_em: null,
};

describe("falta total na consulta de NF", () => {
  it("mostra somente uma falta total ainda ativa", () => {
    expect(faltaTotalAtiva([
      { ...faltaTotal, tipo: "falta_parcial" },
      { ...faltaTotal, cancelado_em: "2026-11-18T13:00:00Z" },
      faltaTotal,
    ])).toEqual(faltaTotal);
  });

  it("não mostra o alerta quando toda falta total foi cancelada", () => {
    expect(faltaTotalAtiva([
      { ...faltaTotal, cancelado_em: "2026-11-18T13:00:00Z" },
    ])).toBeNull();
  });

  it("usa a ocorrência ativa mais recente", () => {
    const recente = { ...faltaTotal, criado_em: "2026-11-18T14:00:00Z" };
    expect(faltaTotalAtiva([faltaTotal, recente])).toEqual(recente);
  });
});
