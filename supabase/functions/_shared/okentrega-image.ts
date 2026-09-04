// Preparo da imagem do canhoto para a OK Entrega.
// Exigência do manual: JPEG 1536 x 240 px, densidade 150 dpi.
// Fora dessa especificação o comprovante entra como "Recusado".
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

export const OKE_LARGURA = 1536;
export const OKE_ALTURA = 240;
export const OKE_DPI = 150;

export type ModoImagem = "recibo" | "contain" | "stretch" | "cover";

// Altura da tira do recibo em relação à folha (canhoto da DANFE ~ 15%; usamos
// 24% para garantir cabeçalho "RECEBEMOS DE", data, nome e assinatura).
const TIRA_FRACAO = 0.24;

export class CanhotoIlegivelError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "CanhotoIlegivelError";
  }
}

type Recipe = { x: number; y: number; w: number; h: number; rot: number };

/**
 * Localiza a FOLHA (papel) na foto e devolve o recorte da tira do recibo.
 *
 * Por que mudou: a heurística anterior pegava o "maior bloco conectado de tinta",
 * que em fotos tiradas sobre mesa de escritório ancorava em teclado, mouse ou
 * embalagem de resma (muito mais contraste que o canhoto). A OK Entrega recebia
 * uma faixa que não era o canhoto e recusava por ilegibilidade.
 *
 * Estratégia atual:
 *  1) maior região CLARA conectada = folha (descarta mesa, teclado, resma, chão);
 *  2) eixo longo da folha define os dois extremos candidatos (a DANFE é retrato e
 *     o canhoto é uma tira em uma das pontas);
 *  3) escolhe a ponta com MENOS tinta que ainda tenha linhas de texto — o corpo
 *     da DANFE (tabelas) é sempre muito mais denso que o recibo. Isso resolve
 *     também o giro de 180°;
 *  4) valida a tira (densidade de tinta + linhas de texto). Sem validação, faixa
 *     branca ou objeto errado era enviado como se fosse comprovante.
 */
