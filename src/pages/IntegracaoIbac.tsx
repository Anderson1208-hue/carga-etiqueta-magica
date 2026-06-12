import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RefreshCw, Send, AlertCircle, CheckCircle2, Clock, RotateCcw, Trash2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { IbacSaudePanel } from "@/components/ibac/IbacSaudePanel";
import { IbacAlertasPanel } from "@/components/ibac/IbacAlertasPanel";
import { IbacBackfillPanel } from "@/components/ibac/IbacBackfillPanel";
import { IbacEventoDetalheDialog } from "@/components/ibac/IbacEventoDetalheDialog";
import { IbacRetryPanel } from "@/components/ibac/IbacRetryPanel";
import { ImportarDeParaDialog } from "@/components/ibac/ImportarDeParaDialog";
import { IbacCanhotosPanel } from "@/components/ibac/IbacCanhotosPanel";

export default function IntegracaoIbac() {
  const { isAdmin, isLoading, profile } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("fila");
  const [detalheId, setDetalheId] = useState<string | null>(null);

  // Filtros da fila
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroEvento, setFiltroEvento] = useState<string>("todos");
  const [filtroBusca, setFiltroBusca] = useState<string>("");
  const [filtroDataIni, setFiltroDataIni] = useState<string>("");
  const [filtroDataFim, setFiltroDataFim] = useState<string>("");

  const { data: fila = [], refetch: refetchFila } = useQuery({
    queryKey: ["ibac-fila", filtroStatus, filtroEvento, filtroBusca, filtroDataIni, filtroDataFim],
    queryFn: async () => {
      let q = supabase
        .from("ibac_eventos_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (filtroStatus !== "todos") q = q.eq("status", filtroStatus as any);
      if (filtroEvento !== "todos") q = q.eq("evento_interno", filtroEvento);
      const busca = filtroBusca.trim();
      if (busca) {
        // Busca por chave de acesso ou número de NF dentro do payload
        q = q.or(`chave_acesso.ilike.%${busca}%,payload->>numero_nf.ilike.%${busca}%`);
      }
      if (filtroDataIni) q = q.gte("created_at", `${filtroDataIni}T00:00:00`);
      if (filtroDataFim) q = q.lte("created_at", `${filtroDataFim}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const { data: dePara = [], refetch: refetchDePara } = useQuery({
    queryKey: ["ibac-de-para"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ibac_de_para_eventos")
        .select("*")
        .order("evento_interno");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["ibac-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ibac_log_envios")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const processar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ibac-sync");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        data?.status === "aguardando_configuracao"
          ? "Aguardando IBAC_API_URL e IBAC_API_KEY"
          : `Processados: ${data?.processados ?? 0} | Sucessos: ${data?.sucessos ?? 0}`,
      );
      qc.invalidateQueries({ queryKey: ["ibac-fila"] });
      qc.invalidateQueries({ queryKey: ["ibac-logs"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const salvarDePara = useMutation({
    mutationFn: async (item: any) => {
      const { error } = await supabase
        .from("ibac_de_para_eventos")
        .update({
          codigo_ibac: item.codigo_ibac,
          descricao_ibac: item.descricao_ibac,
          ativo: item.ativo,
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("De-Para atualizado");
      refetchDePara();
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const reenviar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ibac_eventos_queue")
        .update({ status: "pendente", tentativas: 0, erro_mensagem: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento marcado para reenvio");
      refetchFila();
    },
  });

  const reenviarTodosErros = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("ibac_eventos_queue")
        .update({ status: "pendente", tentativas: 0, erro_mensagem: null })
        .eq("status", "erro")
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`${count} evento(s) reenfileirado(s) para reenvio`);
      qc.invalidateQueries({ queryKey: ["ibac-fila"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const limparEnviados = useMutation({
    mutationFn: async () => {
      // Apaga eventos enviados há mais de 30 dias para manter a fila enxuta
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("ibac_eventos_queue")
        .delete()
        .eq("status", "enviado")
        .lt("enviado_em", cutoff)
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`${count} evento(s) antigo(s) removido(s) da fila`);
      qc.invalidateQueries({ queryKey: ["ibac-fila"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  if (isLoading || !profile) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const counts = {
    pendente: fila.filter((f) => f.status === "pendente").length,
    enviado: fila.filter((f) => f.status === "enviado").length,
    erro: fila.filter((f) => f.status === "erro").length,
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, { v: any; icon: any; cls: string }> = {
      pendente: { v: "secondary", icon: Clock, cls: "" },
      enviado: { v: "default", icon: CheckCircle2, cls: "bg-green-600" },
      erro: { v: "destructive", icon: AlertCircle, cls: "" },
      cancelado: { v: "outline", icon: AlertCircle, cls: "" },
    };
    const cfg = variants[status] ?? variants.pendente;
    const Icon = cfg.icon;
    return (
      <Badge variant={cfg.v} className={cfg.cls}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  return (
    <MainLayout>
      <main className="container mx-auto p-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Integração IBAC</h1>
            <p className="text-sm text-muted-foreground">
              Fila de eventos, mapeamento e auditoria do EDI com IBAC.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={counts.erro === 0 || reenviarTodosErros.isPending}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reenviar erros ({counts.erro})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reenviar todos os eventos com erro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Os {counts.erro} evento(s) em erro voltarão para o status "pendente" com tentativas zeradas. O cron processa em até 2 minutos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => reenviarTodosErros.mutate()}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={limparEnviados.isPending}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpar antigos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar eventos enviados antigos?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Remove permanentemente da fila os eventos com status "enviado" há mais de 30 dias. O histórico em "Logs" é preservado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => limparEnviados.mutate()}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button onClick={() => processar.mutate()} disabled={processar.isPending}>
              <Send className="w-4 h-4 mr-2" />
              Processar fila agora
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pendentes</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{counts.pendente}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Enviados</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-green-600">{counts.enviado}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Erros</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold text-destructive">{counts.erro}</div></CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="fila">Fila ({fila.length})</TabsTrigger>
            <TabsTrigger value="saude">Saúde</TabsTrigger>
            <TabsTrigger value="alertas">Alertas</TabsTrigger>
            <TabsTrigger value="backfill">Backfill</TabsTrigger>
            <TabsTrigger value="retry">Retry</TabsTrigger>
            <TabsTrigger value="depara">De-Para de Eventos</TabsTrigger>
            <TabsTrigger value="canhotos">Canhotos</TabsTrigger>
            <TabsTrigger value="logs">Logs ({logs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="saude">
            <IbacSaudePanel />
          </TabsContent>

          <TabsContent value="alertas">
            <IbacAlertasPanel />
          </TabsContent>

          <TabsContent value="backfill">
            <IbacBackfillPanel />
          </TabsContent>

          <TabsContent value="retry">
            <IbacRetryPanel />
          </TabsContent>



          <TabsContent value="fila">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Fila de eventos</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => refetchFila()}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 p-3 rounded-md border bg-muted/30">
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="enviado">Enviado</SelectItem>
                        <SelectItem value="erro">Erro</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Evento</Label>
                    <Select value={filtroEvento} onValueChange={setFiltroEvento}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {dePara.map((d: any) => (
                          <SelectItem key={d.id} value={d.evento_interno}>{d.evento_interno}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">NF / Chave de acesso</Label>
                    <Input
                      placeholder="Número ou chave..."
                      value={filtroBusca}
                      onChange={(e) => setFiltroBusca(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">De</Label>
                    <Input type="date" value={filtroDataIni} onChange={(e) => setFiltroDataIni(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Até</Label>
                    <Input type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} />
                  </div>
                  <div className="md:col-span-6 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{fila.length} evento(s) carregado(s) (máx. 500)</span>
                    {(filtroStatus !== "todos" || filtroEvento !== "todos" || filtroBusca || filtroDataIni || filtroDataFim) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFiltroStatus("todos");
                          setFiltroEvento("todos");
                          setFiltroBusca("");
                          setFiltroDataIni("");
                          setFiltroDataFim("");
                        }}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Erro</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fila.map((f) => (
                      <TableRow
                        key={f.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setDetalheId(f.id)}
                      >
                        <TableCell className="font-mono text-xs">{f.evento_interno}</TableCell>
                        <TableCell>{statusBadge(f.status)}</TableCell>
                        <TableCell>{f.tentativas}</TableCell>
                        <TableCell className="text-xs">{new Date(f.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-xs text-destructive max-w-xs truncate">{f.erro_mensagem ?? "—"}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setDetalheId(f.id)}>
                              Detalhes
                            </Button>
                            {f.status === "erro" && (
                              <Button size="sm" variant="outline" onClick={() => reenviar.mutate(f.id)}>
                                Reenviar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {fila.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Fila vazia</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="depara">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Mapeamento Evento Interno → Código IBAC</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Preencha manualmente ou importe a planilha enviada pela IBAC.
                    </p>
                  </div>
                  <ImportarDeParaDialog itens={dePara as any} onImported={refetchDePara} />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento Interno</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Código IBAC</TableHead>
                      <TableHead>Descrição IBAC</TableHead>
                      <TableHead>Ativo</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dePara.map((d) => (
                      <DeParaRow key={d.id} item={d} onSave={(v) => salvarDePara.mutate(v)} />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader><CardTitle>Últimas requisições</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Status HTTP</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Sucesso</TableHead>
                      <TableHead>Endpoint</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell>{l.response_status ?? "—"}</TableCell>
                        <TableCell>{l.duracao_ms ? `${l.duracao_ms}ms` : "—"}</TableCell>
                        <TableCell>
                          {l.sucesso ? <Badge className="bg-green-600">OK</Badge> : <Badge variant="destructive">Falhou</Badge>}
                        </TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-md">{l.endpoint ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {logs.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem logs</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <IbacEventoDetalheDialog
        eventoId={detalheId}
        onOpenChange={(o) => !o && setDetalheId(null)}
      />
    </MainLayout>

  );
}

function DeParaRow({ item, onSave }: { item: any; onSave: (v: any) => void }) {
  const [local, setLocal] = useState(item);
  const dirty =
    local.codigo_ibac !== item.codigo_ibac ||
    local.descricao_ibac !== item.descricao_ibac ||
    local.ativo !== item.ativo;

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{item.evento_interno}</TableCell>
      <TableCell className="text-sm">{item.descricao_interna}</TableCell>
      <TableCell>
        <Input
          value={local.codigo_ibac ?? ""}
          onChange={(e) => setLocal({ ...local, codigo_ibac: e.target.value })}
          placeholder="ex: 222"
          className="w-24"
        />
      </TableCell>
      <TableCell>
        <Input
          value={local.descricao_ibac ?? ""}
          onChange={(e) => setLocal({ ...local, descricao_ibac: e.target.value })}
          placeholder="Descrição"
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={local.ativo}
          onCheckedChange={(v) => setLocal({ ...local, ativo: v })}
        />
      </TableCell>
      <TableCell>
        <Button size="sm" disabled={!dirty} onClick={() => onSave(local)}>
          Salvar
        </Button>
      </TableCell>
    </TableRow>
  );
}
