import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useComercialParalelo } from '@/hooks/useComercialParalelo';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, LockKeyhole, Plus, Pencil, Save, Search, Copy, X, History } from 'lucide-react';
import { toast } from 'sonner';
import { agruparFontes, basesParalelas, cidadesDoTexto, validarTarifa, normalizarCnpjParalelo, sugerirComponentes, fonteDeEntrada, type ClienteParalelo, type RegiaoParalela, type TarifaParalela, type FonteParalela, type EntradaParalela } from '@/lib/comercial-paralelo';
import type { Json } from '@/integrations/supabase/types';

const db = supabase;
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const vazioFiscal = { cfop: '', cst: '', aliquota: '', uf_inicio: '', uf_fim: '' };
const clienteVazio = (): ClienteParalelo => ({ id: '', nome: '', cnpj: '', fiscal: {...vazioFiscal}, observacao: '', ativo: true });
const regiaoVazia = (cliente_id: string): RegiaoParalela => ({id:'',cliente_id,nome:'',cidades:[],lead_time:null,calendario:'uteis_rj',observacao:'',ativo:true});
const tarifaVazia = (regiao_id: string): TarifaParalela => ({id:'',regiao_id,vigente_de:hoje(),vigente_ate:null,fator_cubagem:null,componentes:[],faixas:[],fiscal:{...vazioFiscal},observacao:'',status:'aprovada'});

