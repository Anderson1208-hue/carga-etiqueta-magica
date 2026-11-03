export const DATASETS = ['notas','cargas','veiculos','agendas','entregas','ibac','okentrega','produtos','destinatarios','embarcadores','roteirizacoes','prefaturas','prefatura_itens','ctes','sla','tarifas'] as const;
export type Dataset = typeof DATASETS[number];
export type BusinessRow = Record<string, string | number | boolean | null>;
export interface Report {
  title: string; dataset: Dataset; period: { inicio: string; fim: string }; filters: Record<string, string>;
  rows: BusinessRow[]; totals: Record<string, number>; missing: Record<string, number>; groups: Record<string, number>;
  complete: boolean; generatedAt: string; catalog?: boolean;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0,4)) && date.getMonth()+1 === Number(value.slice(5,7)) && date.getDate() === Number(value.slice(8,10));
}
const numericFields = ['peso_kg','volume_m3','valor_mercadoria','valor_frete','caixas','distancia_total_km'];
export function summarize(rows: BusinessRow[]) {
  const totals: Record<string, number> = { registros: rows.length };
  const missing: Record<string, number> = {};
  const groups: Record<string, number> = {};
  for (const row of rows) {
    for (const field of numericFields) {
      if (!(field in row)) continue;
      const value = row[field];
      if (typeof value === 'number' && Number.isFinite(value)) totals[field] = (totals[field] ?? 0) + value;
      else missing[field] = (missing[field] ?? 0) + 1;
    }
    const group = String(row.validacao_status ?? row.agenda_status ?? row.status ?? 'Sem status');
    groups[group] = (groups[group] ?? 0) + 1;
  }
  if ('peso_kg' in totals) totals.toneladas = totals.peso_kg / 1000;
  for (const field of Object.keys(totals)) totals[field] = Math.round(totals[field] * 1e6) / 1e6;
  return { totals, missing, groups };
}
export const JULIO_USER_ID = 'e847b0ab-5e6f-417e-8115-6d2c67a3697f';
export function eligibleIdentity(active: boolean, serverAdmin: boolean, userId: string, granted: boolean) {
  return active && (serverAdmin || (userId === JULIO_USER_ID && granted));
}
export function safeCell(value: string | number | boolean | null): string | number | boolean {
  if (value === null) return '';
  return typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
}