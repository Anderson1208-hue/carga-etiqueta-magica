export const CONSULTA_INICIO = '2026-10-22';
export const AUTOMACAO_INICIO = '2026-10-26';
export const CONSULTA_CRON = '0 10,20 * * 1-5';

export function dataBrasilia(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function dataConsultaPermitida(data: string, hoje = dataBrasilia()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const parsed = new Date(`${data}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === Number(data.slice(0, 4))
    && parsed.getMonth() + 1 === Number(data.slice(5, 7)) && parsed.getDate() === Number(data.slice(8, 10))
    && data >= CONSULTA_INICIO && data <= hoje;
}