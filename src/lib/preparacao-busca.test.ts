import { describe, expect, it } from "vitest";
import { correspondeBuscaPreparacao } from "./preparacao-busca";

const nota = {
  numero_nf: "4505672",
  cnpj_destinatario: "01234567000189",
  dest_razao_social: "ATACADÃO SA",
  dest_bairro: "CENTRO",
  dest_cidade: "RIO DE JANEIRO",
};

describe("busca da Preparação", () => {
  it("localiza CNPJ completo com e sem pontuação, preservando zeros", () => {
    expect(correspondeBuscaPreparacao(nota, "01234567000189")).toBe(true);
    expect(correspondeBuscaPreparacao(nota, " 01.234.567/0001-89 ")).toBe(true);
    expect(correspondeBuscaPreparacao(nota, "01234567000289")).toBe(false);
  });
  it("aceita parte do CNPJ e CNPJ armazenado com pontuação", () => {
    expect(correspondeBuscaPreparacao(nota, "01.234.567")).toBe(true);
    expect(correspondeBuscaPreparacao({ ...nota, cnpj_destinatario: "01.234.567/0001-89" }, "01234567000189")).toBe(true);
  });
  it("preserva buscas por NF, destinatário, bairro e cidade", () => {
    for (const busca of ["4505672", "atacadão", "centro", "rio de janeiro", ""]) {
      expect(correspondeBuscaPreparacao(nota, busca)).toBe(true);
    }
    expect(correspondeBuscaPreparacao(nota, "inexistente")).toBe(false);
  });
  it("não transforma texto misto ou pontuação vazia em busca por CNPJ", () => {
    expect(correspondeBuscaPreparacao(nota, "cliente 01234567")).toBe(false);
    expect(correspondeBuscaPreparacao(nota, "./-")).toBe(false);
  });
});