// Parser para o layout PREFATURA da própria Expresso Ebenezer (.TXT largura fixa).
// Diferente do NOTFIS (que vem do embarcador), este arquivo contém:
//   - 000 : header
//   - 390 : cabeçalho da pré-fatura
//   - 391 : transportador
//   - 392 : totais
//   - 393 : cabeçalho da prestação (CNPJ emit/dest, série, valor mercadoria)
//   - 394 : valores detalhados — o ÚLTIMO bloco de 15 dígitos é o valor TOTAL do frete
//   - 396 : lista de números de NF (8 dígitos) cobertos pela prestação imediatamente anterior
//   - 399 : trailer
//
// Uma prestação (393/394) pode cobrir múltiplas NFs (listadas no 396). Neste caso
// o valor do frete é consolidado: emitimos uma linha por NF repetindo o frete e
// marcamos raw_jsonb.frete_consolidado = true para o operador saber.

import type { PrefaturaItemRaw, PrefaturaParseResult } from "./prefatura-utils";

async function readAsLatin1(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buf);
}

function dec(s: string, decimals: number): number | null {
  const t = s.replace(/\s+/g, "");
  if (!/^\d+$/.test(t)) return null;
  return +(parseInt(t, 10) / Math.pow(10, decimals)).toFixed(decimals);
}

/** Detecta o layout PREFATURA Ebenezer (registro 390 com "PREFAT"). */
export function isPrefaturaEbenezerContent(text: string): boolean {
  const head = text.substring(0, 800);
  return /^390PREFAT/m.test(head);
}

export async function parsePrefaturaEbenezerFile(file: File): Promise<PrefaturaParseResult> {
  const text = await readAsLatin1(file);
  const lines = text.split(/\r?\n/);

  const itens: PrefaturaItemRaw[] = [];
  let totalNf = 0;
  let totalFrete = 0;
  let cnpjEmitFile: string | null = null;

  // Estado da prestação corrente
  let cur: {
    linha393: number;
    cnpj_emit: string | null;
    cnpj_dest: string | null;
    serie: string | null;
    valor_frete: number | null;      // do 393 pos 122-137 (base_prestacao = frete real, bate com CT-e)
    valor_mercadoria: number | null; // do 394 últimos 15 dígitos (= vNF da nota)
  } | null = null;

  const flush396 = (numerosNf: string[]) => {
    if (!cur) return;
    const consolidado = numerosNf.length > 1;
    // `grupo_id` = identificador da prestação (linha do 393). Permite à Conciliação
    // somar o frete cliente das NFs do mesmo bloco e bater com o frete total do
    // CT-e correspondente, mesmo quando o CT-e no banco não tem todas as NFs
    // vinculadas (ex.: imports antigos com apenas a 1ª NF).
    const grupoId = `g_${cur.linha393}`;
    // Frete rateado igualmente: somando as N linhas do grupo dá o total do CT-e.
    const freteRateado =
      cur.valor_frete !== null && numerosNf.length > 0
        ? +(cur.valor_frete / numerosNf.length).toFixed(2)
        : cur.valor_frete;
    numerosNf.forEach((num) => {
      const item: PrefaturaItemRaw = {
        linha_arquivo: cur!.linha393,
        chave_acesso_cliente: null,
        numero_nf_cliente: num.replace(/^0+/, "") || "0",
        serie_cliente: cur!.serie,
        cnpj_emitente_cliente: cur!.cnpj_emit,
        cnpj_destinatario_cliente: cur!.cnpj_dest,
        documento_transporte_cliente: null,
        valor_nf_cliente: cur!.valor_mercadoria,
        valor_frete_cliente: freteRateado,
        peso_cliente: null,
        volumes_cliente: null,
        data_emissao_cliente: null,
        referencia_interna_cliente: null,
        raw_jsonb: {
          tipo_registro: "393/394/396",
          grupo_id: grupoId,
          frete_consolidado: consolidado,
          nfs_no_bloco: numerosNf,
          frete_total_prestacao: cur!.valor_frete,
          frete_rateado_por_nf: freteRateado,
          valor_mercadoria_394: cur!.valor_mercadoria,
        },
      };
      itens.push(item);
      if (item.valor_nf_cliente) totalNf += item.valor_nf_cliente;
      if (item.valor_frete_cliente) totalFrete += item.valor_frete_cliente;
    });
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;
    const tipo = ln.substring(0, 3);

    if (tipo === "391") {
      // CNPJ do transportador (Ebenezer) — pos 3-17
      const c = ln.substring(3, 17).replace(/\D/g, "");
      if (c.length === 14 && !cnpjEmitFile) cnpjEmitFile = c;
      continue;
    }

    if (tipo === "393") {
      // Offsets (0-indexed, validados contra o arquivo da Ebenezer):
      //   0-2   : "393"
      //   3-16  : CNPJ transportador (14)
      //   17-75 : "      NOTA FISCAL" + padding (53)
      //   76-89 : CNPJ emitente (14)
      //   90    : espaço
      //   91-104: CNPJ destinatário (14)
      //   105   : espaço
      //   106   : série (1)
      //   107-121: valor base (15, 2 decimais)
      //   122-136: valor mercadoria (15, 2 decimais)
      if (ln.length < 137) continue;
      const cnpjEmit = ln.substring(76, 90).replace(/\D/g, "");
      const cnpjDest = ln.substring(91, 105).replace(/\D/g, "");
      const serie = ln.substring(106, 107).trim() || null;
      const valorBaseFrete = dec(ln.substring(107, 122), 2); // base de prestação = frete real
      cur = {
        linha393: i + 1,
        cnpj_emit: cnpjEmit.length === 14 ? cnpjEmit : null,
        cnpj_dest: cnpjDest.length === 14 ? cnpjDest : null,
        serie,
        valor_frete: valorBaseFrete,
        valor_mercadoria: null,
      };
      continue;
    }

    if (tipo === "394") {
      if (!cur) continue;
      // Último bloco de 15 dígitos = valor da mercadoria (vNF da nota)
      const tail = ln.replace(/\s+$/, "");
      const m = tail.match(/(\d{15})$/);
      cur.valor_mercadoria = m ? dec(m[1], 2) : null;
      continue;
    }

    if (tipo === "396") {
      // Layout: "396" + repetições de "5" + 2 espaços + NF(8 dígitos)
      // Extrai todos os grupos de 8 dígitos precedidos por 2 espaços
      const matches = [...ln.matchAll(/ {2}(\d{8})/g)].map((m) => m[1]);
      flush396(matches);
      continue;
    }
  }

  // Se ficou um 393/394 sem 396 (não esperado), emite mesmo assim sem número de NF
  if (cur) flush396([""]);

  return {
    itens,
    cliente_cnpj_inferido: cnpjEmitFile,
    total_valor_nf: +totalNf.toFixed(2),
    total_valor_frete: +totalFrete.toFixed(2),
  };
}
