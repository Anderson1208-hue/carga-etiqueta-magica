// Mirror of supabase/functions/_shared/overhaul-sm-regras.ts (server re-checks).
export const PLACAS_RASTREADAS = [
  "KOS3B53","KNZ4524","KVO5956","KWN4F37","LLJ6E62","LLM5D56","LQA9B31","LQG1685","LQG1H02","LQG1H31",
  "LQG1H40","LNA5B11","KYY3041","LJS8C00","KYG4G96","CBL1702","LLJ7E12","CIV1224","LAF4D87","LJL1208",
  "LAF4388","KUX2795","KZO3935","KOD1J61","LOH8F53","KWW3B22","KYN7B08","LLT4F19","KOY7B25","LRH9070",
  "LLW7C35","KQT8G57","MRX5F02","CUC6D38","KOP5A00","JFQ5I78","KRC7B85","DTB9585","LKU2A09",
];
export const normalizarPlaca = (p: string) => (p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const placaRastreada = (p: string) => PLACAS_RASTREADAS.includes(normalizarPlaca(p));
