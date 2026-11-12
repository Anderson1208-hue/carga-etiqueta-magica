// Conferência OTD Bauducco: regras determinísticas (sem IA) validadas com Anderson em 12/11/2026.
export type OtdRow = Record<string, unknown>;
export type Sistema = { nf: string; agenda_data: string | null; entrega_data: string | null; status: string | null };
export type Classe = 'CONTESTAR' | 'MOTIVO DO CLIENTE' | 'ATRASO RECONHECIDO';

// Ocorrências que são responsabilidade da transportadora (ou sem ocorrência do cliente) => atraso reconhecido.
const RECONHECIDO = ['NÃO', 'NAO', 'N/A', '', 'ATRASO / ERRO DA TRANSPORTADORA', 'QUEBRA DE VEÍCULO', 'PRODUTO EM FALTA / SOBRA', 'CLIENTE COM PROBLEMA NO SISTEMA'];

export const nfNumero = (v: unknown) => String(v ?? '').split('-')[0].replace(/\D/g, '').replace(/^0+/, '');
export const dia = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const br = (d: string) => d.split('-').reverse().join('/');

export function classificar(row: OtdRow, sis?: Sistema): { classe: Classe; justificativa: string; nota: string } {
  const perda = String(row['Houve perda de agenda?'] ?? '').trim().toUpperCase();
  const ocorr = String(row['Ocorrência atrasou o recebimento?'] ?? '').trim().toUpperCase();
  if (perda === 'AGENDA ATENDIDA') return { classe: 'CONTESTAR', justificativa: 'CONTESTAR: agenda atendida (planilha confirma)', nota: 'A própria planilha informa agenda atendida.' };
  if (sis?.agenda_data && sis.entrega_data && sis.agenda_data.slice(0, 10) === sis.entrega_data.slice(0, 10))
    return { classe: 'CONTESTAR', justificativa: 'CONTESTAR: entregue na data agendada (sistema)', nota: `Entregue na data agendada (${br(sis.entrega_data.slice(0, 10))}), conforme agendamento e baixa no sistema Expresso Ebenezer.` };
  if (!RECONHECIDO.includes(ocorr)) return { classe: 'MOTIVO DO CLIENTE', justificativa: 'ANALISAR: atraso por ocorrência no cliente', nota: `Ocorrência informada pela Bauducco: ${ocorr}.` };
  return { classe: 'ATRASO RECONHECIDO', justificativa: 'PROCEDE', nota: '' };
}

export function resumo(rows: OtdRow[], classes: Classe[]) {
  const medidas = rows.filter(r => ['NO PRAZO', 'FORA DO PRAZO'].includes(String(r['OTD'] ?? '').toUpperCase())).length;
  const noPrazo = rows.filter(r => String(r['OTD'] ?? '').toUpperCase() === 'NO PRAZO').length;
  const contestar = classes.filter(c => c === 'CONTESTAR').length;
  const cliente = classes.filter(c => c === 'MOTIVO DO CLIENTE').length;
  const pct = (n: number) => (medidas ? n / medidas : 0);
  return [
    { cenario: 'OTD Bauducco (atual)', noPrazo, medidas, otd: pct(noPrazo) },
    { cenario: 'Retirando agendas atendidas/entregues na agenda', noPrazo: noPrazo + contestar, medidas, otd: pct(noPrazo + contestar) },
    { cenario: '+ atrasos por ocorrência do cliente', noPrazo: noPrazo + contestar + cliente, medidas, otd: pct(noPrazo + contestar + cliente) },
  ];
}
