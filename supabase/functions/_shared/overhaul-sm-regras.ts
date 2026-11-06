// Pure rules for Overhaul SM generation (tested in overhaul-sm-regras_test.ts).
export const PLACAS_RASTREADAS = [
  'KOS3B53','KNZ4524','KVO5956','KWN4F37','LLJ6E62','LLM5D56','LQA9B31','LQG1685','LQG1H02','LQG1H31',
  'LQG1H40','LNA5B11','KYY3041','LJS8C00','KYG4G96','CBL1702','LLJ7E12','CIV1224','LAF4D87','LJL1208',
  'LAF4388','KUX2795','KZO3935','KOD1J61','LOH8F53','KWW3B22','KYN7B08','LLT4F19','KOY7B25','LRH9070',
  'LLW7C35','KQT8G57','MRX5F02','CUC6D38','KOP5A00','JFQ5I78','KRC7B85','DTB9585','LKU2A09',
];

export const normalizarPlaca = (p: string) => (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const placaRastreada = (p: string) => PLACAS_RASTREADAS.includes(normalizarPlaca(p));

const tokens = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z]+/).filter((t) => t.length > 1);

// Our driver name is often shortened ("Antonio Benedito"); every token must appear in the portal name.
export function motoristaConfere(nosso: string, portal: string): boolean {
  const n = tokens(nosso);
  const p = new Set(tokens(portal));
  return n.length > 0 && n.every((t) => p.has(t));
}

export const valorBR = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dataBR = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export interface PontoRota {
  rponSequencia: number; refeId: number; refeDescricao: string; refeRaio: number; tparId: number;
  tparDescricao: string; areaId: unknown; areaDescricao: unknown; rponLatitude: number; rponLongitude: number;
  statusRealizado?: unknown; minutosMaximo?: unknown;
}

// Same row shape the portal's own SM screen builds when a saved route is selected.
export function locaisDaRota(pontos: PontoRota[]) {
  return pontos
    .filter((p) => p.tparId !== 4 && p.tparId !== 5)
    .map((p) => [p.rponSequencia, p.refeId, p.refeDescricao, p.refeRaio, false, p.tparId, p.tparDescricao,
      p.areaId ?? null, p.areaDescricao ?? null, '', '', 500, p.rponLatitude, p.rponLongitude,
      p.statusRealizado ?? null, '', '', '', '', p.minutosMaximo ?? null]);
}

// Route must be origin -> stops (in routing order) -> last delivery as destination.
export function conferirRota(pontos: PontoRota[], origemId: number, refesOrdenadas: number[]): string | null {
  const ord = [...pontos].sort((a, b) => a.rponSequencia - b.rponSequencia);
  const o = ord.find((p) => p.tparId === 4);
  const d = ord.find((p) => p.tparId === 5);
  const meio = ord.filter((p) => p.tparId !== 4 && p.tparId !== 5).map((p) => p.refeId);
  if (o?.refeId !== origemId) return 'origem da rota diferente';
  if (d?.refeId !== refesOrdenadas[refesOrdenadas.length - 1]) return 'destino da rota diferente da última entrega';
  const esperado = refesOrdenadas.slice(0, -1);
  if (meio.length !== esperado.length || meio.some((r, i) => r !== esperado[i])) return 'paradas da rota fora da ordem da roteirização';
  return null;
}
