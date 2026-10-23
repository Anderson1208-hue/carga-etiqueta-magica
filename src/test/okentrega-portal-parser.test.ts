import { describe, expect, it } from 'vitest';
import { portalDocumentId, portalValidationText, portalQueueStatus, portalConsultationStatus, latestPortalDelivery } from '../../supabase/functions/_shared/okentrega-portal-parser';

describe('consulta de ocorrência OK Entrega', () => {
  it('registra em análise sem aprovar e mantém desconhecidos sem interpretação', () => {
    expect(portalConsultationStatus(['em análise'])).toEqual({ status: 'aguardando_aprovacao', status_comprovante: null });
    expect(portalConsultationStatus(['desconhecido'])).toBeNull();
  });
  const entry = (date: string, status: string) => ({ INFO_ORI: { TIPOOCORRENCIA: 'Entrega', DTREGISTRO: date }, RESULTADO_VALIDA: [status] });
  it('considera correção posterior registrada no portal, não só o envio original', () => {
    const latest = latestPortalDelivery({ EE1: entry('22/10/2026 16:04', 'Recusado'), EE2: entry('23/10/2026 09:51', 'registrado') }, '1');
    expect(latest?.id).toBe('EE2');
    expect(portalQueueStatus(latest?.value.RESULTADO_VALIDA)?.status).toBe('aprovado');
  });
  it('mantém recusa mais recente do portal mesmo havendo uma aprovação antiga', () => {
    const latest = latestPortalDelivery({ EE1: entry('22/10/2026 15:03', 'registrado'), EE2: entry('23/10/2026 14:15', 'Recusado') }, '1');
    expect(portalQueueStatus(latest?.value.RESULTADO_VALIDA)?.status).toBe('recusado');
  });
  it('não escolhe uma aprovação antiga se a nova ocorrência ainda não foi validada', () => {
    const latest = latestPortalDelivery({ EE1: entry('22/10/2026 15:03', 'registrado'), EE2: entry('23/10/2026 14:15', 'Em análise') }, '1');
    expect(portalQueueStatus(latest?.value.RESULTADO_VALIDA)).toBeNull();
  });
  it('exige a ocorrência original na mesma nota e datas não ambíguas', () => {
    expect(latestPortalDelivery({ EE2: entry('23/10/2026 09:51', 'registrado') }, '1')).toBeNull();
    expect(latestPortalDelivery({ EE1: entry('23/10/2026 09:51', 'Recusado'), EE2: entry('23/10/2026 09:51', 'registrado') }, '1')).toBeNull();
  });
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