import { describe, expect, it } from 'vitest';
import { fotoInvalida, proximaEtapa } from '../../supabase/functions/_shared/ibac-substituicao-regras';
import { combinarCanhoto, payloadImagem } from '../../supabase/functions/_shared/ibac-portal-parser';

describe('substituição explícita Cacau', () => {
  const chave = '35261061472205000407550010044001191227177955';
  it('envia o documento completo como o portal, preservando vínculos e substituindo somente a foto', () => {
    const original = { oid: 'imagem', documentoIndustria: { chaveDoc: chave }, conhecimentos: [{ oid: 'cte' }], status: 'PENDENTE', base64: null };
    const payload = payloadImagem(original, 'imagem', 'nova', 'canhoto.jpg');
    expect(payload.documentoIndustria.chaveDoc).toBe(chave);
    expect(payload.conhecimentos).toEqual([{ oid: 'cte' }]);
    expect(payload.base64).toBe('nova');
    expect(original.base64).toBeNull();
    expect(() => payloadImagem(original, 'outra', 'nova', 'canhoto.jpg')).toThrow();
  });
  it('identifica a NF pelo documentoIndustria e mantém a validação da lista MO', () => {
    const p = combinarCanhoto({ oid: 'imagem', chave, statusValidacaoIA: 'INVALIDO' }, { oid: 'imagem', documentoIndustria: { chaveDoc: chave }, status: 'PENDENTE', base64: 'foto' }, chave);
    expect(p.chave).toBe(chave);
    expect(p.statusValidacaoIA).toBe('INVALIDO');
    expect(fotoInvalida(p)).toBe(true);
  });
  it('bloqueia detalhe de outra nota ou de outra imagem', () => {
    expect(() => combinarCanhoto({ oid: 'imagem', chave }, { oid: 'imagem', documentoIndustria: { chaveDoc: 'outra' } }, chave)).toThrow();
    expect(() => combinarCanhoto({ oid: 'imagem', chave }, { oid: 'outra', documentoIndustria: { chaveDoc: chave } }, chave)).toThrow();
  });
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