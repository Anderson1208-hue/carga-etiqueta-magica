import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lerOrientacaoExif } from "./exif-orientacao.ts";

// JPEG mínimo com bloco EXIF contendo a tag de orientação.
function jpegComOrientacao(o: number): Uint8Array {
  const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, o, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xda]);
}

Deno.test("foto tirada em pé (orientação 6) é detectada", () => {
  assertEquals(lerOrientacaoExif(jpegComOrientacao(6)), 6);
});

Deno.test("foto sem EXIF fica como está", () => {
  assertEquals(lerOrientacaoExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda])), 1);
});
