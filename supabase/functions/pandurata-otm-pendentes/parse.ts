export function numeroBR(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : null;
}
export function inteiro(v: unknown): number | null {
  const n = numeroBR(v);
  return n === null ? null : Math.round(n);
}
// "07/03/2026 00:00:00" (America/Sao_Paulo) -> ISO with -03:00
export function dataOtm(v: unknown): string | null {
  const m = String(v ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00` : null;
}
export function chaveDt(dt: unknown): string {
  return String(dt ?? '').replace(/\D/g, '').replace(/^0+/, '');
}
export function decodificarHtml(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
export function extrairSaida(rawHtml: string): unknown {
  const m = rawHtml.match(/<pre[^>]*id=["']?lovout["']?[^>]*>([\s\S]*?)<\/pre>/i);
  if (!m) return null;
  try { return JSON.parse(decodificarHtml(m[1])); } catch { return null; }
}
