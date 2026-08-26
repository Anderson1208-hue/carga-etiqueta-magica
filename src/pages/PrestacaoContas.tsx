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
import { Checkbox } from "@/components/ui/checkbox";
import { CanhotoViewer, type CanhotoItem } from "@/components/prestacao/CanhotoViewer";
import { ConciliacaoIbacPanel } from "@/components/prestacao/ConciliacaoIbacPanel";

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
  Undo2,
  Moon,
  FileWarning,
} from "lucide-react";
import { Link } from "react-router-dom";
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
  nf_id: string;
  status: string;
  ocorrencia: string | null;
  recebedor_nome: string | null;
  foto_path: string | null;
  foto_recibo_path: string | null;
  latitude: number | null;
  longitude: number | null;
  registrado_em: string | null;
  validacao_score: number | null;
  validacao_status: string | null;
  validacao_problemas: { lista?: string[]; observacoes?: string; numero_nf_detectado?: string | null; numero_nf_esperado?: string | null; nf_match?: "ok" | "divergente" | "nao_detectado" } | null;
  conferido_em: string | null;
  conferencia_status: string | null;
  conferencia_motivo: string | null;
  canhoto_pendente_motivo?: string | null;
  canhoto_pendente_obs?: string | null;
  canhoto_pendente_em?: string | null;
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
  const { user, isAdmin, profile } = useAuth();
  const podeDesfazer = isAdmin || (profile?.ativo === true && profile?.role === "operador");

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
  const [pernoitando, setPernoitando] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [conferindoLote, setConferindoLote] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [conciliacaoKey, setConciliacaoKey] = useState(0);
  const [conciliacaoErros, setConciliacaoErros] = useState(0);


  // Somente baixas com foto entram na conferência em massa de canhotos.
  const itensCanhoto: CanhotoItem[] = useMemo(
    () =>
      baixas
        .filter((b) => b.foto_path || b.foto_recibo_path)
        .map((b) => ({
          id: b.id,
          numero_nf: b.nf?.numero_nf ?? null,
          destinatario: b.nf?.dest_razao_social ?? null,
          foto_path: b.foto_path,
          foto_recibo_path: b.foto_recibo_path,
          conferencia_status: b.conferencia_status,
        })),
    [baixas],
  );

  async function marcarPernoite() {
    if (!veiculoSel) return;
    const ok = window.confirm(
      `Marcar PERNOITE do veículo ${veiculoSel.placa}?\n\n` +
        `O veículo será replicado para o próximo dia com as mesmas NFs vinculadas ` +
        `e aparecerá destacado em AZUL na Roteirização.\n\n` +
        `A prestação de contas deste dia também será encerrada.`
    );
    if (!ok) return;

    setPernoitando(true);
    try {
      // 1. Calcular próximo dia (base na data do veículo)
      const baseData = veiculoSel.data ? new Date(veiculoSel.data + "T12:00:00") : new Date();
      baseData.setDate(baseData.getDate() + 1);
      const proxData = baseData.toISOString().slice(0, 10);

      // 2. Buscar NFs vinculadas ao veículo original
      const { data: vinculos, error: vErr } = await supabase
        .from("veiculo_nfs")
        .select("nf_id, carga_origem_id")
        .eq("veiculo_id", veiculoSel.id);
      if (vErr) throw vErr;
      const nfRows = (vinculos || []) as Array<{ nf_id: string; carga_origem_id: string }>;

      // 3. Criar novo veículo para o próximo dia (pernoite)
      const { data: novoVeic, error: insErr } = await supabase
        .from("veiculos")
        .insert({
          placa: veiculoSel.placa,
          motorista: veiculoSel.motorista || "",
          data: proxData,
          status: "pendente",
          pernoite: true,
          pernoite_origem_id: veiculoSel.id,
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // 4. Mover vínculos veiculo_nfs do veículo antigo para o novo
      // (nf_id é UNIQUE em veiculo_nfs, então não dá pra duplicar — fazemos UPDATE)
      if (nfRows.length > 0 && novoVeic?.id) {
        const { error: linkErr } = await supabase
          .from("veiculo_nfs")
          .update({ veiculo_id: novoVeic.id })
          .eq("veiculo_id", veiculoSel.id);
        if (linkErr) throw linkErr;
      }

      // 5. Encerrar prestação de contas do veículo original
      const obs = obsEncerramento
        ? `[PERNOITE] ${obsEncerramento}`
        : `[PERNOITE] Veículo pernoitou com ${nfRows.length} NF(s) (continua em ${proxData.split("-").reverse().join("/")}).`;
      const { error: encErr } = await supabase
        .from("veiculos")
        .update({
          prestacao_contas_em: new Date().toISOString(),
          prestacao_contas_por: user?.id,
          prestacao_contas_obs: obs,
        })
        .eq("id", veiculoSel.id);
      if (encErr) throw encErr;

      toast({
        title: "Pernoite registrado",
        description: `Veículo replicado para ${proxData.split("-").reverse().join("/")} com ${nfRows.length} NF(s), destacado em azul na Roteirização.`,
      });
      await carregarVeiculos();
      setVeiculoSel(null);
      setBaixas([]);
    } catch (err: any) {
      toast({ title: "Erro ao marcar pernoite", description: err?.message, variant: "destructive" });
    } finally {
      setPernoitando(false);
    }
  }

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
          id, nf_id, status, ocorrencia, recebedor_nome, foto_path, foto_recibo_path, latitude, longitude,
          registrado_em, validacao_score, validacao_status, validacao_problemas,
          conferido_em, conferencia_status, conferencia_motivo,
          nf:notas_fiscais!baixas_entrega_nf_id_fkey(numero_nf, dest_razao_social, dest_cidade, dest_uf)
        `)
        .eq("veiculo_id", veiculo.id)
        .order("registrado_em", { ascending: true });

      if (error) throw error;
      setBaixas((data as unknown as BaixaItem[]) || []);
      setSelecionadas(new Set());
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
    
    if (veiculoSel) carregarBaixas(veiculoSel);
  }

  async function conferirEmLote(ids: string[]) {
    if (ids.length === 0) return;
    setConferindoLote(true);
    try {
      const { error } = await supabase
        .from("baixas_entrega")
        .update({
          conferido_em: new Date().toISOString(),
          conferido_por: user?.id,
          conferencia_status: "ok",
          conferencia_motivo: null,
        })
        .in("id", ids);
      if (error) throw error;
      toast({ title: `${ids.length} baixa(s) conferida(s)` });
      setSelecionadas(new Set());
      if (veiculoSel) await carregarBaixas(veiculoSel);
    } catch (err: any) {
      toast({ title: "Erro ao conferir em lote", description: err?.message, variant: "destructive" });
    } finally {
      setConferindoLote(false);
    }
  }

  function toggleSelecionada(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelecionarTodasAConferir() {
    const aConferirIds = baixas.filter((b) => !b.conferencia_status).map((b) => b.id);
    const todasSelecionadas = aConferirIds.length > 0 && aConferirIds.every((id) => selecionadas.has(id));
    if (todasSelecionadas) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(aConferirIds));
    }
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

  async function solicitarNovaFoto(baixa: BaixaItem) {
    if (baixa.conferencia_status) {
      toast({
        title: "Reabra a conferência primeiro",
        description: "Esta baixa já foi conferida. Clique em Reabrir antes de solicitar nova foto.",
        variant: "destructive",
      });
      return;
    }
    const ok = window.confirm(
      `Excluir a foto da NF ${baixa.nf?.numero_nf || ""}?\n\n` +
        `A baixa será removida e o motorista verá a NF como pendente para registrar a entrega novamente com uma nova foto.`
    );
    if (!ok) return;

    try {
      if (baixa.foto_path) {
        await supabase.storage.from("comprovantes").remove([baixa.foto_path]);
      }
      const { error } = await supabase
        .from("baixas_entrega")
        .delete()
        .eq("id", baixa.id);
      if (error) throw error;

      toast({
        title: "Foto excluída",
        description: "O motorista deve registrar a entrega novamente no app.",
      });
      if (veiculoSel) carregarBaixas(veiculoSel);
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    }
  }

  async function desfazerBaixa(baixa: BaixaItem) {
    const ok = window.confirm(
      `Desfazer a baixa da NF ${baixa.nf?.numero_nf || ""}?\n\n` +
        `A ocorrência registrada pelo motorista (${baixa.ocorrencia ? (OCORRENCIA_LABEL[baixa.ocorrencia] || baixa.ocorrencia) : "—"}) será removida ` +
        `e a NF voltará para o app do motorista como pendente, permitindo registrar a ocorrência correta.`
    );
    if (!ok) return;

    try {
      if (baixa.foto_path) {
        await supabase.storage.from("comprovantes").remove([baixa.foto_path]);
      }
      const { error: delErr, count: delCount } = await supabase
        .from("baixas_entrega")
        .delete({ count: "exact" })
        .eq("id", baixa.id);
      if (delErr) throw delErr;
      if (!delCount || delCount === 0) {
        throw new Error("Sem permissão para desfazer a baixa. Solicite ao administrador.");
      }

      // Reverte status da NF para "NF EM ROTA" se não houver outra baixa ativa para a mesma NF
      const { data: outras } = await supabase
        .from("baixas_entrega")
        .select("id")
        .eq("nf_id", baixa.nf_id)
        .limit(1);

      if (!outras || outras.length === 0) {
        await supabase
          .from("notas_fiscais")
          .update({ status_entrega: "NF EM ROTA" })
          .eq("id", baixa.nf_id);

        // Re-vincula a NF ao veículo. A trigger fn_sync_nf_status_from_baixa
        // remove o vínculo em veiculo_nfs quando a baixa é "reentrega" — sem
        // restaurar, a placa some da tela do motorista.
        const veiculoId = veiculoSel || (baixa as any).veiculo_id;
        if (veiculoId) {
          const { data: nfRow } = await supabase
            .from("notas_fiscais")
            .select("carga_id")
            .eq("id", baixa.nf_id)
            .maybeSingle();
          if (nfRow?.carga_id) {
            await supabase
              .from("veiculo_nfs")
              .upsert(
                [{ veiculo_id: veiculoId, nf_id: baixa.nf_id, carga_origem_id: nfRow.carga_id }],
                { onConflict: "nf_id", ignoreDuplicates: true }
              );
          }
        }
      }

      toast({
        title: "Baixa desfeita",
        description: "O motorista deve registrar a ocorrência novamente no app.",
      });
      if (veiculoSel) carregarBaixas(veiculoSel);
    } catch (err: any) {
      toast({ title: "Erro ao desfazer baixa", description: err?.message, variant: "destructive" });
    }
  }


  async function encerrarPrestacao() {
    if (!veiculoSel) return;
    if (conciliacaoErros > 0) {
      const ok = window.confirm(
        `A conciliação da placa ${veiculoSel.placa} aponta ${conciliacaoErros} NF(s) em ERRO ` +
          `(sem desfecho, entregue sem foto ou canhoto com falha de envio).\n\n` +
          `Trate essas notas (reentrega, nova foto ou reenvio) antes de encerrar.\n\n` +
          `Encerrar mesmo assim?`,
      );
      if (!ok) return;
    }
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
      // Cria a fila de canhotos exclusivamente para o veículo encerrado e só
      // então dispara o envio. O ibac-sync mantém as travas de placa/data piloto.
      const { data: fila, error: filaError } = await supabase.functions.invoke(
        "ibac-enfileirar-canhotos",
        { body: { veiculo_id: veiculoSel.id } },
      );
      if (filaError) throw filaError;

      const enfileirados = Number(fila?.enfileirados ?? 0);
      const { error: syncError } = await supabase.functions.invoke("ibac-sync");
      if (syncError) throw syncError;

      toast({
        title: "Prestação de contas encerrada",
        description: `${enfileirados} canhoto(s) enfileirado(s) para envio à IBAC. Conferindo conciliação da placa...`,
      });
      await carregarVeiculos();
      // Mantém o veículo selecionado e força a conciliação: toda NF roteirizada
      // precisa terminar como canhoto enviado ou ocorrência válida.
      const atualizado = { ...veiculoSel, prestacao_contas_em: new Date().toISOString() };
      await carregarBaixas(atualizado);
      setConciliacaoKey((k) => k + 1);

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
              {podeDesfazer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => (window.location.href = "/prestacao-contas/desfazer-baixa")}
                >
                  <Undo2 className="w-4 h-4 mr-1" /> Desfazer Baixa
                </Button>
              )}
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

                  <ConciliacaoIbacPanel
                    key={`${veiculoSel.id}-${conciliacaoKey}`}
                    veiculoId={veiculoSel.id}
                    placa={veiculoSel.placa}
                    encerrado={!!veiculoSel.prestacao_contas_em}
                    onErrosChange={setConciliacaoErros}
                  />




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
                        <Table className="text-xs">
                          <TableHeader>
                            <TableRow className="[&>*]:py-1.5 [&>*]:px-2">
                              <TableHead className="w-8">
                                {(() => {
                                  const aConferirIds = baixas.filter((b) => !b.conferencia_status).map((b) => b.id);
                                  const allChecked = aConferirIds.length > 0 && aConferirIds.every((id) => selecionadas.has(id));
                                  return (
                                    <Checkbox
                                      checked={allChecked}
                                      disabled={!!veiculoSel?.prestacao_contas_em || aConferirIds.length === 0}
                                      onCheckedChange={toggleSelecionarTodasAConferir}
                                      aria-label="Selecionar todas a conferir"
                                    />
                                  );
                                })()}
                              </TableHead>
                              <TableHead className="w-12">NF</TableHead>
                              <TableHead>Cliente</TableHead>
                              <TableHead>Ocorr.</TableHead>
                              <TableHead>Recebedor</TableHead>
                              <TableHead>IA</TableHead>
                              <TableHead>Foto</TableHead>
                              <TableHead>GPS</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right w-24">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {baixas.map((b) => {
                              const ocLabel = b.ocorrencia ? OCORRENCIA_LABEL[b.ocorrencia] || b.ocorrencia : "—";
                              const jaConferida = !!b.conferencia_status;
                              return (
                                <TableRow key={b.id} className={`[&>*]:py-1.5 [&>*]:px-2 ${b.conferencia_status === "pendencia" ? "bg-red-50 dark:bg-red-950/20" : b.conferencia_status === "ok" ? "bg-green-50/40 dark:bg-green-950/10" : ""}`}>
                                  <TableCell>
                                    <Checkbox
                                      checked={selecionadas.has(b.id)}
                                      disabled={jaConferida || !!veiculoSel?.prestacao_contas_em}
                                      onCheckedChange={() => toggleSelecionada(b.id)}
                                      aria-label={`Selecionar NF ${b.nf?.numero_nf || ""}`}
                                    />
                                  </TableCell>
                                  <TableCell className="font-mono text-[11px] whitespace-nowrap">{b.nf?.numero_nf || "—"}</TableCell>
                                  <TableCell className="max-w-[160px]">
                                    <p className="truncate font-medium text-xs">{b.nf?.dest_razao_social || "—"}</p>
                                    <p className="text-[11px] text-muted-foreground truncate">{b.nf?.dest_cidade}/{b.nf?.dest_uf}</p>
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap"><Badge variant="outline" className="text-[11px] px-1 py-0 h-5">{ocLabel}</Badge></TableCell>
                                  <TableCell className="text-xs truncate max-w-[100px]">{b.recebedor_nome || "—"}</TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {b.validacao_status ? (
                                      <div className="flex items-center gap-1">
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <Badge variant={b.validacao_status === "ok" ? "default" : b.validacao_status === "alerta" ? "secondary" : "destructive"} className="text-[11px] px-1 py-0 h-5">
                                              {b.validacao_score ?? "?"}
                                              {b.validacao_problemas?.nf_match === "divergente" && " ⚠NF"}
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent className="max-w-xs">
                                            <p className="font-semibold capitalize">{b.validacao_status}</p>
                                            {b.validacao_problemas?.nf_match === "divergente" && (
                                              <p className="text-xs mt-1 font-semibold text-destructive">
                                                NF do canhoto: {b.validacao_problemas.numero_nf_detectado} ≠ esperado {b.validacao_problemas.numero_nf_esperado}
                                              </p>
                                            )}
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
                                        {b.validacao_status === "ruim" && (b.validacao_score ?? 100) < 50 && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                                                disabled={!!veiculoSel.prestacao_contas_em}
                                                onClick={() => solicitarNovaFoto(b)}
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Excluir foto e pedir nova ao motorista</TooltipContent>
                                          </Tooltip>
                                        )}
                                      </div>
                                    ) : <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {b.foto_path ? (
                                      <div className="flex items-center gap-1">
                                        <Button size="icon" variant="ghost" className="h-6 w-6 p-0" onClick={() => verFoto(b.foto_path!)}>
                                          <ImageIcon className="w-3.5 h-3.5" />
                                        </Button>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                                              disabled={!!veiculoSel.prestacao_contas_em}
                                              onClick={() => solicitarNovaFoto(b)}
                                            >
                                              <X className="w-3.5 h-3.5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Excluir foto e pedir nova ao motorista</TooltipContent>
                                        </Tooltip>
                                      </div>
                                    ) : <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {b.latitude && b.longitude ? (
                                      <a
                                        href={`https://www.google.com/maps?q=${b.latitude},${b.longitude}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                      >
                                        <MapPin className="w-3.5 h-3.5" />
                                      </a>
                                    ) : <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {b.conferencia_status === "ok" ? (
                                      <Badge className="gap-1 bg-green-600 hover:bg-green-700 text-[11px] px-1 py-0 h-5"><CheckCircle2 className="w-3 h-3" /> OK</Badge>
                                    ) : b.conferencia_status === "pendencia" ? (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Badge variant="destructive" className="gap-1 text-[11px] px-1 py-0 h-5"><AlertTriangle className="w-3 h-3" /> Pend.</Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>{b.conferencia_motivo}</TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <Badge variant="outline" className="text-[11px] px-1 py-0 h-5">A conferir</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right whitespace-nowrap">
                                    <div className="flex gap-0.5 justify-end items-center">
                                      {b.conferencia_status ? (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 p-0" disabled={!!veiculoSel.prestacao_contas_em} onClick={() => reabrirConferencia(b)}>
                                              <Undo2 className="w-3.5 h-3.5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Reabrir conferência</TooltipContent>
                                        </Tooltip>
                                      ) : (
                                        <>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button size="icon" variant="default" className="h-6 w-6 p-0" disabled={!!veiculoSel.prestacao_contas_em} onClick={() => marcarConferido(b)}>
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Conferir OK</TooltipContent>
                                          </Tooltip>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button size="icon" variant="destructive" className="h-6 w-6 p-0" disabled={!!veiculoSel.prestacao_contas_em} onClick={() => setPendDialog({ baixa: b, motivo: "" })}>
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Registrar pendência</TooltipContent>
                                          </Tooltip>
                                        </>
                                      )}
                                      {podeDesfazer && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="icon"
                                              variant="outline"
                                              className="h-6 w-6 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                              disabled={!!veiculoSel.prestacao_contas_em}
                                              onClick={() => desfazerBaixa(b)}
                                            >
                                              <Undo2 className="w-3.5 h-3.5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Desfazer baixa — motorista poderá registrar a ocorrência correta</TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
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

                  {!veiculoSel.prestacao_contas_em && stats.aConferir > 0 && (
                    <Card className="border-primary/40 bg-primary/5">
                      <CardContent className="py-3 flex items-center justify-between flex-wrap gap-2">
                        <p className="text-sm">
                          <span className="font-semibold">{selecionadas.size}</span> selecionada(s) de {stats.aConferir} a conferir
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={itensCanhoto.length === 0}
                            onClick={() => setViewerOpen(true)}
                          >
                            Conferir canhotos ({itensCanhoto.length})
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={selecionadas.size === 0 || conferindoLote}
                            onClick={() => conferirEmLote(Array.from(selecionadas))}
                          >
                            {conferindoLote ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Conferir selecionadas
                          </Button>
                          <Button
                            size="sm"
                            disabled={conferindoLote}
                            onClick={() => conferirEmLote(baixas.filter((b) => !b.conferencia_status).map((b) => b.id))}
                          >
                            {conferindoLote ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Conferir todas ({stats.aConferir})
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}


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
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              size="lg"
                              variant="outline"
                              className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                              disabled={pernoitando || encerrando}
                              onClick={marcarPernoite}
                            >
                              {pernoitando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Moon className="w-4 h-4 mr-2" />}
                              Pernoite
                            </Button>
                            <Button
                              size="lg"
                              disabled={!tudoConferido || encerrando || pernoitando}
                              onClick={encerrarPrestacao}
                            >
                              {encerrando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                              Encerrar Prestação de Contas
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Conferência de canhotos em massa (tiras leves + navegação por teclado) */}
        <CanhotoViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          itens={itensCanhoto}
          bloqueado={!!veiculoSel?.prestacao_contas_em}
          onConferir={async (id) => {
            const b = baixas.find((x) => x.id === id);
            if (b) await marcarConferido(b);
          }}
          onPendencia={(id) => {
            const b = baixas.find((x) => x.id === id);
            if (b) {
              setViewerOpen(false);
              setPendDialog({ baixa: b, motivo: "" });
            }
          }}
          onNovaFoto={(id) => {
            const b = baixas.find((x) => x.id === id);
            if (b) {
              setViewerOpen(false);
              void solicitarNovaFoto(b);
            }
          }}
        />


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
