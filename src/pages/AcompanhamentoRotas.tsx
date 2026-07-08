import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Truck,
  WifiOff,
  MapPin,
  ArrowRight,
} from "lucide-react";
import type {
  MonitoramentoRota,
  MonitoramentoParada,
  Alerta,
  MonitoramentoConfig,
} from "@/components/monitoramento/types";
import { RotaStatusBadge } from "@/components/monitoramento/StatusBadge";
import { MapaMonitoramento } from "@/components/monitoramento/MapaMonitoramento";
import { ParadasTable } from "@/components/monitoramento/ParadasTable";
import { AlertasPanel } from "@/components/monitoramento/AlertasPanel";

const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

const normalizePlate = (placa?: string | null) =>
  (placa || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

const TOLERANCIA_SEM_SINAL_MIN = 25;

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AcompanhamentoRotas() {
  const [rotas, setRotas] = useState<MonitoramentoRota[]>([]);
  const [alertasCount, setAlertasCount] = useState<Record<string, number>>({});
  const [selectedRota, setSelectedRota] = useState<MonitoramentoRota | null>(null);
  const [baixasPorCnpj, setBaixasPorCnpj] = useState<Record<string, string>>({});
  const [paradas, setParadas] = useState<MonitoramentoParada[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSelecionada, setDataSelecionada] = useState<string>(todayISO());
  const [config, setConfig] = useState<MonitoramentoConfig | null>(null);

  // Carrega apenas rotas ATIVAS de veículos que estão na roteirização da data
  // (veiculos.data é setada pela roteirização e reagendada no pernoite).
  const loadRotas = useCallback(async (dataFiltro: string) => {
    try {
      const all = await fetchAllPages<any>((from, to) =>
        supabase
          .from("monitoramento_rotas")
          .select("*")
          .eq("status", "ativa")
          .order("created_at", { ascending: false })
          .range(from, to)
      );

      const veicIds = Array.from(new Set(all.map((r) => r.veiculo_id).filter(Boolean)));
      let veicDoDia = new Set<string>();
      let baixados = new Set<string>();
      if (veicIds.length > 0) {
        const { data: veics } = await supabase
          .from("veiculos")
          .select("id, data, prestacao_contas_em")
          .in("id", veicIds);
        (veics || []).forEach((v: any) => {
          if (String(v.data).slice(0, 10) === dataFiltro) veicDoDia.add(v.id);
          if (v.prestacao_contas_em) baixados.add(v.id);
        });
      }
      const filtered = all.filter(
        (r) => veicDoDia.has(r.veiculo_id) && !baixados.has(r.veiculo_id)
      );


      // Dedup por placa
      const seen = new Set<string>();
      const dedup = filtered.filter((r) => {
        const key = normalizePlate(r.placa) || r.veiculo_id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      dedup.sort((a, b) => (a.placa || "").localeCompare(b.placa || ""));
      setRotas(dedup);

      // Alertas por rota (contagem)
      if (dedup.length === 0) {
        setAlertasCount({});
      } else {
        const alertsRows = await fetchAllPages<any>((from, to) =>
          supabase
            .from("alertas_monitoramento")
            .select("monitoramento_rota_id")
            .eq("lido", false)
            .in("monitoramento_rota_id", dedup.map((r) => r.id))
            .range(from, to)
        );
        const counts: Record<string, number> = {};
        alertsRows.forEach((a: any) => {
          if (!a.monitoramento_rota_id) return;
          counts[a.monitoramento_rota_id] = (counts[a.monitoramento_rota_id] || 0) + 1;
        });
        setAlertasCount(counts);
      }

      // Mantém seleção quando possível, senão seleciona a primeira
      setSelectedRota((prev) => {
        if (prev && dedup.find((r) => r.id === prev.id)) {
          return dedup.find((r) => r.id === prev.id) || null;
        }
        return dedup[0] || null;
      });
    } catch (err) {
      console.error("Erro ao carregar rotas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetalhe = useCallback(async (rotaId: string, veiculoId: string | null) => {
    const [pars, alrts] = await Promise.all([
      fetchAllPages<any>((from, to) =>
        supabase
          .from("monitoramento_paradas")
          .select("*")
          .eq("monitoramento_rota_id", rotaId)
          .order("ordem", { ascending: true })
          .range(from, to)
      ),
      fetchAllPages<any>((from, to) =>
        supabase
          .from("alertas_monitoramento")
          .select("*")
          .eq("monitoramento_rota_id", rotaId)
          .eq("lido", false)
          .order("created_at", { ascending: false })
          .range(from, to)
      ),
    ]);
    setParadas(pars);
    setAlertas(alrts);

    // Última baixa "entregue" por CNPJ do destinatário (dentro deste veículo)
    if (veiculoId) {
      const baixas = await fetchAllPages<any>((from, to) =>
        supabase
          .from("baixas_entrega")
          .select("registrado_em, nf_id, status, notas_fiscais!inner(cnpj_destinatario)")
          .eq("veiculo_id", veiculoId)
          .eq("status", "entregue")
          .order("registrado_em", { ascending: false })
          .range(from, to)
      );
      const map: Record<string, string> = {};
      baixas.forEach((b: any) => {
        const cnpj = (b.notas_fiscais?.cnpj_destinatario || "").replace(/\D/g, "");
        if (!cnpj) return;
        if (!map[cnpj]) map[cnpj] = b.registrado_em; // já vem desc → primeiro = mais recente
      });
      setBaixasPorCnpj(map);
    } else {
      setBaixasPorCnpj({});
    }
  }, []);


  useEffect(() => {
    supabase
      .from("monitoramento_config")
      .select("*")
      .limit(1)
      .single()
      .then(({ data }) => data && setConfig(data as any));
  }, []);

  useEffect(() => {
    setLoading(true);
    loadRotas(dataSelecionada);
    const ch = supabase
      .channel("acomp-rotas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "monitoramento_rotas" },
        () => loadRotas(dataSelecionada)
      )
      .subscribe();
    const iv = setInterval(() => loadRotas(dataSelecionada), 30000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(iv);
    };
  }, [dataSelecionada, loadRotas]);

  useEffect(() => {
    if (!selectedRota) {
      setParadas([]);
      setAlertas([]);
      return;
    }
    loadDetalhe(selectedRota.id, selectedRota.veiculo_id);
    const iv = setInterval(() => loadDetalhe(selectedRota.id, selectedRota.veiculo_id), 15000);
    return () => clearInterval(iv);
  }, [selectedRota, loadDetalhe]);

  // Navegação por teclado ← →
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) return;
      if (rotas.length === 0) return;
      const idx = selectedRota ? rotas.findIndex((r) => r.id === selectedRota.id) : -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedRota(rotas[(idx + 1 + rotas.length) % rotas.length]);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedRota(rotas[(idx - 1 + rotas.length) % rotas.length]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotas, selectedRota]);

  async function handleMarkAlertRead(id: string) {
    await supabase.from("alertas_monitoramento").update({ lido: true }).eq("id", id);
    if (selectedRota) loadDetalhe(selectedRota.id, selectedRota.veiculo_id);
    loadRotas(dataSelecionada);
  }

  function minutosSemSinal(r: MonitoramentoRota): number | null {
    if (!r.ultima_atualizacao || r.status !== "ativa") return null;
    return Math.floor((Date.now() - new Date(r.ultima_atualizacao).getTime()) / 60000);
  }

  const proximaParada = useMemo(
    () => paradas.find((p) => !["finalizada", "pulada", "visita_inconsistente"].includes(p.status)),
    [paradas]
  );

  function goPrev() {
    if (!selectedRota || rotas.length === 0) return;
    const idx = rotas.findIndex((r) => r.id === selectedRota.id);
    setSelectedRota(rotas[(idx - 1 + rotas.length) % rotas.length]);
  }
  function goNext() {
    if (!selectedRota || rotas.length === 0) return;
    const idx = rotas.findIndex((r) => r.id === selectedRota.id);
    setSelectedRota(rotas[(idx + 1) % rotas.length]);
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

  const currentIdx = selectedRota ? rotas.findIndex((r) => r.id === selectedRota.id) : -1;

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Acompanhamento de Rotas</h1>
            <p className="text-sm text-muted-foreground">
              Veículos em rota da data — use ← → para trocar rapidamente
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col">
              <Label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Data
              </Label>
              <Input
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
            <Link to="/torre-controle">
              <Button size="sm" variant="outline">
                Torre <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Barra de chips (navegação rápida) */}
        <Card>
          <CardContent className="p-3">
            {rotas.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Nenhum veículo em rota nesta data.
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" onClick={goPrev} disabled={rotas.length < 2}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1 flex gap-2 overflow-x-auto pb-1">
                  {rotas.map((r, i) => {
                    const active = selectedRota?.id === r.id;
                    const alerts = alertasCount[r.id] || 0;
                    const mSemSinal = minutosSemSinal(r);
                    const inativo = mSemSinal !== null && mSemSinal > TOLERANCIA_SEM_SINAL_MIN;
                    const progress = r.total_paradas
                      ? Math.round((r.paradas_concluidas / r.total_paradas) * 100)
                      : 0;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedRota(r)}
                        className={`shrink-0 min-w-[180px] text-left rounded-lg border p-2 transition-colors ${
                          active
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm">{r.placa}</span>
                          <div className="flex items-center gap-1">
                            {alerts > 0 && (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-warning/15 text-warning border-warning/30">
                                {alerts}
                              </Badge>
                            )}
                            {inativo && (
                              <Badge variant="destructive" className="h-5 px-1.5 text-[10px] gap-0.5">
                                <WifiOff className="w-2.5 h-2.5" />
                                {mSemSinal}m
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.motorista || "Sem motorista"}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full">
                            <div
                              className="h-1.5 rounded-full bg-primary transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {r.paradas_concluidas}/{r.total_paradas}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <Button size="icon" variant="outline" onClick={goNext} disabled={rotas.length < 2}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <div className="text-xs text-muted-foreground shrink-0 pl-2 border-l">
                  {currentIdx + 1} / {rotas.length}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {!selectedRota ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Truck className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">Selecione um veículo acima</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Header rota + próxima parada em destaque */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="md:col-span-1">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h2 className="text-xl font-bold">{selectedRota.placa}</h2>
                      <p className="text-sm text-muted-foreground">
                        {selectedRota.motorista || "—"}
                      </p>
                    </div>
                    <RotaStatusBadge status={selectedRota.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Progresso: {selectedRota.paradas_concluidas}/{selectedRota.total_paradas}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    GPS: {formatDateTime(selectedRota.ultima_atualizacao)}
                  </div>
                </CardContent>
              </Card>
              <Card className="md:col-span-2 border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary mb-1">
                    <MapPin className="w-3.5 h-3.5" /> Próxima parada
                  </div>
                  {proximaParada ? (
                    <>
                      <p className="font-semibold text-sm">
                        #{proximaParada.ordem} — {proximaParada.razao_social || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {proximaParada.endereco_completo || "—"}
                      </p>
                      <div className="mt-1 text-xs flex flex-wrap gap-3">
                        <span>NFs: {proximaParada.total_nfs || 0}</span>
                        <span>Caixas: {proximaParada.total_caixas || 0}</span>
                        <span>Status: {proximaParada.status}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Todas as paradas foram finalizadas.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <AlertasPanel
              alertas={alertas}
              onMarkRead={handleMarkAlertRead}
              formatDateTime={formatDateTime}
            />

            <MapaMonitoramento
              paradas={paradas}
              veiculoLat={selectedRota.ultima_lat}
              veiculoLng={selectedRota.ultima_lng}
              placa={selectedRota.placa}
            />

            <ParadasTable
              paradas={paradas}
              onJustificar={() => {
                /* justificativa fica em Monitoramento detalhado */
              }}
              formatTime={formatTime}
              baixasPorCnpj={baixasPorCnpj}
            />
          </>
        )}
      </div>
    </MainLayout>
  );
}
