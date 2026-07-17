import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  total: number;
  porTipo: Record<string, number>;
  loading?: boolean;
}

export function AlertasResumo({ total, porTipo, loading }: Props) {
  const tipos = Object.entries(porTipo).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-warning" />
          Alertas da Torre
        </CardTitle>
        <Link to="/torre-controle" className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
          Abrir <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">
          {loading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-muted" /> : total}
        </div>
        <p className="text-xs text-muted-foreground mb-3">não lidos</p>
        {tipos.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tipos.map(([tipo, n]) => (
              <Badge key={tipo} variant="outline" className="text-xs">
                {tipo}: {n}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sem alertas pendentes</p>
        )}
      </CardContent>
    </Card>
  );
}
