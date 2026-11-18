import { describe, expect, it } from 'vitest';
import { conferirCte, type FonteParalela, type TarifaParalela } from './comercial-paralelo';
const cli = [{ id: 'c', cnpj: '29.737.368/0034-87', nome: 'M', fiscal: {}, observacao: '', ativo: true }];
const reg = [{ id: 'r', cliente_id: 'c', nome: 'RJ', cidades: [{ nome: 'Rio de Janeiro', uf: 'RJ' }], lead_time: null, calendario: 'uteis_rj', observacao: '', ativo: true }];
const tar = (comp: TarifaParalela['componentes']): TarifaParalela[] => [{ id: 't', regiao_id: 'r', vigente_de: '2026-10-30', vigente_ate: null, fator_cubagem: null, componentes: comp, faixas: [], fiscal: {}, observacao: '', status: 'sugerida' }];
const cte = (fp: number, peso: number, cidade = 'RIO DE JANEIRO') => ({ municipio_fim: cidade, uf_fim: 'RJ', data_emissao: '2026-11-16', componentes: [{ nome: 'FRETE PESO', valor: fp }], quantidades: [{ tipo: 'PESO', unidade: '01', quantidade: peso }] }) as FonteParalela;
describe('conferência de CT-e com a tarifa', () => {
  const t = tar([{ nome: 'FRETE PESO', base: 'ton_real', valor: 950, embutido: false }]);
  it('aceita frete peso igual ao valor por kg', () => expect(conferirCte(cte(442.12, 465.386), '29737368003487', cli, reg, t).status).toBe('ok'));
  it('aponta diferença acima de 1%', () => expect(conferirCte(cte(500, 465.386), '29737368003487', cli, reg, t).status).toBe('diferente'));
  it('aplica frete mínimo', () => expect(conferirCte(cte(148.93, 50), '29737368003487', cli, reg, tar([{ nome: 'FRETE PESO', base: 'ton_real', valor: 827.4, embutido: false }, { nome: 'MINIMO', base: 'minimo', valor: 148.93, embutido: false }])).status).toBe('ok'));
  it('cidade fora das regiões fica sem região', () => expect(conferirCte(cte(100, 100, 'MACAE'), '29737368003487', cli, reg, t).status).toBe('sem_regiao'));
});
