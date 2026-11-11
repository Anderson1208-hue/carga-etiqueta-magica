import { describe, expect, it } from 'vitest';
import { agruparFontes, cidadesDoTexto, validarTarifa, normalizarCnpjParalelo, sugerirComponentes, fonteDeEntrada, type EntradaParalela, type FonteParalela } from './comercial-paralelo';
describe('cadastros paralelos', () => {
  it('sugere apenas com peso cubado explícito e amostras consistentes', () => {
    const f = {quantidades:[{unidade:'01',tipo:'PESO_CUBADO',quantidade:1000}],componentes:[{nome:'FRETE PESO',valor:561.9},{nome:'CAT',valor:5}],valor_carga:10000} as FonteParalela;
    expect(sugerirComponentes([f,f,f]).componentes).toContainEqual({nome:'FRETE PESO',base:'ton_cubada',valor:561.9,embutido:false});
    expect(sugerirComponentes([f]).componentes).toEqual([]);
    expect(sugerirComponentes([{...f,quantidades:[{unidade:'03',tipo:'VOLUMES',quantidade:1000}]},f,f]).componentes.some(c=>c.nome==='FRETE PESO')).toBe(false);
  });
  it('normaliza CNPJ dos cadastros e XMLs sem alterar a origem', () => {
    expect(normalizarCnpjParalelo('01.234.567/0001-89')).toBe('01234567000189');
  });
  it('permite Campos como terceira região sem misturar clientes', () => {
    const fonte = (cnpj: string, cidade: string) => ({ chave_cte: cnpj + cidade, municipio_fim: cidade, uf_fim: 'RJ', notas: [{ cnpj_emitente: cnpj, razao_social_emitente: cnpj }] }) as FonteParalela;
    const grupos = agruparFontes([fonte('11111111111111', 'Rio de Janeiro'), fonte('11111111111111', 'Niterói'), fonte('11111111111111', 'Campos dos Goytacazes'), fonte('22222222222222', 'Campos dos Goytacazes')]);
    expect(grupos).toHaveLength(4);
    expect(grupos.filter(g => g.cnpj === '11111111111111')).toHaveLength(3);
  });
  it('não atribui CT-e com vários clientes a um cliente arbitrário', () => {
    expect(agruparFontes([{ notas: [{ cnpj_emitente: '1' }, { cnpj_emitente: '2' }] } as FonteParalela])).toEqual([]);
  });
  it('mantém municípios separados por UF e remove duplicados', () => {
    expect(cidadesDoTexto('Campos dos Goytacazes/RJ\nCampos dos Goytacazes/RJ\nRio de Janeiro/RJ')).toHaveLength(2);
    expect(() => cidadesDoTexto('Campos')).toThrow();
  });
  it('preserva datas de vigência e rejeita faixas sobrepostas', () => {
    const tarifa = { vigente_de: '2026-11-10', vigente_ate: null, fator_cubagem: null, componentes: [{nome: 'Frete',base: 'ton_cubada',valor: 561.9,embutido:false}], faixas: [] };
    expect(validarTarifa(tarifa)).toBeNull();
    expect(validarTarifa({...tarifa, vigente_ate: '2026-11-09'})).not.toBeNull();
    expect(validarTarifa({...tarifa, faixas:[{de:0,ate:100,valor:20},{de:50,ate:200,valor:30}]})).toBe('Faixas de peso sobrepostas');
  });
  it('usa somente CT-es novos como evidência de tarifa, nunca NFs', () => {
    const entrada = { id:'1', tipo:'NF', fonte_id:'nf-1', cnpj:'70940994008277', cliente:'Pandurata', cidade:'Campos dos Goytacazes', uf:'RJ', documento:'123', data_documento:'2026-11-11', dados:{}, created_at:'2026-11-11T20:00:00Z' } as EntradaParalela;
    expect(fonteDeEntrada(entrada)).toBeNull();
    const cte = fonteDeEntrada({...entrada, tipo:'CTE', fonte_id:'cte-1', dados:{componentes:[{nome:'CAT',valor:5}],quantidades:[],valor_carga:1000,valor_total_prestacao:100}});
    expect(cte?.chave_cte).toBe('cte-1');
    expect(cte?.notas?.[0].cnpj_emitente).toBe('70940994008277');
    expect(cte?.componentes).toEqual([{nome:'CAT',valor:5}]);
  });
});