import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  MapPin,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Circle, CircleMarker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const iconAtual = L.divIcon({
  className: "",
  html: `<div style="background:#dc2626;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,.5)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});
const iconCluster = L.divIcon({
  className: "",
  html: `<div style="background:#16a34a;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,.5)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

type Vizinho = { destinatario_id: string; nome: string; cnpj: string; distancia_m: number };

type Sugestao = {
  id: string;
  destinatario_id: string;
  endereco_id: string | null;
  cluster_lat: number;
  cluster_lng: number;
  num_pings: number;
  num_rotas_distintas: number;
  num_placas_distintas: number | null;
  primeira_visita: string;
  ultima_visita: string;
  raio_cluster_metros: number;
  distancia_atual_metros: number | null;
  origem_atual: string | null;
  confianca_atual: number | null;
  clientes_vizinhos_200m: Vizinho[] | null;
  status: string;
  created_at: string;
};

type Destinatario = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj_cpf: string;
};

type Endereco = {
  id: string;
  destinatario_id: string;
  latitude: number | null;
  longitude: number | null;
};

function MapaSugestao({ sug, enderecoAtual }: { sug: Sugestao; enderecoAtual?: Endereco }) {
  const { data: pings } = useQuery({
    queryKey: ["pings-sug", sug.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pings_sugestao_coordenada", {
        p_sugestao_id: sug.id,
      });
      if (error) throw error;
      return (data ?? []) as { lat: number; lng: number }[];
    },
  });

  const center: [number, number] = [Number(sug.cluster_lat), Number(sug.cluster_lng)];
  const atual: [number, number] | null =
    enderecoAtual?.latitude && enderecoAtual?.longitude
      ? [Number(enderecoAtual.latitude), Number(enderecoAtual.longitude)]
      : null;

  return (
    <div className="h-[280px] rounded-md overflow-hidden border">
      <MapContainer center={center} zoom={16} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle center={center} radius={sug.raio_cluster_metros} pathOptions={{ color: "#16a34a", weight: 1, fillOpacity: 0.08 }} />
        {(pings ?? []).map((p, i) => (
          <CircleMarker key={i} center={[Number(p.lat), Number(p.lng)]} radius={3}
            pathOptions={{ color: "#16a34a", fillColor: "#16a34a", fillOpacity: 0.6, weight: 0 }} />
        ))}
        <Marker position={center} icon={iconCluster}>
          <Popup>Cluster sugerido (verde)</Popup>
        </Marker>
        {atual && (
          <Marker position={atual} icon={iconAtual}>
            <Popup>Coordenada atual (vermelho)</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

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
        .eq("status", "pendente");
      if (error) throw error;
      return (data ?? []) as unknown as Sugestao[];
    },
  });

  const destIds = useMemo(
    () => Array.from(new Set((sugestoes ?? []).map((s) => s.destinatario_id))),
    [sugestoes],
  );
  const endIds = useMemo(
    () => Array.from(new Set((sugestoes ?? []).map((s) => s.endereco_id).filter(Boolean) as string[])),
    [sugestoes],
  );

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

  const { data: enderecos } = useQuery({
    queryKey: ["end-sugestoes", endIds],
    enabled: endIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("destinatario_enderecos")
        .select("id, destinatario_id, latitude, longitude")
        .in("id", endIds);
      if (error) throw error;
      const m = new Map<string, Endereco>();
      (data as Endereco[]).forEach((e) => m.set(e.id, e));
      return m;
    },
  });

  // Ordem inteligente (Manus): distância <3km + muitos pings primeiro
  const ordenadas = useMemo(() => {
    const arr = [...(sugestoes ?? [])];
    arr.sort((a, b) => {
      const aClose = (a.distancia_atual_metros ?? 0) < 3000 ? 0 : 1;
      const bClose = (b.distancia_atual_metros ?? 0) < 3000 ? 0 : 1;
      if (aClose !== bClose) return aClose - bClose;
      return b.num_pings - a.num_pings;
    });
    return arr;
  }, [sugestoes]);

  const aprovar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("aprovar_sugestao_coordenada", { p_sugestao_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.coordenada_atualizada
        ? "Aprovada e coordenada atualizada"
        : "Aprovada (coordenada atual já tinha confiança maior)");
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
      toast.success("Rejeitada — bloqueada por 60 dias");
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

  const tentarRejeitar = (id: string) => {
    const m = (motivo[id] || "").trim();
    if (m.length < 3) {
      toast.error("Informe o motivo da rejeição (mínimo 3 caracteres)");
      return;
    }
    rejeitar.mutate({ id, m });
  };

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <Button asChild variant="ghost" size="sm" className="mb-2">
        <Link to="/">
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar ao menu principal
        </Link>
      </Button>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Revisão de coordenadas — Frente A</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Sugestões factuais (accuracy ≤50m, raio ≤80m, ≥2 rotas distintas, distância 150m–50km da atual).
            Aprovar promove para confiança 95. Rejeitar exige motivo e bloqueia a mesma sugestão por 60 dias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {ordenadas.length} pendente(s)
          </Badge>
          <Button onClick={gerarAgora} disabled={gerando} variant="outline">
            {gerando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Gerar agora
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      )}
      {!isLoading && ordenadas.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma sugestão pendente. Job diário roda às 03:30 — use "Gerar agora" para forçar.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {ordenadas.map((s) => {
          const dest = destinatarios?.get(s.destinatario_id);
          const endAtual = s.endereco_id ? enderecos?.get(s.endereco_id) : undefined;
          const vizinhos = (s.clientes_vizinhos_200m ?? []) as Vizinho[];
          const cnpj = dest?.cnpj_cpf ?? "";
          const filial = cnpj.replace(/\D/g, "").slice(8, 12);
          const distKm =
            s.distancia_atual_metros != null ? (s.distancia_atual_metros / 1000).toFixed(2) : null;
          const isBig = (s.distancia_atual_metros ?? 0) > 10000;

          return (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <span>{dest?.nome_fantasia || dest?.razao_social || "Destinatário"}</span>
                  {cnpj && (
                    <Badge variant="outline" className="text-xs font-mono">
                      {cnpj}
                      {filial && <span className="ml-1 text-primary">·filial {filial}</span>}
                    </Badge>
                  )}
                  <Badge className="text-xs">
                    {s.num_pings} pings · {s.num_rotas_distintas} rotas · {s.num_placas_distintas ?? "?"} placas
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    raio {Math.round(s.raio_cluster_metros)}m
                  </Badge>
                  {distKm && (
                    <Badge variant={isBig ? "destructive" : "default"} className="text-xs">
                      {distKm} km da atual{isBig && " — escrutínio!"}
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
                <MapaSugestao sug={s} enderecoAtual={endAtual} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-green-600" />
                    <span className="font-mono text-xs">
                      {Number(s.cluster_lat).toFixed(6)}, {Number(s.cluster_lng).toFixed(6)}
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${s.cluster_lat},${s.cluster_lng}&t=k`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                    >
                      satélite <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Evidências: {new Date(s.primeira_visita).toLocaleDateString()} →{" "}
                    {new Date(s.ultima_visita).toLocaleDateString()}
                  </div>
                </div>

                {vizinhos.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs space-y-1">
                    <div className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      P4 · {vizinhos.length} outro(s) cliente(s) a &lt;200m do cluster
                    </div>
                    <ul className="ml-5 list-disc">
                      {vizinhos.slice(0, 5).map((v) => (
                        <li key={v.destinatario_id}>
                          {v.nome} ({v.cnpj}) — {v.distancia_m}m
                        </li>
                      ))}
                    </ul>
                    <div className="text-muted-foreground">
                      Confirme que o dwell não é da entrega do vizinho antes de aprovar.
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 items-start">
                  <Textarea
                    placeholder="Motivo da rejeição (obrigatório — ex: rota não executada, cluster em restaurante, coincide com vizinho)"
                    value={motivo[s.id] ?? ""}
                    onChange={(e) => setMotivo({ ...motivo, [s.id]: e.target.value })}
                    className="flex-1 min-w-[240px] h-10"
                  />
                  <Button onClick={() => aprovar.mutate(s.id)} disabled={aprovar.isPending} size="sm">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar
                  </Button>
                  <Button
                    onClick={() => tentarRejeitar(s.id)}
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
