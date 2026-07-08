// Análise "estilo mercado" (Samsara/Trimble) de tempo em parada e entrega off-site.
// - Dwell time: tempo entre 1º e último ping GPS dentro do geofence da parada
//   (padrão do mercado; simples e robusto a pings esparsos).
// - Off-site: sinaliza quando a coordenada da baixa "entregue" está fora do raio
//   da parada — indica entrega registrada longe do endereço cadastrado.

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
  firstIn: string | null;
  lastIn: string | null;
  baixaDistM: number | null;
  offSite: boolean;
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
  const baixasPorCnpj = new Map<string, BaixaCoord>();
  for (const b of baixas) {
    if (!b.cnpj) continue;
    const cur = baixasPorCnpj.get(b.cnpj);
    if (!cur || new Date(b.registrado_em) > new Date(cur.registrado_em)) {
      baixasPorCnpj.set(b.cnpj, b);
    }
  }

  for (const p of paradas) {
    const pLat = p.latitude == null ? null : Number(p.latitude);
    const pLng = p.longitude == null ? null : Number(p.longitude);
    const raio = (p.raio_geofence_metros || 100) + toleranciaGpsM;

    let firstIn: string | null = null;
    let lastIn: string | null = null;
    let pingsDentro = 0;

    if (pLat != null && pLng != null && Number.isFinite(pLat) && Number.isFinite(pLng)) {
      for (const g of pings) {
        const gLat = Number(g.latitude);
        const gLng = Number(g.longitude);
        if (!Number.isFinite(gLat) || !Number.isFinite(gLng)) continue;
        const d = haversineM(pLat, pLng, gLat, gLng);
        if (d <= raio) {
          pingsDentro++;
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

    // Off-site: baixa fora do raio da parada
    const cnpj = (p.cnpj_destinatario || "").replace(/\D/g, "");
    const baixa = cnpj ? baixasPorCnpj.get(cnpj) : undefined;
    let baixaDistM: number | null = null;
    let offSite = false;
    if (baixa && baixa.latitude != null && baixa.longitude != null && pLat != null && pLng != null) {
      baixaDistM = Math.round(
        haversineM(pLat, pLng, Number(baixa.latitude), Number(baixa.longitude))
      );
      offSite = baixaDistM > raio;
    }

    out[p.id] = {
      dwellMin,
      pingsDentro,
      firstIn,
      lastIn,
      baixaDistM,
      offSite,
    };
  }

  return out;
}

export function isPassagem(a: ParadaAnalise): boolean {
  return a.dwellMin != null && a.dwellMin < DWELL_MIN_THRESHOLD;
}
