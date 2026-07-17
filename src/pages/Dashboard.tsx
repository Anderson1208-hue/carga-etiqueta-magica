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
  AlertTriangle,
  PackageCheck,
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
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const ontem24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Base da roteirização = sessões criadas hoje (dia a dia)
  const inicioDiaIso = inicioHojeIso;
  const fimDiaIso = new Date(hoje.getTime() + 86400000).toISOString();


  const [
    cargasAbertasRes,
    nfsHojeRes,
    aguardandoConfRes,
    roteirizacoesRes,
    paradasPendRes,
    agendHojeStatusRes,
    alertasRes,
    ibacQueueRes,
    ibacLog24hRes,
  ] = await Promise.all([
    supabase.from("cargas").select("id", { count: "exact", head: true }).eq("status", "aberta"),
    supabase.from("notas_fiscais").select("id", { count: "exact", head: true }).gte("created_at", inicioHojeIso),
    supabase.from("etiquetas").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    supabase.from("roteirizacoes").select("id, carga_id").gte("created_at", inicioOntemIso).lt("created_at", fimOntemIso),
    supabase.from("monitoramento_paradas").select("id", { count: "exact", head: true }).in("status", ["pendente", "em_deslocamento", "no_local"]),
    supabase.from("agendamentos").select("status").gte("data_agendamento", inicioHojeIso).lt("data_agendamento", new Date(hoje.getTime() + 86400000).toISOString()),
    supabase.from("alertas_monitoramento").select("tipo").eq("lido", false),
    supabase.from("ibac_eventos_queue").select("status"),
    supabase.from("ibac_log_envios").select("sucesso").gte("created_at", ontem24h),
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

  // Roteirizações criadas ontem = planejamento para operar hoje
  const roteirizacoes = (roteirizacoesRes.data ?? []) as Array<{ id: string; carga_id: string | null }>;
  const cargaIds = Array.from(new Set(roteirizacoes.map((r) => r.carga_id).filter(Boolean))) as string[];

  let veiculoIds: string[] = [];
  let nfIds: string[] = [];

  if (cargaIds.length > 0) {
    const vnfRes = await supabase
      .from("veiculo_nfs")
      .select("veiculo_id, nf_id")
      .in("carga_origem_id", cargaIds);
    const rows = (vnfRes.data ?? []) as { veiculo_id: string; nf_id: string }[];
    veiculoIds = Array.from(new Set(rows.map((r) => r.veiculo_id).filter(Boolean)));
    nfIds = Array.from(new Set(rows.map((r) => r.nf_id).filter(Boolean)));
  }

  const veiculosRoteirizados = veiculoIds.length;
  const nfsRoteirizadas = nfIds.length;

  // Execução: cruzar veículos planejados com monitoramento de hoje
  let veiculosEmRota = 0;
  let veiculosFinalizados = 0;
  if (veiculoIds.length > 0) {
    const mrRes = await supabase
      .from("monitoramento_rotas")
      .select("veiculo_id, status")
      .eq("data", hojeStr)
      .in("veiculo_id", veiculoIds);
    const mrRows = (mrRes.data ?? []) as { veiculo_id: string; status: string }[];
    veiculosEmRota = new Set(
      mrRows.filter((r) => r.status === "ativa" || r.status === "em_rota" || r.status === "iniciada").map((r) => r.veiculo_id),
    ).size;
    veiculosFinalizados = new Set(mrRows.filter((r) => r.status === "finalizada").map((r) => r.veiculo_id)).size;
  }

  // Status das NFs planejadas
  let nfsEntregues = 0;
  let nfsOcorrencias = 0;
  let nfsEmRota = 0;

  if (nfIds.length > 0) {
    // Chunk in batches of 500 to avoid URL limits
    const chunks: string[][] = [];
    for (let i = 0; i < nfIds.length; i += 500) chunks.push(nfIds.slice(i, i + 500));
    const statusRows: { status_entrega: string | null }[] = [];
    for (const c of chunks) {
      const r = await supabase.from("notas_fiscais").select("status_entrega").in("id", c);
      statusRows.push(...((r.data ?? []) as { status_entrega: string | null }[]));
    }
    nfsEntregues = statusRows.filter((r) => r.status_entrega === "ENTREGUE").length;
    nfsOcorrencias = statusRows.filter((r) => r.status_entrega === "RECUSADO").length;
    nfsEmRota = statusRows.filter((r) => r.status_entrega === "NF EM ROTA").length;
  }

  return {
    cargasAbertas: cargasAbertasRes.count ?? 0,
    nfsHoje: nfsHojeRes.count ?? 0,
    aguardandoConferencia: aguardandoConfRes.count ?? 0,
    paradasPendentes: paradasPendRes.count ?? 0,
    agendHoje: agendamentos.length,
    agendConfirmados: agendamentos.filter((a: { status: string }) => a.status === "confirmado" || a.status === "agendado").length,
    alertasTotal: (alertasRes.data ?? []).length,
    alertasPorTipo,
    ibacPendentes,
    ibacErros,
    ibacSucesso24h,
    ibacTotal24h,
    veiculosRoteirizados,
    veiculosEmRota,
    veiculosFinalizados,
    nfsRoteirizadas,
    nfsEntregues,
    nfsOcorrencias,
    nfsEmRota,
  };
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: loadDashboard,
    refetchInterval: REFRESH_MS,
  });

  const d = data;

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

        {/* Veículos da roteirização de hoje */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Veículos — roteirização de hoje</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              title="Veículos roteirizados"
              value={d?.veiculosRoteirizados ?? 0}
              subtitle="Placas na roteirização de hoje"
              icon={Truck}
              to="/torre-controle"
              tone="default"
              loading={isLoading}
            />
            <KpiCard
              title="Veículos em rota"
              value={d?.veiculosEmRota ?? 0}
              subtitle="Rota ativa no momento"
              icon={Radar}
              to="/torre-controle"
              tone="info"
              loading={isLoading}
            />
            <KpiCard
              title="Veículos finalizados"
              value={d?.veiculosFinalizados ?? 0}
              subtitle="Entregas do dia concluídas"
              icon={PackageCheck}
              to="/torre-controle"
              tone="success"
              loading={isLoading}
            />
          </div>
        </div>

        {/* NFs da roteirização de hoje */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">NFs — roteirização de hoje</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="NFs roteirizadas"
              value={d?.nfsRoteirizadas ?? 0}
              subtitle="Total nos veículos de hoje"
              icon={FileText}
              to="/torre-controle"
              tone="default"
              loading={isLoading}
            />
            <KpiCard
              title="Entregues"
              value={d?.nfsEntregues ?? 0}
              subtitle="Baixa entregue"
              icon={CheckCircle2}
              to="/torre-controle"
              tone="success"
              loading={isLoading}
            />
            <KpiCard
              title="Ocorrências"
              value={d?.nfsOcorrencias ?? 0}
              subtitle="Recusa / devolução"
              icon={AlertTriangle}
              to="/torre-controle"
              tone="danger"
              loading={isLoading}
            />
            <KpiCard
              title="Em rota"
              value={d?.nfsEmRota ?? 0}
              subtitle="Aguardando baixa"
              icon={Radar}
              to="/torre-controle"
              tone="info"
              loading={isLoading}
            />
          </div>
        </div>

        {/* Operação de retaguarda */}
        <div className="grid gap-4 md:grid-cols-2">
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
          emRota={d?.nfsEmRota ?? 0}
          entreguesHoje={d?.nfsEntregues ?? 0}
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
