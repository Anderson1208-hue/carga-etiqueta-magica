import { describe, expect, it } from 'vitest';
import { filtrarPendentes, type LinhaConsulta } from '../../supabase/functions/_shared/ibac-consulta-regras';

const linha = (chave: string, status_validacao: string | null): LinhaConsulta =>
  ({ chave, status_validacao });

describe('consulta IBAC pula notas já VÁLIDO', () => {
  it('não regrava a linha que o portal traz como VÁLIDO', () => {
    const r = filtrarPendentes([linha('a'.repeat(44), 'VALIDO'), linha('b'.repeat(44), 'PENDENTE')], new Set());
    expect(r.puladas).toBe(1);
    expect(r.aGravar.map((l) => l.chave)).toEqual(['b'.repeat(44)]);
  });
  it('não regrava linha que já está VÁLIDO no nosso banco', () => {
    const chave = 'c'.repeat(44);
    const r = filtrarPendentes([linha(chave, 'VALIDO')], new Set([chave]));
    expect(r.puladas).toBe(1);
    expect(r.aGravar).toHaveLength(0);
  });
  it('regrava INVALIDO e sem retorno; tolera acentuação e espaços', () => {
    const r = filtrarPendentes(
      [linha('d'.repeat(44), 'INVÁLIDO'), linha('e'.repeat(44), null), linha('f'.repeat(44), ' Válido ')],
      new Set(),
    );
    expect(r.puladas).toBe(1);
    expect(r.aGravar).toHaveLength(2);
  });
});
