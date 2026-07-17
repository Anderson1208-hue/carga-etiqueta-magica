import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Truck,
  FileText,
  CalendarClock,
  CheckCircle2,
  ArrowRight,
  Plus,
  Map,
  Radio,
  FileBarChart,
  Users,
  Radar,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { HealthBanner } from "@/components/dashboard/HealthBanner";
import { FunilOperacional } from "@/components/dashboard/FunilOperacional";
import { AlertasResumo } from "@/components/dashboard/AlertasResumo";
import { IbacResumo } from "@/components/dashboard/IbacResumo";
import { RecebidosPorDia } from "@/components/dashboard/RecebidosPorDia";

const REFRESH_MS = 60_000;

async function loadDashboard() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioHojeIso = hoje.toISOString();
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    cargasAbertasRes,
    nfsHojeRes,
    aguardandoConfRes,
    entreguesHojeRes,
    ocorrenciasHojeRes,
    baixasHojeRes,
    rotasAtivasRes,
    paradasPendRes,
    agendHojeStatusRes,
    alertasRes,
    ibacQueueRes,
    ibacLog24hRes,
    veiculosEmRotaRes,
    nfsEmRotaRes,
  ] = await Promise.all([
    supabase.from("cargas").select("id", { count: "exact", head: true }).eq("status", "aberta"),
    supabase.from("notas_fiscais").select("id", { count: "exact", head: true }).gte("created_at", inicioHojeIso),
    supabase.from("etiquetas").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    supabase.from("baixas_entrega").select("id", { count: "exact", head: true }).eq("status", "entregue").gte("registrado_em", inicioHojeIso),
    supabase.from("baixas_entrega").select("id", { count: "exact", head: true }).neq("status", "entregue").gte("registrado_em", inicioHojeIso),
    supabase.from("baixas_entrega").select("id", { count: "exact", head: true }).gte("registrado_em", inicioHojeIso),
    supabase.from("monitoramento_rotas").select("id", { count: "exact", head: true }).in("status", ["em_rota", "iniciada"]),
    supabase.from("monitoramento_paradas").select("id", { count: "exact", head: true }).in("status", ["pendente", "em_deslocamento", "no_local"]),
    supabase.from("agendamentos").select("status").gte("data_agendamento", inicioHojeIso).lt("data_agendamento", new Date(hoje.getTime() + 86400000).toISOString()),
    supabase.from("alertas_monitoramento").select("tipo").eq("lido", false),
    supabase.from("ibac_eventos_queue").select("status"),
    supabase.from("ibac_log_envios").select("sucesso").gte("created_at", ontem),
    supabase.from("veiculos").select("id", { count: "exact", head: true }).eq("status", "em_rota"),
    supabase.from("notas_fiscais").select("id", { count: "exact", head: true }).eq("status_entrega", "NF EM ROTA"),
  ]);

  const alertasPorTipo: Record<string, number> = {};
  (alertasRes.data ?? []).forEach((a: { tipo: string }) => {
    alertasPorTipo[a.tipo] = (alertasPorTipo[a.tipo] ?? 0) + 1;
  });

  const ibacStatuses = ibacQueueRes.data ?? [];
  const ibacPendentes = ibacStatuses.filter((r: { status: string }) => r.status === "pendente").length;
  const ibacErros = ibacStatuses.filter((r: { status: string }) => r.status === "erro").length;

  const ibacLog = ibacLog24hRes.data ?? [];
  const ibacSucesso24h = ibacLog.filter((r: { sucesso: boolean }) => r.sucesso).length;
  const ibacTotal24h = ibacLog.length;

  const agendamentos = agendHojeStatusRes.data ?? [];

  return {
    cargasAbertas: cargasAbertasRes.count ?? 0,
    nfsHoje: nfsHojeRes.count ?? 0,
    aguardandoConferencia: aguardandoConfRes.count ?? 0,
    entreguesHoje: entreguesHojeRes.count ?? 0,
    ocorrenciasHoje: ocorrenciasHojeRes.count ?? 0,
    baixasHoje: baixasHojeRes.count ?? 0,
    rotasAtivas: rotasAtivasRes.count ?? 0,
    paradasPendentes: paradasPendRes.count ?? 0,
    agendHoje: agendamentos.length,
    agendConfirmados: agendamentos.filter((a: { status: string }) => a.status === "confirmado" || a.status === "agendado").length,
    alertasTotal: (alertasRes.data ?? []).length,
    alertasPorTipo,
    ibacPendentes,
    ibacErros,
    ibacSucesso24h,
    ibacTotal24h,
    veiculosEmRota: veiculosEmRotaRes.count ?? 0,
    nfsEmRota: nfsEmRotaRes.count ?? 0,
  };
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: loadDashboard,
    refetchInterval: REFRESH_MS,
  });

  const d = data;
  const totalPlanejadoHoje = (d?.entreguesHoje ?? 0) + (d?.ocorrenciasHoje ?? 0);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Torre operacional</h1>
          <p className="text-muted-foreground">Visão consolidada do dia — atualiza a cada minuto</p>
        </div>

        {/* Banner de saúde */}
        <HealthBanner
          items={[
            { label: "alertas não lidos na Torre", count: d?.alertasTotal ?? 0, to: "/torre-controle" },
            { label: "eventos IBAC com erro", count: d?.ibacErros ?? 0, to: "/integracoes/ibac" },
          ]}
        />

        {/* KPIs do dia */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            title="Entregas de hoje"
            value={`${d?.entreguesHoje ?? 0}${totalPlanejadoHoje > 0 ? ` / ${totalPlanejadoHoje}` : ""}`}
            subtitle={`${d?.ocorrenciasHoje ?? 0} ocorrências · ${d?.baixasHoje ?? 0} baixas registradas`}
            icon={CheckCircle2}
            to="/torre-controle"
            tone="success"
            loading={isLoading}
          />
          <KpiCard
            title="Veículos em rota"
            value={d?.veiculosEmRota ?? 0}
            subtitle={`${d?.rotasAtivas ?? 0} rotas ativas · ${d?.paradasPendentes ?? 0} paradas pendentes`}
            icon={Truck}
            to="/monitoramento-rotas"
            tone="info"
            loading={isLoading}
          />
          <KpiCard
            title="Entregas em rota"
            value={d?.nfsEmRota ?? 0}
            subtitle="NFs a caminho do cliente"
            icon={Radar}
            to="/torre-controle"
            tone="info"
            loading={isLoading}
          />
          <KpiCard
            title="Agendamentos hoje"
            value={d?.agendHoje ?? 0}
            subtitle={`${d?.agendConfirmados ?? 0} confirmados`}
            icon={CalendarClock}
            to="/agendamento"
            loading={isLoading}
          />
          <KpiCard
            title="NFs recebidas hoje"
            value={d?.nfsHoje ?? 0}
            subtitle={`${d?.cargasAbertas ?? 0} cargas abertas em preparação`}
            icon={FileText}
            to="/cargas"
            loading={isLoading}
          />
        </div>

        {/* Funil */}
        <FunilOperacional
          recebidas={d?.nfsHoje ?? 0}
          aguardandoConferencia={d?.aguardandoConferencia ?? 0}
          emRota={d?.paradasPendentes ?? 0}
          entreguesHoje={d?.entreguesHoje ?? 0}
          loading={isLoading}
        />

        {/* Recebidos por dia */}
        <RecebidosPorDia />

        {/* Torre + IBAC */}
        <div className="grid gap-4 md:grid-cols-2">
          <AlertasResumo
            total={d?.alertasTotal ?? 0}
            porTipo={d?.alertasPorTipo ?? {}}
            loading={isLoading}
          />
          <IbacResumo
            pendentes={d?.ibacPendentes ?? 0}
            erros={d?.ibacErros ?? 0}
            sucesso24h={d?.ibacSucesso24h ?? 0}
            total24h={d?.ibacTotal24h ?? 0}
            loading={isLoading}
          />
        </div>

        {/* Ações rápidas */}
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Ações rápidas</h3>
            </div>
            <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <QuickAction to="/cargas" icon={Plus} label="Nova carga" />
              <QuickAction to="/roteirizacao" icon={Map} label="Roteirizar" />
              <QuickAction to="/torre-controle" icon={Radar} label="Torre" />
              <QuickAction to="/relatorios/pendentes-baixa" icon={FileBarChart} label="Pendentes baixa" />
              <QuickAction to="/integracoes/ibac" icon={Radio} label="IBAC" />
              <QuickAction to="/destinatarios" icon={Users} label="Cadastros" />
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: typeof Plus; label: string }) {
  return (
    <Link to={to}>
      <Button variant="outline" size="sm" className="w-full justify-between h-auto py-2">
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="text-xs">{label}</span>
        </span>
        <ArrowRight className="h-3 w-3 opacity-60" />
      </Button>
    </Link>
  );
}
