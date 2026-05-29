// Pre-invoice (pré-fatura) reconciliation helpers.
// Pure logic — does not touch any operational module.

import * as XLSX from "xlsx";

export interface PrefaturaItemRaw {
  linha_arquivo: number;
  chave_acesso_cliente: string | null;
  numero_nf_cliente: string | null;
  serie_cliente: string | null;
  cnpj_emitente_cliente: string | null;
  cnpj_destinatario_cliente: string | null;
  documento_transporte_cliente: string | null;
  valor_nf_cliente: number | null;
  valor_frete_cliente: number | null;
  peso_cliente: number | null;
  volumes_cliente: number | null;
  data_emissao_cliente: string | null;
  referencia_interna_cliente: string | null;
  raw_jsonb: Record<string, unknown>;
}

export interface PrefaturaParseResult {
  itens: PrefaturaItemRaw[];
  cliente_cnpj_inferido: string | null;
  total_valor_nf: number;
  total_valor_frete: number;
}

const HEADER_ALIASES: Partial<Record<keyof PrefaturaItemRaw, string[]>> = {
  // linha_arquivo / raw_jsonb não vêm do header
  chave_acesso_cliente: ["chave", "chave acesso", "chave_acesso", "chave de acesso", "chavenfe"],
  numero_nf_cliente: ["nf", "numero nf", "numero_nf", "numeronf", "nota", "nota fiscal", "nro nf"],
  serie_cliente: ["serie", "série"],
  cnpj_emitente_cliente: ["cnpj emitente", "cnpj_emitente", "emitente cnpj", "cnpj_emit"],
  cnpj_destinatario_cliente: ["cnpj destinatario", "cnpj_destinatario", "destinatario cnpj", "cnpj_dest"],
  documento_transporte_cliente: ["cte", "ct-e", "minuta", "documento transporte", "doc_transporte", "numero cte", "numero documento"],
  valor_nf_cliente: ["valor nf", "valor_nf", "vnf", "valor nota", "valor da nota"],
  valor_frete_cliente: ["valor frete", "valor_frete", "frete", "vfrete"],
  peso_cliente: ["peso", "peso bruto", "peso_bruto", "peso kg"],
  volumes_cliente: ["volumes", "qtd volumes", "qtde volumes", "qvol", "quantidade volumes"],
  data_emissao_cliente: ["data emissao", "data_emissao", "data", "dt emissao", "data nf"],
  referencia_interna_cliente: ["referencia", "ref", "referencia interna", "ref cliente", "pedido", "fatura"],
};

function normalizeHeader(s: string): string {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 _-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildHeaderMap(headers: string[]): Partial<Record<keyof PrefaturaItemRaw, number>> {
  const norm = headers.map(normalizeHeader);
  const map: Partial<Record<keyof PrefaturaItemRaw, number>> = {};
  (Object.keys(HEADER_ALIASES) as (keyof PrefaturaItemRaw)[]).forEach((key) => {
    const aliases = HEADER_ALIASES[key] || [];
    for (let i = 0; i < norm.length; i++) {
      if (aliases.some((a) => norm[i].includes(a))) {
        map[key] = i;
        return;
      }
    }
  });
  return map;
}

function parseNumberBR(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(v: unknown): number | null {
  const n = parseNumberBR(v);
  return n === null ? null : Math.round(n);
}

function parseDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().split("T")[0];
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y.toString().padStart(4, "0")}-${d.m.toString().padStart(2, "0")}-${d.d.toString().padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return null;
}

function onlyDigits(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\D/g, "");
  return s || null;
}

