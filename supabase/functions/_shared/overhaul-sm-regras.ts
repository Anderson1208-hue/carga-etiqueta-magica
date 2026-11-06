// Regras de negócio da geração de SM no portal Overhaul (puro, testável com Deno).
// Fonte: planilha de veículos rastreados (fornecida por Anderson em 05/11/2026).

// Somente placas rastreadas podem ter SM gerada automaticamente.
export const PLACAS_RASTREADAS: readonly string[] = [
  'DOW3F18', 'DYB0E91', 'EBD9C73', 'ECZ2F48', 'EHL9E45', 'EJO3C52', 'EJU2B02',
  'FNS6J81', 'FPQ2E57', 'FUJ7D31', 'FXQ6C81', 'GBX0H02', 'GCB0C02', 'GFH8D22',
  'GRI0D31', 'GSV2A92', 'GWC3D62', 'GXU7H42', 'HLE2I71', 'HLI4D71', 'HPT1A61',
  'HXO3B81', 'KPI4E81', 'KSD2G32', 'KVM5I01', 'LLJ6E62', 'LLR9A81', 'LLT4F19',
  'LSA6E32', 'LSS2I64', 'OGT7J31', 'QKN2I22', 'QTQ5C71', 'RVB0H48', 'RWI0I51',
  'SEV0J52', 'TGH8I01', 'TQR2C04', 'TXC4G51',
];

export function normalizarPlaca(placa: string | null | undefined): string {
  return (placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function placaRastreada(placa: string | null | undefined): boolean {
  return PLACAS_RASTREADAS.includes(normalizarPlaca(placa));
}

// Conferência da rota: os CNPJs das NFs do veículo devem bater com a seleção do operador.
// Comparação por conjunto (ordem não importa); ordem final vem da própria roteirização.
export function motoristaConfere(
  nomeSistema: string | null | undefined,
  nomePortal: string | null | undefined,
): boolean {
  return normNome(nomeSistema) === normNome(nomePortal) && normNome(nomeSistema) !== '';
}

export function normNome(nome: string | null | undefined): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Conferência da rota: os CNPJs das NFs do veículo devem bater com a seleção do operador.
// Comparação por conjunto (ordem não importa); ordem final vem da própria roteirização.
export function conferirRota(
  cnpjsSistema: string[],
  cnpjsSelecionados: string[],
): { ok: boolean; faltando: string[]; sobrando: string[] } {
  const norm = (c: string) => c.replace(/\D/g, '');
  const sistema = new Set(cnpjsSistema.map(norm).filter(Boolean));
  const selecionados = new Set(cnpjsSelecionados.map(norm).filter(Boolean));
  const faltando = [...sistema].filter((c) => !selecionados.has(c));
  const sobrando = [...selecionados].filter((c) => !sistema.has(c));
  return { ok: faltando.length === 0 && sobrando.length === 0, faltando, sobrando };
}

// Locais (referências) do portal, na ordem das paradas; dedup por CNPJ mantendo a 1ª ocorrência.
export interface LocalRota {
  refId: number;
  tipo: 'ENTREGA' | 'COLETA';
  seq: number;
}

export function locaisDaRota(
  origemRefId: number,
  paradas: { refId: number; cnpj: string }[],
): LocalRota[] {
  const vistos = new Set<string>();
  const locais: LocalRota[] = [];
  let seq = 2; // 1 = origem
  for (const p of paradas) {
    const cnpj = p.cnpj.replace(/\D/g, '');
    if (!cnpj || vistos.has(cnpj)) continue;
    vistos.add(cnpj);
    locais.push({ refId: p.refId, tipo: 'ENTREGA', seq: seq++ });
  }
  return locais;
}

// Formatações do portal (padrão brasileiro).
export function valorBR(v: number): string {
  return v.toFixed(2).replace('.', ',');
}

export function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Similaridade de nomes para casar o motorista da roteirização com o cadastro do portal.
// Distância de Levenshtein normalizada: 1 = idêntico, 0 = totalmente diferente.
export function similaridadeNome(a: string, b: string): number {
  const s = normNome(a);
  const t = normNome(b);
  if (!s || !t) return 0;
  if (s === t) return 1;
  const m = s.length;
  const n = t.length;
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) {
      const custo = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + custo);
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// Escolhe o motorista do portal mais próximo do nome informado.
// Exige similaridade mínima de 0,8 e que o melhor seja único (sem empate ambíguo).
export function melhorMotorista<T extends { nome: string }>(
  nomeBusca: string,
  candidatos: T[],
  minimo = 0.8,
): { escolhido: T | null; similaridade: number; ambiguos: T[] } {
  let melhor: T | null = null;
  let melhorSim = 0;
  const ambiguos: T[] = [];
  for (const c of candidatos) {
    const sim = similaridadeNome(nomeBusca, c.nome);
    if (sim > melhorSim) {
      melhor = c;
      melhorSim = sim;
      ambiguos.length = 0;
    } else if (sim === melhorSim && melhor) {
      ambiguos.push(c);
    }
  }
  if (!melhor || melhorSim < minimo || ambiguos.length > 0) {
    return { escolhido: null, similaridade: melhorSim, ambiguos: melhor ? [melhor, ...ambiguos] : [] };
  }
  return { escolhido: melhor, similaridade: melhorSim, ambiguos: [] };
}
