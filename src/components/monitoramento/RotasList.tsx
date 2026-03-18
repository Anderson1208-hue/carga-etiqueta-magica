import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WifiOff, Truck } from "lucide-react";
import type { MonitoramentoRota, MonitoramentoConfig } from "./types";
import { RotaStatusBadge } from "./StatusBadge";

interface RotasListProps {
  rotas: MonitoramentoRota[];
  selectedRotaId: string | null;
  onSelectRota: (rota: MonitoramentoRota) => void;
  config: MonitoramentoConfig;
  formatDateTime: (iso: string | null) => string;
}

function isInactive(rota: MonitoramentoRota, config: MonitoramentoConfig) {
  if (!rota.ultima_atualizacao || rota.status !== "ativa") return false;
  const diff = (Date.now() - new Date(rota.ultima_atualizacao).getTime()) / 60000;
  return diff > config.tempo_max_sem_atualizacao_min;
}

export function RotasList({ rotas, selectedRotaId, onSelectRota, config, formatDateTime }: RotasListProps) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Rotas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[600px] overflow-y-auto">
        {rotas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Truck className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm text-center">
              Nenhuma rota monitorada ainda.
            </p>
            <p className="text-xs text-center mt-1">
              Clique em "Iniciar Monitoramento" para começar.
            </p>
          </div>
        )}
        {rotas.map((rota) => (
          <button
            key={rota.id}
            onClick={() => onSelectRota(rota)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedRotaId === rota.id
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm">{rota.placa}</span>
              <RotaStatusBadge status={rota.status} />
            </div>
            <p className="text-xs text-muted-foreground">{rota.motorista || "Sem motorista"}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {rota.paradas_concluidas}/{rota.total_paradas} paradas
              </span>
              {isInactive(rota, config) && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <WifiOff className="w-3 h-3" /> Inativo
                </Badge>
              )}
            </div>
            {rota.ultima_atualizacao && (
              <p className="text-xs text-muted-foreground mt-1">
                Última pos: {formatDateTime(rota.ultima_atualizacao)}
              </p>
            )}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