export async function parsePrefaturaExcel(file: File): Promise<PrefaturaParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown as unknown[][];

  if (!rows.length) {
    return { itens: [], cliente_cnpj_inferido: null, total_valor_nf: 0, total_valor_frete: 0 };
  }

  const headers = (rows[0] as unknown[]).map((c) => String(c ?? ""));
  const map = buildHeaderMap(headers);

  const itens: PrefaturaItemRaw[] = [];
  let totalNf = 0;
  let totalFrete = 0;
  let cnpjEmit: string | null = null;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    if (!r || r.every((c) => c === "" || c === null || c === undefined)) continue;

    const raw: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      raw[h || `col_${idx}`] = r[idx];
    });

    const get = (k: keyof PrefaturaItemRaw) => (map[k] !== undefined ? r[map[k] as number] : null);

    const item: PrefaturaItemRaw = {
      linha_arquivo: i + 1,
      chave_acesso_cliente: onlyDigits(get("chave_acesso_cliente")),
      numero_nf_cliente: get("numero_nf_cliente") != null ? String(get("numero_nf_cliente")).trim() : null,
      serie_cliente: get("serie_cliente") != null ? String(get("serie_cliente")).trim() : null,
      cnpj_emitente_cliente: onlyDigits(get("cnpj_emitente_cliente")),
      cnpj_destinatario_cliente: onlyDigits(get("cnpj_destinatario_cliente")),
      documento_transporte_cliente:
        get("documento_transporte_cliente") != null ? String(get("documento_transporte_cliente")).trim() : null,
      valor_nf_cliente: parseNumberBR(get("valor_nf_cliente")),
      valor_frete_cliente: parseNumberBR(get("valor_frete_cliente")),
      peso_cliente: parseNumberBR(get("peso_cliente")),
      volumes_cliente: parseIntSafe(get("volumes_cliente")),
      data_emissao_cliente: parseDate(get("data_emissao_cliente")),
      referencia_interna_cliente:
        get("referencia_interna_cliente") != null ? String(get("referencia_interna_cliente")).trim() : null,
      raw_jsonb: raw,
    };

    itens.push(item);
    if (item.valor_nf_cliente) totalNf += item.valor_nf_cliente;
    if (item.valor_frete_cliente) totalFrete += item.valor_frete_cliente;
    if (!cnpjEmit && item.cnpj_emitente_cliente) cnpjEmit = item.cnpj_emitente_cliente;
  }

  return { itens, cliente_cnpj_inferido: cnpjEmit, total_valor_nf: totalNf, total_valor_frete: totalFrete };
}

// ─── Comparação / divergências ────────────────────────────────────────────

export interface NFInterna {
  id: string;
  chave_acesso: string;
  numero_nf: string;
  serie: string | null;
  cnpj_emitente: string;
  valor_nf: number | null;
  peso_bruto: number | null;
  volume_m3: number | null;
  data_emissao: string | null;
}

export interface CteInterno {
  id: string;
  numero_cte: string;
  chave_cte?: string | null;
  chave_nf_referenciada: string | null;
  numero_nf_referenciada: string | null;
  valor_frete: number | null;
}

export interface Tolerancia {
  valor_nf: number; // valor absoluto em R$
  valor_frete: number; // valor absoluto em R$
  peso: number; // valor absoluto em kg
}

export const TOLERANCIA_DEFAULT: Tolerancia = { valor_nf: 0.05, valor_frete: 0.05, peso: 0.5 };

function stripZeros(s: string | null | undefined): string {
  return (s || "").replace(/^0+/, "");
}

export function matchNF(item: PrefaturaItemRaw, nfs: NFInterna[]): { nf: NFInterna | null; matched_by: string } {
  if (item.chave_acesso_cliente) {
    const nf = nfs.find((n) => n.chave_acesso === item.chave_acesso_cliente);
    if (nf) return { nf, matched_by: "chave_acesso" };
  }
  const num = stripZeros(item.numero_nf_cliente || "");
  if (num && item.cnpj_emitente_cliente) {
    const nf = nfs.find(
      (n) =>
        stripZeros(n.numero_nf) === num &&
        n.cnpj_emitente.replace(/\D/g, "") === item.cnpj_emitente_cliente &&
        (!item.serie_cliente || (n.serie || "") === item.serie_cliente)
    );
    if (nf) return { nf, matched_by: "numero_serie_cnpj" };
  }
  if (num) {
    const matches = nfs.filter((n) => stripZeros(n.numero_nf) === num);
    if (matches.length === 1) return { nf: matches[0], matched_by: "numero" };
  }
  return { nf: null, matched_by: "sem_match" };
}

export function matchCte(nf: NFInterna, ctes: CteInterno[]): CteInterno | null {
  return (
    ctes.find((c) => c.chave_nf_referenciada === nf.chave_acesso) ||
    ctes.find((c) => stripZeros(c.numero_nf_referenciada || "") === stripZeros(nf.numero_nf)) ||
    null
  );
}

export interface Divergencia {
  campo: string;
  esperado: number | string | null;
  recebido: number | string | null;
  diff: number | null;
}

