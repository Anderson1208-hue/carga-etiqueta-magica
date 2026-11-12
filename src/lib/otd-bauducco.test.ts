import { describe, it, expect } from 'vitest';
import { classificar, nfNumero, resumo } from './otd-bauducco';
describe('OTD Bauducco', () => {
  it('extrai número da NF sem zeros e série', () => expect(nfNumero('000764079-20')).toBe('764079'));
  it('agenda atendida na planilha = contestar', () => expect(classificar({ 'Houve perda de agenda?': 'Agenda Atendida', 'Ocorrência atrasou o recebimento?': 'NÃO' }).classe).toBe('CONTESTAR'));
  it('entrega no dia da agenda do sistema = contestar', () => expect(classificar({ 'Ocorrência atrasou o recebimento?': 'NÃO' }, { nf: '1', agenda_data: '2026-10-14', entrega_data: '2026-10-14', status: null }).classe).toBe('CONTESTAR'));
  it('aguardando descarga = motivo do cliente', () => expect(classificar({ 'Ocorrência atrasou o recebimento?': 'AGUARDANDO DESCARGA' }).classe).toBe('MOTIVO DO CLIENTE'));
  it('sem ocorrência do cliente = atraso reconhecido', () => expect(classificar({ 'Ocorrência atrasou o recebimento?': 'NÃO' }).classe).toBe('ATRASO RECONHECIDO'));
  it('quebra de veículo = atraso reconhecido', () => expect(classificar({ 'Ocorrência atrasou o recebimento?': 'QUEBRA DE VEÍCULO' }).classe).toBe('ATRASO RECONHECIDO'));
  it('cenários de OTD', () => {
    const r = resumo([{ OTD: 'NO PRAZO' }, { OTD: 'FORA DO PRAZO' }, { OTD: 'FORA DO PRAZO' }, { OTD: 'N/A' }], ['CONTESTAR', 'ATRASO RECONHECIDO']);
    expect(r[0].otd).toBeCloseTo(1 / 3); expect(r[1].noPrazo).toBe(2);
  });
});
