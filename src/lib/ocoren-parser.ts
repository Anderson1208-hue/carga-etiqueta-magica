// Parser do layout PROCEDA OCOREN 3.1 — registros 342 (ocorrência de entrega).
// Posições (1-indexed):
//   01-03  Identificador "342"
//   04-17  CNPJ emitente (14)
//   18     Série
//   21-28  Número da NF (8, com zeros à esquerda)
//   29-30  Código da ocorrência (ex: "01" = entregue)
//   31-38  Data DDMMAAAA
//   39-42  Hora HHMM

export interface OcorenRecord {
  cnpj: string;       // 14 dígitos
  numeroNf: string;   // sem zeros à esquerda
  codigo: string;     // 2 chars
  dataIso: string;    // ISO timestamp
}

const CODE_ENTREGUE = "01";

function parseDataHora(data: string, hora: string): string {
  // data DDMMAAAA, hora HHMM -> ISO local
  const dd = data.slice(0, 2);
  const mm = data.slice(2, 4);
  const aaaa = data.slice(4, 8);
  const hh = hora.slice(0, 2);
  const mi = hora.slice(2, 4);
  // Trata como horário local — Brasil
  return new Date(`${aaaa}-${mm}-${dd}T${hh}:${mi}:00`).toISOString();
}

export function parseOcoren(content: string, onlyCode: string = CODE_ENTREGUE): OcorenRecord[] {
  const out: OcorenRecord[] = [];
  for (const raw of content.split(/\r?\n/)) {
    if (!raw.startsWith("342")) continue;
    if (raw.length < 42) continue;
    const codigo = raw.slice(28, 30);
    if (codigo !== onlyCode) continue;
    const cnpj = raw.slice(3, 17);
    const nfRaw = raw.slice(20, 28);
    const numeroNf = String(parseInt(nfRaw, 10));
    if (!numeroNf || isNaN(parseInt(nfRaw, 10))) continue;
    const data = raw.slice(30, 38);
    const hora = raw.slice(38, 42);
    let dataIso: string;
    try {
      dataIso = parseDataHora(data, hora);
    } catch {
      dataIso = new Date().toISOString();
    }
    out.push({ cnpj, numeroNf, codigo, dataIso });
  }
  return out;
}

export function summarizeAllCodes(content: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const raw of content.split(/\r?\n/)) {
    if (!raw.startsWith("342") || raw.length < 30) continue;
    const codigo = raw.slice(28, 30);
    counts[codigo] = (counts[codigo] || 0) + 1;
  }
  return counts;
}
