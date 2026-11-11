export type ClienteParalelo = { id: string; cnpj: string; nome: string; fiscal: Record<string, string>; observacao: string; ativo: boolean };
export type CidadeParalela = { nome: string; uf: string };
export type RegiaoParalela = { id: string; cliente_id: string; nome: string; cidades: CidadeParalela[]; lead_time: number | null; calendario: string; observacao: string; ativo: boolean };
export type ComponenteParalelo = { nome: string; base: string; valor: number; embutido: boolean };
export type FaixaParalela = { de: number; ate: number | null; valor: number };
export type TarifaParalela = { id: string; regiao_id: string; vigente_de: string; vigente_ate: string | null; fator_cubagem: number | null; componentes: ComponenteParalelo[]; fiscal: Record<string, string>; faixas: FaixaParalela[]; observacao: string; status: 'sugerida' | 'aprovada' };
export type FonteParalela = { chave_cte: string; numero_cte: string; data_emissao: string; municipio_fim: string; uf_fim: string; cfop: string; icms: Record<string, string> | null; componentes: { nome: string; valor: number }[]; quantidades: { unidade: string; tipo: string; quantidade: number }[]; valor_total_prestacao: number; valor_carga: number; notas: { cnpj_emitente: string; razao_social_emitente: string; dest_cidade: string; dest_uf: string }[] | null };
export type EntradaParalela = {
  id: string;
  tipo: 'NF' | 'CTE';
  fonte_id: string;
  cnpj: string;
  cliente: string;
  cidade: string;
  uf: string;
  documento: string | null;
  data_documento: string | null;
  dados: Partial<Pick<FonteParalela, 'numero_cte' | 'cfop' | 'icms' | 'componentes' | 'quantidades' | 'valor_total_prestacao' | 'valor_carga'>>;
  created_at: string;
};
/** Converte somente CT-es capturados depois da ativação; NFs nunca viram evidência tarifária. */
export function fonteDeEntrada(e: EntradaParalela): FonteParalela | null {
  if (e.tipo !== 'CTE') return null;
  return {
    chave_cte: e.fonte_id,
    numero_cte: e.dados.numero_cte || e.documento || '',
    data_emissao: e.data_documento || '',
    municipio_fim: e.cidade,
    uf_fim: e.uf,
    cfop: e.dados.cfop || '',
    icms: e.dados.icms || null,
    componentes: e.dados.componentes || [],
    quantidades: e.dados.quantidades || [],
    valor_total_prestacao: e.dados.valor_total_prestacao || 0,
    valor_carga: e.dados.valor_carga || 0,
    notas: [{ cnpj_emitente: e.cnpj, razao_social_emitente: e.cliente, dest_cidade: e.cidade, dest_uf: e.uf }],
  };
}
export const basesParalelas = [
  ['ton_cubada', 'R$/t cubada'], ['ton_real', 'R$/t real'], ['100kg', 'R$/100 kg'],
  ['percentual_nf', '% da NF'], ['percentual_frete', '% do frete'], ['fixo', 'R$/CT-e'],
  ['entrega', 'R$/entrega'], ['minimo', 'Frete mínimo (R$)'],
] as const;
export function validarTarifa(t: Pick<TarifaParalela, 'vigente_de' | 'vigente_ate' | 'componentes' | 'faixas' | 'fator_cubagem'>): string | null {
  if (!t.vigente_de) return 'Informe o início da vigência';
  if (t.vigente_ate && t.vigente_ate < t.vigente_de) return 'Fim da vigência anterior ao início';
  if (t.fator_cubagem !== null && (!Number.isFinite(t.fator_cubagem) || t.fator_cubagem <= 0)) return 'Fator de cubagem inválido';
  if (!t.componentes.length && !t.faixas.length) return 'Cadastre um componente ou uma faixa';
  if (t.componentes.some(c => !c.nome.trim() || !basesParalelas.some(([b]) => b === c.base) || !Number.isFinite(c.valor) || c.valor < 0)) return 'Confira os componentes';
  const faixas = [...t.faixas].sort((a, b) => a.de - b.de);
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i];
    if (!Number.isFinite(f.de) || f.de < 0 || !Number.isFinite(f.valor) || f.valor < 0 || (f.ate !== null && (!Number.isFinite(f.ate) || f.ate <= f.de))) return 'Confira os limites das faixas';
    const anterior = faixas[i - 1];
    if (anterior && (anterior.ate === null || f.de < anterior.ate)) return 'Faixas de peso sobrepostas';
  }
  return null;
}
export function cidadesDoTexto(texto: string): CidadeParalela[] {
  const cidades = texto.split('\n').filter(s => s.trim()).map(s => {
    const partes = s.trim().split('/');
    return { nome: partes.slice(0, -1).join('/').trim(), uf: (partes.at(-1) || '').trim().toUpperCase() };
  });
  if (cidades.some(c => !c.nome || !/^[A-Z]{2}$/.test(c.uf))) throw new Error('Informe cada cidade como Cidade/UF');
  return [...new Map(cidades.map(c => [`${c.nome.toLocaleLowerCase('pt-BR')}/${c.uf}`, c])).values()];
}
export function agruparFontes(fontes: FonteParalela[]) {
  const grupos = new Map<string, { cnpj: string; cliente: string; cidade: string; uf: string; fontes: FonteParalela[] }>();
  for (const f of fontes) {
    // A multi-shipper CT-e cannot safely be assigned to an individual client.
    const clientes = [...new Set(f.notas?.map(n => normalizarCnpjParalelo(n.cnpj_emitente)) || [])];
    if (clientes.length !== 1) continue;
    const n = f.notas?.[0];
    if (!n) continue;
    const cidade = f.municipio_fim || n.dest_cidade;
    const uf = f.uf_fim || n.dest_uf;
    if (!cidade || !uf) continue;
    const cnpj = normalizarCnpjParalelo(n.cnpj_emitente);
    const key = `${cnpj}/${cidade.toLocaleLowerCase('pt-BR')}/${uf}`;
    const grupo = grupos.get(key) || { cnpj, cliente: n.razao_social_emitente, cidade, uf, fontes: [] };
    grupo.fontes.push(f); grupos.set(key, grupo);
  }
  return [...grupos.values()].sort((a, b) => `${a.cliente}/${a.cidade}`.localeCompare(`${b.cliente}/${b.cidade}`, 'pt-BR', { numeric: true }));
}
export function normalizarCnpjParalelo(cnpj: string) { return cnpj.replace(/\D/g, ''); }
/** Evidence-only inversion of explicit CT-e quantities; never uses NF boxes as weight. */
export function sugerirComponentes(fontes: FonteParalela[]) {
  const candidatos = new Map<string, { nome: string; base: string; valores: number[] }>();
  for (const f of fontes) {
    const peso = f.quantidades.find(q => q.unidade === '01' && q.tipo.toUpperCase() === 'PESO_CUBADO')?.quantidade;
    for (const c of f.componentes) {
      const nome = c.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      let base = '', divisor = 0;
      if (nome === 'FRETE PESO' && peso && peso > 0) { base = 'ton_cubada'; divisor = peso / 1000; }
      else if ((nome === 'FRETE VALOR' || nome === 'OUTROS' || nome === 'GRIS') && f.valor_carga > 0) { base = 'percentual_nf'; divisor = f.valor_carga / 100; }
      else if (nome === 'CAT') { base = 'fixo'; divisor = 1; }
      else if (nome === 'PEDAGIO' && peso && peso > 0) { base = '100kg'; divisor = Math.ceil(peso / 100); }
      if (!base || !divisor) continue;
      const key = nome + '/' + base;
      const item = candidatos.get(key) || { nome:c.nome,base,valores:[] };
      item.valores.push(c.valor / divisor); candidatos.set(key,item);
    }
  }
  const componentes: ComponenteParalelo[] = [], pendencias: string[] = [];
  for (const c of candidatos.values()) {
    const ordenados = [...c.valores].sort((a,b)=>a-b), meio = ordenados[Math.floor(ordenados.length/2)];
    if (c.valores.length < 3 || c.valores.some(v => Math.abs(v-meio) > Math.max(0.015,Math.abs(meio)*0.0005))) {
      pendencias.push(`${c.nome}: ${c.valores.length} amostras ou valores divergentes`); continue;
    }
    componentes.push({nome:c.nome,base:c.base,valor:Number(meio.toFixed(c.base==='percentual_nf'?4:2)),embutido:false});
  }
  return {componentes,pendencias};
}