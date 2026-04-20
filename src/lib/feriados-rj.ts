// Feriados nacionais e estaduais do Rio de Janeiro
// Usado para calcular o próximo dia útil para liberação de NFs agendadas.

// Calcula a data da Páscoa (algoritmo de Meeus/Jones/Butcher)
function calcularPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmt(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Retorna Set de strings "YYYY-MM-DD" com todos os feriados RJ do ano
export function getFeriadosRJ(ano: number): Set<string> {
  const feriados = new Set<string>();
  const pascoa = calcularPascoa(ano);

  // Fixos nacionais
  feriados.add(`${ano}-01-01`); // Confraternização Universal
  feriados.add(`${ano}-04-21`); // Tiradentes
  feriados.add(`${ano}-05-01`); // Dia do Trabalho
  feriados.add(`${ano}-09-07`); // Independência
  feriados.add(`${ano}-10-12`); // N. Sra. Aparecida
  feriados.add(`${ano}-11-02`); // Finados
  feriados.add(`${ano}-11-15`); // Proclamação da República
  feriados.add(`${ano}-11-20`); // Consciência Negra (nacional desde 2024)
  feriados.add(`${ano}-12-25`); // Natal

  // Móveis (baseados na Páscoa)
  feriados.add(fmt(addDays(pascoa, -48))); // Carnaval (segunda)
  feriados.add(fmt(addDays(pascoa, -47))); // Carnaval (terça)
  feriados.add(fmt(addDays(pascoa, -46))); // Quarta-feira de Cinzas (meio expediente — tratamos como feriado)
  feriados.add(fmt(addDays(pascoa, -2)));  // Sexta-feira Santa
  feriados.add(fmt(addDays(pascoa, 60)));  // Corpus Christi

  // Estaduais RJ
  feriados.add(`${ano}-04-23`); // São Jorge (RJ)
  feriados.add(`${ano}-11-20`); // Zumbi/Consciência Negra (RJ — já incluso)

  return feriados;
}

export function isDiaUtil(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  const feriados = getFeriadosRJ(date.getFullYear());
  return !feriados.has(fmt(date));
}

// Retorna o próximo dia útil estritamente após `date` (não inclui o próprio).
export function proximoDiaUtilApos(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  while (!isDiaUtil(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}
