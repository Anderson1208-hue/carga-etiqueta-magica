// Preparo da imagem do canhoto para a OK Entrega.
// Exigência do manual: JPEG 1536 x 240 px, densidade 150 dpi.
// Fora dessa especificação o comprovante entra como "Recusado".
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

export const OKE_LARGURA = 1536;
export const OKE_ALTURA = 240;
export const OKE_DPI = 150;

export type ModoImagem = "recibo" | "contain" | "stretch" | "cover";

// Faixa do recibo na DANFE (mesmos valores do preparo do app em
// src/lib/okentrega-canhoto.ts): centro vertical em 24% da altura e faixa de
// 22% da altura. Sem esse recorte a foto retrato inteira cabia em ~180x240 px
// dentro da faixa 1536x240 e o comprovante chegava ilegível na OK Entrega.
const RECIBO_OFFSET_Y = 0.24;
const RECIBO_ALTURA = 0.22;

/**
 * Redimensiona para exatamente 1536x240.
 * - contain: preserva proporção, centraliza sobre fundo branco (padrão, não distorce a assinatura)
 * - stretch: força 1536x240 (distorce)
 * - cover: preenche e recorta as sobras
 */
export async function prepararCanhoto(
  originais: Uint8Array,
  modo: ModoImagem = "contain",
  qualidade = 85,
): Promise<{ bytes: Uint8Array; largura: number; altura: number; dpi: number }> {
  const src = await Image.decode(originais);

  let final: Image;

  if (modo === "recibo") {
    const sh = Math.max(8, Math.min(src.height, Math.round(src.height * RECIBO_ALTURA)));
    const cy = Math.round(src.height * RECIBO_OFFSET_Y);
    const sy = Math.max(0, Math.min(src.height - sh, cy - Math.round(sh / 2)));
    const faixa = src.crop(0, sy, src.width, sh).resize(OKE_LARGURA, OKE_ALTURA);
    // Realce para leitura (P&B + contraste), igual ao preparo do app.
    try {
      faixa.saturation(0);
      faixa.contrast(1.45);
    } catch {
      // se a versão da lib não expor os filtros, segue sem realce
    }
    final = faixa;
  } else if (modo === "stretch") {
    final = src.resize(OKE_LARGURA, OKE_ALTURA);
  } else if (modo === "cover") {
    const escala = Math.max(OKE_LARGURA / src.width, OKE_ALTURA / src.height);
    const redim = src.resize(Math.round(src.width * escala), Math.round(src.height * escala));
    const x = Math.max(0, Math.round((redim.width - OKE_LARGURA) / 2));
    const y = Math.max(0, Math.round((redim.height - OKE_ALTURA) / 2));
    final = redim.crop(x, y, OKE_LARGURA, OKE_ALTURA);
  } else {
    const escala = Math.min(OKE_LARGURA / src.width, OKE_ALTURA / src.height);
    const largura = Math.max(1, Math.round(src.width * escala));
    const altura = Math.max(1, Math.round(src.height * escala));
    const redim = src.resize(largura, altura);
    const canvas = new Image(OKE_LARGURA, OKE_ALTURA);
    canvas.fill(0xffffffff); // fundo branco
    canvas.composite(redim, Math.round((OKE_LARGURA - largura) / 2), Math.round((OKE_ALTURA - altura) / 2));
    final = canvas;
  }

  const jpeg = await final.encodeJPEG(qualidade);
  const comDpi = aplicarDensidadeJfif(new Uint8Array(jpeg), OKE_DPI);

  return { bytes: comDpi, largura: OKE_LARGURA, altura: OKE_ALTURA, dpi: OKE_DPI };
}

/**
 * Garante o segmento APP0/JFIF com units=1 (dpi) e X/Y density = dpi.
 * Se o encoder não escreveu APP0, insere o segmento logo após o SOI.
 */
export function aplicarDensidadeJfif(bytes: Uint8Array, dpi: number): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

  const temApp0 =
    bytes[2] === 0xff && bytes[3] === 0xe0 &&
    bytes[6] === 0x4a && bytes[7] === 0x46 && bytes[8] === 0x49 && bytes[9] === 0x46 && bytes[10] === 0x00;

  if (temApp0) {
    const out = bytes.slice();
    out[2 + 11] = 0x01; // units = dots per inch
    out[2 + 12] = (dpi >> 8) & 0xff;
    out[2 + 13] = dpi & 0xff;
    out[2 + 14] = (dpi >> 8) & 0xff;
    out[2 + 15] = dpi & 0xff;
    return out;
  }

  const app0 = new Uint8Array([
    0xff, 0xe0,
    0x00, 0x10, // length 16
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, // versão 1.01
    0x01, // units = dpi
    (dpi >> 8) & 0xff, dpi & 0xff,
    (dpi >> 8) & 0xff, dpi & 0xff,
    0x00, 0x00, // sem thumbnail
  ]);

  const out = new Uint8Array(bytes.length + app0.length);
  out[0] = 0xff;
  out[1] = 0xd8;
  out.set(app0, 2);
  out.set(bytes.subarray(2), 2 + app0.length);
  return out;
}

export function paraBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