function detectarRecorte(src: Image): Recipe {
  const escala = Math.max(1, Math.round(Math.max(src.width, src.height) / 360));
  const w = Math.max(24, Math.floor(src.width / escala));
  const h = Math.max(24, Math.floor(src.height / escala));
  const small = src.clone().resize(w, h);
  const px = small.bitmap; // RGBA

  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
  }

  // ---- 1) folha = maior componente conectado de pixels claros
  const ord = Float32Array.from(lum).sort();
  const claro = ord[Math.floor(ord.length * 0.97)] || 255;
  const limPapel = Math.max(70, claro * 0.72);

  const papel = new Uint8Array(w * h);
  for (let i = 0; i < lum.length; i++) if (lum[i] > limPapel) papel[i] = 1;

  const visto = new Uint8Array(w * h);
  const fila = new Int32Array(w * h);
  let folha = { area: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
  const marca = new Uint8Array(w * h); // componente vencedor
  for (let s = 0; s < papel.length; s++) {
    if (!papel[s] || visto[s]) continue;
    let ini = 0, fim = 0;
    fila[fim++] = s; visto[s] = 1;
    let area = 0, bx0 = w, bx1 = 0, by0 = h, by1 = 0;
    const inicio = fim - 1;
    while (ini < fim) {
      const i = fila[ini++];
      const x = i % w, y = (i - x) / w;
      area++;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
      if (x > 0 && papel[i - 1] && !visto[i - 1]) { visto[i - 1] = 1; fila[fim++] = i - 1; }
      if (x < w - 1 && papel[i + 1] && !visto[i + 1]) { visto[i + 1] = 1; fila[fim++] = i + 1; }
      if (y > 0 && papel[i - w] && !visto[i - w]) { visto[i - w] = 1; fila[fim++] = i - w; }
      if (y < h - 1 && papel[i + w] && !visto[i + w]) { visto[i + w] = 1; fila[fim++] = i + w; }
    }
    if (area > folha.area) {
      folha = { area, x0: bx0, x1: bx1, y0: by0, y1: by1 };
      marca.fill(0);
      for (let k = inicio; k < fim; k++) marca[fila[k]] = 1;
    }
  }

  const fw = folha.x1 - folha.x0 + 1;
  const fh = folha.y1 - folha.y0 + 1;
  if (folha.area < w * h * 0.06 || fw < 12 || fh < 12) {
    throw new CanhotoIlegivelError("Folha do canhoto não identificada na foto.");
  }

  // ---- 2) tinta dentro da folha (contraste local, ignora sombra e degradê)
  const tinta = new Uint8Array(w * h);
  const RM = 10;
  for (let y = folha.y0; y <= folha.y1; y++) {
    for (let x = folha.x0; x <= folha.x1; x++) {
      const i = y * w + x;
      let s = 0, c = 0;
      for (let k = -RM; k <= RM; k++) {
        const xx = x + k;
        if (xx < folha.x0 || xx > folha.x1) continue;
        s += lum[y * w + xx]; c++;
      }
      const mediaLocal = s / Math.max(1, c);
      if (lum[i] < mediaLocal * 0.86) tinta[i] = 1;
    }
  }

  const densidade = (ax0: number, ax1: number, ay0: number, ay1: number) => {
    let ink = 0, tot = 0;
    for (let y = ay0; y <= ay1; y++) {
      for (let x = ax0; x <= ax1; x++) {
        if (!marca[y * w + x] && !tinta[y * w + x]) continue;
        tot++;
        if (tinta[y * w + x]) ink++;
      }
    }
    return tot > 0 ? ink / tot : 0;
  };

  const linhasTexto = (ax0: number, ax1: number, ay0: number, ay1: number) => {
    let linhas = 0;
    const larg = ax1 - ax0 + 1;
    for (let y = ay0; y <= ay1; y++) {
      let cnt = 0;
      for (let x = ax0; x <= ax1; x++) if (tinta[y * w + x]) cnt++;
      if (cnt > larg * 0.04) linhas++;
    }
    return linhas;
  };

  // ---- 3) eixo longo + escolha da ponta que contém o recibo
  const vertical = fh >= fw;
  const tiraPx = Math.max(6, Math.round((vertical ? fh : fw) * TIRA_FRACAO));

  type Cand = { rot: number; dens: number; linhas: number };
  const cands: Cand[] = [];
  if (vertical) {
    cands.push({
      rot: 0,
      dens: densidade(folha.x0, folha.x1, folha.y0, folha.y0 + tiraPx),
      linhas: linhasTexto(folha.x0, folha.x1, folha.y0, folha.y0 + tiraPx),
    });
    cands.push({
      rot: 180,
      dens: densidade(folha.x0, folha.x1, folha.y1 - tiraPx, folha.y1),
      linhas: linhasTexto(folha.x0, folha.x1, folha.y1 - tiraPx, folha.y1),
    });
  } else {
    // ponta esquerda vira topo girando 90° no sentido horário
    cands.push({
      rot: 90,
      dens: densidade(folha.x0, folha.x0 + tiraPx, folha.y0, folha.y1),
      linhas: linhasTexto(folha.x0, folha.x0 + tiraPx, folha.y0, folha.y1),
    });
    cands.push({
      rot: 270,
      dens: densidade(folha.x1 - tiraPx, folha.x1, folha.y0, folha.y1),
      linhas: linhasTexto(folha.x1 - tiraPx, folha.x1, folha.y0, folha.y1),
    });
  }

  // o recibo tem texto, mas muito menos tinta que o corpo da DANFE
  const validos = cands.filter((c) => c.dens >= 0.006 && c.dens <= 0.30 && c.linhas >= 3);
  if (validos.length === 0) {
    throw new CanhotoIlegivelError(
      "Tira do canhoto não localizada na folha (foto sem o recibo ou fora de foco).",
    );
  }
  validos.sort((a, b) => a.dens - b.dens);
  const escolhido = validos[0];

  // ---- 4) tira do recibo em coordenadas ORIGINAIS.
  // Recortamos só a tira (não a folha inteira): girar uma folha A4 de 12 MP
  // estoura o limite de CPU do worker.
  const padX = Math.round(fw * 0.015) + 1;
  const padY = Math.round(fh * 0.015) + 1;
  let bx0 = folha.x0, bx1 = folha.x1, by0 = folha.y0, by1 = folha.y1;
  if (escolhido.rot === 0) by1 = Math.min(folha.y1, folha.y0 + tiraPx);
  else if (escolhido.rot === 180) by0 = Math.max(folha.y0, folha.y1 - tiraPx);
  else if (escolhido.rot === 90) bx1 = Math.min(folha.x1, folha.x0 + tiraPx);
  else bx0 = Math.max(folha.x0, folha.x1 - tiraPx);

  bx0 = Math.max(0, bx0 - padX); bx1 = Math.min(w - 1, bx1 + padX);
  by0 = Math.max(0, by0 - padY); by1 = Math.min(h - 1, by1 + padY);

  const x = Math.max(0, Math.round((bx0 * src.width) / w));
  const y = Math.max(0, Math.round((by0 * src.height) / h));
  const cw = Math.max(8, Math.min(src.width - x, Math.round(((bx1 - bx0 + 1) * src.width) / w)));
  const ch = Math.max(8, Math.min(src.height - y, Math.round(((by1 - by0 + 1) * src.height) / h)));

  return { x, y, w: cw, h: ch, rot: escolhido.rot };
}


