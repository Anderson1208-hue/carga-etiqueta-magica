import { useEffect, useRef, useCallback, useState } from "react";

/** Configuração dinâmica do GPS tracker */
interface GpsConfig {
  intervalo_padrao_segundos: number;
  intervalo_critico_segundos: number;
  distance_filter_metros: number;
  batch_sync_ativo: boolean;
  batch_max_posicoes: number;
  raio_aproximacao_metros: number;
}

const DEFAULT_CONFIG: GpsConfig = {
  intervalo_padrao_segundos: 120,
  intervalo_critico_segundos: 60,
  distance_filter_metros: 100,
  batch_sync_ativo: true,
  batch_max_posicoes: 5,
  raio_aproximacao_metros: 500,
};

interface GpsPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
}

interface UseGpsTrackerOptions {
  monitoramentoRotaId: string | null;
  enabled: boolean;
  /** Coordenadas das paradas para detecção de aproximação */
  paradasCoords?: { lat: number; lng: number }[];
  /** Config override vinda do banco */
  config?: Partial<GpsConfig>;
}

/** Haversine em metros */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function useGpsTracker({
  monitoramentoRotaId,
  enabled,
  paradasCoords = [],
  config: configOverride,
}: UseGpsTrackerOptions) {
  const cfg: GpsConfig = { ...DEFAULT_CONFIG, ...configOverride };

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchRef = useRef<GpsPosition[]>([]);
  const lastSentRef = useRef<{ lat: number; lng: number } | null>(null);
  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modoCritico, setModoCritico] = useState(false);

  // Flush batch to server
  const flushBatch = useCallback(async (positions: GpsPosition[]) => {
    if (!monitoramentoRotaId || positions.length === 0) return;
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/processar-gps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({
          monitoramento_rota_id: monitoramentoRotaId,
          // Envia a última posição como principal (compatibilidade)
          latitude: positions[positions.length - 1].latitude,
          longitude: positions[positions.length - 1].longitude,
          accuracy: positions[positions.length - 1].accuracy,
          // Envia lote completo
          batch: positions,
        }),
      });

      if (res.ok) {
        const last = positions[positions.length - 1];
        setLastPosition({ lat: last.latitude, lng: last.longitude });
        lastSentRef.current = { lat: last.latitude, lng: last.longitude };
        setError(null);
      }
    } catch (err) {
      console.error("Erro ao enviar GPS:", err);
      setError("Falha ao enviar posição");
    }
  }, [monitoramentoRotaId]);

  // Decide se está em modo crítico (próximo de parada)
  const checkModoCritico = useCallback((lat: number, lng: number): boolean => {
    if (paradasCoords.length === 0) return false;
    return paradasCoords.some(
      (p) => haversine(lat, lng, p.lat, p.lng) <= cfg.raio_aproximacao_metros
    );
  }, [paradasCoords, cfg.raio_aproximacao_metros]);

  const enqueuePosition = useCallback((pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = pos.coords;

    // Distance filter: só enfileira se moveu o suficiente
    if (lastSentRef.current) {
      const dist = haversine(lastSentRef.current.lat, lastSentRef.current.lng, latitude, longitude);
      if (dist < cfg.distance_filter_metros) {
        // Não moveu o suficiente, mas atualiza UI
        setLastPosition({ lat: latitude, lng: longitude });
        return;
      }
    }

    const position: GpsPosition = {
      latitude,
      longitude,
      accuracy,
      timestamp: new Date().toISOString(),
    };

    // Verifica modo crítico
    const critico = checkModoCritico(latitude, longitude);
    setModoCritico(critico);

    if (cfg.batch_sync_ativo) {
      batchRef.current.push(position);
      // Flush se atingiu max do lote OU está em modo crítico (envia imediato)
      if (batchRef.current.length >= cfg.batch_max_posicoes || critico) {
        const toSend = [...batchRef.current];
        batchRef.current = [];
        flushBatch(toSend);
      }
    } else {
      // Envio imediato (sem lote)
      flushBatch([position]);
    }
  }, [cfg.distance_filter_metros, cfg.batch_sync_ativo, cfg.batch_max_posicoes, checkModoCritico, flushBatch]);

  const getPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setError("GPS não disponível");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      enqueuePosition,
      (err) => {
        console.error("Erro GPS:", err);
        setError("Sem acesso ao GPS");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, [enqueuePosition]);

  useEffect(() => {
    if (!enabled || !monitoramentoRotaId) {
      // Flush remaining batch before stopping
      if (batchRef.current.length > 0) {
        flushBatch([...batchRef.current]);
        batchRef.current = [];
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setTracking(false);
      setModoCritico(false);
      return;
    }

    setTracking(true);
    getPosition(); // envio imediato

    const intervalMs = (modoCritico ? cfg.intervalo_critico_segundos : cfg.intervalo_padrao_segundos) * 1000;
    intervalRef.current = setInterval(getPosition, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, monitoramentoRotaId, modoCritico, cfg.intervalo_padrao_segundos, cfg.intervalo_critico_segundos, getPosition, flushBatch]);

  return { tracking, lastPosition, error, modoCritico };
}
