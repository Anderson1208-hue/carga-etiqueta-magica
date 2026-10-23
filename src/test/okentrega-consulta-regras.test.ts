import { describe, expect, it } from 'vitest';
import { CONSULTA_CRON, AUTOMACAO_INICIO, dataConsultaPermitida, dataBrasilia } from '../../supabase/functions/_shared/okentrega-consulta-regras';

describe('consulta programada OK Entrega', () => {
  it('executa às 07h e 17h Brasília (10h e 20h UTC)', () => {
    expect(CONSULTA_CRON).toBe('0 10,20 * * *');
  });
  it('inicia a automação na segunda 26/10/2026', () => {
    expect(AUTOMACAO_INICIO).toBe('2026-10-26');
  });
  it('inclui notas do próprio dia e anteriores desde 22/10', () => {
    expect(dataConsultaPermitida('2026-10-26', '2026-10-26')).toBe(true);
    expect(dataConsultaPermitida('2026-10-22', '2026-10-26')).toBe(true);
    expect(dataConsultaPermitida('2026-10-21', '2026-10-26')).toBe(false);
    expect(dataConsultaPermitida('2026-10-27', '2026-10-26')).toBe(false);
    expect(dataConsultaPermitida('2026-02-30', '2026-10-26')).toBe(false);
  });
  it('usa o dia de Brasília na virada UTC', () => {
    expect(dataBrasilia(new Date('2026-10-27T01:00:00Z'))).toBe('2026-10-26');
  });
});