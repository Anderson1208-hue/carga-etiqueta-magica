import { Capacitor } from "@capacitor/core";

/**
 * Chip visual que mostra em qual modo o app foi compilado.
 * - DEV  → APK aponta para sandbox Lovable (hot-reload). Precisa de internet p/ abrir.
 * - PROD → APK roda /dist embutido (capacitor://localhost). Funciona offline.
 * - WEB  → rodando no navegador (não é APK).
 */
export function BuildModeBadge() {
  const isNative = Capacitor.isNativePlatform();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const isSandbox = host.endsWith("lovableproject.com") || host.endsWith("lovable.app");

  let label: string;
  let className: string;

  if (!isNative) {
    label = "WEB";
    className = "bg-blue-600 text-white";
  } else if (isSandbox) {
    label = "DEV";
    className = "bg-red-600 text-white";
  } else {
    label = "PROD";
    className = "bg-green-600 text-white";
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${className}`}
      title={`Build: ${label} (${host || "native"})`}
    >
      {label}
    </span>
  );
}
