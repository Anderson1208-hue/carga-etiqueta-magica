import { describe, it, expect } from 'vitest';
import { DATASETS, NUMERIC_FILTERS, modelSample, summarize, eligibleIdentity, safeCell, validDate } from './report';
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
  it('oferece a carga agrupada por veículo/dia sem remover a carga individual', () => {
    expect(DATASETS).toContain('cargas_agrupadas');
    expect(DATASETS).toContain('cargas');
    const agrupadas = summarize([{ volume_m3: 70, peso_kg: 1000 }, { volume_m3: 90, peso_kg: 2000 }]);
    expect(agrupadas.totals.registros).toBe(2);
    expect(agrupadas.totals.volume_m3 / agrupadas.totals.registros).toBe(80);
  });
  it('mostra todas as linhas de resultados pequenos e só amostra dos grandes', () => {
    const pequenas = Array.from({ length: 50 }, (_, i) => ({ volume_m3: i }));
    expect(modelSample(pequenas).length).toBe(50);
    const grandes = Array.from({ length: 101 }, (_, i) => ({ volume_m3: i }));
    expect(modelSample(grandes).length).toBe(12);
  });
  it('expõe os filtros numéricos de volume e peso', () => {
    expect([...NUMERIC_FILTERS]).toEqual(['volume_m3_min','volume_m3_max','peso_kg_min','peso_kg_max']);
  });
});