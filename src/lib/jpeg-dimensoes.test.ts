import { describe, it, expect } from "vitest";
import { lerDimensoesJpeg, megapixels, MAX_MEGAPIXELS_DECODE } from "../../supabase/functions/_shared/jpeg-dimensoes";

function jpeg(w: number, h: number) {
  // SOI + APP0 curto + SOF0
  return new Uint8Array([0xff,0xd8, 0xff,0xe0,0x00,0x04,0x00,0x00, 0xff,0xc0,0x00,0x11,0x08, h>>8,h&255, w>>8,w&255, 0x03,0,0,0,0,0,0,0,0,0]);
}

describe("lerDimensoesJpeg", () => {
  it("lê 8160x6120 (foto de 50 MP do KWS5D11) sem decodificar", () => {
    const d = lerDimensoesJpeg(jpeg(8160, 6120))!;
    expect(d).toEqual({ largura: 8160, altura: 6120 });
    expect(megapixels(d)).toBeGreaterThan(MAX_MEGAPIXELS_DECODE);
  });
  it("4160x3120 fica abaixo do limite de decodificação", () => {
    expect(megapixels(lerDimensoesJpeg(jpeg(4160, 3120))!)).toBeLessThan(MAX_MEGAPIXELS_DECODE);
  });
  it("não-JPEG retorna null", () => {
    expect(lerDimensoesJpeg(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
