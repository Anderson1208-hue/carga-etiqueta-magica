import { Capacitor } from "@capacitor/core";

/**
 * Chip visual que identifica o ambiente em execução.
 *
 * Fonte primária: VITE_BUILD_ENV injetado no build do React
 *   (dev | homolog | prod). Setado pelos scripts de build do APK.
 *
 * Fallback (quando VITE_BUILD_ENV não existe — ex.: dev local): inferimos
 * pelo hostname.
 *   - sandbox lovableproject.com / *.lovable.app → DEV/HOMOLOG
 *   - capacitor://localhost (APK embedded)       → PROD
 *   - navegador comum                            → WEB
 */
type Env = "DEV" | "HOMOLOG" | "PROD" | "WEB";

function detectEnv(): Env {
  const declared = (import.meta.env.VITE_BUILD_ENV || "").toString().toLowerCase();
  const isNative = Capacitor.isNativePlatform();

  if (declared === "prod") return "PROD";
  if (declared === "homolog") return "HOMOLOG";
  if (declared === "dev") return "DEV";

  // Fallback por inferência
  if (!isNative) return "WEB";
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (host.endsWith("lovableproject.com")) return "DEV";
  if (host.endsWith("lovable.app")) return "HOMOLOG";
  return "PROD";
}

const STYLE: Record<Env, string> = {
  DEV: "bg-red-600 text-white",
  HOMOLOG: "bg-amber-500 text-white",
  PROD: "bg-green-600 text-white",
  WEB: "bg-blue-600 text-white",
};

export function BuildModeBadge() {
  const label = detectEnv();
  const host = typeof window !== "undefined" ? window.location.hostname : "native";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${STYLE[label]}`}
      title={`Build: ${label} (${host})`}
    >
      {label}
    </span>
  );
}
