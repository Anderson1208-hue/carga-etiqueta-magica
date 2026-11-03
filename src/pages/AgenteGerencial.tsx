import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, FileText, FileSpreadsheet, ClipboardList, LockKeyhole, Copy, Check } from 'lucide-react';
import { z } from 'zod';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Tool, ToolHeader, ToolContent } from '@/components/ai-elements/tool';
import { useAgenteGerencial } from '@/hooks/useAgenteGerencial';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { exportReport, textOf, type AgentMessage, type AgentThread, type Report } from '@/lib/agente-gerencial';
import logo from '@/assets/agente-gerencial.jpg';
import { toast } from 'sonner';

function ReportView({ report }: {report: Report}) {
  const [expanded,setExpanded] = useState(false);
  const [exporting,setExporting] = useState(false);
  const columns = Array.from(new Set(report.rows.flatMap(Object.keys)));
  async function download(format:'pdf'|'excel') {
    setExporting(true);
    try { await exportReport(report,format); } catch {toast.error('Não foi possível gerar o arquivo');} finally {setExporting(false);}
  }
  return <section className="my-4 border-y border-border py-4 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <ClipboardList className="h-5 w-5 text-primary"/><h3 className="font-semibold flex-1 min-w-0 break-words">{report.title}</h3>
      <Button variant="outline" size="sm" disabled={exporting} onClick={()=>download('pdf')}><FileText/>PDF</Button>
      <Button variant="outline" size="sm" disabled={exporting} onClick={()=>download('excel')}><FileSpreadsheet/>Excel</Button>
    </div>
    <p className="text-xs text-muted-foreground">{report.catalog?'Catálogo atual — sem filtro de período':`${report.period.inicio} a ${report.period.fim}`} · {report.rows.length} registros · {report.complete ? 'Completo' : 'Parcial — refine os filtros'} · {new Date(report.generatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">{Object.entries(report.totals).map(([k,v])=><div key={k}><span className="text-muted-foreground">{k.replace(/_/g,' ')}: </span><strong>{v.toLocaleString('pt-BR',{maximumFractionDigits:3})}</strong></div>)}</div>
    {Object.keys(report.missing).length>0 && <p className="text-sm text-destructive">Dados ausentes: {Object.entries(report.missing).map(([k,v])=>`${k}: ${v}`).join(' · ')}</p>}
    <Button variant="ghost" size="sm" onClick={()=>setExpanded(!expanded)}>{expanded?'Recolher dados':'Ver dados'}</Button>
    {expanded && <div className="max-h-96 overflow-auto border rounded-md"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr>{columns.map(c=><th key={c} className="px-3 py-2 text-left whitespace-nowrap">{c.replace(/_/g,' ')}</th>)}</tr></thead><tbody>{report.rows.slice(0,200).map((r,i)=><tr key={i} className="border-t">{columns.map(c=><td key={c} className="px-3 py-2 whitespace-nowrap">{String(r[c]??'—')}</td>)}</tr>)}</tbody></table>{report.rows.length>200&&<p className="p-3 text-muted-foreground">Exibindo 200 registros. O arquivo contém todos os registros consultados.</p>}</div>}
  </section>;
}

function AgentConversation({ threadId,onUpdate }: {threadId:string;onUpdate:()=>void}) {
  const [messages,setMessages] = useState<AgentMessage[]>([]);
  const [status,setStatus] = useState<'ready'|'submitted'|'streaming'|'error'>('ready');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [text,setText] = useState('');
  const [copied,setCopied] = useState<string>();
  const abort = useRef<AbortController>();
  const root = useRef<HTMLDivElement>(null);
  const focus = () => root.current?.querySelector('textarea')?.focus();
  useEffect(()=>{
    let live=true;
    supabase.from('agente_gerencial_mensagens').select('id,role,parts').eq('conversa_id',threadId).order('created_at').order('id').then(({data,error})=>{
      if(!live)return;
      if(error)setError('Não foi possível carregar esta conversa');
      else setMessages((data??[]).map(m=>({id:m.id,role:m.role==='user'?'user':'assistant',parts:m.parts as AgentMessage['parts']})));
      setLoading(false);setTimeout(focus,50);
    });
    return()=>{live=false;abort.current?.abort();};
  },[threadId]);
  async function send(input:{text:string}) {
    const parsed = z.string().trim().min(1).max(4000).safeParse(input.text);
    if(!parsed.success||status==='submitted'||status==='streaming')return;
    const requestText=parsed.data;
    setText('');setError('');setStatus('submitted');
    const assistantId=crypto.randomUUID();
    setMessages(m=>[...m,{id:crypto.randomUUID(),role:'user',parts:[{type:'text',text:requestText}]},{id:assistantId,role:'assistant',parts:[]}]);
    focus();
    abort.current=new AbortController();
    let done=false;
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw new Error('Entre na sua conta novamente');
      const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agente-gerencial`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({conversa_id:threadId,text:requestText}),signal:abort.current.signal});
      if(!response.ok){const body=await response.json();throw new Error(body.error??'Não foi possível consultar');}
      if(!response.body)throw new Error('Resposta indisponível');
      const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
      const update=(fn:(msg:AgentMessage)=>AgentMessage)=>setMessages(m=>m.map(msg=>msg.id===assistantId?fn(msg):msg));
      while(true){
        const chunk=await reader.read();if(chunk.done)break;
        buffer+=decoder.decode(chunk.value,{stream:true});
        let separator=buffer.indexOf('\n\n');
        while(separator>=0){
          const frame=buffer.slice(0,separator);buffer=buffer.slice(separator+2);separator=buffer.indexOf('\n\n');
          const line=frame.split('\n').find(l=>l.startsWith('data: '));if(!line)continue;
          const event=JSON.parse(line.slice(6));
          if(event.type==='error')throw new Error(event.message);
          if(event.type==='text-delta') {setStatus('streaming');update(msg=>{const parts=[...msg.parts];const index=parts.findIndex(p=>p.type==='text');if(index>=0){const p=parts[index];if(p.type==='text')parts[index]={...p,text:p.text+event.delta};}else parts.push({type:'text',text:event.delta});return {...msg,parts};});}
          if(event.type==='tool-start')update(msg=>({...msg,parts:[...msg.parts,{type:'dynamic-tool',toolName:'consultar_relatorio',toolCallId:event.id,state:'input-available',input:event.input}]}));
          if(event.type==='report')update(msg=>({...msg,parts:[...msg.parts.map(p=>p.type==='dynamic-tool'&&p.toolCallId===event.id?{type:'dynamic-tool' as const,toolName:p.toolName,toolCallId:p.toolCallId,input:p.input??{},state:'output-available' as const,output:{registros:event.report.rows.length,completo:event.report.complete}}:p),{type:'data-report',data:event.report}]}));
          if(event.type==='done'){done=true;onUpdate();}
        }
      }
      if(!done)throw new Error('Resposta interrompida. Confira o histórico antes de solicitar novamente.');
      setStatus('ready');
    }catch(e){
      const message=e instanceof Error ? (e.name==='AbortError'?'Pedido interrompido; nenhuma alteração operacional foi feita.':e.message) : 'Erro ao consultar';
      setError(message);setText(requestText);setStatus('error');
      setMessages(m=>m.map(msg=>msg.id===assistantId?{...msg,parts:msg.parts.map(p=>p.type==='dynamic-tool'&&p.state==='input-available'?{type:'dynamic-tool' as const,toolName:p.toolName,toolCallId:p.toolCallId,input:p.input,state:'output-error' as const,errorText:message}:p)}:msg));
    }finally{focus();}
  }
  return <div ref={root} className="flex flex-col h-full min-h-0 min-w-0">
    <Conversation className="flex-1 min-h-0"><ConversationContent className="p-4 lg:px-8 gap-6">
      {loading?<Shimmer>Carregando conversa…</Shimmer>:messages.length===0?<div className="py-16 text-center"><img src={logo} alt="" width={96} height={96} className="mx-auto mb-5 rounded-md"/><h2 className="text-xl font-semibold">Nova consulta gerencial</h2></div>:messages.map(msg=><Message from={msg.role} key={msg.id} className="max-w-full">
        <MessageContent className={msg.role==='user'?'group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground max-w-[85%]':'w-full min-w-0'}>
          {msg.parts.map((part,i)=>part.type==='text'?<MessageResponse key={i}>{part.text}</MessageResponse>:part.type==='dynamic-tool'?<Tool key={i} defaultOpen={false}><ToolHeader type="dynamic-tool" toolName="consultar_relatorio" title="Consulta de dados" state={part.state}/><ToolContent><p className="text-sm">{JSON.stringify(part.input)}</p>{part.state==='output-error'?<p className="text-destructive">{part.errorText}</p>:<p className="text-sm">{part.state==='output-available'?'Dados consultados.':'Consulta em andamento.'}</p>}</ToolContent></Tool>:part.type==='data-report'?<ReportView key={i} report={part.data}/>:null)}
          {msg.role==='assistant'&&msg.parts.length===0&&status==='submitted'&&<Shimmer>Preparando consulta…</Shimmer>}
        </MessageContent>
        {msg.role==='assistant'&&textOf(msg)&&<Button variant="ghost" size="icon-sm" aria-label="Copiar resposta" title="Copiar resposta" onClick={async()=>{await navigator.clipboard.writeText(textOf(msg));setCopied(msg.id);}}>{copied===msg.id?<Check/>:<Copy/>}</Button>}
      </Message>)}
    </ConversationContent><ConversationScrollButton/></Conversation>
    {error&&<p role="alert" className="mx-4 mb-2 text-sm text-destructive">{error}</p>}
    <div className="border-t p-4 pb-20 lg:px-8"><PromptInput onSubmit={send} maxFiles={0} className="w-full">
      <PromptInputTextarea autoFocus aria-label="Pedido ao Agente Gerencial" placeholder="Solicite um relatório, informando período e critérios…" value={text} onChange={e=>setText(e.target.value)} maxLength={4000} disabled={loading} className="min-h-20 max-h-40"/>
      <PromptInputFooter className="justify-end"><PromptInputSubmit status={status} disabled={loading || (status!=='submitted'&&status!=='streaming'&&!text.trim())} onStop={()=>abort.current?.abort()} aria-label={status==='submitted'||status==='streaming'?'Interromper pedido':'Enviar pedido'}/></PromptInputFooter>
    </PromptInput></div>
  </div>;
}

export default function AgenteGerencial(){
  const {allowed,loading}=useAgenteGerencial();const {user}=useAuth();const {threadId}=useParams();const navigate=useNavigate();
  const [threads,setThreads]=useState<AgentThread[]>([]);const [creating,setCreating]=useState(false);
  const load=async()=>{const {data,error}=await supabase.from('agente_gerencial_conversas').select('id,titulo,updated_at').order('updated_at',{ascending:false}).order('id').limit(100);if(error)toast.error('Não foi possível carregar as conversas');else setThreads(data??[]);};
  useEffect(()=>{if(allowed)void load();},[allowed]);
  async function create(){if(!user||creating)return;setCreating(true);const {data,error}=await supabase.from('agente_gerencial_conversas').insert({user_id:user.id}).select('id').single();setCreating(false);if(error||!data){toast.error('Não foi possível abrir a conversa');return;}await load();navigate(`/agente-gerencial/${data.id}`);}
  if(loading)return <MainLayout><p>Verificando acesso…</p></MainLayout>;
  if(!allowed)return <MainLayout><div className="flex items-center gap-3"><LockKeyhole/><h1 className="text-xl">Acesso não autorizado</h1></div></MainLayout>;
  return <MainLayout><div className="flex flex-col h-[calc(100vh-3rem)] min-w-0">
    <header className="flex items-center gap-3 pb-4 border-b"><img src={logo} alt="" width={44} height={44} className="rounded-md"/><h1 className="text-2xl flex-1">Agente Gerencial</h1><span className="text-xs text-muted-foreground flex items-center gap-1"><LockKeyhole className="h-3 w-3"/>Somente consulta</span></header>
    <div className="flex flex-1 min-h-0">
      <aside className="w-56 shrink-0 border-r pr-3 pt-4 flex flex-col gap-3"><Button onClick={create} disabled={creating}><Plus/>Nova conversa</Button><nav aria-label="Conversas gerenciais" className="overflow-y-auto flex-1 space-y-1">{threads.map(t=><Button key={t.id} variant={threadId===t.id?'secondary':'ghost'} asChild className="w-full justify-start h-auto py-3 whitespace-normal text-left"><Link to={`/agente-gerencial/${t.id}`}><span className="line-clamp-2 break-words">{t.titulo}</span></Link></Button>)}</nav></aside>
      <div className="flex-1 min-w-0">{threadId?<AgentConversation key={threadId} threadId={threadId} onUpdate={()=>void load()}/>:<div className="h-full flex flex-col items-center justify-center gap-5"><img src={logo} alt="" width={128} height={128} className="rounded-md"/><h2 className="text-xl">Agente Gerencial</h2><Button onClick={create} disabled={creating}><Plus/>Nova conversa</Button></div>}</div>
    </div>
  </div></MainLayout>;
}