import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ClipboardCheck, Truck, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface FunilProps {
  recebidas: number;
  aguardandoConferencia: number;
  emRota: number;
  entreguesHoje: number;
  loading?: boolean;
}

export function FunilOperacional({ recebidas, aguardandoConferencia, emRota, entreguesHoje, loading }: FunilProps) {
  const etapas = [
    { label: "Recebidas hoje", value: recebidas, icon: Package, color: "text-primary" },
    { label: "Aguardando conf.", value: aguardandoConferencia, icon: ClipboardCheck, color: "text-warning" },
    { label: "Em rota", value: emRota, icon: Truck, color: "text-primary" },
    { label: "Entregues hoje", value: entreguesHoje, icon: CheckCircle2, color: "text-success" },
  ];
  const max = Math.max(...etapas.map((e) => e.value), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Funil operacional</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row md:items-stretch gap-2">
          {etapas.map((e, i) => (
            <div key={e.label} className="flex md:flex-1 items-center gap-2">
              <div className="flex-1 rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <e.icon className={cn("h-4 w-4", e.color)} />
                  <span>{e.label}</span>
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted" /> : e.value}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full transition-all", e.color.replace("text-", "bg-"))}
                    style={{ width: `${Math.round((e.value / max) * 100)}%` }}
                  />
                </div>
              </div>
              {i < etapas.length - 1 && (
                <ChevronRight className="hidden md:block h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
