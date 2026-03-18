import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Alerta } from "./types";

interface AlertasPanelProps {
  alertas: Alerta[];
  onMarkRead: (id: string) => void;
  formatDateTime: (iso: string | null) => string;
}

export function AlertasPanel({ alertas, onMarkRead, formatDateTime }: AlertasPanelProps) {
  if (alertas.length === 0) return null;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-warning">
          <Bell className="w-4 h-4" /> Alertas ({alertas.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alertas.map((alerta) => (
          <div
            key={alerta.id}
            className="flex items-center justify-between p-2 bg-background rounded-lg border"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{alerta.mensagem}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(alerta.created_at)}</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onMarkRead(alerta.id)}>
              <CheckCircle2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
