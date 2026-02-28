import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TipoCargaBadgeProps {
  tipoCarga?: string;
  className?: string;
  size?: "sm" | "md";
}

export function TipoCargaBadge({ tipoCarga, className, size = "sm" }: TipoCargaBadgeProps) {
  if (!tipoCarga || tipoCarga === "SECA") return null;

  return (
    <Badge
      className={cn(
        "bg-red-600 text-white hover:bg-red-700 border-red-600 gap-1 shrink-0",
        size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5",
        className
      )}
    >
      <AlertTriangle className={cn(size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5")} />
      CHOCOLATE – TERMO SENSÍVEL
    </Badge>
  );
}

export function isChocolate(tipoCarga?: string | null): boolean {
  return tipoCarga === "CHOCOLATE";
}

export function chocolateRowClass(tipoCarga?: string | null): string {
  if (!isChocolate(tipoCarga)) return "";
  return "bg-red-50 border-l-4 border-l-red-500 dark:bg-red-950/30 dark:border-l-red-600";
}
