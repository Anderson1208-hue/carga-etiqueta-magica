import { useEffect, useRef } from "react";

/**
 * Mantém a tela do dispositivo acesa enquanto `enabled === true`.
 * Usa Screen Wake Lock API (Chrome/Edge mobile, suportada no WebView Android moderno).
 * No iOS Safari ainda não tem suporte nativo — degradação silenciosa.
 *
 * Reaplica automaticamente o lock quando a aba volta ao primeiro plano
 * (a Screen Wake Lock API libera o lock ao perder visibilidade).
 */
export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function acquire() {
      try {
        // @ts-ignore — wakeLock pode não existir em ambientes antigos
        if (!enabled || !navigator.wakeLock) return;
        // @ts-ignore
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener?.("release", () => {
          sentinelRef.current = null;
        });
      } catch (err) {
        // Ex.: usuário não interagiu, bateria fraca, navegador sem suporte.
        console.debug("WakeLock indisponível:", err);
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible" && enabled && !sentinelRef.current) {
        acquire();
      }
    }

    if (enabled) {
      acquire();
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (sentinelRef.current) {
        sentinelRef.current.release?.().catch(() => {});
        sentinelRef.current = null;
      }
    };
  }, [enabled]);
}
