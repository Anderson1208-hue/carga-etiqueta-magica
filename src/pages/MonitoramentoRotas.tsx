import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { MainLayout } from "@/components/layout/MainLayout";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Truck, RefreshCw, Settings, Loader2, Eye, CalendarDays } from "lucide-react";

const todayISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

import type {
  MonitoramentoRota,
  MonitoramentoParada,
  Alerta,
  MonitoramentoConfig,
} from "@/components/monitoramento/types";
import { MapaGeral } from "@/components/monitoramento/MapaGeral";
import { MonitoramentoStats } from "@/components/monitoramento/MonitoramentoStats";
import { RotasList } from "@/components/monitoramento/RotasList";
import { RotaDetailHeader } from "@/components/monitoramento/RotaDetailHeader";
import { AlertasPanel } from "@/components/monitoramento/AlertasPanel";
import { ParadasTable } from "@/components/monitoramento/ParadasTable";
import { MapaMonitoramento } from "@/components/monitoramento/MapaMonitoramento";
import { AuditoriaPercursoPanel } from "@/components/monitoramento/AuditoriaPercursoPanel";
import { JustificativaDialog } from "@/components/monitoramento/JustificativaDialog";
import { ConfigDialog } from "@/components/monitoramento/ConfigDialog";
import { IniciarDialog } from "@/components/monitoramento/IniciarDialog";

