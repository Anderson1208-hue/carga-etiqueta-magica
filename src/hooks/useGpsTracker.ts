import { useEffect, useRef, useCallback, useState } from "react";

const GPS_INTERVAL_MS = 30_000; // Send GPS every 30 seconds

interface UseGpsTrackerOptions {
  monitoramentoRotaId: string | null;
  enabled: boolean;
}

export function useGpsTracker({ monitoramentoRotaId, enabled }: UseGpsTrackerOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendPosition = useCallback(async (lat: number, lng: number, accuracy: number) => {
    if (!monitoramentoRotaId) return;

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
          latitude: lat,
          longitude: lng,
          accuracy,
        }),
      });

      if (res.ok) {
        setLastPosition({ lat, lng });
        setError(null);
      }
    } catch (err) {
      console.error("Erro ao enviar GPS:", err);
      setError("Falha ao enviar posição");
    }
  }, [monitoramentoRotaId]);

  const getAndSendPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setError("GPS não disponível");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        sendPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        console.error("Erro GPS:", err);
        setError("Sem acesso ao GPS");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, [sendPosition]);

  useEffect(() => {
    if (!enabled || !monitoramentoRotaId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setTracking(false);
      return;
    }

    setTracking(true);
    // Send immediately
    getAndSendPosition();
    // Then every interval
    intervalRef.current = setInterval(getAndSendPosition, GPS_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setTracking(false);
    };
  }, [enabled, monitoramentoRotaId, getAndSendPosition]);

  return { tracking, lastPosition, error };
}
