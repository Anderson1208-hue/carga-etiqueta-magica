/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_PROJECT_ID: string;
  /** Ambiente do build do APK: "dev" | "homolog" | "prod". Vazio em web local. */
  readonly VITE_BUILD_ENV?: "dev" | "homolog" | "prod";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
