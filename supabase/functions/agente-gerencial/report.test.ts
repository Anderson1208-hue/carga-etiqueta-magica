import { describe, it, expect } from 'vitest';
import { summarize, eligibleIdentity, safeCell, validDate } from './report';
describe('Agente Gerencial — autorizações e dados', () => {
  it('rejeita datas impossíveis e aceita data local válida',()=>{expect(validDate('2026-02-30')).toBe(false);expect(validDate('2026-11-02')).toBe(true);});
  it('permite o administrador aprovado', () => expect(eligibleIdentity(true, true, false)).toBe(true));
  it('permite somente quem está na lista de acessos', () => {
    expect(eligibleIdentity(true, false, true)).toBe(true);
    expect(eligibleIdentity(true, false, false)).toBe(false);
  });
  it('bloqueia usuário inativo mesmo administrador', () => expect(eligibleIdentity(false, true, true)).toBe(false));
  it('converte toneladas e registra valores ausentes', () => {
    const result = summarize([{peso_kg: 2000,volume_m3: 4,valor_mercadoria: 100},{peso_kg: 500,volume_m3: null,valor_mercadoria: null}]);
    expect(result.totals.toneladas).toBe(2.5);
    expect(result.totals.valor_mercadoria).toBe(100);
    expect(result.missing.valor_mercadoria).toBe(1);
  });
  it('neutraliza fórmulas exportadas sem alterar números', () => {
    expect(safeCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(safeCell(18)).toBe(18);
  });
});