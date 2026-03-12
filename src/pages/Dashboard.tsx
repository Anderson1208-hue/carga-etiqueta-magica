import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Truck,
  FileText,
  Tags,
  CheckCircle2,
  Clock,
  ArrowRight,
  Package,
} from "lucide-react";

interface Stats {
  cargasAbertas: number;
  cargasFechadas: number;
  totalNfs: number;
  etiquetasPendentes: number;
  etiquetasConferidasInterno: number;
  etiquetasConferidas: number;
  etiquetasDivergencia: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    cargasAbertas: 0,
    cargasFechadas: 0,
    totalNfs: 0,
    etiquetasPendentes: 0,
    etiquetasConferidasInterno: 0,
    etiquetasConferidas: 0,
    etiquetasDivergencia: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [cargasRes, nfsRes, etiquetasRes] = await Promise.all([
        supabase.from("cargas").select("status"),
        supabase.from("notas_fiscais").select("id", { count: "exact" }),
        supabase.from("etiquetas").select("status"),
      ]);

      const cargas = cargasRes.data || [];
      const etiquetas = etiquetasRes.data || [];

      setStats({
        cargasAbertas: cargas.filter((c) => c.status === "aberta").length,
        cargasFechadas: cargas.filter((c) => c.status === "fechada").length,
        totalNfs: nfsRes.count || 0,
        etiquetasPendentes: etiquetas.filter((e) => e.status === "pendente").length,
        etiquetasConferidasInterno: etiquetas.filter((e) => e.status === "conferido_interno").length,
        etiquetasConferidas: etiquetas.filter((e) => e.status === "conferido").length,
        etiquetasDivergencia: etiquetas.filter((e) => e.status === "divergencia").length,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  }

  const totalEtiquetas =
    stats.etiquetasPendentes + stats.etiquetasConferidasInterno + stats.etiquetasConferidas;
  const totalConferidas = stats.etiquetasConferidasInterno + stats.etiquetasConferidas;
  const progressPercent =
    totalEtiquetas > 0
      ? Math.round((totalConferidas / totalEtiquetas) * 100)
      : 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral do sistema de recebimento
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Cargas Abertas
              </CardTitle>
              <Truck className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.cargasAbertas}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.cargasFechadas} fechadas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Notas Fiscais
              </CardTitle>
              <FileText className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalNfs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Total importadas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Etiquetas Pendentes
              </CardTitle>
              <Clock className="h-5 w-5 text-pending" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.etiquetasPendentes}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Aguardando conferência
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Conferidas (Total)
              </CardTitle>
              <CheckCircle2 className="h-5 w-5 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalConferidas}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.etiquetasConferidasInterno} interna · {stats.etiquetasConferidas} externa
                {stats.etiquetasDivergencia > 0 && ` · ${stats.etiquetasDivergencia} diverg.`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Progress Card */}
        {totalEtiquetas > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                Progresso de Conferência
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {totalConferidas} de {totalEtiquetas} etiquetas
                  </span>
                  <span className="font-medium">{progressPercent}%</span>
                </div>
                <div className="h-3 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold mb-1">Nova Carga</h3>
                  <p className="text-sm text-muted-foreground">
                    Criar nova carga e importar XMLs
                  </p>
                </div>
                <Link to="/cargas">
                  <Button size="sm">
                    Criar
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold mb-1">Gerar Etiquetas</h3>
                  <p className="text-sm text-muted-foreground">
                    Criar PDF de etiquetas para impressão
                  </p>
                </div>
                <Link to="/etiquetas">
                  <Button size="sm" variant="secondary">
                    Gerar
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold mb-1">Conferência</h3>
                  <p className="text-sm text-muted-foreground">
                    Ler QR codes e conferir etiquetas
                  </p>
                </div>
                <Link to="/conferencia">
                  <Button size="sm" variant="secondary">
                    Iniciar
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