const normalizePlate = (placa?: string | null) =>
  (placa || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

export default function MonitoramentoRotas() {
  const { toast } = useToast();
  const [rotas, setRotas] = useState<MonitoramentoRota[]>([]);
  const [selectedRota, setSelectedRota] = useState<MonitoramentoRota | null>(null);
  const [paradas, setParadas] = useState<MonitoramentoParada[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [justificativaParada, setJustificativaParada] = useState<MonitoramentoParada | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState<string>(todayISO());
  const [mostrarAntigas, setMostrarAntigas] = useState(true);

  const [showConfig, setShowConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configId, setConfigId] = useState("");
  const [config, setConfig] = useState<MonitoramentoConfig>({
    raio_padrao_metros: 100,
    tempo_minimo_atendimento_min: 5,
    tempo_maximo_cliente_min: 60,
    tolerancia_gps_metros: 30,
    tempo_max_sem_atualizacao_min: 15,
    intervalo_padrao_segundos: 120,
    intervalo_critico_segundos: 60,
    distance_filter_metros: 100,
    geofence_ativo: true,
    batch_sync_ativo: true,
    batch_max_posicoes: 5,
    raio_aproximacao_metros: 500,
  });

  const [showIniciar, setShowIniciar] = useState(false);
  const [veiculosDisponiveis, setVeiculosDisponiveis] = useState<any[]>([]);
  const [loadingVeiculos, setLoadingVeiculos] = useState(false);
  const [iniciandoRota, setIniciandoRota] = useState(false);

  // --- Data loading (unchanged logic) ---
  const loadRotas = useCallback(async (dataFiltro: string, incluirAntigas: boolean) => {
    try {
      let query = supabase
        .from("monitoramento_rotas")
        .select("*")
        .order("created_at", { ascending: false });
      if (incluirAntigas) {
        // Data selecionada + rotas anteriores ainda abertas (não finalizadas)
        query = query.lte("data", dataFiltro);
      }
      // Quando incluirAntigas=false, não filtramos por monitoramento_rotas.data:
      // o vínculo com "roteirização do dia" vem via veiculos.data logo abaixo.
      const data = await fetchAllPages<any>((from, to) => query.range(from, to));

      let rotasFiltradas = data;
      if (!incluirAntigas) {
        // Só veículos que estão na roteirização da data selecionada
        // (veiculos.data é definido pela roteirização e movido no pernoite).
        const veicIds = Array.from(new Set(data.map((r: any) => r.veiculo_id).filter(Boolean)));
        let veicDoDia = new Set<string>();
        if (veicIds.length > 0) {
          const { data: veics } = await supabase
            .from("veiculos")
            .select("id, data")
            .in("id", veicIds)
            .eq("data", dataFiltro);
          veicDoDia = new Set((veics || []).map((v: any) => v.id));
        }
        rotasFiltradas = data.filter((r: any) => veicDoDia.has(r.veiculo_id));
      }

      // Dedup por placa normalizada — mantém a rota mais recente (já vem ordenada desc).
      const seen = new Set<string>();
      const dedup = rotasFiltradas.filter((r: any) => {
        const key = normalizePlate(r.placa) || r.veiculo_id;
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // Oculta rotas finalizadas (cargas antigas já encerradas).
      const ativas = dedup.filter((r: any) => r.status !== "finalizada");
      setRotas(ativas);
    } catch (err) {
      console.error("Erro ao carregar rotas:", err);
    } finally {
      setLoading(false);
    }
  }, []);



  const loadParadas = useCallback(async (rotaId: string) => {
    const data = await fetchAllPages<any>((from, to) =>
      supabase
        .from("monitoramento_paradas")
        .select("*")
        .eq("monitoramento_rota_id", rotaId)
        .order("ordem", { ascending: true })
        .range(from, to)
    );
    setParadas(data);
  }, []);

  const loadAlertas = useCallback(async (rotaId: string) => {
    const data = await fetchAllPages<any>((from, to) =>
      supabase
        .from("alertas_monitoramento")
        .select("*")
        .eq("monitoramento_rota_id", rotaId)
        .eq("lido", false)
        .order("created_at", { ascending: false })
        .range(from, to)
    );
    setAlertas(data);
  }, []);

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
        intervalo_padrao_segundos: (data as any).intervalo_padrao_segundos ?? 120,
        intervalo_critico_segundos: (data as any).intervalo_critico_segundos ?? 60,
        distance_filter_metros: (data as any).distance_filter_metros ?? 100,
        geofence_ativo: (data as any).geofence_ativo ?? true,
        batch_sync_ativo: (data as any).batch_sync_ativo ?? true,
        batch_max_posicoes: (data as any).batch_max_posicoes ?? 5,
        raio_aproximacao_metros: (data as any).raio_aproximacao_metros ?? 500,
      });
      setConfigId((data as any).id);
    }
  }, []);

  const loadVeiculosDisponiveis = useCallback(async (dataFiltro: string) => {
    setLoadingVeiculos(true);
    try {
      // Apenas veículos da roteirização do dia selecionado (amarrado por veiculos.data),
      // ainda não baixados na prestação de contas.
      const { data: veiculos } = await supabase
        .from("veiculos")
        .select("id, placa, motorista, data, status, prestacao_contas_em")
        .in("status", ["pendente", "em_rota"])
        .eq("data", dataFiltro)
        .is("prestacao_contas_em", null)
        .order("created_at", { ascending: false });
      const { data: monAtivas } = await supabase
        .from("monitoramento_rotas")
        .select("veiculo_id, placa")
        .eq("status", "ativa");
      const ativosIds = new Set((monAtivas || []).map((m: any) => m.veiculo_id));
      const ativosPlacas = new Set((monAtivas || []).map((m: any) => normalizePlate(m.placa)).filter(Boolean));
      // Dedup por placa (mantém o mais recente já ordenado)
      const seen = new Set<string>();
      const filtrados = (veiculos || []).filter((v: any) => {
        if (ativosIds.has(v.id) || ativosPlacas.has(normalizePlate(v.placa))) return false;
        const key = normalizePlate(v.placa) || v.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setVeiculosDisponiveis(filtrados);
    } finally {
      setLoadingVeiculos(false);
    }
  }, []);

  // --- Actions (unchanged logic) ---
  async function criarMonitoramentoParaVeiculo(veiculo: any): Promise<{ sucesso: boolean; placa: string; paradas?: number; motivo?: string }> {
    try {
      // Guard: impede duplicar monitoramento para a mesma placa, mesmo com veiculo_id diferente
      const { data: ativas } = await supabase
        .from("monitoramento_rotas")
        .select("id, veiculo_id, placa")
        .eq("status", "ativa")
        .limit(1000);
      const placaVeiculo = normalizePlate(veiculo.placa);
      const existente = (ativas || []).find((rota: any) =>
        rota.veiculo_id === veiculo.id || normalizePlate(rota.placa) === placaVeiculo
      );
      if (existente) {
        return { sucesso: false, placa: veiculo.placa, motivo: "Já possui rota ativa" };
      }

      const { data: veiculoNfs } = await supabase
        .from("veiculo_nfs")
        .select(`
          nf_id, carga_origem_id,
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

      if (Object.keys(groupedByCnpj).length === 0) {
        return { sucesso: false, placa: veiculo.placa, motivo: "Sem NF vinculada" };
      }

      // Normaliza CNPJ para casar com roteirizacao_paradas (ambos os formatos possíveis)
      const norm = (s: string) => (s || "").replace(/\D/g, "");
      const cnpjsDoVeiculo = new Set(Object.keys(groupedByCnpj).map(norm).filter(Boolean));
      const cargaIds = Array.from(
        new Set((veiculoNfs || []).map((v: any) => v.carga_origem_id).filter(Boolean))
      );

      // Escolhe a roteirização com maior cobertura dos CNPJs deste veículo e
      // renumera 1..N (mesma lógica de Roteirizacao.buildOrdemPorCnpj)
      const ordemPorCnpj = new Map<string, number>();
      const dadosPorCnpj = new Map<string, any>();
      if (cargaIds.length > 0) {
        const { data: rots } = await supabase
          .from("roteirizacoes")
          .select("id, created_at")
          .in("carga_id", cargaIds)
          .order("created_at", { ascending: false });
        const rotIds = (rots || []).map((r: any) => r.id);
        if (rotIds.length > 0) {
          const { data: paradasAll } = await supabase
            .from("roteirizacao_paradas")
            .select("roteirizacao_id, cnpj_destinatario, latitude, longitude, ordem, razao_social, endereco_completo, total_nfs, total_caixas, peso_total_kg, volume_total_m3")
            .in("roteirizacao_id", rotIds)
            .order("ordem", { ascending: true });
          const paradasPorRot = new Map<string, any[]>();
          for (const p of paradasAll || []) {
            const arr = paradasPorRot.get(p.roteirizacao_id) || [];
            arr.push(p);
            paradasPorRot.set(p.roteirizacao_id, arr);
          }
          const ranked = (rots || [])
            .map((r: any) => {
              const ps = paradasPorRot.get(r.id) || [];
              const coverage = new Set(
                ps.filter((p: any) => cnpjsDoVeiculo.has(norm(p.cnpj_destinatario)))
                  .map((p: any) => norm(p.cnpj_destinatario))
              ).size;
              return { id: r.id, created_at: r.created_at, coverage, paradas: ps };
            })
            .sort((a, b) => {
              if (b.coverage !== a.coverage) return b.coverage - a.coverage;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });

          const cnpjsOrdenados: string[] = [];
          for (const r of ranked) {
            const ordenadas = [...r.paradas].sort((a: any, b: any) => a.ordem - b.ordem);
            for (const p of ordenadas) {
              const c = norm(p.cnpj_destinatario);
              if (!cnpjsDoVeiculo.has(c)) continue;
              if (!dadosPorCnpj.has(c)) dadosPorCnpj.set(c, p);
              if (!cnpjsOrdenados.includes(c)) cnpjsOrdenados.push(c);
            }
          }
          cnpjsOrdenados.forEach((c, idx) => ordemPorCnpj.set(c, idx + 1));
        }
      }

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

      let proximaOrdem = ordemPorCnpj.size + 1;
      const paradasInsert = Object.entries(groupedByCnpj).map(([cnpj, cnpjNfs]) => {
        const cnpjN = norm(cnpj);
        const rotP = dadosPorCnpj.get(cnpjN);
        const ord = ordemPorCnpj.get(cnpjN) ?? proximaOrdem++;
        return {
          monitoramento_rota_id: (monRota as any).id,
          ordem: ord,
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

      return { sucesso: true, placa: veiculo.placa, paradas: paradasInsert.length };
    } catch (err) {
      console.error("Erro ao criar monitoramento:", err);
      return { sucesso: false, placa: veiculo.placa, motivo: "Erro inesperado" };
    }
  }

  async function handleIniciarMonitoramento(veiculo: any) {
    setIniciandoRota(true);
    try {
      const res = await criarMonitoramentoParaVeiculo(veiculo);
      if (res.sucesso) {
        toast({ title: "Monitoramento iniciado!", description: `${res.placa} - ${res.paradas} paradas` });
      } else {
        toast({
          title: "Não iniciado",
          description: `${res.placa}: ${res.motivo}`,
          variant: "destructive",
        });
      }
      setShowIniciar(false);
      loadRotas(dataSelecionada, mostrarAntigas);
    } finally {
      setIniciandoRota(false);
    }
  }

  async function handleIniciarTodos(veiculos: any[]) {
    // Filtra: veículos da programação de hoje + veículos de dias anteriores ainda sem baixa
    // (loadVeiculosDisponiveis já restringe status a 'pendente'/'em_rota', então qualquer
    // data <= hoje significa "do dia ou anterior sem baixa concluída").
    const hojeStr = new Date().toISOString().slice(0, 10);
    const hoje = new Date(`${hojeStr}T00:00:00`).getTime();
    const elegiveis = (veiculos || []).filter((v) => {
      if (!v?.data) return false;
      const d = new Date(`${String(v.data).slice(0, 10)}T00:00:00`).getTime();
      return d <= hoje;
    });

    if (elegiveis.length === 0) {
      toast({
        title: "Nenhum veículo elegível",
        description: "Não há veículos da programação de hoje ou de dias anteriores sem baixa.",
        variant: "destructive",
      });
      return;
    }

    setIniciandoRota(true);
    const resultados: Awaited<ReturnType<typeof criarMonitoramentoParaVeiculo>>[] = [];
    for (const v of elegiveis) {
      const res = await criarMonitoramentoParaVeiculo(v);
      resultados.push(res);
    }
    const sucessos = resultados.filter((r) => r.sucesso);
    const falhas = resultados.filter((r) => !r.sucesso);
    const ignorados = (veiculos?.length || 0) - elegiveis.length;
    const sufixoIgnorados = ignorados > 0 ? ` ${ignorados} veículo(s) futuro(s) ignorado(s).` : "";
    if (sucessos.length > 0) {
      toast({
        title: `${sucessos.length} monitoramento(s) iniciado(s)`,
        description:
          (falhas.length > 0
            ? `${falhas.length} falha(s): ${falhas.map((f) => `${f.placa} (${f.motivo})`).join(", ")}`
            : "Todos os veículos elegíveis foram iniciados com sucesso.") + sufixoIgnorados,
      });
    } else {
      toast({
        title: "Nenhum monitoramento iniciado",
        description: falhas.map((f) => `${f.placa}: ${f.motivo}`).join("; ") + sufixoIgnorados,
        variant: "destructive",
      });
    }
    setShowIniciar(false);
    loadRotas(dataSelecionada, mostrarAntigas);
    setIniciandoRota(false);
  }

  async function handleSaveJustificativa(paradaId: string, tipo: string, texto: string) {
    const { error } = await supabase
      .from("monitoramento_paradas")
      .update({
        justificativa: texto || tipo,
        justificativa_tipo: tipo,
        justificativa_em: new Date().toISOString(),
      })
      .eq("id", paradaId);
    if (error) throw error;
    toast({ title: "Justificativa registrada" });
    if (selectedRota) loadParadas(selectedRota.id);
  }

  async function handleMarkAlertRead(alertId: string) {
    await supabase
      .from("alertas_monitoramento")
      .update({ lido: true, lido_em: new Date().toISOString() })
      .eq("id", alertId);
    if (selectedRota) loadAlertas(selectedRota.id);
  }

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

  // --- Helpers ---
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

  // --- Effects ---
  useEffect(() => {
    loadRotas(dataSelecionada, mostrarAntigas);
    loadConfig();
  }, [loadRotas, loadConfig, dataSelecionada, mostrarAntigas]);

  useEffect(() => {
    if (!selectedRota) return;
    loadParadas(selectedRota.id);
    loadAlertas(selectedRota.id);

    const channelParadas = supabase
      .channel(`mon-paradas-${selectedRota.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "monitoramento_paradas",
        filter: `monitoramento_rota_id=eq.${selectedRota.id}`,
      }, () => loadParadas(selectedRota.id))
      .subscribe();

    const channelAlertas = supabase
      .channel(`mon-alertas-${selectedRota.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "alertas_monitoramento",
        filter: `monitoramento_rota_id=eq.${selectedRota.id}`,
      }, () => loadAlertas(selectedRota.id))
      .subscribe();

    const channelRota = supabase
      .channel(`mon-rota-${selectedRota.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "monitoramento_rotas",
        filter: `id=eq.${selectedRota.id}`,
      }, (payload) => setSelectedRota(payload.new as any))
      .subscribe();

    return () => {
      supabase.removeChannel(channelParadas);
      supabase.removeChannel(channelAlertas);
      supabase.removeChannel(channelRota);
    };
  }, [selectedRota?.id, loadParadas, loadAlertas]);

  // --- Stats ---
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Monitoramento de Rotas</h1>
            <p className="text-muted-foreground">Acompanhamento em tempo real das entregas</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <Input
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value || todayISO())}
                className="h-8 w-[150px] border-0 p-0 focus-visible:ring-0"
              />
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDataSelecionada(todayISO())}>
                Hoje
              </Button>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
              <Switch id="mostrar-antigas" checked={mostrarAntigas} onCheckedChange={setMostrarAntigas} />
              <Label htmlFor="mostrar-antigas" className="text-xs cursor-pointer">
                Incluir rotas antigas em aberto (fora da roteirização do dia)
              </Label>
            </div>
            <Button size="sm" onClick={() => { setShowIniciar(true); loadVeiculosDisponiveis(dataSelecionada); }}>
              <Truck className="w-4 h-4 mr-1" /> Iniciar Monitoramento
            </Button>
            <Button variant="outline" size="sm" onClick={() => { loadRotas(dataSelecionada, mostrarAntigas); if (selectedRota) { loadParadas(selectedRota.id); loadAlertas(selectedRota.id); } }}>
              <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
              <Settings className="w-4 h-4 mr-1" /> Configurações
            </Button>
          </div>
        </div>

        <MonitoramentoStats {...stats} />

        {/* Mini mapa geral com todos os veículos */}
        {rotas.filter((r) => r.ultima_lat && r.ultima_lng).length > 0 && (
          <MapaGeral
            rotas={rotas.filter((r) => r.ultima_lat && r.ultima_lng)}
            height="200px"
            onSelectRota={setSelectedRota}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <RotasList
            rotas={rotas}
            selectedRotaId={selectedRota?.id || null}
            onSelectRota={setSelectedRota}
            config={config}
            formatDateTime={formatDateTime}
          />

          <div className="lg:col-span-2 space-y-4">
            {!selectedRota ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Eye className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm">Selecione uma rota para monitorar</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <RotaDetailHeader rota={selectedRota} formatDateTime={formatDateTime} />
                <AlertasPanel alertas={alertas} onMarkRead={handleMarkAlertRead} formatDateTime={formatDateTime} />
                <MapaMonitoramento
                  paradas={paradas}
                  veiculoLat={selectedRota.ultima_lat}
                  veiculoLng={selectedRota.ultima_lng}
                  placa={selectedRota.placa}
                  rotaId={selectedRota.id}
                />
                <AuditoriaPercursoPanel rotaId={selectedRota.id} formatTime={formatTime} />
                <ParadasTable
                  paradas={paradas}
                  onJustificar={(p) => setJustificativaParada(p)}
                  formatTime={formatTime}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <JustificativaDialog
        parada={justificativaParada}
        onClose={() => setJustificativaParada(null)}
        onSave={handleSaveJustificativa}
      />

      <ConfigDialog
        open={showConfig}
        onClose={() => setShowConfig(false)}
        config={config}
        onConfigChange={setConfig}
        onSave={handleSaveConfig}
        saving={savingConfig}
      />

      <IniciarDialog
        open={showIniciar}
        onClose={() => setShowIniciar(false)}
        veiculos={veiculosDisponiveis}
        loading={loadingVeiculos}
        iniciando={iniciandoRota}
        onIniciar={handleIniciarMonitoramento}
        onIniciarTodos={handleIniciarTodos}
      />
    </MainLayout>
  );
}
