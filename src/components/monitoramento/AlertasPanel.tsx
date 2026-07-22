import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, AlertTriangle, CheckCircle2, MapPinOff } from "lucide-react";
import type { Alerta } from "./types";

interface AlertasPanelProps {
  alertas: Alerta[];
  onMarkRead: (id: string) => void;
  onJustificar?: (alerta: Alerta) => void;
  formatDateTime: (iso: string | null) => string;
}

export function AlertasPanel({ alertas, onMarkRead, onJustificar, formatDateTime }: AlertasPanelProps) {
  if (alertas.length === 0) return null;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-warning">
          <Bell className="w-4 h-4" /> Alertas ({alertas.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alertas.map((alerta) => {
          const isNaoProgramada = alerta.tipo === "parada_nao_programada";
          const Icon = isNaoProgramada ? MapPinOff : AlertTriangle;
          return (
            <div
              key={alerta.id}
              className="flex items-center justify-between gap-2 p-2 bg-background rounded-lg border"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className={`w-4 h-4 flex-shrink-0 ${isNaoProgramada ? "text-destructive" : "text-warning"}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isNaoProgramada && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                        NÃO PROGRAMADA
                      </Badge>
                    )}
                    <p className="text-sm font-medium truncate">{alerta.mensagem}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(alerta.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isNaoProgramada && onJustificar && (
                  <Button size="sm" variant="outline" onClick={() => onJustificar(alerta)}>
                    Justificar
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onMarkRead(alerta.id)} title="Marcar como lido">
                  <CheckCircle2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
