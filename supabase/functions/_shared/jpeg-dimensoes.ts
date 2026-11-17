// Lê largura/altura de um JPEG pelo cabeçalho (marcador SOF), sem decodificar
// os pixels. Usado para não abrir fotos enormes (ex.: 50 MP) dentro da função.
export function lerDimensoesJpeg(b: Uint8Array): { largura: number; altura: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xff) return null;
    const m = b[p + 1];
    if (m === 0xff) { p++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { p += 2; continue; }
    const len = (b[p + 2] << 8) | b[p + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { altura: (b[p + 5] << 8) | b[p + 6], largura: (b[p + 7] << 8) | b[p + 8] };
    }
    if (m === 0xda) return null;
    p += 2 + len;
  }
  return null;
}

// Acima disso a decodificação na função arrisca estourar a memória.
export const MAX_MEGAPIXELS_DECODE = 20;

export function megapixels(d: { largura: number; altura: number }): number {
  return (d.largura * d.altura) / 1_000_000;
}