async function lerPaginas(tabela: 'paralelo_clientes' | 'paralelo_regioes' | 'paralelo_tarifas') {
  const rows: unknown[] = []; let cursor = '';
  for (;;) {
    let query = db.from(tabela).select('*').order('id').limit(200);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 200) return rows;
    cursor = data[data.length - 1].id;
  }
}
function Campo({ nome, children }: { nome: string; children: React.ReactNode }) {
  return <Label className="grid gap-2 text-sm">{nome}{children}</Label>;
}
function FiscalCampos({ value, change }: {value:Record<string,string>;change:(v:Record<string,string>)=>void}) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries({cfop:'CFOP',cst:'CST',aliquota:'Alíquota (%)',uf_inicio:'UF início',uf_fim:'UF fim'}).map(([key,nome]) => <Campo key={key} nome={nome}><Input value={value[key] || ''} onChange={e=>change({...value,[key]:e.target.value})}/></Campo>)}</div>;
}
export default function ComercialParalelo() {
  const { allowed, loading: authLoading, error: authError } = useComercialParalelo();
  const cache = useQueryClient();
  const query = useQuery({queryKey:['cadastros-paralelos'],enabled:allowed,queryFn:async()=>{
    const [clientes,regioes,tarifas] = await Promise.all([lerPaginas('paralelo_clientes'),lerPaginas('paralelo_regioes'),lerPaginas('paralelo_tarifas')]);
    return {clientes:clientes as ClienteParalelo[],regioes:regioes as RegiaoParalela[],tarifas:tarifas as TarifaParalela[]};
  }});
  const {clientes=[],regioes=[],tarifas=[]} = query.data || {};
  const [clienteId,setClienteId] = useState('');
  const [tab,setTab] = useState('clientes');
  const [clienteForm,setClienteForm] = useState<ClienteParalelo|null>(null);
  const [regiaoForm,setRegiaoForm] = useState<RegiaoParalela|null>(null);
  const [cidadesTexto,setCidadesTexto] = useState('');
  const [tarifaForm,setTarifaForm] = useState<TarifaParalela|null>(null);
  const [saving,setSaving] = useState(false);
  const [inicio,setInicio] = useState(hoje().slice(0,8)+'01');
  const [fim,setFim] = useState(hoje());
  const [fontes,setFontes] = useState<FonteParalela[]>([]);
  const [analisando,setAnalisando] = useState(false);
  const [analisado,setAnalisado] = useState(false);
  const [parcial,setParcial] = useState(false);
  const [evidencia,setEvidencia] = useState<FonteParalela|null>(null);
  const [clientesFonte,setClientesFonte] = useState<{id:string;cnpj:string;razao_social:string;nome_fantasia:string|null}[]>([]);
  const [historico,setHistorico] = useState(false);
  const [historicoCursor,setHistoricoCursor] = useState<number|null>(null);
  const [historicoRows,setHistoricoRows] = useState<{id:number;tabela:string;acao:string;autor:string|null;created_at:string;antes:Json|null;depois:Json|null}[]>([]);
  const [histMore,setHistMore] = useState(false);
  const [entradas,setEntradas] = useState<EntradaParalela[]>([]);
  const [entradasLoading,setEntradasLoading] = useState(false);
  const [entradasMore,setEntradasMore] = useState(false);
  const [entradasCursor,setEntradasCursor] = useState<{created_at:string;id:string}|null>(null);
  useEffect(()=>{if(!allowed){setFontes([]);setClientesFonte([]);setEntradas([]);}},[allowed]);
  const reload = () => cache.invalidateQueries({queryKey:['cadastros-paralelos']});
  const regs = regioes.filter(r=>r.cliente_id===clienteId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{numeric:true}));
  const abrirRegiao = (r:RegiaoParalela) => {setRegiaoForm(r);setCidadesTexto(r.cidades.map(c=>`${c.nome}/${c.uf}`).join('\n'));};
  async function salvar(tipo:'cliente'|'regiao'|'tarifa') {
    setSaving(true);
    try {
      if(tipo==='cliente' && clienteForm){
        const cnpj = normalizarCnpjParalelo(clienteForm.cnpj);
        if(!clienteForm.nome.trim() || !/^\d{14}$/.test(cnpj)) throw new Error('Informe nome e CNPJ com 14 dígitos');
        const {id,...payload}={...clienteForm,cnpj};
        const {error}=id ? await db.from('paralelo_clientes').update(payload).eq('id',id) : await db.from('paralelo_clientes').insert(payload);
        if(error) throw error;setClienteForm(null);
      }
      if(tipo==='regiao' && regiaoForm){
        if(!regiaoForm.nome.trim() || !regiaoForm.cliente_id) throw new Error('Informe cliente e nome da região');
        const cidades=cidadesDoTexto(cidadesTexto);
        if(regiaoForm.lead_time!==null && (!Number.isInteger(regiaoForm.lead_time) || regiaoForm.lead_time<0)) throw new Error('Lead time deve ser um número inteiro de dias');
        const outras=regioes.filter(r=>r.cliente_id===regiaoForm.cliente_id && r.id!==regiaoForm.id && r.ativo);
        if(regiaoForm.ativo && cidades.some(c=>outras.some(r=>r.cidades.some(x=>x.nome.toLocaleLowerCase('pt-BR')===c.nome.toLocaleLowerCase('pt-BR') && x.uf===c.uf)))) throw new Error('Uma cidade já pertence a outra região ativa deste cliente');
        const {id,...rest}=regiaoForm;const payload={...rest,cidades:cidades as unknown as Json};
        const {error}=id ? await db.from('paralelo_regioes').update(payload).eq('id',id) : await db.from('paralelo_regioes').insert(payload);
        if(error) throw error;setRegiaoForm(null);
      }
      if(tipo==='tarifa' && tarifaForm){
        if(!tarifaForm.regiao_id) throw new Error('Selecione a região');
        const erro=validarTarifa(tarifaForm);if(erro) throw new Error(erro);
        const {id,...rest}=tarifaForm;
        const {error}=await db.from('paralelo_tarifas').insert({...rest,status:rest.status,componentes:rest.componentes as unknown as Json,faixas:rest.faixas as unknown as Json});
        if(error) throw error;setTarifaForm(null);
      }
      await reload();toast.success('Cadastro paralelo salvo');
    } catch(e){toast.error(e instanceof Error ? e.message : String((e as {message?:string}).message || 'Falha ao salvar'));} finally {setSaving(false);}
  }
  async function analisar() {
    setAnalisando(true);setAnalisado(false);setFontes([]);setParcial(false);
    const encontrados:FonteParalela[]=[];
    try {
      let cursor='';
      const deadline=Date.now()+45_000;
      for(;;){
        const {data,error}=await db.rpc('paralelo_fontes',{p_inicio:inicio,p_fim:fim,p_cursor:cursor});
        if(error) throw error;
        const page=data as unknown as FonteParalela[];
        encontrados.push(...page.slice(0,200));
        if(page.length<=200) break;
        cursor=page[199].chave_cte;
        if(Date.now()>deadline){setParcial(true);break;}
        await new Promise(r=>setTimeout(r,100));
      }
      setFontes(encontrados);setAnalisado(true);
    }catch(e){setFontes(encontrados);setParcial(encontrados.length>0);toast.error((e as Error).message);}finally{setAnalisando(false);}
  }
  async function buscarClientes(){
    setAnalisando(true);
    try{let cursor='00000000-0000-0000-0000-000000000000';const rows:typeof clientesFonte=[];
      for(;;){const {data,error}=await db.rpc('paralelo_clientes_fontes',{p_cursor:cursor});if(error)throw error;
        const page=data as unknown as typeof clientesFonte;rows.push(...page.slice(0,200));if(page.length<=200)break;cursor=page[199].id;}
      setClientesFonte(rows.map(c=>({...c,cnpj:normalizarCnpjParalelo(c.cnpj)})));
    }catch(e){toast.error((e as Error).message);}finally{setAnalisando(false);}
  }
  async function carregarHistorico(cursor:number|null=null){
    let q=db.from('paralelo_historico').select('*').order('id',{ascending:false}).limit(51);
    if(cursor!==null)q=q.lt('id',cursor);
    const {data,error}=await q;if(error){toast.error(error.message);return;}
    setHistoricoRows(data?.slice(0,50)||[]);setHistMore((data?.length||0)>50);setHistoricoCursor(data?.[49]?.id||null);setHistorico(true);
  }
  async function carregarEntradas(limpar=true) {
    if(!allowed) return;
    setEntradasLoading(true);
    try {
      let q=db.from('paralelo_entradas').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(201);
      if(clienteId) q=q.eq('cnpj',clientes.find(c=>c.id===clienteId)?.cnpj||'');
      const cursor=limpar?null:entradasCursor;
      if(cursor) q=q.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      const {data,error}=await q;
      if(error) throw error;
      const rows=(data||[]).slice(0,200) as unknown as EntradaParalela[];
      setEntradas(atuais=>limpar?rows:[...atuais,...rows]);
      setEntradasCursor(rows.length?rows[rows.length-1]:cursor);
      setEntradasMore((data?.length||0)>200);
    } catch(e) { toast.error((e as Error).message); }
    finally { setEntradasLoading(false); }
  }
  // O cliente e a aba definem uma nova consulta; o cursor só é usado por "Carregar mais".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(tab==='entradas'&&allowed) void carregarEntradas(true);},[tab,clienteId,allowed]);
  const grupos=agruparFontes(fontes);
  const gruposEntradas=agruparFontes(entradas.map(fonteDeEntrada).filter((f):f is FonteParalela=>f!==null));
  function revisarSugestao(g:typeof grupos[number]) {
    const c=clientes.find(c=>c.cnpj===g.cnpj);
    const r=regioes.find(r=>r.cliente_id===c?.id && r.cidades.some(x=>x.nome.toLocaleLowerCase('pt-BR')===g.cidade.toLocaleLowerCase('pt-BR') && x.uf===g.uf));
    if(!c||!r){toast.error('Cadastre o cliente e a região desta cidade primeiro');return;}
    const sugestao=sugerirComponentes(g.fontes),f=g.fontes[0];
    setClienteId(c.id);
    setTarifaForm({...tarifaVazia(r.id),status:'sugerida',componentes:sugestao.componentes,fiscal:{...vazioFiscal,cfop:f.cfop||'',cst:f.icms?.CST||'',aliquota:f.icms?.pICMS||'',uf_fim:f.uf_fim||''},observacao:`SUGESTÃO A CONFERIR — ${g.fontes.length} CT-es: ${g.fontes.map(x=>x.numero_cte).join(', ')}. Bases estimadas por inversão das quantidades declaradas (pedágio com arredondamento para 100 kg). Não confirma contrato, mínimo, impostos embutidos nem fator de cubagem. ${sugestao.pendencias.join('; ')}`});
  }
  function revisarRegiaoEntrada(e:EntradaParalela) {
    const c=clientes.find(c=>c.cnpj===e.cnpj);
    if(!c){toast.error('Atualize os cadastros para revisar o novo cliente');return;}
    setClienteId(c.id);
    abrirRegiao({...regiaoVazia(c.id),nome:e.cidade,cidades:[{nome:e.cidade,uf:e.uf}],observacao:`Documento ${e.tipo} ${e.documento||e.fonte_id}, recebido em ${new Date(e.created_at).toLocaleString('pt-BR')}.`});
  }
  function sugerirTarifaEntrada(e:EntradaParalela) {
    const g=gruposEntradas.find(g=>g.cnpj===e.cnpj&&g.cidade===e.cidade&&g.uf===e.uf);
    if(!g){toast.error('Este CT-e não possui dados suficientes para análise');return;}
    revisarSugestao(g);
  }
  if(authLoading) return <div className="p-6"><Loader2 className="animate-spin"/></div>;
  if(!allowed) return <div className="p-6 text-center"><LockKeyhole className="mx-auto mb-3"/><h1 className="text-xl font-semibold">{authError?'Não foi possível conferir o acesso':'Acesso restrito'}</h1></div>;
  return <MainLayout><div className="max-w-7xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold flex items-center gap-2"><LockKeyhole className="h-6 w-6"/>Cadastro Paralelo</h1><Badge variant="outline" className="mt-2">Exclusivo • Anderson</Badge></div><Button variant="outline" onClick={()=>carregarHistorico()}><History className="mr-2 h-4 w-4"/>Histórico</Button></header>
    {query.error && <div role="alert" className="text-destructive">Não foi possível carregar os cadastros. <Button variant="outline" onClick={()=>query.refetch()}>Tentar novamente</Button></div>}
    {query.isLoading ? <Loader2 className="animate-spin"/> : <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="clientes">Clientes ({clientes.length})</TabsTrigger><TabsTrigger value="entradas">Entradas novas</TabsTrigger><TabsTrigger value="regioes">Regiões e cidades</TabsTrigger><TabsTrigger value="tarifas">Tarifas e fiscal</TabsTrigger><TabsTrigger value="fontes">Analisar CT-es</TabsTrigger></TabsList>
      <TabsContent value="clientes" className="space-y-4"><div className="flex flex-wrap gap-2"><Button onClick={()=>setClienteForm(clienteVazio())}><Plus className="mr-2 h-4 w-4"/>Novo cliente</Button><Button variant="outline" disabled={analisando} onClick={buscarClientes}><Search className="mr-2 h-4 w-4"/>Buscar clientes existentes</Button></div>
        <Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>CNPJ</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{clientes.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{numeric:true})).map(c=><TableRow key={c.id}><TableCell className="font-medium">{c.nome}</TableCell><TableCell>{c.cnpj}</TableCell><TableCell>{c.ativo?'Ativo':'Inativo'}</TableCell><TableCell className="flex gap-2"><Button size="icon" variant="ghost" aria-label={`Editar ${c.nome}`} title="Editar cliente" onClick={()=>setClienteForm(c)}><Pencil className="h-4 w-4"/></Button><Button variant="outline" size="sm" onClick={()=>{setClienteId(c.id);setTab('regioes');}}>Regiões</Button></TableCell></TableRow>)}</TableBody></Table>
        {!clientes.length && <p className="text-muted-foreground py-8">Nenhum cliente cadastrado.</p>}
        {clientesFonte.length>0 && <section className="border-t pt-4"><h2 className="font-semibold mb-3">Clientes encontrados</h2><div className="space-y-2">{clientesFonte.filter(c=>!clientes.some(x=>x.cnpj===c.cnpj)).map(c=><div key={c.id} className="flex flex-wrap items-center justify-between border-b py-2 gap-2"><span>{c.nome_fantasia||c.razao_social} • {c.cnpj}</span><Button variant="outline" onClick={()=>setClienteForm({...clienteVazio(),cnpj:c.cnpj,nome:c.nome_fantasia||c.razao_social})}><Copy className="h-4 w-4 mr-2"/>Revisar cadastro</Button></div>)}</div></section>}
      </TabsContent>
      {(tab==='regioes'||tab==='tarifas') && <div className="my-4 max-w-lg"><Campo nome="Cliente"><Select value={clienteId} onValueChange={setClienteId}><SelectTrigger><SelectValue placeholder="Selecione o cliente"/></SelectTrigger><SelectContent>{clientes.map(c=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></Campo></div>}
      <TabsContent value="regioes" className="space-y-4"><Button disabled={!clienteId} onClick={()=>abrirRegiao(regiaoVazia(clienteId))}><Plus className="mr-2 h-4 w-4"/>Nova região</Button><Table><TableHeader><TableRow><TableHead>Região</TableHead><TableHead>Cidades</TableHead><TableHead>Lead time</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{regs.map(r=><TableRow key={r.id}><TableCell className="font-medium">{r.nome}</TableCell><TableCell className="max-w-md whitespace-normal">{r.cidades.map(c=>`${c.nome}/${c.uf}`).join(', ')||'—'}</TableCell><TableCell>{r.lead_time===null?'Não informado':`${r.lead_time} dias ${r.calendario==='corridos'?'corridos':'úteis RJ'}`}</TableCell><TableCell>{r.ativo?'Ativa':'Inativa'}</TableCell><TableCell><Button size="icon" variant="ghost" title="Editar região" aria-label={`Editar ${r.nome}`} onClick={()=>abrirRegiao(r)}><Pencil className="h-4 w-4"/></Button></TableCell></TableRow>)}</TableBody></Table>{!regs.length&&<p className="text-muted-foreground py-8">{clienteId?'Nenhuma região cadastrada.':'Selecione um cliente.'}</p>}</TabsContent>
      <TabsContent value="tarifas" className="space-y-4"><Button disabled={!regs.length} onClick={()=>setTarifaForm(tarifaVazia(regs[0]?.id||''))}><Plus className="mr-2 h-4 w-4"/>Nova tarifa</Button><Table><TableHeader><TableRow><TableHead>Região</TableHead><TableHead>Vigência</TableHead><TableHead>Componentes</TableHead><TableHead>Fiscal</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{tarifas.filter(t=>regs.some(r=>r.id===t.regiao_id)).sort((a,b)=>b.vigente_de.localeCompare(a.vigente_de)).map(t=><TableRow key={t.id}><TableCell>{regs.find(r=>r.id===t.regiao_id)?.nome}<Badge variant="outline" className="ml-2">{t.status==='sugerida'?'Sugerida':'Revisada'}</Badge></TableCell><TableCell>{t.vigente_de.split('-').reverse().join('/')} — {t.vigente_ate?.split('-').reverse().join('/')||'Sem fim'}</TableCell><TableCell className="whitespace-normal max-w-md">{t.componentes.map(c=>`${c.nome}: ${c.valor} ${basesParalelas.find(([b])=>b===c.base)?.[1]||c.base}`).join(' · ')}{t.faixas.length>0&&` • ${t.faixas.length} faixas`}</TableCell><TableCell>CFOP {t.fiscal.cfop||'—'} • CST {t.fiscal.cst||'—'} • {t.fiscal.aliquota||'—'}%</TableCell><TableCell><Button size="icon" variant="ghost" title="Revisar e criar nova versão" aria-label="Nova versão da tarifa" onClick={()=>setTarifaForm({...t,id:'',vigente_de:hoje()})}><Copy className="h-4 w-4"/></Button></TableCell></TableRow>)}</TableBody></Table></TabsContent>
      <TabsContent value="entradas" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">Somente documentos recebidos a partir de 11/11/2026</h2><p className="text-sm text-muted-foreground">Nenhum documento antigo foi copiado. Regiões e tarifas continuam sujeitas à sua revisão; CT-e com mais de um cliente não é atribuído automaticamente.</p></div><Button variant="outline" disabled={entradasLoading} onClick={()=>{void carregarEntradas(true);void reload();}}>{entradasLoading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Search className="mr-2 h-4 w-4"/>}Atualizar</Button></div>
        <div className="max-w-lg"><Campo nome="Filtrar por cliente"><Select value={clienteId||'todos'} onValueChange={v=>setClienteId(v==='todos'?'':v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todos">Todos os clientes</SelectItem>{clientes.map(c=><SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent></Select></Campo></div>
        <div className="flex flex-wrap gap-2"><Badge variant="secondary">{entradas.filter(e=>e.tipo==='NF').length} NFs carregadas</Badge><Badge variant="outline">{entradas.filter(e=>e.tipo==='CTE').length} CT-es carregados</Badge></div>
        <Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Cliente / cidade</TableHead><TableHead>Documento</TableHead><TableHead>Recebido em</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{entradas.map(e=><TableRow key={e.id}><TableCell><Badge variant="outline">{e.tipo}</Badge></TableCell><TableCell className="whitespace-normal max-w-sm"><span className="font-medium">{e.cliente}</span><div>{e.cidade}/{e.uf}</div></TableCell><TableCell>{e.documento||'—'}{e.data_documento&&<div className="text-sm text-muted-foreground">{e.data_documento.split('-').reverse().join('/')}</div>}</TableCell><TableCell>{new Date(e.created_at).toLocaleString('pt-BR')}</TableCell><TableCell><div className="flex flex-wrap gap-2">{e.tipo==='CTE'&&<><Button size="sm" variant="outline" onClick={()=>setEvidencia(fonteDeEntrada(e))}>Ver CT-e</Button><Button size="sm" variant="outline" onClick={()=>sugerirTarifaEntrada(e)}>Sugerir tarifa</Button></>}<Button size="sm" variant="outline" onClick={()=>revisarRegiaoEntrada(e)}>Revisar região</Button></div></TableCell></TableRow>)}</TableBody></Table>
        {!entradasLoading&&!entradas.length&&<p className="py-8 text-muted-foreground">Nenhuma NF ou CT-e novo entrou desde a ativação. Os próximos documentos aparecerão aqui automaticamente.</p>}
        {entradasLoading&&entradas.length>0&&<Loader2 className="animate-spin"/>}
        {entradasMore&&<Button variant="outline" disabled={entradasLoading} onClick={()=>carregarEntradas(false)}><Plus className="mr-2 h-4 w-4"/>Carregar mais</Button>}
      </TabsContent>
      <TabsContent value="fontes" className="space-y-4"><div className="flex flex-wrap gap-3 items-end"><Campo nome="De"><Input type="date" value={inicio} onChange={e=>setInicio(e.target.value)}/></Campo><Campo nome="Até"><Input type="date" value={fim} onChange={e=>setFim(e.target.value)}/></Campo><Button onClick={analisar} disabled={analisando}>{analisando?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Search className="mr-2 h-4 w-4"/>}Analisar CT-es</Button></div>
        {parcial&&<div role="alert" className="text-destructive">Consulta parcial: o tempo de consulta foi atingido. Reduza o período para conferir todos os CT-es.</div>}
        {analisado&&<div className="flex flex-wrap gap-3"><Badge variant="secondary">{fontes.length} CT-es com detalhes</Badge><Badge variant="outline">{grupos.length} combinações cliente/cidade</Badge><Badge variant="outline">{fontes.filter(f=>new Set(f.notas?.map(n=>n.cnpj_emitente)||[]).size!==1).length} sem cliente único</Badge></div>}
        <Table><TableHeader><TableRow><TableHead>Cliente / cidade</TableHead><TableHead>Amostras</TableHead><TableHead>Componentes encontrados</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{grupos.map(g=><TableRow key={`${g.cnpj}/${g.cidade}/${g.uf}`}><TableCell className="whitespace-normal max-w-sm"><span className="font-medium">{g.cliente}</span><div>{g.cidade}/{g.uf}</div></TableCell><TableCell>{g.fontes.length}</TableCell><TableCell className="whitespace-normal max-w-xs">{[...new Set(g.fontes.flatMap(f=>f.componentes.map(c=>c.nome)))].join(', ')||'Sem componentes'}</TableCell><TableCell><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>setEvidencia(g.fontes[0])}>Ver CT-e</Button><Button size="sm" variant="outline" onClick={()=>{const c=clientes.find(c=>c.cnpj===g.cnpj);if(!c){setClienteForm({...clienteVazio(),cnpj:g.cnpj,nome:g.cliente});return;}setClienteId(c.id);abrirRegiao({...regiaoVazia(c.id),nome:g.cidade,cidades:[{nome:g.cidade,uf:g.uf}]});}}>Revisar região</Button><Button size="sm" variant="outline" onClick={()=>revisarSugestao(g)}>Sugerir tarifa</Button></div></TableCell></TableRow>)}</TableBody></Table>
        {analisado&&!fontes.length&&<p className="text-muted-foreground">Nenhum CT-e com componentes guardados neste período.</p>}
      </TabsContent>
    </Tabs>}
    <Dialog open={Boolean(clienteForm)} onOpenChange={o=>{if(!o&&!saving)setClienteForm(null);}}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{clienteForm?.id?'Editar cliente':'Novo cliente'}</DialogTitle></DialogHeader>{clienteForm&&<div className="space-y-4"><Campo nome="Nome"><Input value={clienteForm.nome} onChange={e=>setClienteForm({...clienteForm,nome:e.target.value})}/></Campo><Campo nome="CNPJ"><Input value={clienteForm.cnpj} onChange={e=>setClienteForm({...clienteForm,cnpj:e.target.value.replace(/\D/g,'')})} maxLength={14}/></Campo><h3 className="font-semibold">Parâmetros fiscais</h3><FiscalCampos value={clienteForm.fiscal} change={fiscal=>setClienteForm({...clienteForm,fiscal})}/><Campo nome="Observação"><Textarea value={clienteForm.observacao} onChange={e=>setClienteForm({...clienteForm,observacao:e.target.value})}/></Campo><Label className="flex items-center gap-2"><Checkbox checked={clienteForm.ativo} onCheckedChange={v=>setClienteForm({...clienteForm,ativo:v===true})}/>Ativo</Label></div>}<DialogFooter><Button disabled={saving} onClick={()=>salvar('cliente')}><Save className="mr-2 h-4 w-4"/>Salvar cliente</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(regiaoForm)} onOpenChange={o=>{if(!o&&!saving)setRegiaoForm(null);}}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{regiaoForm?.id?'Editar região':'Nova região'}</DialogTitle></DialogHeader>{regiaoForm&&<div className="space-y-4"><Campo nome="Nome da região"><Input value={regiaoForm.nome} onChange={e=>setRegiaoForm({...regiaoForm,nome:e.target.value})}/></Campo><Campo nome="Cidades (Cidade/UF, uma por linha)"><Textarea rows={6} value={cidadesTexto} onChange={e=>setCidadesTexto(e.target.value)} placeholder="Campos dos Goytacazes/RJ"/></Campo><div className="grid grid-cols-2 gap-3"><Campo nome="Lead time (dias)"><Input type="number" min={0} step={1} value={regiaoForm.lead_time??''} onChange={e=>setRegiaoForm({...regiaoForm,lead_time:e.target.value===''?null:Number(e.target.value)})}/></Campo><Campo nome="Calendário"><Select value={regiaoForm.calendario} onValueChange={calendario=>setRegiaoForm({...regiaoForm,calendario})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="uteis_rj">Dias úteis RJ</SelectItem><SelectItem value="corridos">Dias corridos</SelectItem></SelectContent></Select></Campo></div><Campo nome="Observação"><Textarea value={regiaoForm.observacao} onChange={e=>setRegiaoForm({...regiaoForm,observacao:e.target.value})}/></Campo><Label className="flex gap-2 items-center"><Checkbox checked={regiaoForm.ativo} onCheckedChange={v=>setRegiaoForm({...regiaoForm,ativo:v===true})}/>Ativa</Label></div>}<DialogFooter><Button disabled={saving} onClick={()=>salvar('regiao')}><Save className="mr-2 h-4 w-4"/>Salvar região</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(tarifaForm)} onOpenChange={o=>{if(!o&&!saving)setTarifaForm(null);}}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Nova versão de tarifa</DialogTitle></DialogHeader>{tarifaForm&&<div className="space-y-5"><Campo nome="Região"><Select value={tarifaForm.regiao_id} onValueChange={regiao_id=>setTarifaForm({...tarifaForm,regiao_id})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{regs.map(r=><SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent></Select></Campo><div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><Campo nome="Vigente de"><Input type="date" value={tarifaForm.vigente_de} onChange={e=>setTarifaForm({...tarifaForm,vigente_de:e.target.value})}/></Campo><Campo nome="Vigente até"><Input type="date" value={tarifaForm.vigente_ate||''} onChange={e=>setTarifaForm({...tarifaForm,vigente_ate:e.target.value||null})}/></Campo><Campo nome="Cubagem (kg/m³)"><Input type="number" min={0} value={tarifaForm.fator_cubagem??''} onChange={e=>setTarifaForm({...tarifaForm,fator_cubagem:e.target.value===''?null:Number(e.target.value)})}/></Campo></div><FiscalCampos value={tarifaForm.fiscal} change={fiscal=>setTarifaForm({...tarifaForm,fiscal})}/>
      <section className="border-t pt-4 space-y-3"><div className="flex justify-between items-center"><h3 className="font-semibold">Frete e generalidades</h3><Button size="sm" variant="outline" onClick={()=>setTarifaForm({...tarifaForm,componentes:[...tarifaForm.componentes,{nome:'',base:'fixo',valor:0,embutido:false}]})}><Plus className="mr-1 h-4 w-4"/>Componente</Button></div>{tarifaForm.componentes.map((c,i)=><div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_110px_auto_auto] items-end gap-2"><Campo nome="Nome"><Input value={c.nome} onChange={e=>setTarifaForm({...tarifaForm,componentes:tarifaForm.componentes.map((x,j)=>j===i?{...x,nome:e.target.value}:x)})}/></Campo><Campo nome="Base"><Select value={c.base} onValueChange={base=>setTarifaForm({...tarifaForm,componentes:tarifaForm.componentes.map((x,j)=>j===i?{...x,base}:x)})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{basesParalelas.map(([b,n])=><SelectItem key={b} value={b}>{n}</SelectItem>)}</SelectContent></Select></Campo><Campo nome="Valor"><Input type="number" min={0} step="any" value={c.valor} onChange={e=>setTarifaForm({...tarifaForm,componentes:tarifaForm.componentes.map((x,j)=>j===i?{...x,valor:Number(e.target.value)}:x)})}/></Campo><Label className="flex items-center gap-2 h-10"><Checkbox checked={c.embutido} onCheckedChange={v=>setTarifaForm({...tarifaForm,componentes:tarifaForm.componentes.map((x,j)=>j===i?{...x,embutido:v===true}:x)})}/>Embutido</Label><Button variant="ghost" size="icon" aria-label="Remover componente" onClick={()=>setTarifaForm({...tarifaForm,componentes:tarifaForm.componentes.filter((_,j)=>j!==i)})}><X className="h-4 w-4"/></Button></div>)}</section>
      <section className="border-t pt-4 space-y-3"><div className="flex justify-between items-center"><h3 className="font-semibold">Faixas de peso cubado (kg) • R$/CT-e</h3><Button variant="outline" size="sm" onClick={()=>setTarifaForm({...tarifaForm,faixas:[...tarifaForm.faixas,{de:0,ate:null,valor:0}]})}><Plus className="mr-1 h-4 w-4"/>Faixa</Button></div>{tarifaForm.faixas.map((f,i)=><div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">{(['de','ate','valor'] as const).map(k=><Campo key={k} nome={{de:'De (inclusive)',ate:'Até (exclusive)',valor:'Valor (R$)'}[k]}><Input type="number" min={0} step="any" value={f[k]??''} onChange={e=>setTarifaForm({...tarifaForm,faixas:tarifaForm.faixas.map((x,j)=>j===i?{...x,[k]:k==='ate'&&e.target.value===''?null:Number(e.target.value)}:x)})}/></Campo>)}<Button size="icon" variant="ghost" aria-label="Remover faixa" onClick={()=>setTarifaForm({...tarifaForm,faixas:tarifaForm.faixas.filter((_,j)=>j!==i)})}><X className="h-4 w-4"/></Button></div>)}</section><Label className="flex gap-2 items-center"><Checkbox checked={tarifaForm.status==='aprovada'} onCheckedChange={v=>setTarifaForm({...tarifaForm,status:v===true?'aprovada':'sugerida'})}/>Parâmetros revisados e aprovados</Label><Campo nome="Observação / referência Praxio"><Textarea value={tarifaForm.observacao} onChange={e=>setTarifaForm({...tarifaForm,observacao:e.target.value})}/></Campo></div>}<DialogFooter><Button disabled={saving} onClick={()=>salvar('tarifa')}><Save className="mr-2 h-4 w-4"/>Salvar nova versão</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(evidencia)} onOpenChange={o=>{if(!o)setEvidencia(null);}}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>CT-e {evidencia?.numero_cte} • Praxio</DialogTitle></DialogHeader>{evidencia&&<div className="space-y-4"><div className="text-sm break-all">{evidencia.chave_cte}</div><div>{evidencia.municipio_fim}/{evidencia.uf_fim} • {moeda(evidencia.valor_total_prestacao)}</div><Badge variant="outline">Valores do documento — base tarifária não confirmada</Badge><Table><TableHeader><TableRow><TableHead>Componente</TableHead><TableHead>Valor no CT-e</TableHead></TableRow></TableHeader><TableBody>{evidencia.componentes.map((c,i)=><TableRow key={i}><TableCell>{c.nome}</TableCell><TableCell>{moeda(c.valor)}</TableCell></TableRow>)}</TableBody></Table><div className="text-sm">CFOP {evidencia.cfop} • CST {evidencia.icms?.CST||'—'} • ICMS {evidencia.icms?.pICMS||'—'}%</div><Table><TableBody>{evidencia.quantidades.map((q,i)=><TableRow key={i}><TableCell>{q.tipo}</TableCell><TableCell>Unidade {q.unidade}</TableCell><TableCell>{q.quantidade}</TableCell></TableRow>)}</TableBody></Table><Button variant="outline" onClick={()=>{const c=clientes.find(c=>c.cnpj===evidencia.notas?.[0]?.cnpj_emitente);if(!c){toast.error('Cadastre o cliente primeiro');return;}setClienteForm({...c,fiscal:{...c.fiscal,cfop:evidencia.cfop||'',cst:evidencia.icms?.CST||'',aliquota:evidencia.icms?.pICMS||'',uf_fim:evidencia.uf_fim||''}});setEvidencia(null);}}>Revisar parâmetros fiscais do cliente</Button></div>}</DialogContent></Dialog>
    <Dialog open={historico} onOpenChange={setHistorico}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Histórico dos cadastros paralelos</DialogTitle></DialogHeader><div className="space-y-3">{historicoRows.map(h=><details key={h.id} className="border-b pb-3"><summary className="cursor-pointer text-sm">{new Date(h.created_at).toLocaleString('pt-BR')} • {h.tabela.replace('paralelo_','')} • {h.acao} • {h.autor?'Anderson':'Sistema'}</summary><pre className="text-xs whitespace-pre-wrap break-all mt-2">{JSON.stringify({antes:h.antes,depois:h.depois},null,2)}</pre></details>)}</div><DialogFooter><Button variant="outline" onClick={()=>carregarHistorico()}>Mais recentes</Button>{histMore&&<Button variant="outline" onClick={()=>carregarHistorico(historicoCursor)}>Anteriores</Button>}</DialogFooter></DialogContent></Dialog>
  </div></MainLayout>;
}