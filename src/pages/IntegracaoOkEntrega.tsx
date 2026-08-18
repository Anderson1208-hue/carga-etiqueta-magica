import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Send, RefreshCw, FlaskConical, Loader2, ListPlus, Copy, KeyRound } from "lucide-react";

const STATUS_BAIXA_LABEL: Record<string, string> = {
  "01": "Comprovante em análise",
  "02": "Comprovante analisado",
  "51": "NF-e não encontrada",
  "52": "Divergência de transportadora",
  "53": "Divergência no tipo de entrega",
};

function rotuloStatusBaixa(valor?: string | null) {
  if (!valor) return "—";
  const cod = valor.trim().slice(0, 2);
  return STATUS_BAIXA_LABEL[cod] ? `${cod} - ${STATUS_BAIXA_LABEL[cod]}` : valor;
}

export default function IntegracaoOkEntrega() {
  const { isAdmin, isLoading } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("envio");
  const [dryRunJson, setDryRunJson] = useState<string>("");

  // form local da config
  const [ambiente, setAmbiente] = useState("homolog");
  const [envioAtivo, setEnvioAtivo] = useState(false);
  const [entregadorHomolog, setEntregadorHomolog] = useState("");
  const [entregadorProducao, setEntregadorProducao] = useState("");
  const [cnpjTransportadora, setCnpjTransportadora] = useState("");
  const [cnpjsEmitente, setCnpjsEmitente] = useState("");
  const [whitelist, setWhitelist] = useState("");
  const [modoImagem, setModoImagem] = useState("contain");
  const [maxTentativas, setMaxTentativas] = useState("5");

  const { data: cfg } = useQuery({
    queryKey: ["okentrega-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("okentrega_config").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!cfg) return;
    setAmbiente(cfg.ambiente ?? "homolog");
    setEnvioAtivo(!!cfg.envio_ativo);
    setEntregadorHomolog(cfg.entregador_id_homolog ? String(cfg.entregador_id_homolog) : "");
    setEntregadorProducao(cfg.entregador_id_producao ? String(cfg.entregador_id_producao) : "");
    setCnpjTransportadora(cfg.cnpj_transportadora ?? "");
    setCnpjsEmitente((cfg.cnpjs_emitente ?? []).join("\n"));
    setWhitelist((cfg.whitelist_nfs ?? []).join("\n"));
    setModoImagem(cfg.modo_imagem ?? "contain");
    setMaxTentativas(String(cfg.max_tentativas ?? 5));
  }, [cfg]);

  const { data: fila = [], refetch: refetchFila } = useQuery({
    queryKey: ["okentrega-fila"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("okentrega_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["okentrega-stats"],
    queryFn: async () => {
      const [pend, env, err] = await Promise.all([
        supabase.from("okentrega_queue").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        supabase.from("okentrega_queue").select("id", { count: "exact", head: true }).eq("status", "enviado"),
        supabase.from("okentrega_queue").select("id", { count: "exact", head: true }).eq("status", "erro"),
      ]);
      return { pendentes: pend.count ?? 0, enviados: env.count ?? 0, erros: err.count ?? 0 };
    },
    refetchInterval: 30_000,
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("okentrega_config")
        .update({
          ambiente,
          envio_ativo: envioAtivo,
          entregador_id_homolog: entregadorHomolog ? Number(entregadorHomolog) : null,
          entregador_id_producao: entregadorProducao ? Number(entregadorProducao) : null,
          cnpj_transportadora: cnpjTransportadora.replace(/\D/g, "") || null,
          cnpjs_emitente: cnpjsEmitente.split(/[\n,;]/).map((v) => v.replace(/\D/g, "")).filter(Boolean),
          whitelist_nfs: whitelist.split(/[\n,;]/).map((v) => v.trim()).filter(Boolean),
          modo_imagem: modoImagem,
          max_tentativas: Number(maxTentativas) || 5,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["okentrega-config"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const toggleEnvio = useMutation({
    mutationFn: async (valor: boolean) => {
      const { error } = await supabase
        .from("okentrega_config")
        .update({ envio_ativo: valor, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
      return valor;
    },
    onSuccess: (valor) => {
      toast.success(valor ? "Envio ativo salvo" : "Envio bloqueado salvo");
      qc.invalidateQueries({ queryKey: ["okentrega-config"] });
    },
    onError: (e: any, valor) => {
      setEnvioAtivo(!valor);
      toast.error(`Erro ao salvar kill switch: ${e.message}`);
    },
  });


  const enfileirar = useMutation({
    mutationFn: async () => {
      const nfs = whitelist.split(/[\n,;]/).map((v) => v.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("okentrega-enfileirar", {
        body: nfs.length > 0 ? { nfs } : {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Enfileirados: ${d?.enfileirados ?? 0} de ${d?.candidatos ?? 0} candidatos`);
      refetchFila();
      qc.invalidateQueries({ queryKey: ["okentrega-stats"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const testarLogin = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("okentrega-sync", { body: { testar_login: true } });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      setDryRunJson(JSON.stringify(d, null, 2));
      if (d?.status === "login_ok")
        toast.success(`Login OK (${d.ambiente}) — token válido até ${new Date(d.token_expira_em).toLocaleDateString("pt-BR")}`);
      else toast.error(d?.mensagem ?? "Login falhou");
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const sincronizar = useMutation({

    mutationFn: async (dryRun: boolean) => {
      const { data, error } = await supabase.functions.invoke("okentrega-sync", { body: { dry_run: dryRun } });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      setDryRunJson(JSON.stringify(d, null, 2));
      if (d?.status === "envio_bloqueado") toast.warning(d.mensagem);
      else if (d?.status === "dry_run") toast.success(`Prévia gerada para ${d.processados} item(ns)`);
      else toast.success(`Enviados: ${d?.sucessos ?? 0} · Falhas: ${d?.falhas ?? 0}`);
      refetchFila();
      qc.invalidateQueries({ queryKey: ["okentrega-stats"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </MainLayout>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <MainLayout>
      <div className="container mx-auto p-4 max-w-7xl space-y-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 -ml-3 h-8" asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar ao menu
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">Integração OK Entrega</h1>
            <Badge variant={ambiente === "producao" ? "default" : "secondary"}>
              {ambiente === "producao" ? "Produção" : "Homologação"}
            </Badge>
            <Badge variant={envioAtivo ? "default" : "outline"}>{envioAtivo ? "Envio ativo" : "Envio bloqueado"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Envio de baixas de entrega (IOD + POD) para a Torre de Controle OK Entrega. A imagem do canhoto é
            convertida automaticamente para JPEG 1536 × 240 px a 150 dpi, conforme exigência do manual.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pendentes na fila</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.pendentes ?? "—"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Enviados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats?.enviados ?? "—"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Com erro</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{stats?.erros ?? "—"}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="envio">Envio e configuração</TabsTrigger>
            <TabsTrigger value="fila">Fila</TabsTrigger>
            <TabsTrigger value="teste">Teste / JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="envio" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configuração</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label>Ambiente</Label>
                    <Select value={ambiente} onValueChange={setAmbiente}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="homolog">Homologação</SelectItem>
                        <SelectItem value="producao">Produção</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>entregadorId homologação</Label>
                    <Input value={entregadorHomolog} onChange={(e) => setEntregadorHomolog(e.target.value)} placeholder="29668" />
                  </div>
                  <div className="space-y-1">
                    <Label>entregadorId produção</Label>
                    <Input value={entregadorProducao} onChange={(e) => setEntregadorProducao(e.target.value)} placeholder="85852" />
                  </div>
                  <div className="space-y-1">
                    <Label>CNPJ da transportadora (emitente do CT-e)</Label>
                    <Input value={cnpjTransportadora} onChange={(e) => setCnpjTransportadora(e.target.value)} placeholder="só dígitos" />
                  </div>
                  <div className="space-y-1">
                    <Label>Ajuste da imagem (1536 × 240)</Label>
                    <Select value={modoImagem} onValueChange={setModoImagem}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contain">Encaixar sem distorcer (fundo branco)</SelectItem>
                        <SelectItem value="cover">Preencher e recortar</SelectItem>
                        <SelectItem value="stretch">Esticar até 1536 × 240</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Máx. tentativas</Label>
                    <Input value={maxTentativas} onChange={(e) => setMaxTentativas(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>CNPJs de embarcadores (um por linha)</Label>
                    <Textarea
                      rows={4}
                      value={cnpjsEmitente}
                      onChange={(e) => setCnpjsEmitente(e.target.value)}
                      placeholder="70940994"
                    />
                    <p className="text-xs text-muted-foreground">
                      Match por prefixo do CNPJ do emitente da NF-e. Esta integração é da{" "}
                      <strong>Pandurata (Bauducco)</strong> — prefixo <code>70940994</code>. Sem CNPJ aqui, nada é
                      enfileirado.
                    </p>

                  </div>
                  <div className="space-y-1">
                    <Label>Whitelist de NFs para teste (um por linha)</Label>
                    <Textarea rows={4} value={whitelist} onChange={(e) => setWhitelist(e.target.value)} placeholder="754899" />
                    <p className="text-xs text-muted-foreground">
                      Com a whitelist preenchida, somente essas notas são enviadas — ideal para a homologação.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between border rounded-md p-3 bg-muted/30">
                  <div>
                    <Label className="text-sm">Envio ativo</Label>
                    <p className="text-xs text-muted-foreground">
                      Kill switch. Desligado, a fila acumula sem enviar nada à OK Entrega. Salva na hora.
                    </p>
                  </div>
                  <Switch
                    checked={envioAtivo}
                    disabled={toggleEnvio.isPending}
                    onCheckedChange={(v) => {
                      setEnvioAtivo(v);
                      toggleEnvio.mutate(v);
                    }}
                  />
                </div>


                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                    Salvar configuração
                  </Button>
                  <Button variant="outline" onClick={() => testarLogin.mutate()} disabled={testarLogin.isPending}>
                    <KeyRound className="w-4 h-4 mr-2" /> Testar login / token
                  </Button>

                  <Button variant="outline" onClick={() => enfileirar.mutate()} disabled={enfileirar.isPending}>
                    <ListPlus className="w-4 h-4 mr-2" /> Enfileirar baixas
                  </Button>
                  <Button variant="outline" onClick={() => sincronizar.mutate(true)} disabled={sincronizar.isPending}>
                    <FlaskConical className="w-4 h-4 mr-2" /> Gerar prévia (dry-run)
                  </Button>
                  <Button onClick={() => sincronizar.mutate(false)} disabled={sincronizar.isPending}>
                    <Send className="w-4 h-4 mr-2" /> Enviar agora
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fila">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Fila de envios</CardTitle>
                <Button size="sm" variant="outline" onClick={() => refetchFila()}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NF</TableHead>
                      <TableHead>Chave</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>statusbaixa</TableHead>
                      <TableHead>Comprovante</TableHead>
                      <TableHead>Tent.</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fila.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.numero_nf || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{i.chave_acesso?.slice(-12) ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              i.status === "enviado" ? "default" : i.status === "erro" ? "destructive" : "secondary"
                            }
                          >
                            {i.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{rotuloStatusBaixa(i.status_baixa)}</TableCell>
                        <TableCell className="text-xs">
                          {i.status_comprovante === "1"
                            ? "Aprovado"
                            : i.status_comprovante === "2"
                              ? `Recusado${i.motivo_recusa ? ` — ${i.motivo_recusa}` : ""}`
                              : "Em análise"}
                        </TableCell>
                        <TableCell>{i.tentativas}</TableCell>
                        <TableCell className="text-xs text-destructive max-w-[220px] truncate">
                          {i.erro_mensagem ?? ""}
                        </TableCell>
                      </TableRow>
                    ))}
                    {fila.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                          Fila vazia. Use "Enfileirar baixas".
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="teste">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>JSON / retorno da API</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Use a prévia para conferir o payload antes de ligar o envio. Após os testes de homologação, envie
                    este JSON e o retorno para <code>okentrega1@stilsolucoes.com.br</code>.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!dryRunJson}
                  onClick={() => {
                    navigator.clipboard.writeText(dryRunJson);
                    toast.success("JSON copiado");
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" /> Copiar
                </Button>
              </CardHeader>
              <CardContent>
                <Textarea
                  readOnly
                  rows={22}
                  className="font-mono text-xs"
                  value={dryRunJson || "Nenhuma execução ainda. Clique em \"Gerar prévia (dry-run)\" ou \"Enviar agora\"."}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
