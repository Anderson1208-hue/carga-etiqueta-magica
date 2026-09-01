// Preparo da imagem do canhoto para a OK Entrega.
// Exigência do manual: JPEG 1536 x 240 px, densidade 150 dpi.
// Fora dessa especificação o comprovante entra como "Recusado".
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

export const OKE_LARGURA = 1536;
export const OKE_ALTURA = 240;
export const OKE_DPI = 150;

export type ModoImagem = "recibo" | "contain" | "stretch" | "cover";

// Fallback da faixa do recibo quando a detecção automática não acha conteúdo:
// centro vertical em 24% da altura e faixa de 22% da altura.
const RECIBO_OFFSET_Y = 0.24;
const RECIBO_ALTURA = 0.22;

/**
 * Detecta a área útil do canhoto (papel + tinta) na foto.
 * A faixa fixa falhava quando o motorista fotografa o recibo de lado, torto ou
 * ocupando apenas um canto: a OK Entrega recebia 1536x240 quase em branco.
 */
function detectarRecorte(src: Image): { x: number; y: number; w: number; h: number; rot: number } | null {
  const ALVO = OKE_LARGURA / OKE_ALTURA; // 6.4
  const escala = Math.max(1, Math.round(Math.max(src.width, src.height) / 320));
  const w = Math.max(16, Math.floor(src.width / escala));
  const h = Math.max(16, Math.floor(src.height / escala));
  const small = src.clone().resize(w, h);
  const px = small.bitmap; // RGBA

  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
  }

  // 1) papel = região clara (descarta fundo escuro, sombra, roupa do motorista)
  const ord = Float32Array.from(lum).sort();
  const claro = ord[Math.floor(ord.length * 0.95)] || 255;
  const limPapel = claro * 0.7;

  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    let cnt = 0;
    for (let x = 0; x < w; x++) if (lum[y * w + x] > limPapel) cnt++;
    if (cnt > w * 0.05) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  for (let x = 0; x < w; x++) {
    let cnt = 0;
    for (let y = 0; y < h; y++) if (lum[y * w + x] > limPapel) cnt++;
    if (cnt > h * 0.05) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  }
  if (x1 <= x0 || y1 <= y0) return null;

  // 2) tinta = pixel bem mais escuro que a média LOCAL do papel (elimina sombra
  // e degradê da folha) e que tenha papel claro na vizinhança (elimina roupa,
  // chão e fundo escuro da foto).
  const media = new Float32Array(w * h); // média local (janela 25) via duas passadas
  const tmp = new Float32Array(w * h);
  const RM = 12;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let k = -RM; k <= RM; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        s += lum[y * w + xx]; c++;
      }
      tmp[y * w + x] = s / c;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let s = 0, c = 0;
      for (let k = -RM; k <= RM; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        s += tmp[yy * w + x]; c++;
      }
      media[y * w + x] = s / c;
    }
  }

  // máximo local (janela 7) separável: existe papel claro por perto?
  const R = 3;
  const maxH = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = -R; k <= R; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        const v = lum[y * w + xx];
        if (v > m) m = v;
      }
      maxH[y * w + x] = m;
    }
  }
  const vizinho = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0;
      for (let k = -R; k <= R; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        const v = maxH[yy * w + x];
        if (v > m) m = v;
      }
      vizinho[y * w + x] = m;
    }
  }

  const tinta = new Uint8Array(w * h);
  let totalTinta = 0;
  for (let i = 0; i < tinta.length; i++) {
    if (lum[i] < media[i] * 0.82 && vizinho[i] > limPapel && lum[i] > claro * 0.15) {
      tinta[i] = 1; totalTinta++;
    }
  }
  if (totalTinta < 40) return null;

  // 3) dilata (janela 7) e fica com o MAIOR bloco conectado: é a tira do recibo,
  // onde estão número da NF, data, nome e assinatura.
  const D = 3;
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!tinta[y * w + x]) continue;
      for (let dy = -D; dy <= D; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -D; dx <= D; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          dil[yy * w + xx] = 1;
        }
      }
    }
  }

  const visto = new Uint8Array(w * h);
  const fila = new Int32Array(w * h);
  let melhor = { peso: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
  for (let s = 0; s < dil.length; s++) {
    if (!dil[s] || visto[s]) continue;
    let ini = 0, fim = 0;
    fila[fim++] = s; visto[s] = 1;
    let peso = 0, bx0 = w, bx1 = 0, by0 = h, by1 = 0;
    while (ini < fim) {
      const i = fila[ini++];
      const x = i % w, y = (i - x) / w;
      if (tinta[i]) peso++;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
      if (x > 0 && dil[i - 1] && !visto[i - 1]) { visto[i - 1] = 1; fila[fim++] = i - 1; }
      if (x < w - 1 && dil[i + 1] && !visto[i + 1]) { visto[i + 1] = 1; fila[fim++] = i + 1; }
      if (y > 0 && dil[i - w] && !visto[i - w]) { visto[i - w] = 1; fila[fim++] = i - w; }
      if (y < h - 1 && dil[i + w] && !visto[i + w]) { visto[i + w] = 1; fila[fim++] = i + w; }
    }
    if (peso > melhor.peso) melhor = { peso, x0: bx0, x1: bx1, y0: by0, y1: by1 };
  }
  if (melhor.peso < 30) return null;

  let ix0 = melhor.x0, ix1 = melhor.x1, iy0 = melhor.y0, iy1 = melhor.y1;

  // margem de respiro
  const padX = Math.round((ix1 - ix0) * 0.04) + 1;
  const padY = Math.round((iy1 - iy0) * 0.04) + 1;
  ix0 = Math.max(0, ix0 - padX); ix1 = Math.min(w - 1, ix1 + padX);
  iy0 = Math.max(0, iy0 - padY); iy1 = Math.min(h - 1, iy1 + padY);

  // volta à resolução original
  let cx = (ix0 * src.width) / w;
  let cy = (iy0 * src.height) / h;
  let cw = ((ix1 - ix0 + 1) * src.width) / w;
  let ch = ((iy1 - iy0 + 1) * src.height) / h;

  // 3) orientação: o canhoto da DANFE é uma tira na BORDA da folha. Se a tira
  // detectada está em pé (motorista fotografou a folha deitada), giramos para
  // deixá-la na horizontal — sem isso a faixa 1536x240 saía quase em branco.
  // Qual lado vira o topo: o cabeçalho impresso ("RECEBEMOS DE...") é a metade
  // com mais tinta; ela precisa ficar em cima, senão o canhoto sai de ponta-cabeça.
  let rot = 0;
  if (ch > cw * 1.2) {
    const meio = Math.round((ix0 + ix1) / 2);
    let esq = 0, dir = 0;
    for (let y = iy0; y <= iy1; y++) {
      for (let x = ix0; x <= ix1; x++) {
        if (!tinta[y * w + x]) continue;
        if (x < meio) esq++; else dir++;
      }
    }
    rot = esq >= dir ? 90 : 270;
  }

  // ajusta ao formato alvo (6.4:1 no eixo longo da tira) sem esmagar o conteúdo
  const alvoLocal = rot === 0 ? ALVO : 1 / ALVO;
  if (cw / ch < alvoLocal) {
    const novoW = Math.min(src.width, ch * alvoLocal);
    cx = Math.max(0, Math.min(src.width - novoW, cx - (novoW - cw) / 2));
    cw = novoW;
  } else {
    const novoH = Math.min(src.height, cw / alvoLocal);
    cy = Math.max(0, Math.min(src.height - novoH, cy - (novoH - ch) / 2));
    ch = novoH;
  }
  void icy; void pcy;

  return {
    x: Math.max(0, Math.round(cx)),
    y: Math.max(0, Math.round(cy)),
    w: Math.max(8, Math.min(src.width - Math.round(cx), Math.round(cw))),
    h: Math.max(8, Math.min(src.height - Math.round(cy), Math.round(ch))),
    rot,
  };
}

/**
 * Redimensiona para exatamente 1536x240.
 * - recibo: detecta a área do canhoto na foto e encaixa na faixa (padrão em produção)
 * - contain: preserva proporção, centraliza sobre fundo branco
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
    let area: { x: number; y: number; w: number; h: number; rot: number } | null = null;
    try {
      area = detectarRecorte(src);
    } catch {
      area = null;
    }
    if (!area) {
      const sh = Math.max(8, Math.min(src.height, Math.round(src.height * RECIBO_ALTURA)));
      const cyF = Math.round(src.height * RECIBO_OFFSET_Y);
      const syF = Math.max(0, Math.min(src.height - sh, cyF - Math.round(sh / 2)));
      area = { x: 0, y: syF, w: src.width, h: sh, rot: 0 };
    }
    let recorte = src.crop(area.x, area.y, area.w, area.h);
    if (area.rot) recorte = recorte.rotate(area.rot) as Image;
    const faixa = recorte.resize(OKE_LARGURA, OKE_ALTURA);
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
