import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, MapPin, RefreshCw } from "lucide-react";

type Sugestao = {
  id: string;
  destinatario_id: string;
  endereco_id: string | null;
  cluster_lat: number;
  cluster_lng: number;
  num_pings: number;
  num_rotas_distintas: number;
  primeira_visita: string;
  ultima_visita: string;
  raio_cluster_metros: number;
  distancia_atual_metros: number | null;
  origem_atual: string | null;
  confianca_atual: number | null;
  status: string;
  created_at: string;
};

type Destinatario = { id: string; razao_social: string; nome_fantasia: string | null; cnpj_cpf: string };

export default function RevisaoCoordenadas() {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [gerando, setGerando] = useState(false);

  const { data: sugestoes, isLoading } = useQuery({
    queryKey: ["sugestoes-coordenada", "pendente"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sugestoes_coordenada")
        .select("*")
        .eq("status", "pendente")
        .order("num_pings", { ascending: false });
      if (error) throw error;
      return data as Sugestao[];
    },
  });

  const destIds = Array.from(new Set((sugestoes ?? []).map((s) => s.destinatario_id)));

  const { data: destinatarios } = useQuery({
    queryKey: ["dest-sugestoes", destIds],
    enabled: destIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("destinatarios")
        .select("id, razao_social, nome_fantasia, cnpj_cpf")
        .in("id", destIds);
      if (error) throw error;
      const m = new Map<string, Destinatario>();
      (data as Destinatario[]).forEach((d) => m.set(d.id, d));
      return m;
    },
  });

  const aprovar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("aprovar_sugestao_coordenada", { p_sugestao_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.coordenada_atualizada ? "Aprovada e coordenada atualizada" : "Aprovada (coordenada atual já tinha confiança maior)");
      qc.invalidateQueries({ queryKey: ["sugestoes-coordenada"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao aprovar"),
  });

  const rejeitar = useMutation({
    mutationFn: async ({ id, m }: { id: string; m: string }) => {
      const { error } = await supabase.rpc("rejeitar_sugestao_coordenada", {
        p_sugestao_id: id,
        p_motivo: m,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rejeitada");
      qc.invalidateQueries({ queryKey: ["sugestoes-coordenada"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao rejeitar"),
  });

  const gerarAgora = async () => {
    setGerando(true);
    try {
      const { data, error } = await supabase.rpc("gerar_sugestoes_dwell_factual");
      if (error) throw error;
      toast.success(`${(data ?? []).length} sugestão(ões) geradas`);
      qc.invalidateQueries({ queryKey: ["sugestoes-coordenada"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Revisão de coordenadas — Frente A</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Sugestões geradas pelo agrupamento factual de pings GPS dos motoristas (accuracy ≤50m, durante atendimento).
            Só aparecem clientes com pelo menos 2 rotas distintas, ≥20 pings, raio ≤80m e distância entre 150m e 50km da coordenada atual.
            A aprovação promove a nova coordenada para confiança 95 (só sobrescreve origens abaixo disso).
          </p>
        </div>
        <Button onClick={gerarAgora} disabled={gerando} variant="outline">
          {gerando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Gerar agora
        </Button>
      </div>

      {isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>}
      {!isLoading && (sugestoes?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma sugestão pendente. Job diário roda às 03:30; use "Gerar agora" para forçar.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {(sugestoes ?? []).map((s) => {
          const dest = destinatarios?.get(s.destinatario_id);
          const gmapsCluster = `https://www.google.com/maps?q=${s.cluster_lat},${s.cluster_lng}`;
          const gmapsCompare =
            s.confianca_atual != null
              ? `https://www.google.com/maps/dir/?api=1&origin=${s.cluster_lat},${s.cluster_lng}&destination=CURRENT`
              : null;
          return (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <span>{dest?.nome_fantasia || dest?.razao_social || "Destinatário"}</span>
                  <Badge variant="outline" className="text-xs">{dest?.cnpj_cpf}</Badge>
                  <Badge className="text-xs">{s.num_pings} pings · {s.num_rotas_distintas} rotas</Badge>
                  <Badge variant="secondary" className="text-xs">raio {Math.round(s.raio_cluster_metros)}m</Badge>
                  {s.distancia_atual_metros != null && (
                    <Badge variant="destructive" className="text-xs">
                      {(s.distancia_atual_metros / 1000).toFixed(2)} km da atual
                    </Badge>
                  )}
                  {s.origem_atual && (
                    <Badge variant="outline" className="text-xs">
                      atual: {s.origem_atual} ({s.confianca_atual ?? 0})
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <a href={gmapsCluster} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                    <MapPin className="w-4 h-4" />
                    Cluster: {Number(s.cluster_lat).toFixed(6)}, {Number(s.cluster_lng).toFixed(6)}
                  </a>
                  <div className="text-muted-foreground">
                    Período: {new Date(s.primeira_visita).toLocaleDateString()} → {new Date(s.ultima_visita).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-start">
                  <Textarea
                    placeholder="Motivo da rejeição (opcional)"
                    value={motivo[s.id] ?? ""}
                    onChange={(e) => setMotivo({ ...motivo, [s.id]: e.target.value })}
                    className="flex-1 min-w-[240px] h-10"
                  />
                  <Button
                    onClick={() => aprovar.mutate(s.id)}
                    disabled={aprovar.isPending}
                    size="sm"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar
                  </Button>
                  <Button
                    onClick={() => rejeitar.mutate({ id: s.id, m: motivo[s.id] || "" })}
                    disabled={rejeitar.isPending}
                    variant="outline"
                    size="sm"
                  >
                    <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
