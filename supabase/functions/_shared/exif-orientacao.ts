// Lê a orientação EXIF (tag 0x0112) de um JPEG. Celulares gravam a foto "deitada"
// e marcam a rotação no EXIF; ao reduzir com imagescript o EXIF se perde e a
// foto sai de lado. Use `endireitar` logo após o decode.
export function lerOrientacaoExif(b: Uint8Array): number {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let p = 2;
  while (p + 4 < b.length) {
    if (b[p] !== 0xff) return 1;
    const marker = b[p + 1];
    const len = (b[p + 2] << 8) | b[p + 3];
    if (marker === 0xe1 && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) {
      const t = p + 10; // início do cabeçalho TIFF
      const le = b[t] === 0x49;
      const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const u32 = (o: number) =>
        le
          ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
          : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > b.length) break;
        if (u16(e) === 0x0112) return u16(e + 8) || 1;
      }
      return 1;
    }
    if (marker === 0xda) return 1;
    p += 2 + len;
  }
  return 1;
}

// deno-lint-ignore no-explicit-any
export function endireitar(img: any, orientacao: number): any {
  // imagescript: rotate(270) endireita a orientação 6 (conferido com foto real).
  if (orientacao === 6) img.rotate(270);
  else if (orientacao === 8) img.rotate(90);
  else if (orientacao === 3) img.rotate(180);
  return img;
}
