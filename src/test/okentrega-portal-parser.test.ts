import { describe, expect, it } from 'vitest';
import { portalDocumentId, portalValidationText, portalQueueStatus } from '../../supabase/functions/_shared/okentrega-portal-parser';

describe('consulta de ocorrência OK Entrega', () => {
  it('Registrado libera aprovação e remove interpretação de erro', () => {
    expect(portalQueueStatus(['registrado'])).toEqual({ status: 'aprovado', status_comprovante: '1' });
  });
  it('Recusado permanece recusado', () => {
    expect(portalQueueStatus(['Recusado'])).toEqual({ status: 'recusado', status_comprovante: '2' });
  });
  it('não aprova resultado desconhecido', () => {
    expect(portalQueueStatus(['Em análise'])).toBeNull();
  });
  it('identifica a lupa com id sem aspas, usada pelo portal', () => {
    expect(portalDocumentId('<a id=19330839><i class="fa-search"></i></a>')).toBe('19330839');
  });
  it('lê Registrado no primeiro elemento do resultado de validação', () => {
    expect(portalValidationText(['registrado', 'outro valor'])).toBe('registrado');
  });
  it('preserva a recusa sem convertê-la em aprovação', () => {
    expect(portalValidationText(['Recusado'])).toBe('Recusado');
  });
});