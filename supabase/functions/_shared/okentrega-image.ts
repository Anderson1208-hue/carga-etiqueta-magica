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
async function chamarVisao(
  chave: string,
  modelo: string,
  instrucao: string,
  b64: string,
): Promise<Record<string, unknown>> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: modelo,
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
    const detalhe = await resp.text().catch(() => "");
    throw new CanhotoIlegivelError(
      `[VALIDACAO_INDISPONIVEL] Visão indisponível (${resp.status})${detalhe ? `: ${detalhe.slice(0, 240)}` : ""}`,
    );
  }
  const data = await resp.json();
  const bruto = String(data?.choices?.[0]?.message?.content ?? "");
  const m = bruto.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Visão não devolveu JSON.");
  return JSON.parse(m[0]);
}

async function miniB64(src: Image, lado = 1024, q = 85): Promise<string> {
  const esc = Math.min(1, lado / Math.max(src.width, src.height));
  const mini = esc < 1 ? src.clone().resize(Math.round(src.width * esc), Math.round(src.height * esc)) : src.clone();
  return paraBase64(new Uint8Array(await mini.encodeJPEG(q)));
}

/**
 * Confere a faixa já recortada. A recusa da OK Entrega é por canhoto
 * INCOMPLETO ou ILEGÍVEL — não por ausência de assinatura. Portanto o critério
 * bloqueante é: canhoto inteiro (as 4 bordas do recibo dentro da faixa, sem
 * corte) e texto legível, com o número da nota conferido.
 */
export async function conferirFaixa(
  faixa: Image,
  numeroNf?: string,
): Promise<{ legivel: boolean; invertido: boolean; nfLida: string | null; temAssinatura: boolean; completo: boolean }> {
  const chave = Deno.env.get("LOVABLE_API_KEY");
  if (!chave) throw new CanhotoIlegivelError("LOVABLE_API_KEY ausente.");
  const instrucao =
    `Esta imagem é uma faixa de canhoto/recibo de nota fiscal (DANFE).` +
    (numeroNf ? ` O número esperado da nota é ${numeroNf}.` : "") +
    ` Responda SOMENTE JSON: {"legivel":true|false,"completo":true|false,"invertido":true|false,` +
    `"numero_nf":"<digitos>"|null,"tem_assinatura":true|false}. ` +
    `completo=true somente se o canhoto aparecer INTEIRO: cabeçalho "RECEBEMOS DE", ` +
    `campos de data e identificação do recebedor e a caixa "NF-e Nº ... SÉRIE" todos visíveis, ` +
    `sem nenhum desses trechos cortado pelas bordas da faixa. ` +
    `legivel=true somente se o texto puder ser lido sem esforço. ` +
    `invertido=true se o texto estiver de cabeça para baixo (180 graus). ` +
    `numero_nf apenas se conseguir LER de fato; caso contrário null.`;
  const r = await chamarVisao(chave, "google/gemini-3.8-flash", instrucao, await miniB64(faixa, 1024, 88));
  const nfLida = r.numero_nf ? String(r.numero_nf).replace(/\D/g, "") : null;
  return {
    legivel: r.legivel !== false,
    invertido: r.invertido === true,
    nfLida,
    temAssinatura: r.tem_assinatura === true,
    completo: r.completo !== false,
  };
}


/**
 * Localiza o canhoto na foto com modelo de visão de grounding (box_2d 0-1000).
 */
