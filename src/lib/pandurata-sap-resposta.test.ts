import { describe, expect, it } from 'vitest';
import { interpretarRespostaSap } from '../../supabase/functions/pandurata-otm-enviar/sap-resposta';
import { definirStatusEnvio, preservarConfirmacaoSap } from '../../supabase/functions/pandurata-otm-enviar/frota';

describe('Resposta da ação SAP observada no vídeo do operador', () => {
  it('reconhece a requisição aceita do processo correto', () => {
    expect(interpretarRespostaSap('Process BAU_SH_ENVIA_FROTA_SAP initiated\nInformações. Ação Requisitada com sucesso')).toBe('requisitado');
  });
  it('não confunde início do processo com sucesso', () => {
    expect(interpretarRespostaSap('Process BAU_SH_ENVIA_FROTA_SAP initiated')).toBe('pendente');
  });
  it('não confirma a resposta de outra ação ou janela', () => {
    expect(interpretarRespostaSap('Process OUTRA_ACAO initiated Ação Requisitada com sucesso')).toBe('pendente');
  });
  it('prioriza erro do processo mesmo havendo texto de sucesso', () => {
    expect(interpretarRespostaSap('Process BAU_SH_ENVIA_FROTA_SAP initiated Ação Requisitada com sucesso ERROR')).toBe('erro');
  });
  it('não libera repetição quando a janela não responde após o clique', () => {
    expect(definirStatusEnvio({ ok: false, codigo: 'consulta_incompleta', sap_acionado: true }, false)).toBe('incerto');
  });
  it('preserva cargas já confirmadas e bloqueia um novo envio', () => {
    expect(preservarConfirmacaoSap('confirmado')).toBe(true);
    expect(preservarConfirmacaoSap('incerto')).toBe(false);
    expect(preservarConfirmacaoSap('erro')).toBe(false);
  });
});