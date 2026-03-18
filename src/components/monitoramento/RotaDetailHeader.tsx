import { Card, CardContent } from "@/components/ui/card";
import { Truck } from "lucide-react";
import type { MonitoramentoRota } from "./types";

interface RotaDetailHeaderProps {
  rota: MonitoramentoRota;
  formatDateTime: (iso: string | null) => string;
}

export function RotaDetailHeader({ rota, formatDateTime }: RotaDetailHeaderProps) {
  const progress = rota.total_paradas
    ? (rota.paradas_concluidas / rota.total_paradas) * 100
    : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{rota.placa}</h2>
              <p className="text-sm text-muted-foreground">{rota.motorista || "—"}</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">
              {rota.paradas_concluidas}/{rota.total_paradas} entregas
            </p>
            <p className="text-muted-foreground">
              {rota.ultima_atualizacao
                ? `GPS: ${formatDateTime(rota.ultima_atualizacao)}`
                : "Sem posição GPS"}
            </p>
          </div>
        </div>
        <div className="mt-3 bg-muted rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
