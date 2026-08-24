// Preparo da imagem do canhoto para a OK Entrega, feito no navegador.
// Exigência do manual: JPEG 1536 x 240 px, densidade 150 dpi.
// Rodamos aqui (e não na Edge Function) porque decodificar fotos de 12 MP
// estoura o limite de CPU do worker.
//
// Retorno da OK Entrega em 19/08/2026: "comunicação sistêmica OK, porém a
// imagem do comprovante está ilegível". Causa raiz: a foto do motorista é
// retrato (3072 x 4096) e o modo "contain" reduzia tudo a 180 x 240 px dentro
// da faixa — texto inaproveitável. A faixa 1536 x 240 (6,4:1) só é legível se
// recortarmos a TIRA DO RECIBO da DANFE (assinatura, data, carimbo, nº da NF)
// e a esticarmos para a largura total.

export const OKE_LARGURA = 1536;
export const OKE_ALTURA = 240;
export const OKE_DPI = 150;

export type ModoImagem = "recibo" | "contain" | "stretch" | "cover";

export type AjusteCanhoto = {
  /** Rotação aplicada antes do recorte (fotos deitadas). */
  rotacao: 0 | 90 | 180 | 270;
  /** Centro vertical da faixa recortada, em fração da altura (0–1). */
  offsetY: number;
  /** Altura da faixa recortada, em fração da altura da foto (0,08–1). */
  altura: number;
  /** Recorte lateral em fração da largura por lado (0–0,4). */
  margemX: number;
  /** Realce para leitura no cartório: preto e branco + contraste. */
  realce: boolean;
};

export const AJUSTE_PADRAO: AjusteCanhoto = {
  rotacao: 0,
  offsetY: 0.24,
  altura: 0.22,
  margemX: 0,
  realce: true,
};

/** Ajusta o segmento APP0/JFIF para units=dpi e X/Y density = dpi. */
function aplicarDensidadeJfif(bytes: Uint8Array, dpi = OKE_DPI): Uint8Array {
  if (bytes.length < 20 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

  const temApp0 =
    bytes[2] === 0xff && bytes[3] === 0xe0 &&
    bytes[6] === 0x4a && bytes[7] === 0x46 && bytes[8] === 0x49 && bytes[9] === 0x46 && bytes[10] === 0x00;

  if (temApp0) {
    const out = bytes.slice();
    out[13] = 0x01;
    out[14] = (dpi >> 8) & 0xff;
    out[15] = dpi & 0xff;
    out[16] = (dpi >> 8) & 0xff;
    out[17] = dpi & 0xff;
    return out;
  }

  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01,
    0x01,
    (dpi >> 8) & 0xff, dpi & 0xff,
    (dpi >> 8) & 0xff, dpi & 0xff,
    0x00, 0x00,
  ]);

  const out = new Uint8Array(bytes.length + app0.length);
  out[0] = 0xff;
  out[1] = 0xd8;
  out.set(app0, 2);
  out.set(bytes.subarray(2), 2 + app0.length);
  return out;
}

function paraBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Aplica a rotação e devolve um canvas com a foto já orientada. */
function orientar(bitmap: ImageBitmap, rotacao: number): HTMLCanvasElement {
  const girado = rotacao === 90 || rotacao === 270;
  const canvas = document.createElement("canvas");
  canvas.width = girado ? bitmap.height : bitmap.width;
  canvas.height = girado ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotacao * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return canvas;
}

