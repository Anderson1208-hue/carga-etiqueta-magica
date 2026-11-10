import { describe, it, expect } from "vitest";
import { embarcadorCliente, linhasProtocolo } from "./divergencia-clientes";

describe("divergência demais clientes", () => {
  it("Arcor e Bagley saem no mesmo relatório", () => {
    expect(embarcadorCliente("54.360.656/0001-00")).toBe("ARCOR/BAGLEY");
    expect(embarcadorCliente("06042467000100")).toBe("ARCOR/BAGLEY");
  });
  it("Masterfoods e Pandurata têm relatório próprio; Cacau não entra", () => {
    expect(embarcadorCliente("29737368000100")).toBe("MASTERFOODS");
    expect(embarcadorCliente("70940994008277")).toBe("PANDURATA");
    expect(embarcadorCliente("61472205000100")).toBeNull();
  });
  it("protocolo usa DT = número da carga, lacre e motorista, sem valor de débito", () => {
    const [l] = linhasProtocolo([{ numero_nf: "773558", c_prod: "0040000152", x_prod: "X", status: "FALTA", qtd_nf: 392, qtd_recebida: 364, quantidade: 28, criado_em: "2026-11-10T15:00:00Z" }],
      { dt: "1804236", lacre: "426018", motorista: "Ivanilton" });
    expect(l).toEqual(["1804236", "773558", "40000152", "X", 392, 364, 28, "FALTA", "10/11/2026", "426018", "Ivanilton"]);
  });
});
