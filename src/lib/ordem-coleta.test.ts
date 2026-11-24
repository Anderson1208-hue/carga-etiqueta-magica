import { describe, expect, it } from "vitest";
import {
  formularioColetaVazio,
  formatarCpfColeta,
  formatarDataColeta,
  normalizarCpfColeta,
  normalizarPlacaColeta,
  placasCarretaColeta,
  validarColeta,
  type OrdemColetaForm,
} from "./ordem-coleta";

function formularioValido(): OrdemColetaForm {
  return {
    ...formularioColetaVazio(),
    embarcador_id: "embarcador-1",
    embarcador_nome: "Pandurata",
    endereco: "Rua de teste, 100",
  };
}

describe("ordem de coleta", () => {
  it("não desloca a data informada por causa do fuso horário", () => {
    expect(formatarDataColeta("2026-11-23")).toBe("23/11/2026");
  });

  it("normaliza a placa no formato aceito pelo cadastro", () => {
    expect(normalizarPlacaColeta("kws-5d11")).toBe("KWS5D11");
  });

  it("normaliza e apresenta o CPF sem perder os 11 dígitos", () => {
    expect(normalizarCpfColeta("123.456.789-09")).toBe("12345678909");
    expect(formatarCpfColeta("12345678909")).toBe("123.456.789-09");
  });

  it("aceita os novos dados da Pandurata preenchidos", () => {
    expect(validarColeta({
      ...formularioValido(),
      cpf_motorista: "12345678909",
      placa: "KWS5D11",
      placa_carreta: "ABC1D23",
      cubagem_m3: "65.875",
      codigo_otm: "OTM-123",
      numero_roteiro: "R-456",
    })).toBeNull();
  });

  it("recusa CPF, carreta ou cubagem inválidos sem exigir o preenchimento", () => {
    expect(validarColeta(formularioValido())).toBeNull();
    expect(validarColeta({ ...formularioValido(), cpf_motorista: "123" })).toBe("O CPF do motorista deve ter 11 números.");
    expect(validarColeta({ ...formularioValido(), placa_carreta: "123" })).toBe("A placa da carreta deve ter 7 letras e números.");
    expect(validarColeta({ ...formularioValido(), cubagem_m3: "-1" })).toBe("A cubagem deve ser maior ou igual a zero.");
  });

  it("aceita duas carretas em carga rodotrem", () => {
    expect(validarColeta({ ...formularioValido(), placa: "KWS5D11", placa_carreta: "ABC1D23", placa_carreta_2: "XYZ9F88" })).toBeNull();
  });

  it("exige a placa da carreta antes de usar o campo rodotrem", () => {
    expect(validarColeta({ ...formularioValido(), placa_carreta_2: "XYZ9F88" })).toBe("Informe a placa da carreta antes de usar o campo rodotrem.");
  });

  it("recusa a placa rodotrem incompleta", () => {
    expect(validarColeta({ ...formularioValido(), placa_carreta: "ABC1D23", placa_carreta_2: "XYZ" })).toBe("A placa da carreta (rodotrem) deve ter 7 letras e números.");
  });

  it("apresenta as carretas na ordem em que foram lançadas", () => {
    expect(placasCarretaColeta({ placa_carreta: "ABC1D23", placa_carreta_2: "XYZ9F88" })).toEqual(["ABC1D23", "XYZ9F88"]);
    expect(placasCarretaColeta({ placa_carreta: "ABC1D23", placa_carreta_2: null })).toEqual(["ABC1D23"]);
    expect(placasCarretaColeta({ placa_carreta: null, placa_carreta_2: null })).toEqual([]);
  });
});
