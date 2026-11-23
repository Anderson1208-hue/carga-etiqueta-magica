import { describe, expect, it } from "vitest";
import { formatarDataColeta, normalizarPlacaColeta } from "./ordem-coleta";

describe("ordem de coleta", () => {
  it("não desloca a data informada por causa do fuso horário", () => {
    expect(formatarDataColeta("2026-11-23")).toBe("23/11/2026");
  });

  it("normaliza a placa no formato aceito pelo cadastro", () => {
    expect(normalizarPlacaColeta("kws-5d11")).toBe("KWS5D11");
  });
});
