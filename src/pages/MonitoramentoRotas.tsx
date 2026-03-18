import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Truck,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Navigation,
  Bell,
  Eye,
  Settings,
  RefreshCw,
  Loader2,
  Radio,
  CircleDot,
  Timer,
  SkipForward,
  Shuffle,
  Zap,
  WifiOff,
} from "lucide-react";

// Status config
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  programada: { label: "Programada", color: "bg-slate-100 text-slate-700 border-slate-200", icon: CircleDot },
  em_rota: { label: "Em Rota", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Navigation },
  chegou_cliente: { label: "Chegou no Cliente", color: "bg-amber-100 text-amber-700 border-amber-200", icon: MapPin },
  em_atendimento: { label: "Em Atendimento", color: "bg-cyan-100 text-cyan-700 border-cyan-200", icon: Timer },
  finalizada: { label: "Finalizada", color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 },
  pulada: { label: "Pulada", color: "bg-red-100 text-red-700 border-red-200", icon: SkipForward },
  parada_excessiva: { label: "Parada Excessiva", color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertTriangle },
  fora_sequencia: { label: "Fora de Sequência", color: "bg-purple-100 text-purple-700 border-purple-200", icon: Shuffle },
  visita_inconsistente: { label: "Visita Inconsistente", color: "bg-rose-100 text-rose-700 border-rose-200", icon: Zap },
};

const JUSTIFICATIVA_TIPOS = [
  "Cliente fechado",
  "Fila para descarga",
  "Dificuldade de acesso",
  "Recusa",
  "Reentrega autorizada",
  "Erro de GPS",
  "Outros",
];

interface MonitoramentoRota {
  id: string;
  veiculo_id: string;
  motorista: string | null;
  placa: string;
  data: string;
  status: string;
  ultima_lat: number | null;
  ultima_lng: number | null;
  ultima_atualizacao: string | null;
  total_paradas: number;
  paradas_concluidas: number;
}

interface MonitoramentoParada {
  id: string;
  monitoramento_rota_id: string;
  ordem: number;
  cnpj_destinatario: string | null;
  razao_social: string | null;
  endereco_completo: string | null;
  latitude: number | null;
  longitude: number | null;
  raio_geofence_metros: number;
  horario_chegada: string | null;
  horario_saida: string | null;
  tempo_permanencia_min: number | null;
  status: string;
  is_excecao: boolean;
  justificativa: string | null;
  justificativa_tipo: string | null;
  total_nfs: number | null;
  total_caixas: number | null;
}

interface Alerta {
  id: string;
  monitoramento_rota_id: string;
  monitoramento_parada_id: string | null;
  tipo: string;
  mensagem: string;
  lido: boolean;
  created_at: string;
}