export async function localizarCanhotoIA(
  src: Image,
  numeroNf?: string,
): Promise<{ recipe: Recipe; nfLida: string | null; bruto?: unknown }> {
  const chave = Deno.env.get("LOVABLE_API_KEY");
  if (!chave) throw new CanhotoIlegivelError("LOVABLE_API_KEY ausente para localizar o canhoto.");

  const instrucao =
    `Na imagem aparece uma DANFE (nota fiscal). Localize o CANHOTO/RECIBO: a faixa retangular com ` +
    `"RECEBEMOS DE Pandurata ...", "DATA DE RECEBIMENTO", "IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR" ` +
    `e a caixa "NF-e Nº${numeroNf ? " " + numeroNf : ""} SÉRIE 20". Ela termina numa linha pontilhada de corte. ` +
    `Não inclua o corpo da nota abaixo dessa linha, mesa, teclado, embalagem de papel nem outras folhas. ` +
    `O canhoto pode estar deitado (texto vertical) ou invertido.\n` +
    `Responda SOMENTE JSON com a caixa envolvente em coordenadas normalizadas 0-1000 na imagem como ela está: ` +
    `{"encontrado":true|false,"box_2d":[y0,x0,y1,x1],"rotacao_horaria":0|90|180|270,"numero_nf":"<digitos>"|null}. ` +
    `rotacao_horaria = giro HORÁRIO necessário para o texto do canhoto ficar horizontal e legível. ` +
    `numero_nf somente se conseguir LER de fato; se a folha estiver quase de perfil, fora de foco ou ilegível, null.`;

  // Uma única chamada: negativas permanentes (crédito/política) jamais são
  // repetidas dentro da mesma execução.
  const r: Record<string, unknown> = await chamarVisao(
    chave,
    "google/gemini-3.8-flash",
    instrucao,
    await miniB64(src, 1024, 88),
  );
  if (r?.encontrado === false) throw new CanhotoIlegivelError("Canhoto não identificado na foto.");

  const box = Array.isArray(r.box_2d) ? (Array.isArray(r.box_2d[0]) ? r.box_2d[0] : r.box_2d) : null;
  if (!box || (box as unknown[]).length < 4) throw new CanhotoIlegivelError("Recorte do canhoto inválido.");
  const [by0, bx0, by1, bx1] = (box as unknown[]).map((v) => Number(v));
  const cl = (v: number) => Math.min(1, Math.max(0, v / 1000));
  let x0 = cl(Math.min(bx0, bx1)), x1 = cl(Math.max(bx0, bx1));
  let y0 = cl(Math.min(by0, by1)), y1 = cl(Math.max(by0, by1));
  if (!(x1 > x0 && y1 > y0)) throw new CanhotoIlegivelError("Recorte do canhoto inválido.");

  // Respiro generoso: a recusa da OK Entrega é por canhoto cortado, então é
  // melhor sobrar um pouco de folha do que perder cabeçalho, data ou nº da NF.
  const padX = (x1 - x0) * 0.06, padY = (y1 - y0) * 0.14;
  x0 = Math.max(0, x0 - padX); x1 = Math.min(1, x1 + padX);
  y0 = Math.max(0, y0 - padY); y1 = Math.min(1, y1 + padY);


  const rotBruta = Number(r.rotacao_horaria ?? r.rotacao) || 0;
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
  if (!nfLida) {
    throw new CanhotoIlegivelError(
      "[CANHOTO_ILEGIVEL] Número da NF não legível no canhoto (foto de perfil, borrada ou sem o recibo).",
    );
  }

  return { recipe: { x, y, w, h, rot }, nfLida, bruto: r };
}

/**
 * Redimensiona para exatamente 1536x240.
 * - recibo: localiza e valida o canhoto por visão; sem validação, bloqueia o envio
 * - contain: preserva proporção, centraliza sobre fundo branco
 * - stretch: força 1536x240 (distorce)
 * - cover: preenche e recorta as sobras
 */
export async function prepararCanhoto(
  originais: Uint8Array,
  modo: ModoImagem = "contain",
  qualidade = 85,
  opts: { numeroNf?: string } = {},
): Promise<{ bytes: Uint8Array; largura: number; altura: number; dpi: number; origem?: string; validacao?: Record<string, unknown> }> {
  const src = await Image.decode(originais);

  let final: Image;
  let origem = modo as string;
  let validacao: Record<string, unknown> | undefined;

  if (modo === "recibo") {
    // Fail-closed: sem validação inteligente não há transmissão automática.
    // O recorte geométrico permanece apenas como utilitário interno e nunca é
    // usado como autorização para enviar ao cliente.
    const localizado = await localizarCanhotoIA(src, opts.numeroNf);
    const area = localizado.recipe;
    origem = "recibo:visao";

    const recortar = (fator: number) => {
      const cx = area.x + area.w / 2, cy = area.y + area.h / 2;
      const w = Math.min(src.width, Math.round(area.w * fator));
      const h = Math.min(src.height, Math.round(area.h * fator));
      const x = Math.max(0, Math.min(src.width - w, Math.round(cx - w / 2)));
      const y = Math.max(0, Math.min(src.height - h, Math.round(cy - h / 2)));
      let t = src.crop(x, y, w, h);
      if (area.rot) t = t.rotate(area.rot) as Image;
      return t;
    };

    let tira = recortar(1);
    let chk = await conferirFaixa(tira, opts.numeroNf);
    // Canhoto cortado é o motivo real das recusas: alarga o recorte e reconfere.
    if (!chk.completo) {
      const alargada = recortar(1.25);
      const chk2 = await conferirFaixa(alargada, opts.numeroNf);
      if (chk2.completo) {
        tira = alargada;
        chk = chk2;
        origem = "recibo:visao+alargado";
      }
    }
    if (chk.invertido) {
      tira = tira.rotate(180) as Image;
      origem += "+180";
    }
    const esperado = String(opts.numeroNf ?? "").replace(/\D/g, "").replace(/^0+/, "");
    const lido = String(chk.nfLida ?? "").replace(/^0+/, "");
    if (!chk.completo || !chk.legivel || !lido || (esperado && lido !== esperado)) {
      throw new CanhotoIlegivelError(
        `[CANHOTO_ILEGIVEL] Validação final reprovada: canhoto inteiro=${chk.completo}, legível=${chk.legivel}, nf=${chk.nfLida ?? "não lida"}.`,
      );
    }
    validacao = { ...chk, numero_nf_esperado: esperado, numero_nf_localizado: localizado.nfLida };


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

  return { bytes: comDpi, largura: OKE_LARGURA, altura: OKE_ALTURA, dpi: OKE_DPI, origem, validacao };
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
