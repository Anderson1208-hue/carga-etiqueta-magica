import { describe, expect, it } from "vitest";
import { produtosDaSobra } from "./produto-sobra";
const produtos = [
  { id: "1", codigo: "0040003051", codigo_alternativo: null, descricao: "Wafer Baunilha", cnpj_embarcador: "70940994008277" },
  { id: "2", codigo: "40003051", codigo_alternativo: null, descricao: "Outro cliente", cnpj_embarcador: "94261534000100" },
  { id: "3", codigo: "90108308802", codigo_alternativo: "8308802", descricao: "BALA BUT TOF", cnpj_embarcador: "54360656003089" },
];
describe("descrição de sobra pelo cadastro", () => {
  it("puxa a descrição cadastrada pelo código sem zeros e pelo embarcador", () => {
    expect(produtosDaSobra(produtos, "40003051", "PANDURATA").map((p) => p.descricao)).toEqual(["Wafer Baunilha"]);
  });
  it("aceita o código alternativo cadastrado", () => {
    expect(produtosDaSobra(produtos, "8308802", "ARCOR/BAGLEY").map((p) => p.descricao)).toEqual(["BALA BUT TOF"]);
  });
  it("não usa descrição de outro embarcador ou de código inexistente", () => {
    expect(produtosDaSobra(produtos, "40003051", "IBAC")).toEqual([]);
    expect(produtosDaSobra(produtos, "999", "PANDURATA")).toEqual([]);
  });
});