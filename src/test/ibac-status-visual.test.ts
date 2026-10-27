import { describe, expect, it } from 'vitest';
import { statusVisualIbac, validadoIbac } from '../lib/ibac-status-visual';

describe('erros visuais IBAC após validação', () => {
  it('retira do erro as cinco notas aprovadas sem modificar o registro original', () => {
    for (const numero of ['4400071', '4400194', '4400195', '4399938', '4400098']) {
      const evento = { numero, status: 'erro' };
      expect(statusVisualIbac(evento.status, { status_portal: 'APROVADO', status_validacao: 'VALIDO' })).toBe('validado');
      expect(evento.status).toBe('erro');
    }
  });
  it('mantém erro não validado ou sem retorno, sem confundir inválido com válido', () => {
    expect(statusVisualIbac('erro', { status_portal: 'PENDENTE', status_validacao: 'INVALIDO' })).toBe('erro');
    expect(statusVisualIbac('erro', null)).toBe('erro');
    expect(statusVisualIbac('erro', { status_portal: 'PENDENTE' })).toBe('erro');
  });
  it('aceita validação explícita e não transforma pendência em erro', () => {
    expect(validadoIbac({ status_validacao: 'VÁLIDO' })).toBe(true);
    expect(statusVisualIbac('pendente', { status_portal: 'PENDENTE' })).toBe('pendente');
  });
});