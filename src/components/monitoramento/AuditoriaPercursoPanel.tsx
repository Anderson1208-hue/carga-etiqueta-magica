import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, MapPin, Search, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Estadia {
  cluster_num: number;
  inicio: string;
  fim: string;
  duracao_min: number;
  latitude: number;
  longitude: number;
  pontos: number;
  parada_planejada_id: string | null;
  parada_ordem: number | null;
  parada_razao_social: string | null;
  distancia_parada_m: number | null;
  classificacao: "planejada" | "almoco" | "suspeita" | "atencao";
}

interface Props {
  rotaId: string;
  formatTime: (ts: string) => string;
}

const CLASS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  planejada: { label: "Planejada", variant: "outline", className: "border-green-500 text-green-700 dark:text-green-400" },
  almoco: { label: "Almoço", variant: "secondary" },
  atencao: { label: "Atenção", variant: "outline", className: "border-yellow-500 text-yellow-700 dark:text-yellow-400" },
  suspeita: { label: "Suspeita", variant: "destructive" },
};

export function AuditoriaPercursoPanel({ rotaId, formatTime }: Props) {
  const [loading, setLoading] = useState(false);
  const [carregou, setCarregou] = useState(false);
  const [estadias, setEstadias] = useState<Estadia[]>([]);

  async function analisar() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("detectar_paradas_suspeitas", {
        p_rota_id: rotaId,
      });
      if (error) throw error;
      setEstadias((data || []) as Estadia[]);
      setCarregou(true);
    } catch (err: any) {
      console.error("Erro ao analisar percurso:", err);
      toast({
        title: "Erro ao analisar",
        description: err.message || "Falha ao processar rastro GPS",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const suspeitas = estadias.filter((e) => e.classificacao === "suspeita").length;
  const atencao = estadias.filter((e) => e.classificacao === "atencao").length;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="w-4 h-4" />
          Auditoria de Percurso
          {carregou && (suspeitas > 0 || atencao > 0) && (
            <span className="text-xs text-muted-foreground font-normal">
              {suspeitas > 0 && <span className="text-destructive">{suspeitas} suspeita{suspeitas > 1 ? "s" : ""}</span>}
              {suspeitas > 0 && atencao > 0 && " · "}
              {atencao > 0 && <span className="text-yellow-600">{atencao} atenção</span>}
            </span>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={analisar} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
          {carregou ? "Reanalisar" : "Analisar paradas"}
        </Button>
      </CardHeader>
      <CardContent>
        {!carregou && !loading && (
          <p className="text-sm text-muted-foreground">
            Detecta onde o veículo ficou parado 5 min ou mais (dentro ou fora da rota planejada) a partir do
            rastro GPS. Sem custo — usa apenas dados já gravados.
          </p>
        )}

        {carregou && estadias.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma estadia com 5 min ou mais encontrada no rastro desta rota.
          </p>
        )}

        {estadias.length > 0 && (
          <div className="space-y-2">
            {estadias.map((e) => {
              const meta = CLASS_LABEL[e.classificacao];
              const isBad = e.classificacao === "suspeita";
              const mapUrl = `https://www.google.com/maps?q=${e.latitude},${e.longitude}`;
              return (
                <div
                  key={e.cluster_num}
                  className={`rounded-md border p-3 text-sm ${
                    isBad ? "border-destructive/40 bg-destructive/5" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">#{e.cluster_num}</span>
                      <Badge variant={meta.variant} className={meta.className}>
                        {isBad && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {meta.label}
                      </Badge>
                      <span className="font-medium">
                        {formatTime(e.inicio)} → {formatTime(e.fim)}
                      </span>
                      <span className="text-muted-foreground">
                        ({e.duracao_min} min, {e.pontos} pts)
                      </span>
                    </div>
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                    >
                      <MapPin className="w-3 h-3" />
                      Ver no mapa
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.parada_planejada_id ? (
                      <>
                        {e.classificacao === "planejada" ? (
                          <>
                            Dentro do geofence da parada #{e.parada_ordem} —{" "}
                            {e.parada_razao_social || "Cliente"}
                          </>
                        ) : (
                          <>
                            Parada planejada mais próxima: #{e.parada_ordem}{" "}
                            {e.parada_razao_social || ""} · {e.distancia_parada_m} m de distância
                          </>
                        )}
                      </>
                    ) : (
                      <>Sem parada planejada próxima</>
                    )}
                    {" · "}
                    <span className="font-mono">
                      {Number(e.latitude).toFixed(5)}, {Number(e.longitude).toFixed(5)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
