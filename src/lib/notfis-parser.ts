// PROCEDA NOTFIS 3.1 EDI parser (fixed-width).
// Extracts NF headers (record 313) from .TXT files sent by shippers like Hershey.
// Layout reverse-engineered from sample files; field positions validated against
// the access key (chave de acesso) embedded at the end of each 313 record.

import type { PrefaturaItemRaw, PrefaturaParseResult } from "./prefatura-utils";

/**
 * Reads file as Latin-1 (CP1252) since NOTFIS files don't use UTF-8.
 */
async function readAsLatin1(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const decoder = new TextDecoder("iso-8859-1");
  return decoder.decode(buf);
}

function safeInt(s: string): number | null {
  const t = s.replace(/\s+/g, "");
  if (!t) return null;
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function safeDecimal(s: string, decimals: number): number | null {
  const n = safeInt(s);
  if (n === null) return null;
  return +(n / Math.pow(10, decimals)).toFixed(decimals);
}

/**
 * Detects whether a string content is NOTFIS format (record 000 header + 313 records).
 */
export function isNotfisContent(text: string): boolean {
  const head = text.substring(0, 500);
  if (!/^000/.test(head)) return false;
  return /\n313/.test(text) || /^313/m.test(text);
}

/**
 * Parses a NOTFIS 3.1 .TXT file and returns items in the same shape used by
 * the prefatura import pipeline (parsePrefaturaExcel).
 */
export async function parseNotfisFile(file: File): Promise<PrefaturaParseResult> {
  const text = await readAsLatin1(file);
  const lines = text.split(/\r?\n/);

  const itens: PrefaturaItemRaw[] = [];
  let totalNf = 0;
  let cnpjEmit: string | null = null;

  // Header (000) usually has shipper name in cols 3-37 — not used for matching.
  // Shipper CNPJ comes from record 311 (positions 3-17, 14 digits).
  let cnpjEmitenteCabecalho: string | null = null;
  // Customer CNPJ comes from record 312 (positions ~45-59).
  let cnpjDestinatarioCabecalho: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;
    const tipo = ln.substring(0, 3);

    if (tipo === "311") {
      // Shipper. CNPJ at position 3, 14 digits (after the leading "0" formatting variant)
      const cnpjRaw = ln.substring(3, 18).replace(/\D/g, "");
      if (cnpjRaw.length >= 14) cnpjEmitenteCabecalho = cnpjRaw.substring(cnpjRaw.length - 14);
      continue;
    }

    if (tipo === "312") {
      // Destinatário. CNPJ usually after the razão social block (45 chars name then CNPJ).
      const slice = ln.substring(43, 60).replace(/\D/g, "");
      if (slice.length >= 14) cnpjDestinatarioCabecalho = slice.substring(slice.length - 14);
      continue;
    }

    if (tipo !== "313") continue;

    // --- Record 313: NF data ---
    // Positions (0-indexed, end-exclusive):
    //   3-18   : pedido / referência cliente (15)
    //   32-38  : número NF (6) — but more reliable from chave
    //   40-48  : data emissão DDMMAAAA
    //   78-85  : qtd volumes (7, /100)
    //   85-100 : peso bruto kg (15, 3 decimals)
    //   100-108: valor mercadoria/NF (8, 2 decimals)
    //   last 44: chave de acesso (44 digits)
    if (ln.length < 100) continue;

    const chave = ln.substring(ln.length - 44).replace(/\s+/g, "");
    const chaveValida = /^\d{44}$/.test(chave);

    // Extract from chave when possible (more reliable than positional)
    let numeroNf: string | null = null;
    let serie: string | null = null;
    let cnpjEmit44: string | null = null;
    if (chaveValida) {
      cnpjEmit44 = chave.substring(6, 20);
      serie = chave.substring(22, 25).replace(/^0+/, "") || "0";
      numeroNf = chave.substring(25, 34).replace(/^0+/, "") || "0";
    } else {
      const numPos = ln.substring(32, 38).trim();
      if (numPos) numeroNf = numPos.replace(/^0+/, "") || "0";
    }

    // Date DDMMAAAA at 40-48
    const dataRaw = ln.substring(40, 48).trim();
    let dataEmissao: string | null = null;
    if (/^\d{8}$/.test(dataRaw)) {
      const dd = dataRaw.substring(0, 2);
      const mm = dataRaw.substring(2, 4);
      const yyyy = dataRaw.substring(4, 8);
      dataEmissao = `${yyyy}-${mm}-${dd}`;
    }

    const volumes = ln.length >= 85 ? safeDecimal(ln.substring(78, 85), 2) : null;
    const pesoBruto = ln.length >= 100 ? safeDecimal(ln.substring(85, 100), 3) : null;
    const valorMerc = ln.length >= 108 ? safeDecimal(ln.substring(100, 108), 2) : null;

    const referencia = ln.substring(3, 18).trim();

    const cnpjEmitFinal = cnpjEmit44 || cnpjEmitenteCabecalho;
    if (!cnpjEmit) cnpjEmit = cnpjEmitFinal;

    const raw_jsonb: Record<string, unknown> = {
      linha_original: ln,
      tipo_registro: "313",
      chave_valida: chaveValida,
    };

    const item: PrefaturaItemRaw = {
      linha_arquivo: i + 1,
      chave_acesso_cliente: chaveValida ? chave : null,
      numero_nf_cliente: numeroNf,
      serie_cliente: serie,
      cnpj_emitente_cliente: cnpjEmitFinal,
      cnpj_destinatario_cliente: cnpjDestinatarioCabecalho,
      documento_transporte_cliente: null, // NOTFIS doesn't carry CT-e/Minuta
      valor_nf_cliente: valorMerc,
      valor_frete_cliente: null, // NOTFIS doesn't carry freight
      peso_cliente: pesoBruto,
      volumes_cliente: volumes !== null ? Math.round(volumes) : null,
      data_emissao_cliente: dataEmissao,
      referencia_interna_cliente: referencia || null,
      raw_jsonb,
    };

    itens.push(item);
    if (item.valor_nf_cliente) totalNf += item.valor_nf_cliente;
  }

  return {
    itens,
    cliente_cnpj_inferido: cnpjEmit,
    total_valor_nf: +totalNf.toFixed(2),
    total_valor_frete: 0, // NOTFIS doesn't carry freight values
  };
}
