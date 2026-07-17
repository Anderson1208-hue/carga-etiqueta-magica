import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  pendentes: number;
  erros: number;
  sucesso24h: number;
  total24h: number;
  loading?: boolean;
}

export function IbacResumo({ pendentes, erros, sucesso24h, total24h, loading }: Props) {
  const taxa = total24h > 0 ? Math.round((sucesso24h / total24h) * 100) : null;
  const cor = taxa == null ? "text-muted-foreground" : taxa >= 95 ? "text-success" : taxa >= 80 ? "text-warning" : "text-destructive";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          Integração IBAC
        </CardTitle>
        <Link to="/integracao-ibac" className="text-xs text-muted-foreground hover:underline flex items-center gap-1">
          Abrir <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Fila" value={pendentes} loading={loading} />
          <Stat label="Erros" value={erros} loading={loading} tone={erros > 0 ? "text-destructive" : undefined} />
          <div>
            <div className={cn("text-2xl font-bold tabular-nums", cor)}>
              {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted" /> : taxa == null ? "—" : `${taxa}%`}
            </div>
            <p className="text-xs text-muted-foreground">Sucesso 24h</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, loading, tone }: { label: string; value: number; loading?: boolean; tone?: string }) {
  return (
    <div>
      <div className={cn("text-2xl font-bold tabular-nums", tone)}>
        {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted" /> : value}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
