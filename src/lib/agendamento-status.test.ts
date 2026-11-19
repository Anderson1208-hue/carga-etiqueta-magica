import { describe, expect, it } from "vitest";
import {
  agendamentoBloqueiaPreparacao,
  agendamentoExigeData,
  agendamentoLiberaParaDeposito,
  isReentregaStatus,
} from "./agendamento-status";

describe("novos status de agendamento", () => {
  it.each(["REENTREGA COM CUSTO", "REENTREGA SEM CUSTO"])(
    "%s não exige data, mas segue o fluxo de reentrega",
    (status) => {
      expect(isReentregaStatus(status)).toBe(true);
      expect(agendamentoExigeData(status)).toBe(false);
      expect(agendamentoLiberaParaDeposito(status)).toBe(true);
      expect(agendamentoBloqueiaPreparacao(status)).toBe(false);
    },
  );

  it.each(["PERDA DE AGENDAMENTO, AGUARDANDO NOVA AGENDA", "SINISTRO"])(
    "%s não exige data nem libera a NF para programação",
    (status) => {
      expect(agendamentoExigeData(status)).toBe(false);
      expect(agendamentoLiberaParaDeposito(status)).toBe(false);
      expect(agendamentoBloqueiaPreparacao(status)).toBe(true);
    },
  );

  it("Falta Direta do CD não exige data nem libera a NF para programação", () => {
    expect(agendamentoExigeData("FALTA DIRETA DO CD")).toBe(false);
    expect(agendamentoLiberaParaDeposito("FALTA DIRETA DO CD")).toBe(false);
    expect(agendamentoBloqueiaPreparacao("FALTA DIRETA DO CD")).toBe(true);
  });

  it("preserva as regras da reentrega e do agendamento atuais", () => {
    expect(agendamentoExigeData("REENTREGA")).toBe(true);
    expect(agendamentoExigeData("AGENDAMENTO")).toBe(true);
    expect(agendamentoBloqueiaPreparacao("AGUARDANDO AGENDA")).toBe(true);
    expect(agendamentoBloqueiaPreparacao("ENTREGA IMEDIATA AGUARDANDO DEFINIÇÃO")).toBe(false);
  });
});