function limitar(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Desenha a faixa 1536x240 final num canvas, conforme o modo/ajuste. */
function desenhar(
  fonte: HTMLCanvasElement | ImageBitmap,
  modo: ModoImagem,
  ajuste: AjusteCanhoto,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = OKE_LARGURA;
  canvas.height = OKE_ALTURA;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OKE_LARGURA, OKE_ALTURA);
  ctx.imageSmoothingQuality = "high";
  if (modo === "recibo" && ajuste.realce) {
    ctx.filter = "grayscale(1) contrast(145%) brightness(106%)";
  }

  const L = (fonte as HTMLCanvasElement).width;
  const A = (fonte as HTMLCanvasElement).height;

  if (modo === "recibo") {
    const margemX = limitar(ajuste.margemX, 0, 0.4);
    const sx = L * margemX;
    const sw = L - 2 * sx;
    const sh = limitar(A * limitar(ajuste.altura, 0.08, 1), 8, A);
    const cy = A * limitar(ajuste.offsetY, 0, 1);
    const sy = limitar(cy - sh / 2, 0, Math.max(0, A - sh));
    ctx.drawImage(fonte as CanvasImageSource, sx, sy, sw, sh, 0, 0, OKE_LARGURA, OKE_ALTURA);
  } else if (modo === "stretch") {
    ctx.drawImage(fonte as CanvasImageSource, 0, 0, OKE_LARGURA, OKE_ALTURA);
  } else if (modo === "cover") {
    const escala = Math.max(OKE_LARGURA / L, OKE_ALTURA / A);
    ctx.drawImage(fonte as CanvasImageSource, (OKE_LARGURA - L * escala) / 2, (OKE_ALTURA - A * escala) / 2, L * escala, A * escala);
  } else {
    const escala = Math.min(OKE_LARGURA / L, OKE_ALTURA / A);
    ctx.drawImage(fonte as CanvasImageSource, (OKE_LARGURA - L * escala) / 2, (OKE_ALTURA - A * escala) / 2, L * escala, A * escala);
  }

  ctx.filter = "none";
  return canvas;
}

async function gerar(
  arquivo: Blob,
  modo: ModoImagem,
  ajuste: AjusteCanhoto,
  qualidade: number,
): Promise<{ canvas: HTMLCanvasElement; base64: string; bytes: number; dataUrl: string }> {
  const bitmap = await createImageBitmap(arquivo);
  const fonte = ajuste.rotacao ? orientar(bitmap, ajuste.rotacao) : bitmap;
  const canvas = desenhar(fonte as HTMLCanvasElement, modo, ajuste);
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar JPEG"))), "image/jpeg", qualidade),
  );
  const bytes = aplicarDensidadeJfif(new Uint8Array(await blob.arrayBuffer()));
  return {
    canvas,
    base64: paraBase64(bytes),
    bytes: bytes.length,
    dataUrl: `data:image/jpeg;base64,${paraBase64(bytes)}`,
  };
}

/** Retorna a foto do canhoto em JPEG 1536x240 @150dpi, já em base64 (sem prefixo data:). */
export async function prepararCanhotoOkEntrega(
  arquivo: Blob,
  modo: ModoImagem = "recibo",
  ajuste: Partial<AjusteCanhoto> = {},
  qualidade = 0.92,
): Promise<{ base64: string; bytes: number }> {
  const { base64, bytes } = await gerar(arquivo, modo, { ...AJUSTE_PADRAO, ...ajuste }, qualidade);
  return { base64, bytes };
}

/** Igual ao envio, mas devolve data URL para pré-visualização na tela. */
export async function previewCanhotoOkEntrega(
  arquivo: Blob,
  modo: ModoImagem = "recibo",
  ajuste: Partial<AjusteCanhoto> = {},
  qualidade = 0.92,
): Promise<{ dataUrl: string; bytes: number }> {
  const { dataUrl, bytes } = await gerar(arquivo, modo, { ...AJUSTE_PADRAO, ...ajuste }, qualidade);
  return { dataUrl, bytes };
}

/**
 * Mesma tira 1536x240 @150dpi, mas como Blob JPEG pronto para upload no bucket.
 * Usada na baixa de entrega para persistir `baixas_entrega.foto_recibo_path`,
 * mantendo a foto original intacta em `foto_path`.
 */
export async function blobCanhotoRecibo(
  arquivo: Blob,
  modo: ModoImagem = "recibo",
  ajuste: Partial<AjusteCanhoto> = {},
  qualidade = 0.92,
): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const ajusteFinal = { ...AJUSTE_PADRAO, ...ajuste };
  const fonte = ajusteFinal.rotacao ? orientar(bitmap, ajusteFinal.rotacao) : bitmap;
  const canvas = desenhar(fonte as HTMLCanvasElement, modo, ajusteFinal);
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar JPEG"))), "image/jpeg", qualidade),
  );
  const bytes = aplicarDensidadeJfif(new Uint8Array(await blob.arrayBuffer()));
  return new Blob([bytes as unknown as BlobPart], { type: "image/jpeg" });
}