/**
 * Localiza o canhoto por VISÃO (Lovable AI) e devolve o recorte + rotação.
 *
 * Motivo: heurísticas de contraste erram quando a foto é tirada sobre mesa de
 * escritório (teclado, mouse, embalagem de resma, pilha de folhas em branco) —
 * foi exatamente o que derrubou 100% dos envios de 03/09. O modelo de visão
 * identifica o bloco "RECEBEMOS DE ... / NF-e Nº ..." e o sentido do texto,
 * inclusive quando a folha está deitada ou de cabeça para baixo.
 */
async function localizarCanhotoIA(
  src: Image,
  numeroNf?: string,
): Promise<{ recipe: Recipe; nfLida: string | null }> {
  const chave = Deno.env.get("LOVABLE_API_KEY");
  if (!chave) throw new CanhotoIlegivelError("LOVABLE_API_KEY ausente para localizar o canhoto.");

  const esc = Math.min(1, 1024 / Math.max(src.width, src.height));
  const mini = src.clone().resize(Math.round(src.width * esc), Math.round(src.height * esc));
  const b64 = paraBase64(new Uint8Array(await mini.encodeJPEG(80)));

  const instrucao =
    `Na foto há uma DANFE (nota fiscal). Localize APENAS o CANHOTO/RECIBO de entrega: ` +
    `o retângulo que contém "RECEBEMOS DE ...", data de recebimento, identificação e assinatura ` +
    `do recebedor, e a caixa "NF-e Nº". Ele termina na linha pontilhada de corte — não inclua o ` +
    `corpo da nota abaixo dela, nem mesa, teclado, embalagem de papel ou outras folhas.\n` +
    (numeroNf ? `O número esperado da nota é ${numeroNf}.\n` : "") +
    `Responda SOMENTE JSON: {"encontrado": true|false, ` +
    `"x0":0-1,"y0":0-1,"x1":0-1,"y1":0-1, ` +
    `"rotacao": 0|90|180|270, "numero_nf": "<digitos>"|null}\n` +
    `Coordenadas normalizadas (0 a 1) do retângulo do canhoto na imagem enviada. ` +
    `"rotacao" = graus no sentido HORÁRIO necessários para o texto do canhoto ficar na horizontal ` +
    `e legível (0 se já está legível). Em "numero_nf" devolva o número impresso no canhoto ` +
    `SOMENTE se você conseguir LER de fato (foto de frente, nítida). Se a folha estiver quase de ` +
    `perfil, fora de foco ou o texto ilegível, devolva "numero_nf": null.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instrucao },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    throw new CanhotoIlegivelError(`Visão indisponível (${resp.status}) ao localizar canhoto.`);
  }
  const data = await resp.json();
  const bruto = data?.choices?.[0]?.message?.content ?? "";
  const m = String(bruto).match(/\{[\s\S]*\}/);
  if (!m) throw new CanhotoIlegivelError("Visão não devolveu coordenadas do canhoto.");
  const r = JSON.parse(m[0]);
  if (!r?.encontrado) throw new CanhotoIlegivelError("Canhoto não identificado na foto.");

  const cl = (v: unknown) => Math.min(1, Math.max(0, Number(v)));
  let x0 = cl(r.x0), y0 = cl(r.y0), x1 = cl(r.x1), y1 = cl(r.y1);
  if (!(x1 > x0 && y1 > y0)) throw new CanhotoIlegivelError("Recorte do canhoto inválido.");

  // respiro para não cortar assinatura/número nas bordas
  const padX = (x1 - x0) * 0.03, padY = (y1 - y0) * 0.05;
  x0 = Math.max(0, x0 - padX); x1 = Math.min(1, x1 + padX);
  y0 = Math.max(0, y0 - padY); y1 = Math.min(1, y1 + padY);

  const rotBruta = Number(r.rotacao) || 0;
  const rot = [0, 90, 180, 270].includes(rotBruta) ? rotBruta : 0;

  const x = Math.round(x0 * src.width);
  const y = Math.round(y0 * src.height);
  const w = Math.max(8, Math.min(src.width - x, Math.round((x1 - x0) * src.width)));
  const h = Math.max(8, Math.min(src.height - y, Math.round((y1 - y0) * src.height)));

  const nfLida = r.numero_nf ? String(r.numero_nf).replace(/\D/g, "") : null;
  if (nfLida && numeroNf && nfLida.replace(/^0+/, "") !== String(numeroNf).replace(/^0+/, "")) {
    throw new CanhotoIlegivelError(
      `[CANHOTO_ILEGIVEL] Canhoto da foto é de outra nota (lido ${nfLida}, esperado ${numeroNf}).`,
    );
  }
  // Sem o número legível o cartório digital recusa: manda para conferência manual
  // em vez de transmitir uma faixa duvidosa.
  if (!nfLida) {
    throw new CanhotoIlegivelError(
      "[CANHOTO_ILEGIVEL] Número da NF não legível no canhoto (foto de perfil, borrada ou sem o recibo).",
    );
  }

  return { recipe: { x, y, w, h, rot }, nfLida };
}

/**
 * Redimensiona para exatamente 1536x240.
 * - recibo: localiza o canhoto na foto (visão + fallback geométrico) e encaixa na faixa
 * - contain: preserva proporção, centraliza sobre fundo branco
 * - stretch: força 1536x240 (distorce)
 * - cover: preenche e recorta as sobras
 */
export async function prepararCanhoto(
  originais: Uint8Array,
  modo: ModoImagem = "contain",
  qualidade = 85,
  opts: { numeroNf?: string } = {},
): Promise<{ bytes: Uint8Array; largura: number; altura: number; dpi: number; origem?: string }> {
  const src = await Image.decode(originais);

  let final: Image;
  let origem = modo as string;

  if (modo === "recibo") {
    // Falha aqui é proposital: melhor a NF ficar em exceção para conferência
    // manual do que transmitir uma faixa que não é o canhoto (recusa por
    // ilegibilidade no cartório digital).
    let area: Recipe;
    try {
      area = (await localizarCanhotoIA(src, opts.numeroNf)).recipe;
      origem = "recibo:visao";
    } catch (e) {
      if (e instanceof CanhotoIlegivelError && e.message.includes("[CANHOTO_ILEGIVEL]")) throw e;
      area = detectarRecorte(src); // fallback geométrico
      origem = "recibo:geometrico";
    }

    let tira = src.crop(area.x, area.y, area.w, area.h);
    if (area.rot) tira = tira.rotate(area.rot) as Image;

    const faixa = tira.resize(OKE_LARGURA, OKE_ALTURA);
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

  return { bytes: comDpi, largura: OKE_LARGURA, altura: OKE_ALTURA, dpi: OKE_DPI, origem };
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
