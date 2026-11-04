import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, ExternalLink, Check, X } from "lucide-react";

type Fonte = { id: string; nome: string; tema: string; url: string; ativo: boolean; ultima_verificacao: string | null; ultima_mudanca: string | null; ultimo_erro: string | null };
type Alerta = { id: string; fonte_id: string; detectado_em: string; titulo: string; resumo: string; impacto: string | null; regras_afetadas: string[]; relevancia: string; trecho: string | null; status: string; observacao: string | null; decidido_em: string | null };

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export default function MonitorFiscal() {
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [filtro, setFiltro] = useState<"pendente" | "todos">("pendente");
  const [obs, setObs] = useState<Record<string, string>>({});
  const [rodando, setRodando] = useState(false);

  const carregar = async () => {
    const [f, a] = await Promise.all([
      supabase.from("fiscal_monitor_fontes").select("id,nome,tema,url,ativo,ultima_verificacao,ultima_mudanca,ultimo_erro").order("nome"),
      (() => { let q = supabase.from("fiscal_monitor_alertas").select("*").order("detectado_em", { ascending: false }).limit(200); if (filtro === "pendente") q = q.eq("status", "pendente"); return q; })(),
    ]);
    if (f.error || a.error) toast.error("Erro ao carregar o monitor");
    setFontes((f.data as Fonte[]) ?? []);
    setAlertas((a.data as Alerta[]) ?? []);
  };
  useEffect(() => { carregar(); }, [filtro]);

  const verificarAgora = async () => {
    setRodando(true);
    const { data, error } = await supabase.functions.invoke("fiscal-monitor", { body: {} });
    setRodando(false);
    if (error) return toast.error("Falha na verificação");
    toast.success(`${data.verificadas} fontes verificadas, ${data.alertas} alerta(s) novo(s)`);
    carregar();
  };

  const decidir = async (id: string, status: "aprovado" | "descartado") => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("fiscal_monitor_alertas").update({ status, observacao: obs[id] || null, decidido_por: u.user?.id, decidido_em: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error("Não foi possível salvar");
    toast.success(status === "aprovado" ? "Alerta aprovado para ajuste da regra" : "Alerta descartado");
    carregar();
  };

  const alternarFonte = async (f: Fonte) => {
    await supabase.from("fiscal_monitor_fontes").update({ ativo: !f.ativo }).eq("id", f.id);
    carregar();
  };

  const nomeFonte = (id: string) => fontes.find((f) => f.id === id);
  const corRel = (r: string): "destructive" | "default" | "secondary" => (r === "alta" ? "destructive" : r === "media" ? "default" : "secondary");

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monitor Fiscal e Tributário</h1>
          <p className="text-sm text-muted-foreground">Verifica fontes oficiais todo dia útil às 7h. Nenhuma regra muda sozinha: cada alerta precisa de aprovação.</p>
        </div>
        <Button onClick={verificarAgora} disabled={rodando}>
          {rodando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Verificar agora
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Alertas</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant={filtro === "pendente" ? "default" : "outline"} onClick={() => setFiltro("pendente")}>Pendentes</Button>
            <Button size="sm" variant={filtro === "todos" ? "default" : "outline"} onClick={() => setFiltro("todos")}>Histórico</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {alertas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum alerta {filtro === "pendente" ? "pendente" : "registrado"}.</p>}
          {alertas.map((a) => {
            const f = nomeFonte(a.fonte_id);
            return (
              <div key={a.id} className="rounded-md border p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={corRel(a.relevancia)}>{a.relevancia}</Badge>
                  <span className="font-semibold">{a.titulo}</span>
                  <Badge variant="outline">{a.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {dt(a.detectado_em)} · {f?.nome}{" "}
                  {f && <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">fonte <ExternalLink className="h-3 w-3" /></a>}
                </p>
                <p className="text-sm">{a.resumo}</p>
                {a.impacto && <p className="text-sm"><strong>Impacto:</strong> {a.impacto}</p>}
                {a.regras_afetadas?.length > 0 && <div className="flex flex-wrap gap-1">{a.regras_afetadas.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}</div>}
                {a.trecho && <details className="text-xs"><summary className="cursor-pointer">Texto novo na fonte</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap bg-muted p-2">{a.trecho}</pre></details>}
                {a.status === "pendente" ? (
                  <div className="space-y-2">
                    <Textarea placeholder="Observação (opcional)" value={obs[a.id] ?? ""} onChange={(e) => setObs({ ...obs, [a.id]: e.target.value })} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => decidir(a.id, "aprovado")}><Check className="mr-1 h-4 w-4" />Aprovar ajuste</Button>
                      <Button size="sm" variant="outline" onClick={() => decidir(a.id, "descartado")}><X className="mr-1 h-4 w-4" />Descartar</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Decidido em {dt(a.decidido_em)}{a.observacao ? ` — ${a.observacao}` : ""}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fontes monitoradas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {fontes.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
              <div>
                <div className="font-medium">{f.nome} <Badge variant="outline">{f.tema}</Badge></div>
                <div className="text-xs text-muted-foreground">Última verificação: {dt(f.ultima_verificacao)} · Última mudança: {dt(f.ultima_mudanca)}</div>
                {f.ultimo_erro && <div className="text-xs text-destructive">Erro: {f.ultimo_erro}</div>}
              </div>
              <Button size="sm" variant="outline" onClick={() => alternarFonte(f)}>{f.ativo ? "Pausar" : "Ativar"}</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
