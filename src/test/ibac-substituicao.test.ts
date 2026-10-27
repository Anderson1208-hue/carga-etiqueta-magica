import { describe, expect, it } from 'vitest';
import { fotoInvalida, proximaEtapa } from '../../supabase/functions/_shared/ibac-substituicao-regras';

describe('substituição explícita Cacau', () => {
  it('nunca exclui foto de nota aprovada mesmo com validação antiga inválida', () => {
    expect(fotoInvalida({ status: 'APROVADO', statusValidacaoIA: 'INVALIDO' })).toBe(false);
  });
  it('autoriza somente reprovação do portal, não erro técnico ou pendência', () => {
    expect(fotoInvalida({ status: 'PENDENTE', statusValidacaoIA: 'INVALIDO' })).toBe(true);
    expect(fotoInvalida({ status: 'PENDENTE', statusValidacaoIA: null })).toBe(false);
    expect(fotoInvalida({ status: 'ERRO' })).toBe(false);
  });
  it('retoma somente envio depois de excluir e falhar', () => {
    expect(proximaEtapa('falha_envio', false, false)).toBe('enviar');
    expect(proximaEtapa('exclusao_iniciada', false, false)).toBe('enviar');
  });
  it('não repete envio aceito cuja resposta se perdeu', () => {
    expect(proximaEtapa('envio_iniciado', true, true)).toBe('concluido');
  });
  it('bloqueia imagem inesperada após início de substituição sem excluir novamente', () => {
    expect(proximaEtapa('falha_envio', true, false)).toBe('bloquear');
    expect(proximaEtapa('exclusao_iniciada', true, false)).toBe('bloquear');
  });
});