import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "lucide-react";
import { MapaGeral } from "@/components/monitoramento/MapaGeral";
import { RotaStatusBadge } from "@/components/monitoramento/StatusBadge";
import type { MonitoramentoRota } from "@/components/monitoramento/types";

const normalizePlate = (placa?: string | null) =>
  (placa || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};



type TorreRotaRow = MonitoramentoRota & { created_at: string };
type VeiculoBaixadoRow = { id: string };
type AlertaCountRow = { monitoramento_rota_id: string | null };

export default function TorreControle() {
  const [rotas, setRotas] = useState<MonitoramentoRota[]>([]);
  const [alertasCount, setAlertasCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dataSelecionada, setDataSelecionada] = useState<string>(todayISO());

  const loadRotas = useCallback(async (dataFiltro: string) => {
    try {
      // Inclui rotas da data selecionada + rotas 'ativa' de qualquer data
      // (motorista pode ter iniciado ontem e continuar em rota hoje).
      const rotasAll = await fetchAllPages<TorreRotaRow>((from, to) =>
        supabase
          .from("monitoramento_rotas")
          .select("*")
          .or(`data.eq.${dataFiltro},status.eq.ativa`)
          .order("created_at", { ascending: false })
          .range(from, to)
      );

      // Exclui rotas de veículos que já tiveram baixa na prestação de contas
      const veiculoIds = Array.from(new Set(rotasAll.map((r) => r.veiculo_id).filter(Boolean)));
      let baixados = new Set<string>();
      if (veiculoIds.length > 0) {
        const { data: veics } = await supabase
          .from("veiculos")
          .select("id, prestacao_contas_em")
          .in("id", veiculoIds)
          .not("prestacao_contas_em", "is", null);
        baixados = new Set(((veics || []) as VeiculoBaixadoRow[]).map((v) => v.id));
      }
      const rotasFiltradas = rotasAll.filter((r) => !baixados.has(r.veiculo_id));
      // Dedup por placa normalizada — mantém a rota mais recente (já vem ordenada desc por created_at)
      const seenVeic = new Set<string>();
      const rotasDedup = rotasFiltradas.filter((r) => {
        const key = normalizePlate(r.placa) || r.veiculo_id;
        if (!key) return true;
        if (seenVeic.has(key)) return false;
        seenVeic.add(key);
        return true;
      });
      setRotas(rotasDedup);

      // Alertas apenas das rotas exibidas
      const rotaIds = rotasDedup.map((r) => r.id);
      if (rotaIds.length === 0) {
        setAlertasCount({});
      } else {
        const alertas = await fetchAllPages<AlertaCountRow>((from, to) =>
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

  useEffect(() => {
    setLoading(true);
    loadRotas(dataSelecionada);

    // Realtime updates for routes and vehicle accountability changes
    const channel = supabase
      .channel("torre-controle-rotas")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "monitoramento_rotas",
      }, () => loadRotas(dataSelecionada))
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "veiculos",
      }, () => loadRotas(dataSelecionada))
      .subscribe();

    // Auto-refresh a cada 60s como fallback
    const interval = setInterval(() => loadRotas(dataSelecionada), 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [loadRotas, dataSelecionada]);


  function formatDateTime(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }

  const TOLERANCIA_SEM_SINAL_MIN = 25;
  function minutosSemSinal(rota: MonitoramentoRota): number | null {
    if (!rota.ultima_atualizacao || rota.status !== "ativa") return null;
    return Math.floor((Date.now() - new Date(rota.ultima_atualizacao).getTime()) / 60000);
  }
  function isInactive(rota: MonitoramentoRota) {
    const m = minutosSemSinal(rota);
    return m !== null && m > TOLERANCIA_SEM_SINAL_MIN;
  }

  const ativas = rotas.filter((r) => r.status === "ativa");
  const finalizadas = rotas.filter((r) => r.status === "finalizada");
  const totalAlertas = Object.values(alertasCount).reduce((a, b) => a + b, 0);
  const comGps = rotas.filter((r) => r.ultima_lat && r.ultima_lng);

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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Torre de Controle</h1>
            <p className="text-muted-foreground">Veículos em operação na data selecionada</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col">
              <Label htmlFor="torre-data" className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Data da operação
              </Label>
              <Input
                id="torre-data"
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value || todayISO())}
                className="h-9 w-[170px]"
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
            <Link to="/monitoramento-rotas">
              <Button size="sm" variant="outline">
                <ArrowRight className="w-4 h-4 mr-1" /> Monitoramento Detalhado
              </Button>
            </Link>
          </div>
        </div>


        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Radio className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{ativas.length}</p>
                <p className="text-xs text-muted-foreground">Em Rota</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{finalizadas.length}</p>
                <p className="text-xs text-muted-foreground">Finalizadas</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalAlertas}</p>
                <p className="text-xs text-muted-foreground">Alertas Ativos</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Truck className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{comGps.length}</p>
                <p className="text-xs text-muted-foreground">Com GPS</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Full Map */}
        {comGps.length > 0 ? (
          <MapaGeral rotas={comGps} height="500px" showTitle={true} />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Truck className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm">Nenhum veículo com posição GPS ativa</p>
              <p className="text-xs mt-1">As posições aparecerão quando os motoristas estiverem em rota</p>
            </CardContent>
          </Card>
        )}

        {/* Routes Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Todas as Rotas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Placa</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Alertas</TableHead>
                    <TableHead>Última Posição</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rotas.map((rota) => {
                    const progress = rota.total_paradas
                      ? Math.round((rota.paradas_concluidas / rota.total_paradas) * 100)
                      : 0;
                    const alerts = alertasCount[rota.id] || 0;
                    const minSemSinal = minutosSemSinal(rota);
                    const inactive = isInactive(rota);
                    const semSinalRecente = minSemSinal !== null && minSemSinal >= 5 && !inactive;

                    return (
                      <TableRow key={rota.id}>
                        <TableCell className="font-semibold">{rota.placa}</TableCell>
                        <TableCell className="text-sm">{rota.motorista || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <RotaStatusBadge status={rota.status} />
                            {inactive && (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <WifiOff className="w-3 h-3" />
                                {minSemSinal} min
                              </Badge>
                            )}
                            {semSinalRecente && (
                              <Badge variant="outline" className="text-xs gap-1 bg-warning/15 text-warning border-warning/30">
                                <WifiOff className="w-3 h-3" />
                                {minSemSinal} min
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted rounded-full h-2 max-w-[100px]">
                              <div
                                className="bg-primary h-2 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {rota.paradas_concluidas}/{rota.total_paradas}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {alerts > 0 ? (
                            <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30 gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {alerts}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(rota.ultima_atualizacao)}
                        </TableCell>
                        <TableCell>
                          <Link to="/monitoramento-rotas">
                            <Button size="sm" variant="ghost">
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rotas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                        Nenhuma rota monitorada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
