// Preparo da imagem do canhoto para a OK Entrega, feito no navegador.
// Exigência do manual: JPEG 1536 x 240 px, densidade 150 dpi.
// Rodamos aqui (e não na Edge Function) porque decodificar fotos de 12 MP
// estoura o limite de CPU do worker.

export const OKE_LARGURA = 1536;
export const OKE_ALTURA = 240;
export const OKE_DPI = 150;

export type ModoImagem = "contain" | "stretch" | "cover";

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

/** Retorna a foto do canhoto em JPEG 1536x240 @150dpi, já em base64 (sem prefixo data:). */
export async function prepararCanhotoOkEntrega(
  arquivo: Blob,
  modo: ModoImagem = "contain",
  qualidade = 0.85,
): Promise<{ base64: string; bytes: number }> {
  const bitmap = await createImageBitmap(arquivo);
  const canvas = document.createElement("canvas");
  canvas.width = OKE_LARGURA;
  canvas.height = OKE_ALTURA;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OKE_LARGURA, OKE_ALTURA);
  ctx.imageSmoothingQuality = "high";

  if (modo === "stretch") {
    ctx.drawImage(bitmap, 0, 0, OKE_LARGURA, OKE_ALTURA);
  } else if (modo === "cover") {
    const escala = Math.max(OKE_LARGURA / bitmap.width, OKE_ALTURA / bitmap.height);
    const l = bitmap.width * escala;
    const a = bitmap.height * escala;
    ctx.drawImage(bitmap, (OKE_LARGURA - l) / 2, (OKE_ALTURA - a) / 2, l, a);
  } else {
    const escala = Math.min(OKE_LARGURA / bitmap.width, OKE_ALTURA / bitmap.height);
    const l = bitmap.width * escala;
    const a = bitmap.height * escala;
    ctx.drawImage(bitmap, (OKE_LARGURA - l) / 2, (OKE_ALTURA - a) / 2, l, a);
  }
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar JPEG"))), "image/jpeg", qualidade),
  );
  const bytes = aplicarDensidadeJfif(new Uint8Array(await blob.arrayBuffer()));
  return { base64: paraBase64(bytes), bytes: bytes.length };
}
