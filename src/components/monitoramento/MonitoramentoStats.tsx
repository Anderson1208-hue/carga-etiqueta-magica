import { Card, CardContent } from "@/components/ui/card";
import { Radio, CheckCircle2, Bell, AlertTriangle } from "lucide-react";

interface StatsProps {
  ativas: number;
  finalizadas: number;
  alertas: number;
  excecoes: number;
}

const STAT_ITEMS = [
  { key: "ativas" as const, label: "Rotas Ativas", icon: Radio, bg: "bg-primary/10", text: "text-primary" },
  { key: "finalizadas" as const, label: "Finalizadas", icon: CheckCircle2, bg: "bg-success/10", text: "text-success" },
  { key: "alertas" as const, label: "Alertas Ativos", icon: Bell, bg: "bg-warning/10", text: "text-warning" },
  { key: "excecoes" as const, label: "Exceções", icon: AlertTriangle, bg: "bg-destructive/10", text: "text-destructive" },
];

export function MonitoramentoStats({ ativas, finalizadas, alertas, excecoes }: StatsProps) {
  const values = { ativas, finalizadas, alertas, excecoes };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {STAT_ITEMS.map(({ key, label, icon: Icon, bg, text }) => (
        <Card key={key}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${text}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{values[key]}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
