// Consulta IBAC/MO: notas já com validação VÁLIDO não precisam ser regravadas.
// O portal ainda as retorna na lista, mas atualizá-las é escrita desnecessária.
export type LinhaConsulta = {
  chave: string;
  status_validacao: string | null;
  [k: string]: unknown;
};

const normalizar = (v: string | null | undefined) =>
  (v ?? '').trim().toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const ehValido = (v: string | null | undefined) => normalizar(v) === 'VALIDO';

export function filtrarPendentes(
  linhas: LinhaConsulta[],
  chavesValidas: Set<string>,
): { aGravar: LinhaConsulta[]; puladas: number } {
  // Pula só o que já está VÁLIDO no nosso banco; se o portal virou VÁLIDO, grava.
  const aGravar = linhas.filter((l) => !chavesValidas.has(l.chave));
  return { aGravar, puladas: linhas.length - aGravar.length };
}

/** Divide em lotes e busca as chaves que já estão VÁLIDO no nosso banco. */
export async function chavesJaValidas(
  admin: { from: (t: string) => any },
  chaves: string[],
): Promise<Set<string>> {
  const validas = new Set<string>();
  for (let i = 0; i < chaves.length; i += 100) {
    const parte = chaves.slice(i, i + 100);
    if (!parte.length) continue;
    const { data, error } = await admin
      .from('ibac_portal_validacao')
      .select('chave')
      .in('chave', parte)
      .in('status_validacao', ['VALIDO', 'VÁLIDO']);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r: { chave: string }) => validas.add(r.chave));
  }
  return validas;
}
