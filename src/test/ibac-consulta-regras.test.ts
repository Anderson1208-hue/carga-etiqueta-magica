import { describe, expect, it } from 'vitest';
import { filtrarPendentes, type LinhaConsulta } from '../../supabase/functions/_shared/ibac-consulta-regras';

const linha = (chave: string, status_validacao: string | null): LinhaConsulta =>
  ({ chave, status_validacao });

describe('consulta IBAC pula só o que já está VÁLIDO no nosso banco', () => {
  it('grava nota que o portal traz VÁLIDO mas aqui ainda está pendente', () => {
    const r = filtrarPendentes([linha('a'.repeat(44), 'VALIDO'), linha('b'.repeat(44), 'PENDENTE')], new Set());
    expect(r.puladas).toBe(0);
    expect(r.aGravar).toHaveLength(2);
  });
  it('não regrava linha que já está VÁLIDO no nosso banco', () => {
    const chave = 'c'.repeat(44);
    const r = filtrarPendentes([linha(chave, 'VALIDO')], new Set([chave]));
    expect(r.puladas).toBe(1);
    expect(r.aGravar).toHaveLength(0);
  });
});
