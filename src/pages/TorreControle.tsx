import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Radio,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  ArrowRight,
  RefreshCw,
  Truck,
  Bell,
  CalendarDays,
  Clock,
  Search,
  MapPin,
  ExternalLink,
  Play,
} from "lucide-react";
import { MapaGeral } from "@/components/monitoramento/MapaGeral";
import { RotaStatusBadge, StatusBadge } from "@/components/monitoramento/StatusBadge";
import type { MonitoramentoRota, MonitoramentoParada, Alerta } from "@/components/monitoramento/types";
import { toast } from "sonner";

const normalizePlate = (placa?: string | null) =>
  (placa || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const TOLERANCIA_SEM_SINAL_MIN = 25;

type FiltroStatus = "todos" | "aguardando" | "ativa" | "sem_sinal" | "alertas" | "finalizada";

type TorreRotaRow = MonitoramentoRota & { created_at: string };

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function minutosSemSinal(rota: MonitoramentoRota): number | null {
  if (!rota.ultima_atualizacao || rota.status !== "ativa") return null;
  return Math.floor((Date.now() - new Date(rota.ultima_atualizacao).getTime()) / 60000);
}

export default function TorreControle() {
  const [rotas, setRotas] = useState<MonitoramentoRota[]>([]);
  const [alertasCount, setAlertasCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [provisionando, setProvisionando] = useState(false);
  const [dataSelecionada, setDataSelecionada] = useState<string>(todayISO());
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  const [busca, setBusca] = useState("");
  const [selectedRotaId, setSelectedRotaId] = useState<string | null>(null);

  // Detalhe da rota selecionada
  const [detailParadas, setDetailParadas] = useState<MonitoramentoParada[]>([]);
  const [detailAlertas, setDetailAlertas] = useState<Alerta[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadRotas = useCallback(async (dataFiltro: string) => {
    try {
      const rotasAll = await fetchAllPages<TorreRotaRow>((from, to) =>
        supabase
          .from("monitoramento_rotas")
          .select("*")
          .or(`data.eq.${dataFiltro},status.eq.ativa`)
          .order("created_at", { ascending: false })
          .range(from, to)
      );

      const veiculoIds = Array.from(new Set(rotasAll.map((r) => r.veiculo_id).filter(Boolean)));
      let baixados = new Set<string>();
      if (veiculoIds.length > 0) {
        const { data: veics } = await supabase
          .from("veiculos")
          .select("id, prestacao_contas_em")
          .in("id", veiculoIds)
          .not("prestacao_contas_em", "is", null);
        baixados = new Set(((veics || []) as { id: string }[]).map((v) => v.id));
      }
      const rotasFiltradas = rotasAll.filter((r) => !baixados.has(r.veiculo_id));
      const seenVeic = new Set<string>();
      const rotasDedup = rotasFiltradas.filter((r) => {
        const key = normalizePlate(r.placa) || r.veiculo_id;
        if (!key) return true;
        if (seenVeic.has(key)) return false;
        seenVeic.add(key);
        return true;
      });
      setRotas(rotasDedup);

      const rotaIds = rotasDedup.map((r) => r.id);
      if (rotaIds.length === 0) {
        setAlertasCount({});
      } else {
        const alertas = await fetchAllPages<{ monitoramento_rota_id: string | null }>((from, to) =>
          supabase
            .from("alertas_monitoramento")
            .select("monitoramento_rota_id")
            .eq("lido", false)
            .in("monitoramento_rota_id", rotaIds)
            .order("created_at", { ascending: false })
            .range(from, to)
        );
        const counts: Record<string, number> = {};
        (alertas || []).forEach((a) => {
          if (!a.monitoramento_rota_id) return;
          counts[a.monitoramento_rota_id] = (counts[a.monitoramento_rota_id] || 0) + 1;
        });
        setAlertasCount(counts);
      }
    } catch (err) {
      console.error("Erro ao carregar rotas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Provisionamento automático (silencioso) no load da data
  const provisionarSilencioso = useCallback(async (dataFiltro: string) => {
    try {
      await supabase.rpc("provisionar_torre_dia", { p_data: dataFiltro });
    } catch (err) {
      console.warn("[torre] provisionamento automático falhou:", err);
    }
  }, []);

  const provisionarManual = useCallback(async () => {
    setProvisionando(true);
    try {
      const { data, error } = await supabase.rpc("provisionar_torre_dia", { p_data: dataSelecionada });
      if (error) throw error;
      const resp = data as { criadas?: number; ignoradas?: number } | null;
      toast.success(`Provisionamento: ${resp?.criadas ?? 0} novas rotas, ${resp?.ignoradas ?? 0} ignoradas`);
      await loadRotas(dataSelecionada);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao provisionar";
      toast.error(msg);
    } finally {
      setProvisionando(false);
    }
  }, [dataSelecionada, loadRotas]);

  useEffect(() => {
    setLoading(true);
    setSelectedRotaId(null);
    // Provisiona primeiro (idempotente), depois carrega
    provisionarSilencioso(dataSelecionada).then(() => loadRotas(dataSelecionada));

    const channel = supabase
      .channel("torre-controle-rotas")
      .on("postgres_changes", { event: "*", schema: "public", table: "monitoramento_rotas" },
        () => loadRotas(dataSelecionada))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "veiculos" },
        () => loadRotas(dataSelecionada))
      .subscribe();

    // Reprovisiona a cada 60s para capturar veículos adicionados à roteirização depois
    const interval = setInterval(
      () => provisionarSilencioso(dataSelecionada).then(() => loadRotas(dataSelecionada)),
      60000
    );

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [loadRotas, provisionarSilencioso, dataSelecionada]);

  // Detalhe: carrega paradas + alertas da rota selecionada
  useEffect(() => {
    if (!selectedRotaId) {
      setDetailParadas([]);
      setDetailAlertas([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    (async () => {
      const [{ data: paradas }, { data: alertas }] = await Promise.all([
        supabase.from("monitoramento_paradas")
          .select("*")
          .eq("monitoramento_rota_id", selectedRotaId)
          .order("ordem", { ascending: true }),
        supabase.from("alertas_monitoramento")
          .select("*")
          .eq("monitoramento_rota_id", selectedRotaId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;
      setDetailParadas((paradas || []) as MonitoramentoParada[]);
      setDetailAlertas((alertas || []) as Alerta[]);
      setDetailLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedRotaId]);

  const filteredRotas = useMemo(() => {
    return rotas.filter((r) => {
      const inactive = (() => {
        const m = minutosSemSinal(r);
        return m !== null && m > TOLERANCIA_SEM_SINAL_MIN;
      })();
      const alerts = alertasCount[r.id] || 0;

      // Filtro por status
      if (filtro === "aguardando" && r.status !== "aguardando") return false;
      if (filtro === "ativa" && r.status !== "ativa") return false;
      if (filtro === "finalizada" && r.status !== "finalizada") return false;
      if (filtro === "sem_sinal" && !inactive) return false;
      if (filtro === "alertas" && alerts === 0) return false;

      // Busca
      if (busca.trim()) {
        const q = busca.trim().toLowerCase();
        const hay = `${r.placa} ${r.motorista || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rotas, filtro, busca, alertasCount]);

  const selectedRota = useMemo(
    () => rotas.find((r) => r.id === selectedRotaId) || null,
    [rotas, selectedRotaId]
  );

  const rotasComGps = useMemo(() => filteredRotas.filter((r) => r.ultima_lat && r.ultima_lng), [filteredRotas]);

  const kpis = useMemo(() => {
    const aguardando = rotas.filter((r) => r.status === "aguardando").length;
    const ativas = rotas.filter((r) => r.status === "ativa").length;
    const finalizadas = rotas.filter((r) => r.status === "finalizada").length;
    const semSinal = rotas.filter((r) => {
      const m = minutosSemSinal(r);
      return m !== null && m > TOLERANCIA_SEM_SINAL_MIN;
    }).length;
    const totalAlertas = Object.values(alertasCount).reduce((a, b) => a + b, 0);
    return { aguardando, ativas, finalizadas, semSinal, totalAlertas };
  }, [rotas, alertasCount]);

  async function marcarAlertaLido(alertaId: string) {
    await supabase.from("alertas_monitoramento").update({ lido: true }).eq("id", alertaId);
    setDetailAlertas((prev) => prev.filter((a) => a.id !== alertaId));
    // Atualiza contador
    if (selectedRotaId) {
      setAlertasCount((prev) => ({
        ...prev,
        [selectedRotaId]: Math.max(0, (prev[selectedRotaId] || 1) - 1),
      }));
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const filtros: { key: FiltroStatus; label: string; count: number }[] = [
    { key: "todos", label: "Todos", count: rotas.length },
    { key: "aguardando", label: "Aguardando", count: kpis.aguardando },
    { key: "ativa", label: "Em rota", count: kpis.ativas },
    { key: "sem_sinal", label: "Sem sinal", count: kpis.semSinal },
    { key: "alertas", label: "Alertas", count: kpis.totalAlertas },
    { key: "finalizada", label: "Finalizadas", count: kpis.finalizadas },
  ];

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Torre de Controle</h1>
            <p className="text-sm text-muted-foreground">Visão macro dos veículos da roteirização do dia</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col">
              <Label htmlFor="torre-data" className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Data
              </Label>
              <Input
                id="torre-data"
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value || todayISO())}
                className="h-9 w-[160px]"
              />
            </div>
            {dataSelecionada !== todayISO() && (
              <Button variant="outline" size="sm" onClick={() => setDataSelecionada(todayISO())}>
                Hoje
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => loadRotas(dataSelecionada)}>
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
            <Button size="sm" onClick={provisionarManual} disabled={provisionando}>
              {provisionando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
              Provisionar dia
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Aguardando" value={kpis.aguardando} icon={Clock} tone="muted" />
          <KpiCard label="Em rota" value={kpis.ativas} icon={Radio} tone="success" />
          <KpiCard label="Sem sinal" value={kpis.semSinal} icon={WifiOff} tone="destructive" />
          <KpiCard label="Alertas" value={kpis.totalAlertas} icon={Bell} tone="warning" />
          <KpiCard label="Finalizadas" value={kpis.finalizadas} icon={CheckCircle2} tone="primary" />
        </div>

        {/* Filtros + busca */}
        <div className="flex flex-wrap items-center gap-2">
          {filtros.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filtro === f.key ? "default" : "outline"}
              onClick={() => setFiltro(f.key)}
              className="h-8"
            >
              {f.label}
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">{f.count}</Badge>
            </Button>
          ))}
          <div className="relative ml-auto">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Placa ou motorista..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 pl-8 w-[220px]"
            />
          </div>
        </div>

        {/* Mapa + Painel lateral */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            {rotasComGps.length > 0 ? (
              <MapaGeral
                rotas={rotasComGps}
                height="600px"
                showTitle={false}
                selectedRotaId={selectedRotaId}
                onSelectRota={(r) => setSelectedRotaId(r.id)}
              />
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                  <Truck className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm">Nenhum veículo com posição GPS ativa nesta data</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-1">
            {selectedRota ? (
              <DetalheRotaPanel
                rota={selectedRota}
                paradas={detailParadas}
                alertas={detailAlertas}
                loading={detailLoading}
                onClose={() => setSelectedRotaId(null)}
                onMarkAlertaLido={marcarAlertaLido}
              />
            ) : (
              <ListaCompactaRotas
                rotas={filteredRotas}
                alertasCount={alertasCount}
                onSelect={(r) => setSelectedRotaId(r.id)}
              />
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

// ─── KPI Card ───────────────────────────────────────────────
function KpiCard({
  label, value, icon: Icon, tone,
}: {
  label: string; value: number; icon: React.ElementType;
  tone: "muted" | "success" | "destructive" | "warning" | "primary" | "accent";
}) {
  const toneClasses: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent-foreground",
  };
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${toneClasses[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xl font-bold leading-tight">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Lista compacta (sem seleção) ──────────────────────────
function ListaCompactaRotas({
  rotas, alertasCount, onSelect,
}: {
  rotas: MonitoramentoRota[];
  alertasCount: Record<string, number>;
  onSelect: (r: MonitoramentoRota) => void;
}) {
  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Truck className="w-4 h-4" />
          Veículos ({rotas.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-1">
            {rotas.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-8">
                Nenhum veículo neste filtro
              </div>
            )}
            {rotas.map((r) => {
              const alerts = alertasCount[r.id] || 0;
              const min = minutosSemSinal(r);
              const inactive = min !== null && min > TOLERANCIA_SEM_SINAL_MIN;
              const progress = r.total_paradas ? Math.round((r.paradas_concluidas / r.total_paradas) * 100) : 0;
              return (
                <button
                  key={r.id}
                  onClick={() => onSelect(r)}
                  className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors border border-transparent hover:border-border"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{r.placa}</span>
                    <RotaStatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{r.motorista || "Sem motorista"}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 bg-muted rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {r.paradas_concluidas}/{r.total_paradas}
                    </span>
                  </div>
                  {(inactive || alerts > 0) && (
                    <div className="flex gap-1 mt-1.5">
                      {inactive && (
                        <Badge variant="destructive" className="text-[10px] gap-1 h-5 px-1.5">
                          <WifiOff className="w-2.5 h-2.5" />{min}m
                        </Badge>
                      )}
                      {alerts > 0 && (
                        <Badge variant="outline" className="text-[10px] gap-1 h-5 px-1.5 bg-warning/15 text-warning border-warning/30">
                          <AlertTriangle className="w-2.5 h-2.5" />{alerts}
                        </Badge>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ─── Detalhe da rota (Opção B: embutido) ──────────────────
function DetalheRotaPanel({
  rota, paradas, alertas, loading, onClose, onMarkAlertaLido,
}: {
  rota: MonitoramentoRota;
  paradas: MonitoramentoParada[];
  alertas: Alerta[];
  loading: boolean;
  onClose: () => void;
  onMarkAlertaLido: (id: string) => void;
}) {
  const progress = rota.total_paradas ? Math.round((rota.paradas_concluidas / rota.total_paradas) * 100) : 0;
  const min = minutosSemSinal(rota);
  const inactive = min !== null && min > TOLERANCIA_SEM_SINAL_MIN;

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{rota.placa}</CardTitle>
              <RotaStatusBadge status={rota.status} />
              {inactive && (
                <Badge variant="destructive" className="text-[10px] gap-1 h-5 px-1.5">
                  <WifiOff className="w-2.5 h-2.5" />{min}m sem sinal
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{rota.motorista || "Sem motorista"}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-7">✕</Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 bg-muted rounded-full h-2">
            <div className="bg-primary h-2 rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {rota.paradas_concluidas}/{rota.total_paradas} ({progress}%)
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Última posição: {formatDateTime(rota.ultima_atualizacao)}
        </p>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <Tabs defaultValue="paradas" className="h-full flex flex-col">
          <TabsList className="mx-2 grid grid-cols-3">
            <TabsTrigger value="paradas" className="text-xs">
              Paradas ({paradas.length})
            </TabsTrigger>
            <TabsTrigger value="alertas" className="text-xs">
              Alertas ({alertas.filter((a) => !a.lido).length})
            </TabsTrigger>
            <TabsTrigger value="acoes" className="text-xs">Ações</TabsTrigger>
          </TabsList>

          <TabsContent value="paradas" className="flex-1 overflow-hidden m-0 mt-2">
            <ScrollArea className="h-full px-2 pb-2">
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : paradas.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-8">Sem paradas</div>
              ) : (
                <div className="space-y-1.5">
                  {paradas.map((p) => (
                    <div key={p.id} className="p-2 rounded-md border bg-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-mono font-semibold text-muted-foreground">#{p.ordem}</span>
                            <span className="font-medium truncate">{p.razao_social || p.cnpj_destinatario}</span>
                          </div>
                          {p.endereco_completo && (
                            <p className="text-[11px] text-muted-foreground truncate flex items-start gap-1 mt-0.5">
                              <MapPin className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                              {p.endereco_completo}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                            {p.horario_chegada && <span>🕒 {formatTime(p.horario_chegada)}</span>}
                            {p.tempo_permanencia_min != null && <span>⏱ {p.tempo_permanencia_min}m</span>}
                            {p.total_nfs != null && <span>📦 {p.total_nfs} NF</span>}
                          </div>
                        </div>
                        <StatusBadge status={p.status} size="sm" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="alertas" className="flex-1 overflow-hidden m-0 mt-2">
            <ScrollArea className="h-full px-2 pb-2">
              {alertas.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-8">Sem alertas</div>
              ) : (
                <div className="space-y-1.5">
                  {alertas.map((a) => (
                    <div key={a.id} className={`p-2 rounded-md border ${a.lido ? "opacity-60" : "bg-warning/5 border-warning/30"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium">{a.mensagem}</p>
                            <p className="text-[10px] text-muted-foreground">{formatDateTime(a.created_at)}</p>
                          </div>
                        </div>
                        {!a.lido && (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onMarkAlertaLido(a.id)}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="acoes" className="flex-1 overflow-auto m-0 mt-2 px-3 pb-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Justificar paradas, finalizar rota manualmente e ver auditoria de percurso
              estão disponíveis na tela detalhada.
            </p>
            <Link to={`/monitoramento-rotas?rota=${rota.id}`}>
              <Button size="sm" variant="outline" className="w-full">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Abrir tela detalhada
              </Button>
            </Link>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
