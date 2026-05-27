import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Activity, TrendingUp, Clock, AlertTriangle } from "lucide-react";

const COLORS = {
  sucesso: "hsl(142 76% 36%)",
  falha: "hsl(0 84% 60%)",
  pendente: "hsl(48 96% 53%)",
  enviado: "hsl(142 76% 36%)",
  erro: "hsl(0 84% 60%)",
  cancelado: "hsl(0 0% 60%)",
};

function fmtDay(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function IbacSaudePanel() {
  // Últimos 14 dias de logs (envios reais)
  const { data: logs = [] } = useQuery({
    queryKey: ["ibac-saude-logs"],
    queryFn: async () => {
      const desde = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("ibac_log_envios")
        .select("created_at, sucesso, duracao_ms, response_status")
        .gte("created_at", desde)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  // Distribuição atual da fila por evento
  const { data: fila = [] } = useQuery({
    queryKey: ["ibac-saude-fila"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ibac_eventos_queue")
        .select("evento_interno, status")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  // Série diária: envios por dia (sucesso vs falha)
  const seriePorDia = useMemo(() => {
    const buckets = new Map<string, { dia: string; sucesso: number; falha: number; total: number }>();
    // Garante 14 dias com zero
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString();
      buckets.set(key, { dia: fmtDay(key), sucesso: 0, falha: 0, total: 0 });
    }
    for (const l of logs) {
      const d = new Date(l.created_at);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString();
      const b = buckets.get(key);
      if (!b) continue;
      b.total += 1;
      if (l.sucesso) b.sucesso += 1;
      else b.falha += 1;
    }
    return Array.from(buckets.values());
  }, [logs]);

  // Série diária: tempo médio de resposta (ms)
  const serieDuracao = useMemo(() => {
    const buckets = new Map<string, { dia: string; soma: number; n: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString();
      buckets.set(key, { dia: fmtDay(key), soma: 0, n: 0 });
    }
    for (const l of logs) {
      if (!l.duracao_ms) continue;
      const d = new Date(l.created_at);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString();
      const b = buckets.get(key);
      if (!b) continue;
      b.soma += l.duracao_ms;
      b.n += 1;
    }
    return Array.from(buckets.values()).map((b) => ({
      dia: b.dia,
      media_ms: b.n > 0 ? Math.round(b.soma / b.n) : 0,
    }));
  }, [logs]);

  // KPIs gerais
  const kpis = useMemo(() => {
    const total = logs.length;
    const sucessos = logs.filter((l) => l.sucesso).length;
    const falhas = total - sucessos;
    const taxa = total > 0 ? (sucessos / total) * 100 : 0;
    const duracoes = logs.filter((l) => l.duracao_ms).map((l) => l.duracao_ms as number);
    const mediaMs = duracoes.length > 0
      ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
      : 0;
    const p95 = duracoes.length > 0
      ? Math.round([...duracoes].sort((a, b) => a - b)[Math.floor(duracoes.length * 0.95)] ?? 0)
      : 0;
    return { total, sucessos, falhas, taxa, mediaMs, p95 };
  }, [logs]);

  // Distribuição por evento (fila atual)
  const porEvento = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fila) m.set(f.evento_interno, (m.get(f.evento_interno) ?? 0) + 1);
    return Array.from(m.entries())
      .map(([evento_interno, total]) => ({ evento_interno, total }))
      .sort((a, b) => b.total - a.total);
  }, [fila]);

  // Distribuição por status (fila atual)
  const porStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fila) m.set(f.status, (m.get(f.status) ?? 0) + 1);
    return Array.from(m.entries()).map(([status, total]) => ({ status, total }));
  }, [fila]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-muted-foreground">Envios (14d)</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.sucessos} sucesso · {kpis.falhas} falha
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-muted-foreground">Taxa de sucesso</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{kpis.taxa.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">últimos 14 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-muted-foreground">Tempo médio</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.mediaMs}ms</div>
            <p className="text-xs text-muted-foreground mt-1">p95: {kpis.p95}ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-muted-foreground">Falhas</CardTitle>
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{kpis.falhas}</div>
            <p className="text-xs text-muted-foreground mt-1">requerem atenção</p>
          </CardContent>
        </Card>
      </div>

      {/* Envios por dia */}
      <Card>
        <CardHeader>
          <CardTitle>Envios por dia (últimos 14 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={seriePorDia}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                  }}
                />
                <Legend />
                <Bar dataKey="sucesso" stackId="a" fill={COLORS.sucesso} name="Sucesso" />
                <Bar dataKey="falha" stackId="a" fill={COLORS.falha} name="Falha" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tempo médio */}
      <Card>
        <CardHeader>
          <CardTitle>Tempo médio de resposta (ms)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieDuracao}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="media_ms"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Distribuição por evento */}
        <Card>
          <CardHeader>
            <CardTitle>Fila por tipo de evento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {porEvento.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Fila vazia
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porEvento} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis
                      type="category"
                      dataKey="evento_interno"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      width={140}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                    />
                    <Bar dataKey="total" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Distribuição por status */}
        <Card>
          <CardHeader>
            <CardTitle>Fila por status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {porStatus.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Fila vazia
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={porStatus}
                      dataKey="total"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(e) => `${e.status}: ${e.total}`}
                    >
                      {porStatus.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            COLORS[entry.status as keyof typeof COLORS] ?? "hsl(var(--primary))"
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
