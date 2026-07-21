// Análise "estilo mercado" (Samsara/Trimble) de tempo em parada por GPS factual.
// - Dwell time: tempo entre 1º e último ping GPS dentro do geofence da parada
//   (padrão do mercado; simples e robusto a pings esparsos).
// - A baixa operacional NÃO entra na análise de localização do veículo.

export interface GpsPing {
  latitude: number | string;
  longitude: number | string;
  registrado_em: string;
}

export interface ParadaCoord {
  id: string;
  cnpj_destinatario: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  raio_geofence_metros: number | null;
}

export interface BaixaCoord {
  cnpj: string; // normalizado
  registrado_em: string;
  latitude: number | null;
  longitude: number | null;
}

export interface ParadaAnalise {
  dwellMin: number | null;
  pingsDentro: number;
  rawPingsDentro: number;
  firstIn: string | null;
  lastIn: string | null;
  minDistM: number | null;
  closestAt: string | null;
}

const DWELL_MIN_THRESHOLD = 2; // < 2min = "passagem"

export function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function analisarParadas(
  paradas: ParadaCoord[],
  pings: GpsPing[],
  baixas: BaixaCoord[],
  toleranciaGpsM = 30
): Record<string, ParadaAnalise> {
  const out: Record<string, ParadaAnalise> = {};
  for (const p of paradas) {
    const pLat = p.latitude == null ? null : Number(p.latitude);
    const pLng = p.longitude == null ? null : Number(p.longitude);
    const raio = (p.raio_geofence_metros || 100) + toleranciaGpsM;

    let firstIn: string | null = null;
    let lastIn: string | null = null;
    let pingsDentro = 0;
    let rawPingsDentro = 0;
    let minDistM: number | null = null;
    let closestAt: string | null = null;

    if (pLat != null && pLng != null && Number.isFinite(pLat) && Number.isFinite(pLng)) {
      for (const g of pings) {
        const gLat = Number(g.latitude);
        const gLng = Number(g.longitude);
        if (!Number.isFinite(gLat) || !Number.isFinite(gLng)) continue;
        const d = haversineM(pLat, pLng, gLat, gLng);
        if (minDistM === null || d < minDistM) {
          minDistM = Math.round(d);
          closestAt = g.registrado_em;
        }
        if (d <= raio) {
          pingsDentro++;
          rawPingsDentro++;
          if (!firstIn || g.registrado_em < firstIn) firstIn = g.registrado_em;
          if (!lastIn || g.registrado_em > lastIn) lastIn = g.registrado_em;
        }
      }
    }

    let dwellMin: number | null = null;
    if (firstIn && lastIn) {
      const diffMs = new Date(lastIn).getTime() - new Date(firstIn).getTime();
      dwellMin = Math.round(diffMs / 60000);
    }

    out[p.id] = {
      dwellMin,
      pingsDentro,
      rawPingsDentro,
      firstIn,
      lastIn,
      minDistM,
      closestAt,
    };
  }

  return out;
}

export function analisarParadasSequencial(
  paradas: ParadaCoord[],
  pings: GpsPing[],
  baixas: BaixaCoord[],
  toleranciaGpsM = 30
): Record<string, ParadaAnalise> {
  const out: Record<string, ParadaAnalise> = {};
  const pingsUsados = new Set<number>();

  for (const p of paradas) {
    const pLat = p.latitude == null ? null : Number(p.latitude);
    const pLng = p.longitude == null ? null : Number(p.longitude);
    const raio = (p.raio_geofence_metros || 100) + toleranciaGpsM;

    let firstIn: string | null = null;
    let lastIn: string | null = null;
    let pingsDentro = 0;
    let rawPingsDentro = 0;
    let minDistM: number | null = null;
    let closestAt: string | null = null;
    const indicesDentro: number[] = [];

    if (pLat != null && pLng != null && Number.isFinite(pLat) && Number.isFinite(pLng)) {
      pings.forEach((g, index) => {
        const gLat = Number(g.latitude);
        const gLng = Number(g.longitude);
        if (!Number.isFinite(gLat) || !Number.isFinite(gLng)) return;
        const d = haversineM(pLat, pLng, gLat, gLng);
        if (minDistM === null || d < minDistM) {
          minDistM = Math.round(d);
          closestAt = g.registrado_em;
        }
        if (d <= raio) rawPingsDentro++;
        if (pingsUsados.has(index)) return;
        if (d <= raio) {
          pingsDentro++;
          indicesDentro.push(index);
          if (!firstIn || g.registrado_em < firstIn) firstIn = g.registrado_em;
          if (!lastIn || g.registrado_em > lastIn) lastIn = g.registrado_em;
        }
      });
    }

    indicesDentro.forEach((index) => pingsUsados.add(index));

    let dwellMin: number | null = null;
    if (firstIn && lastIn) {
      const diffMs = new Date(lastIn).getTime() - new Date(firstIn).getTime();
      dwellMin = Math.round(diffMs / 60000);
    }

    out[p.id] = { dwellMin, pingsDentro, rawPingsDentro, firstIn, lastIn, minDistM, closestAt };
  }

  return out;
}

export function isPassagem(a: ParadaAnalise): boolean {
  return a.dwellMin != null && a.dwellMin < DWELL_MIN_THRESHOLD;
}