export default function MonitoramentoRotas() {
  const { toast } = useToast();
  const [rotas, setRotas] = useState<MonitoramentoRota[]>([]);
  const [selectedRota, setSelectedRota] = useState<MonitoramentoRota | null>(null);
  const [paradas, setParadas] = useState<MonitoramentoParada[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [justificativaDialog, setJustificativaDialog] = useState<MonitoramentoParada | null>(null);
  const [justTipo, setJustTipo] = useState("");
  const [justTexto, setJustTexto] = useState("");
  const [savingJust, setSavingJust] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showIniciar, setShowIniciar] = useState(false);
  const [veiculosDisponiveis, setVeiculosDisponiveis] = useState<any[]>([]);
  const [loadingVeiculos, setLoadingVeiculos] = useState(false);
  const [iniciandoRota, setIniciandoRota] = useState(false);
  const [config, setConfig] = useState({
    raio_padrao_metros: 100,
    tempo_minimo_atendimento_min: 5,
    tempo_maximo_cliente_min: 60,
    tolerancia_gps_metros: 30,
    tempo_max_sem_atualizacao_min: 15,
  });
  const [configId, setConfigId] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Load routes
  const loadRotas = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("monitoramento_rotas")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRotas((data as any[]) || []);
    } catch (err) {
      console.error("Erro ao carregar rotas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load paradas for selected route
  const loadParadas = useCallback(async (rotaId: string) => {
    const { data } = await supabase
      .from("monitoramento_paradas")
      .select("*")
      .eq("monitoramento_rota_id", rotaId)
      .order("ordem", { ascending: true });
    setParadas((data as any[]) || []);
  }, []);

  // Load alerts
  const loadAlertas = useCallback(async (rotaId: string) => {
    const { data } = await supabase
      .from("alertas_monitoramento")
      .select("*")
      .eq("monitoramento_rota_id", rotaId)
      .eq("lido", false)
      .order("created_at", { ascending: false });
    setAlertas((data as any[]) || []);
  }, []);

  // Load config
  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from("monitoramento_config")
      .select("*")
      .limit(1)
      .single();
    if (data) {
      setConfig({
        raio_padrao_metros: (data as any).raio_padrao_metros,
        tempo_minimo_atendimento_min: (data as any).tempo_minimo_atendimento_min,
        tempo_maximo_cliente_min: (data as any).tempo_maximo_cliente_min,
        tolerancia_gps_metros: (data as any).tolerancia_gps_metros,
        tempo_max_sem_atualizacao_min: (data as any).tempo_max_sem_atualizacao_min,
      });
      setConfigId((data as any).id);
    }
  }, []);

  // Load available vehicles to start monitoring
  const loadVeiculosDisponiveis = useCallback(async () => {
    setLoadingVeiculos(true);
    try {
      const { data: veiculos } = await supabase
        .from("veiculos")
        .select("id, placa, motorista, data, status")
        .in("status", ["pendente", "em_rota"])
        .order("created_at", { ascending: false });

      const { data: monAtivas } = await supabase
        .from("monitoramento_rotas")
        .select("veiculo_id")
        .eq("status", "ativa");

      const ativosIds = new Set((monAtivas || []).map((m: any) => m.veiculo_id));
      setVeiculosDisponiveis((veiculos || []).filter((v: any) => !ativosIds.has(v.id)));
    } finally {
      setLoadingVeiculos(false);
    }
  }, []);

  // Start monitoring for a vehicle
  async function handleIniciarMonitoramento(veiculo: any) {
    setIniciandoRota(true);
    try {
      const { data: veiculoNfs } = await supabase
        .from("veiculo_nfs")
        .select(`
          nf_id,
          notas_fiscais (
            id, numero_nf, cnpj_destinatario, dest_razao_social,
            dest_logradouro, dest_numero, dest_bairro, dest_cidade, dest_uf, dest_cep,
            peso_bruto, volume_m3
          )
        `)
        .eq("veiculo_id", veiculo.id);

      const nfs = (veiculoNfs || []).map((vnf: any) => vnf.notas_fiscais).filter(Boolean);

      const groupedByCnpj: Record<string, any[]> = {};
      nfs.forEach((nf: any) => {
        const cnpj = nf.cnpj_destinatario || "SEM_CNPJ";
        if (!groupedByCnpj[cnpj]) groupedByCnpj[cnpj] = [];
        groupedByCnpj[cnpj].push(nf);
      });

      const { data: rotParadas } = await supabase
        .from("roteirizacao_paradas")
        .select("cnpj_destinatario, latitude, longitude, ordem, razao_social, endereco_completo, total_nfs, total_caixas, peso_total_kg, volume_total_m3")
        .in("cnpj_destinatario", Object.keys(groupedByCnpj))
        .order("ordem", { ascending: true });

      const { data: monRota, error: rotaErr } = await supabase
        .from("monitoramento_rotas")
        .insert({
          veiculo_id: veiculo.id,
          motorista: veiculo.motorista,
          placa: veiculo.placa,
          data: veiculo.data,
          total_paradas: Object.keys(groupedByCnpj).length,
        })
        .select()
        .single();

      if (rotaErr) throw rotaErr;

      const paradasMap = new Map((rotParadas || []).map((p: any) => [p.cnpj_destinatario, p]));
      let ordem = 1;
      const paradasInsert = Object.entries(groupedByCnpj).map(([cnpj, cnpjNfs]) => {
        const rotP = paradasMap.get(cnpj);
        return {
          monitoramento_rota_id: (monRota as any).id,
          ordem: rotP?.ordem || ordem++,
          cnpj_destinatario: cnpj,
          razao_social: rotP?.razao_social || cnpjNfs[0]?.dest_razao_social,
          endereco_completo: rotP?.endereco_completo || `${cnpjNfs[0]?.dest_logradouro || ""}, ${cnpjNfs[0]?.dest_numero || ""} - ${cnpjNfs[0]?.dest_bairro || ""}, ${cnpjNfs[0]?.dest_cidade || ""}/${cnpjNfs[0]?.dest_uf || ""}`,
          latitude: rotP?.latitude || null,
          longitude: rotP?.longitude || null,
          raio_geofence_metros: config.raio_padrao_metros,
          total_nfs: rotP?.total_nfs || cnpjNfs.length,
          total_caixas: rotP?.total_caixas || 0,
          peso_total_kg: rotP?.peso_total_kg || cnpjNfs.reduce((s: number, n: any) => s + (Number(n.peso_bruto) || 0), 0),
          volume_total_m3: rotP?.volume_total_m3 || cnpjNfs.reduce((s: number, n: any) => s + (Number(n.volume_m3) || 0), 0),
        };
      });

      paradasInsert.sort((a, b) => a.ordem - b.ordem);
      paradasInsert.forEach((p, i) => (p.ordem = i + 1));

      await supabase.from("monitoramento_paradas").insert(paradasInsert);

      toast({ title: "Monitoramento iniciado!", description: `${veiculo.placa} - ${paradasInsert.length} paradas` });
      setShowIniciar(false);
      loadRotas();
    } catch (err) {
      console.error("Erro ao iniciar monitoramento:", err);
      toast({ title: "Erro ao iniciar monitoramento", variant: "destructive" });
    } finally {
      setIniciandoRota(false);
    }
  }

  useEffect(() => {
    loadRotas();
    loadConfig();
  }, [loadRotas, loadConfig]);

  // When route selected, load details
  useEffect(() => {
    if (!selectedRota) return;
    loadParadas(selectedRota.id);
    loadAlertas(selectedRota.id);

    // Subscribe to realtime updates
    const channelParadas = supabase
      .channel(`mon-paradas-${selectedRota.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "monitoramento_paradas",
        filter: `monitoramento_rota_id=eq.${selectedRota.id}`,
      }, () => loadParadas(selectedRota.id))
      .subscribe();

    const channelAlertas = supabase
      .channel(`mon-alertas-${selectedRota.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "alertas_monitoramento",
        filter: `monitoramento_rota_id=eq.${selectedRota.id}`,
      }, () => loadAlertas(selectedRota.id))
      .subscribe();

    const channelRota = supabase
      .channel(`mon-rota-${selectedRota.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "monitoramento_rotas",
        filter: `id=eq.${selectedRota.id}`,
      }, (payload) => {
        setSelectedRota(payload.new as any);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelParadas);
      supabase.removeChannel(channelAlertas);
      supabase.removeChannel(channelRota);
    };
  }, [selectedRota?.id, loadParadas, loadAlertas]);

  // Save justificativa
  async function handleSaveJustificativa() {
    if (!justificativaDialog || !justTipo) return;
    setSavingJust(true);
    try {
      const { error } = await supabase
        .from("monitoramento_paradas")
        .update({
          justificativa: justTexto || justTipo,
          justificativa_tipo: justTipo,
          justificativa_em: new Date().toISOString(),
        })
        .eq("id", justificativaDialog.id);

      if (error) throw error;
      toast({ title: "Justificativa registrada" });
      setJustificativaDialog(null);
      setJustTipo("");
      setJustTexto("");
      if (selectedRota) loadParadas(selectedRota.id);
    } catch {
      toast({ title: "Erro ao salvar justificativa", variant: "destructive" });
    } finally {
      setSavingJust(false);
    }
  }

  // Mark alert as read
  async function handleMarkAlertRead(alertId: string) {
    await supabase
      .from("alertas_monitoramento")
      .update({ lido: true, lido_em: new Date().toISOString() })
      .eq("id", alertId);
    if (selectedRota) loadAlertas(selectedRota.id);
  }

  // Save config
  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      const { error } = await supabase
        .from("monitoramento_config")
        .update({ ...config, updated_at: new Date().toISOString() })
        .eq("id", configId);
      if (error) throw error;
      toast({ title: "Configurações salvas" });
      setShowConfig(false);
    } catch {
      toast({ title: "Erro ao salvar configurações", variant: "destructive" });
    } finally {
      setSavingConfig(false);
    }
  }

  // Helper: format time
  function formatTime(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDateTime(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }

  // Inactivity check
  function isInactive(rota: MonitoramentoRota) {
    if (!rota.ultima_atualizacao || rota.status !== "ativa") return false;
    const diff = (Date.now() - new Date(rota.ultima_atualizacao).getTime()) / 60000;
    return diff > config.tempo_max_sem_atualizacao_min;
  }

  // Stats
  const stats = {
    ativas: rotas.filter((r) => r.status === "ativa").length,
    finalizadas: rotas.filter((r) => r.status === "finalizada").length,
    alertas: alertas.length,
    excecoes: paradas.filter((p) => p.is_excecao).length,
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Monitoramento de Rotas</h1>
            <p className="text-muted-foreground">Acompanhamento em tempo real das entregas</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadRotas(); if (selectedRota) { loadParadas(selectedRota.id); loadAlertas(selectedRota.id); } }}>
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
              <Settings className="w-4 h-4 mr-1" /> Configurações
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Radio className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.ativas}</p>
                <p className="text-xs text-muted-foreground">Rotas Ativas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.finalizadas}</p>
                <p className="text-xs text-muted-foreground">Finalizadas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Bell className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.alertas}</p>
                <p className="text-xs text-muted-foreground">Alertas Ativos</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.excecoes}</p>
                <p className="text-xs text-muted-foreground">Exceções</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Routes List */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Rotas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {rotas.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma rota monitorada ainda.<br />
                  Inicie o monitoramento a partir da aba Veículos na Roteirização.
                </p>
              )}
              {rotas.map((rota) => (
                <button
                  key={rota.id}
                  onClick={() => setSelectedRota(rota)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedRota?.id === rota.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{rota.placa}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        rota.status === "ativa"
                          ? "bg-green-100 text-green-700 border-green-200"
                          : rota.status === "finalizada"
                          ? "bg-slate-100 text-slate-600 border-slate-200"
                          : "bg-amber-100 text-amber-700 border-amber-200"
                      }`}
                    >
                      {rota.status === "ativa" ? "Ativa" : rota.status === "finalizada" ? "Finalizada" : "Pausada"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{rota.motorista || "Sem motorista"}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      {rota.paradas_concluidas}/{rota.total_paradas} paradas
                    </span>
                    {isInactive(rota) && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <WifiOff className="w-3 h-3" /> Inativo
                      </Badge>
                    )}
                  </div>
                  {rota.ultima_atualizacao && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Última pos: {formatDateTime(rota.ultima_atualizacao)}
                    </p>
                  )}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Detail Panel */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedRota ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Eye className="w-12 h-12 mb-4 opacity-30" />
                  <p>Selecione uma rota para monitorar</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Route Header */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Truck className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold">{selectedRota.placa}</h2>
                          <p className="text-sm text-muted-foreground">{selectedRota.motorista || "—"}</p>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-medium">
                          {selectedRota.paradas_concluidas}/{selectedRota.total_paradas} entregas
                        </p>
                        <p className="text-muted-foreground">
                          {selectedRota.ultima_atualizacao
                            ? `GPS: ${formatDateTime(selectedRota.ultima_atualizacao)}`
                            : "Sem posição GPS"}
                        </p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3 bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{
                          width: `${selectedRota.total_paradas ? (selectedRota.paradas_concluidas / selectedRota.total_paradas) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Alerts */}
                {alertas.length > 0 && (
                  <Card className="border-amber-200 bg-amber-50/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 text-amber-700">
                        <Bell className="w-4 h-4" /> Alertas ({alertas.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {alertas.map((alerta) => (
                        <div
                          key={alerta.id}
                          className="flex items-center justify-between p-2 bg-background rounded-lg border"
                        >
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium">{alerta.mensagem}</p>
                              <p className="text-xs text-muted-foreground">{formatDateTime(alerta.created_at)}</p>
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => handleMarkAlertRead(alerta.id)}>
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Stops Table */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Paradas da Rota</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Chegada</TableHead>
                            <TableHead>Saída</TableHead>
                            <TableHead>Perm.</TableHead>
                            <TableHead className="w-20">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paradas.map((parada) => {
                            const cfg = STATUS_CONFIG[parada.status] || STATUS_CONFIG.programada;
                            const Icon = cfg.icon;
                            return (
                              <TableRow
                                key={parada.id}
                                className={parada.is_excecao ? "bg-red-50/50" : ""}
                              >
                                <TableCell className="font-bold">{parada.ordem}</TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-sm truncate max-w-[200px]">
                                      {parada.razao_social || parada.cnpj_destinatario}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                      {parada.endereco_completo}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={`gap-1 ${cfg.color}`}>
                                    <Icon className="w-3 h-3" />
                                    {cfg.label}
                                  </Badge>
                                  {parada.justificativa_tipo && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      ✓ {parada.justificativa_tipo}
                                    </p>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">{formatTime(parada.horario_chegada)}</TableCell>
                                <TableCell className="text-sm">{formatTime(parada.horario_saida)}</TableCell>
                                <TableCell className="text-sm">
                                  {parada.tempo_permanencia_min != null
                                    ? `${parada.tempo_permanencia_min} min`
                                    : parada.horario_chegada && !parada.horario_saida
                                    ? "..."
                                    : "—"}
                                </TableCell>
                                <TableCell>
                                  {parada.is_excecao && !parada.justificativa_tipo && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7"
                                      onClick={() => {
                                        setJustificativaDialog(parada);
                                        setJustTipo("");
                                        setJustTexto("");
                                      }}
                                    >
                                      Justificar
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {paradas.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                Nenhuma parada registrada
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Justificativa Dialog */}
      <Dialog open={!!justificativaDialog} onOpenChange={() => setJustificativaDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Justificativa Operacional</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Parada #{justificativaDialog?.ordem}</p>
              <p className="text-sm text-muted-foreground">
                {justificativaDialog?.razao_social || justificativaDialog?.cnpj_destinatario}
              </p>
            </div>
            <Select value={justTipo} onValueChange={setJustTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {JUSTIFICATIVA_TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {justTipo === "Outros" && (
              <Textarea
                placeholder="Descreva o motivo..."
                value={justTexto}
                onChange={(e) => setJustTexto(e.target.value)}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJustificativaDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveJustificativa} disabled={!justTipo || savingJust}>
              {savingJust && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Config Dialog */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurações do Monitoramento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Raio padrão de geofence (metros)</label>
              <Input
                type="number"
                value={config.raio_padrao_metros}
                onChange={(e) => setConfig({ ...config, raio_padrao_metros: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tempo mínimo para atendimento (minutos)</label>
              <Input
                type="number"
                value={config.tempo_minimo_atendimento_min}
                onChange={(e) => setConfig({ ...config, tempo_minimo_atendimento_min: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tempo máximo por cliente (minutos)</label>
              <Input
                type="number"
                value={config.tempo_maximo_cliente_min}
                onChange={(e) => setConfig({ ...config, tempo_maximo_cliente_min: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tolerância de GPS (metros)</label>
              <Input
                type="number"
                value={config.tolerancia_gps_metros}
                onChange={(e) => setConfig({ ...config, tolerancia_gps_metros: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tempo máximo sem atualização (minutos)</label>
              <Input
                type="number"
                value={config.tempo_max_sem_atualizacao_min}
                onChange={(e) => setConfig({ ...config, tempo_max_sem_atualizacao_min: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfig(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveConfig} disabled={savingConfig}>
              {savingConfig && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
