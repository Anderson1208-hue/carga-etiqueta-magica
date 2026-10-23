import { describe, expect, it } from "vitest";
import { compararNfsCrescente } from "./okentrega-acompanhamento";

describe("ordem crescente de NF no acompanhamento OK Entrega", () => {
  it("ordena numericamente, inclusive números com zeros à esquerda", () => {
    const notas = ["100", "0009", "22", "2"].map(numero_nf => ({ numero_nf }));
    expect(notas.sort(compararNfsCrescente).map(n => n.numero_nf)).toEqual(["2", "0009", "22", "100"]);
  });
});