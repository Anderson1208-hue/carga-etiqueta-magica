import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface Item {
  label: string;
  count: number;
  to: string;
}

export function HealthBanner({ items }: { items: Item[] }) {
  const critical = items.filter((i) => i.count > 0);
  if (critical.length === 0) return null;

  return (
    <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Atenção — itens exigem ação</AlertTitle>
      <AlertDescription>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {critical.map((i) => (
            <Link key={i.label} to={i.to} className="underline underline-offset-2 hover:opacity-80">
              {i.count} {i.label}
            </Link>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
