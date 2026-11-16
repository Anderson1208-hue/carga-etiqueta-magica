import { describe, expect, it } from "vitest";
import { validarEdicao } from "./divergencia-edicao";
describe("edição de divergências", () => {
  it("exige motivo para preservar rastreabilidade", () => expect(validarEdicao("53", " ", true, false)).toBeTruthy());
  it("aceita corrigir 53 para 1 caixa", () => expect(validarEdicao("1", "Correção do operador", true, false)).toBeNull());
  it("não aceita fração de caixa Cacau", () => expect(validarEdicao("1.5", "Correção", true, false)).toBeTruthy());
  it("falta total usa zero sem exigir quantidade", () => expect(validarEdicao("0", "Correção", true, true)).toBeNull());
});