export function compararCampos(
  item: PrefaturaItemRaw,
  nf: NFInterna,
  cte: CteInterno | null,
  tol: Tolerancia = TOLERANCIA_DEFAULT
): Divergencia[] {
  const divs: Divergencia[] = [];

  const checkNum = (campo: string, esperado: number | null, recebido: number | null, tolerancia: number) => {
    if (esperado === null || recebido === null) return;
    const diff = +(recebido - esperado).toFixed(4);
    if (Math.abs(diff) > tolerancia) {
      divs.push({ campo, esperado, recebido, diff });
    }
  };

  checkNum("valor_nf", nf.valor_nf, item.valor_nf_cliente, tol.valor_nf);
  if (cte) checkNum("valor_frete", cte.valor_frete, item.valor_frete_cliente, tol.valor_frete);
  checkNum("peso", nf.peso_bruto, item.peso_cliente, tol.peso);

  if (item.data_emissao_cliente && nf.data_emissao && item.data_emissao_cliente !== nf.data_emissao) {
    divs.push({ campo: "data_emissao", esperado: nf.data_emissao, recebido: item.data_emissao_cliente, diff: null });
  }

  return divs;
}

export type StatusConciliacao = "ok" | "divergente" | "sem_nf" | "sem_cte";

export interface ConciliacaoResultado {
  prefatura_item_id: string;
  nf_id: string | null;
  cte_id: string | null;
  matched_by: string;
  status_conciliacao: StatusConciliacao;
  divergencias: { itens: Divergencia[] };
}

// ─── Exportação Excel (retorno) ────────────────────────────────────────────

export interface LinhaRetorno {
  chave_acesso: string;
  numero_nf: string;
  serie: string | null;
  cnpj_emitente: string;
  cte_numero: string | null;
  valor_nf_xml: number | null;
  valor_frete_cte: number | null;
  peso: number | null;
  volume_m3: number | null;
  data_emissao: string | null;
  status: string;
  divergencias: Divergencia[];
}

export function exportarRetornoExcel(linhas: LinhaRetorno[], nomeArquivo: string) {
  const wb = XLSX.utils.book_new();

  const conciliados = linhas.filter((l) => l.status === "ok");
  const divergentes = linhas.filter((l) => l.status === "divergente" || l.status === "sem_cte" || l.status === "sem_nf");

  const wsConciliados = XLSX.utils.json_to_sheet(
    conciliados.map((l) => ({
      "Chave Acesso": l.chave_acesso,
      "NF": l.numero_nf,
      "Série": l.serie || "",
      "CNPJ Emitente": l.cnpj_emitente,
      "CT-e": l.cte_numero || "",
      "Valor NF (XML)": l.valor_nf_xml ?? "",
      "Valor Frete (CT-e)": l.valor_frete_cte ?? "",
      "Peso": l.peso ?? "",
      "Volume m³": l.volume_m3 ?? "",
      "Data Emissão": l.data_emissao || "",
      "Status": "OK",
    }))
  );
  XLSX.utils.book_append_sheet(wb, wsConciliados, "Conciliados");

  const linhasDiv: Record<string, unknown>[] = [];
  divergentes.forEach((l) => {
    if (l.divergencias.length === 0) {
      linhasDiv.push({
        "Chave Acesso": l.chave_acesso,
        "NF": l.numero_nf,
        "Status": l.status,
        "Campo": "",
        "Esperado": "",
        "Recebido": "",
        "Diferença": "",
      });
    } else {
      l.divergencias.forEach((d) => {
        linhasDiv.push({
          "Chave Acesso": l.chave_acesso,
          "NF": l.numero_nf,
          "Status": l.status,
          "Campo": d.campo,
          "Esperado": d.esperado ?? "",
          "Recebido": d.recebido ?? "",
          "Diferença": d.diff ?? "",
        });
      });
    }
  });
  const wsDiv = XLSX.utils.json_to_sheet(linhasDiv);
  XLSX.utils.book_append_sheet(wb, wsDiv, "Divergências");

  const totais = {
    total_itens: linhas.length,
    conciliados: conciliados.length,
    divergentes: divergentes.length,
    total_valor_nf_xml: linhas.reduce((s, l) => s + (l.valor_nf_xml || 0), 0),
    total_valor_frete_cte: linhas.reduce((s, l) => s + (l.valor_frete_cte || 0), 0),
  };
  const wsResumo = XLSX.utils.json_to_sheet([totais]);
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  XLSX.writeFile(wb, nomeArquivo);
}
