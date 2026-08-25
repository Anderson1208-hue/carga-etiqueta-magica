// Parser do EDI NOTFIS (IBAC / Cacau Show) para extração de cubagem por NF.
//
// Memória de cálculo corrigida com planilha IBAC_m3_NOTFIS_CORRIGIDO.xlsx
// e layout PROCEDA NOTFIS 3.1 (registro 313, 240 posições):
//   - registro 313 = uma NF
//   - peso bruto: posições 101-107 do layout = slice(100, 107), 2 decimais
//   - peso densidade/cubagem: posições 108-112 do layout = slice(107, 112), 2 decimais
//   - NÃO usar posições 198-212: no layout oficial isso é valor total do frete, não cubagem
//   - fator de cubagem IBAC = 300 kg/m³  =>  volume_m3 = peso_cubado / 300

export const FATOR_CUBAGEM_IBAC = 300;

export interface NotfisCubagemRow {
  numeroNf: string;
  caixas: number;
  valorNf: number;
  pesoBruto: number;
  pesoCubado: number;
  volumeM3: number;
}

export function normalizeNfNumber(value: string | number | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.replace(/^0+/, "") || "0";
}

function num(slice: string, decimals = 0): number {
  const digits = slice.replace(/\D/g, "");
  if (!digits) return 0;
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed)) return 0;
  return decimals > 0 ? parsed / Math.pow(10, decimals) : parsed;
}

/** Lê o arquivo NOTFIS como Latin-1 (CP1252), padrão do PROCEDA. */
export async function readNotfisFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return new TextDecoder("iso-8859-1", { fatal: false }).decode(buffer);
}

export function isNotfisCacauContent(content: string): boolean {
  const head = content.slice(0, 400);
  return /^000/.test(head) && (/^313/m.test(content) || /\n313/.test(content));
}

/**
 * Extrai peso cubado por NF dos registros 313 e converte em m³ (cubado / 300).
 * Última ocorrência da NF prevalece.
 */
export function parseNotfisCubagem(content: string): NotfisCubagemRow[] {
  const rows = new Map<string, NotfisCubagemRow>();

  for (const rawLine of content.split(/\r\n|\n|\r/)) {
    if (!rawLine.startsWith("313")) continue;
    const ln = rawLine.replace(/\s+$/g, "");
    if (ln.length < 112) continue;

    const numeroNf = normalizeNfNumber(ln.slice(32, 40));
    if (numeroNf === "0") continue;

    const caixas = num(ln.slice(78, 85), 2);
    const valorNf = num(ln.slice(85, 100), 2);
    const pesoBruto = num(ln.slice(100, 107), 2);

    const pesoCubado = num(ln.slice(107, 112), 2);

    const volumeM3 = pesoCubado > 0 ? +(pesoCubado / FATOR_CUBAGEM_IBAC).toFixed(4) : 0;

    rows.set(numeroNf, { numeroNf, caixas, valorNf, pesoBruto, pesoCubado, volumeM3 });
  }

  return Array.from(rows.values());
}
