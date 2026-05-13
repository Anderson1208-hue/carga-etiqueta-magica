import { useEffect, useState } from "react";
import { drainQueue, pendingCount } from "@/lib/gpsQueue";

/**
 * Worker que drena a fila GPS periodicamente.
 * - Tenta a cada 15s.
 * - Tenta também ao voltar a ficar online (window 'online').
 * - Expõe contador de pendentes para UI.
 */
export function useGpsQueueWorker(enabled: boolean) {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const endpoint = `${supabaseUrl}/functions/v1/processar-gps`;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled) return;
      try {
        const { remaining } = await drainQueue({ endpoint, apikey: supabaseKey });
        if (!cancelled) setPending(remaining);
      } catch (err) {
        console.warn("[gpsQueueWorker] tick err", err);
        if (!cancelled) {
          try {
            setPending(await pendingCount());
          } catch {
            /* ignore */
          }
        }
      }
      if (!cancelled) timer = setTimeout(tick, 15_000);
    }

    function onOnline() {
      if (timer) clearTimeout(timer);
      tick();
    }

    tick();
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled]);

  return { pending };
}
