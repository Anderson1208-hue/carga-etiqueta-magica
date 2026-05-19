import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Image as ImageIcon,
  MapPin,
  Lock,
  RefreshCw,
  Truck,
  ClipboardCheck,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface VeiculoLista {
  id: string;
  placa: string;
  motorista: string | null;
  data: string;
  prestacao_contas_em: string | null;
  total_baixas: number;
}

interface BaixaItem {
  id: string;
  status: string;
  ocorrencia: string | null;
  recebedor_nome: string | null;
  foto_path: string | null;
  latitude: number | null;
  longitude: number | null;
  registrado_em: string | null;
  validacao_score: number | null;
  validacao_status: string | null;
  validacao_problemas: { lista?: string[]; observacoes?: string } | null;
  conferido_em: string | null;
  conferencia_status: string | null;
  conferencia_motivo: string | null;
  nf: {
    numero_nf: string | null;
    dest_razao_social: string | null;
    dest_cidade: string | null;
    dest_uf: string | null;
  } | null;
}

const OCORRENCIA_LABEL: Record<string, string> = {
  entregue: "Entregue",
  recusado: "Recusado",
  endereco_nao_encontrado: "End. não encontrado",
  ausente: "Ausente",
  reentrega: "Reentrega",
  outros: "Outros",
};

function isoHoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function PrestacaoContas() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<string>(isoHoje());
  const [veiculos, setVeiculos] = useState<VeiculoLista[]>([]);
  const [veiculoSel, setVeiculoSel] = useState<VeiculoLista | null>(null);
  const [baixas, setBaixas] = useState<BaixaItem[]>([]);
  const [totalNfsCarga, setTotalNfsCarga] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [loadingBaixas, setLoadingBaixas] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [pendDialog, setPendDialog] = useState<{ baixa: BaixaItem; motivo: string } | null>(null);
  const [obsEncerramento, setObsEncerramento] = useState("");
  const [encerrando, setEncerrando] = useState(false);

  async function carregarVeiculos() {
    setLoading(true);
    try {
      const { data: veics, error } = await supabase
        .from("veiculos")
        .select("id, placa, motorista, data, prestacao_contas_em")
        .eq("data", data)
        .order("placa");

      if (error) throw error;

      const ids = (veics || []).map((v) => v.id);
      let countMap: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: bx } = await supabase
          .from("baixas_entrega")
          .select("veiculo_id")
          .in("veiculo_id", ids);
        (bx || []).forEach((b: any) => {
          countMap[b.veiculo_id] = (countMap[b.veiculo_id] || 0) + 1;
        });
      }

      const lista: VeiculoLista[] = (veics || []).map((v: any) => ({
        ...v,
        total_baixas: countMap[v.id] || 0,
      }));
      setVeiculos(lista);
    } catch (err: any) {
      toast({ title: "Erro ao carregar veículos", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function carregarBaixas(veiculo: VeiculoLista) {
    setVeiculoSel(veiculo);
    setLoadingBaixas(true);
    setObsEncerramento("");
    try {
      // NFs totais vinculadas ao veículo (independente de ter baixa)
      const { count: nfCount } = await supabase
        .from("veiculo_nfs")
        .select("id", { count: "exact", head: true })
        .eq("veiculo_id", veiculo.id);
      setTotalNfsCarga(nfCount || 0);

      const { data, error } = await supabase
        .from("baixas_entrega")
        .select(`
          id, status, ocorrencia, recebedor_nome, foto_path, latitude, longitude,
          registrado_em, validacao_score, validacao_status, validacao_problemas,
          conferido_em, conferencia_status, conferencia_motivo,
          nf:notas_fiscais!baixas_entrega_nf_id_fkey(numero_nf, dest_razao_social, dest_cidade, dest_uf)
        `)
        .eq("veiculo_id", veiculo.id)
        .order("registrado_em", { ascending: true });

      if (error) throw error;
      setBaixas((data as unknown as BaixaItem[]) || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar baixas", description: err?.message, variant: "destructive" });
    } finally {
      setLoadingBaixas(false);
    }
  }

  async function verFoto(path: string) {
    try {
      const { data, error } = await supabase.storage
        .from("comprovantes")
        .createSignedUrl(path, 300);
      if (error) throw error;
      setFotoUrl(data.signedUrl);
    } catch (err: any) {
      toast({ title: "Erro ao abrir foto", description: err?.message, variant: "destructive" });
    }
  }

  async function marcarConferido(baixa: BaixaItem) {
    const { error } = await supabase
      .from("baixas_entrega")
      .update({
        conferido_em: new Date().toISOString(),
        conferido_por: user?.id,
        conferencia_status: "ok",
        conferencia_motivo: null,
      })
      .eq("id", baixa.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Conferido" });
    if (veiculoSel) carregarBaixas(veiculoSel);
  }

  async function salvarPendencia() {
    if (!pendDialog) return;
    if (!pendDialog.motivo.trim()) {
      toast({ title: "Informe o motivo", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("baixas_entrega")
      .update({
        conferido_em: new Date().toISOString(),
        conferido_por: user?.id,
        conferencia_status: "pendencia",
        conferencia_motivo: pendDialog.motivo.trim(),
      })
      .eq("id", pendDialog.baixa.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setPendDialog(null);
    toast({ title: "Pendência registrada" });
    if (veiculoSel) carregarBaixas(veiculoSel);
  }

  async function reabrirConferencia(baixa: BaixaItem) {
    const { error } = await supabase
      .from("baixas_entrega")
      .update({
        conferido_em: null,
        conferido_por: null,
        conferencia_status: null,
        conferencia_motivo: null,
      })
      .eq("id", baixa.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    if (veiculoSel) carregarBaixas(veiculoSel);
  }

  async function encerrarPrestacao() {
    if (!veiculoSel) return;
    setEncerrando(true);
    try {
      const { error } = await supabase
        .from("veiculos")
        .update({
          prestacao_contas_em: new Date().toISOString(),
          prestacao_contas_por: user?.id,
          prestacao_contas_obs: obsEncerramento || null,
        })
        .eq("id", veiculoSel.id);
      if (error) throw error;
      toast({ title: "Prestação de contas encerrada" });
      await carregarVeiculos();
      setVeiculoSel(null);
      setBaixas([]);
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    } finally {
      setEncerrando(false);
    }
  }

  useEffect(() => {
    carregarVeiculos();
    setVeiculoSel(null);
    setBaixas([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const stats = useMemo(() => {
    const total = baixas.length;
    const conferidas = baixas.filter((b) => b.conferencia_status === "ok").length;
    const pendentes = baixas.filter((b) => b.conferencia_status === "pendencia").length;
    const aConferir = baixas.filter((b) => !b.conferencia_status).length;
    const semBaixa = Math.max(0, totalNfsCarga - total);
    const alertasIa = baixas.filter((b) => b.validacao_status === "ruim" || b.validacao_status === "alerta").length;
    return { total, conferidas, pendentes, aConferir, semBaixa, alertasIa };
  }, [baixas, totalNfsCarga]);

  const tudoConferido = stats.total > 0 && stats.aConferir === 0;

  return (
    <MainLayout>
      <TooltipProvider>
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <ClipboardCheck className="w-7 h-7 text-primary" />
              <h1 className="text-2xl font-bold">Prestação de Contas</h1>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="data" className="text-sm">Data</Label>
              <Input
                id="data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-44"
              />
              <Button variant="outline" size="sm" onClick={carregarVeiculos}>
                <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
            {/* Lista de veículos */}
            <Card className="h-fit lg:sticky lg:top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Veículos do dia ({veiculos.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                {loading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : veiculos.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">Nenhum veículo nesta data.</p>
                ) : (
                  <div className="space-y-1 max-h-[70vh] overflow-y-auto">
                    {veiculos.map((v) => {
                      const ativo = veiculoSel?.id === v.id;
                      const encerrado = !!v.prestacao_contas_em;
                      return (
                        <button
                          key={v.id}
                          onClick={() => carregarBaixas(v)}
                          className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                            ativo
                              ? "bg-primary/10 border-primary"
                              : "border-transparent hover:bg-muted"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{v.placa}</span>
                            {encerrado ? (
                              <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> Encerrado</Badge>
                            ) : (
                              <Badge variant="outline">{v.total_baixas} baixas</Badge>
                            )}
                          </div>
                          {v.motorista && (
                            <p className="text-xs text-muted-foreground truncate">{v.motorista}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detalhe do veículo */}
            <div>
              {!veiculoSel ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Selecione um veículo à esquerda para conferir as baixas.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-lg">{veiculoSel.placa} — {veiculoSel.motorista || "Sem motorista"}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(veiculoSel.data + "T00:00:00"), "dd/MM/yyyy")}
                          </p>
                        </div>
                        {veiculoSel.prestacao_contas_em && (
                          <Badge className="gap-1"><Lock className="w-3 h-3" /> Encerrado em {format(new Date(veiculoSel.prestacao_contas_em), "dd/MM HH:mm")}</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                        <Stat label="NFs carga" value={totalNfsCarga} />
                        <Stat label="Baixadas" value={stats.total} />
                        <Stat label="Sem baixa" value={stats.semBaixa} tone={stats.semBaixa > 0 ? "warn" : undefined} />
                        <Stat label="Conferidas" value={stats.conferidas} tone="good" />
                        <Stat label="Pendência" value={stats.pendentes} tone={stats.pendentes > 0 ? "bad" : undefined} />
                        <Stat label="Alerta IA" value={stats.alertasIa} tone={stats.alertasIa > 0 ? "warn" : undefined} />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Baixas registradas</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {loadingBaixas ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
                      ) : baixas.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-4">Nenhuma baixa registrada para este veículo.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-16">NF</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Ocorrência</TableHead>
                                <TableHead>Recebedor</TableHead>
                                <TableHead>IA</TableHead>
                                <TableHead>Foto</TableHead>
                                <TableHead>GPS</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {baixas.map((b) => {
                                const ocLabel = b.ocorrencia ? OCORRENCIA_LABEL[b.ocorrencia] || b.ocorrencia : "—";
                                return (
                                  <TableRow key={b.id} className={
                                    b.conferencia_status === "pendencia" ? "bg-red-50 dark:bg-red-950/20" :
                                    b.conferencia_status === "ok" ? "bg-green-50/40 dark:bg-green-950/10" : ""
                                  }>
                                    <TableCell className="font-mono text-xs">{b.nf?.numero_nf || "—"}</TableCell>
                                    <TableCell className="max-w-[200px]">
                                      <p className="truncate font-medium text-sm">{b.nf?.dest_razao_social || "—"}</p>
                                      <p className="text-xs text-muted-foreground truncate">{b.nf?.dest_cidade}/{b.nf?.dest_uf}</p>
                                    </TableCell>
                                    <TableCell><Badge variant="outline">{ocLabel}</Badge></TableCell>
                                    <TableCell className="text-sm">{b.recebedor_nome || "—"}</TableCell>
                                    <TableCell>
                                      {b.validacao_status ? (
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <Badge variant={b.validacao_status === "ok" ? "default" : b.validacao_status === "alerta" ? "secondary" : "destructive"}>
                                              {b.validacao_score ?? "?"}
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs">
                                            <p className="font-semibold capitalize">{b.validacao_status}</p>
                                            {b.validacao_problemas?.lista?.length ? (
                                              <ul className="list-disc pl-4 text-xs mt-1">
                                                {b.validacao_problemas.lista.map((p, i) => <li key={i}>{p}</li>)}
                                              </ul>
                                            ) : null}
                                            {b.validacao_problemas?.observacoes && (
                                              <p className="text-xs mt-1">{b.validacao_problemas.observacoes}</p>
                                            )}
                                          </TooltipContent>
                                        </Tooltip>
                                      ) : <span className="text-xs text-muted-foreground">—</span>}
                                    </TableCell>
                                    <TableCell>
                                      {b.foto_path ? (
                                        <Button size="sm" variant="ghost" onClick={() => verFoto(b.foto_path!)}>
                                          <ImageIcon className="w-4 h-4" />
                                        </Button>
                                      ) : <span className="text-xs text-muted-foreground">—</span>}
                                    </TableCell>
                                    <TableCell>
                                      {b.latitude && b.longitude ? (
                                        <a
                                          href={`https://www.google.com/maps?q=${b.latitude},${b.longitude}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-primary hover:underline"
                                        >
                                          <MapPin className="w-4 h-4" />
                                        </a>
                                      ) : <span className="text-xs text-muted-foreground">—</span>}
                                    </TableCell>
                                    <TableCell>
                                      {b.conferencia_status === "ok" ? (
                                        <Badge className="gap-1 bg-green-600 hover:bg-green-700"><CheckCircle2 className="w-3 h-3" /> OK</Badge>
                                      ) : b.conferencia_status === "pendencia" ? (
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> Pendência</Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>{b.conferencia_motivo}</TooltipContent>
                                        </Tooltip>
                                      ) : (
                                        <Badge variant="outline">A conferir</Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right whitespace-nowrap">
                                      {b.conferencia_status ? (
                                        <Button size="sm" variant="ghost" disabled={!!veiculoSel.prestacao_contas_em} onClick={() => reabrirConferencia(b)}>
                                          Reabrir
                                        </Button>
                                      ) : (
                                        <div className="flex gap-1 justify-end">
                                          <Button size="sm" variant="default" disabled={!!veiculoSel.prestacao_contas_em} onClick={() => marcarConferido(b)}>
                                            <CheckCircle2 className="w-4 h-4 mr-1" /> OK
                                          </Button>
                                          <Button size="sm" variant="destructive" disabled={!!veiculoSel.prestacao_contas_em} onClick={() => setPendDialog({ baixa: b, motivo: "" })}>
                                            <AlertTriangle className="w-4 h-4" />
                                          </Button>
                                        </div>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {!veiculoSel.prestacao_contas_em && (
                    <Card>
                      <CardContent className="pt-6 space-y-3">
                        <Label>Observação do encerramento (opcional)</Label>
                        <Textarea
                          value={obsEncerramento}
                          onChange={(e) => setObsEncerramento(e.target.value)}
                          placeholder="Ex: Motorista entregou todos os canhotos. 1 reentrega pendente para amanhã."
                          rows={2}
                        />
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <p className="text-sm text-muted-foreground">
                            {tudoConferido
                              ? "Todas as baixas foram conferidas. Pronto para encerrar."
                              : `Faltam conferir ${stats.aConferir} baixa(s).`}
                          </p>
                          <Button
                            size="lg"
                            disabled={!tudoConferido || encerrando}
                            onClick={encerrarPrestacao}
                          >
                            {encerrando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                            Encerrar Prestação de Contas
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Foto modal */}
        <Dialog open={!!fotoUrl} onOpenChange={(o) => !o && setFotoUrl(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Foto do canhoto</DialogTitle>
            </DialogHeader>
            {fotoUrl && <img src={fotoUrl} alt="Canhoto" className="w-full rounded-md" />}
          </DialogContent>
        </Dialog>

        {/* Pendência modal */}
        <Dialog open={!!pendDialog} onOpenChange={(o) => !o && setPendDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar pendência</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Textarea
                rows={3}
                value={pendDialog?.motivo || ""}
                onChange={(e) => pendDialog && setPendDialog({ ...pendDialog, motivo: e.target.value })}
                placeholder="Ex: Canhoto sem assinatura. Refazer entrega amanhã."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendDialog(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={salvarPendencia}>Salvar pendência</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </MainLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  const color =
    tone === "good" ? "text-green-600" :
    tone === "warn" ? "text-amber-600" :
    tone === "bad" ? "text-red-600" :
    "text-foreground";
  return (
    <div className="rounded-md border p-2">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
