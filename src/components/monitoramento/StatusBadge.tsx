import { Badge } from "@/components/ui/badge";
import {
  CircleDot,
  Navigation,
  MapPin,
  Timer,
  CheckCircle2,
  SkipForward,
  AlertTriangle,
  Shuffle,
  Zap,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: React.ElementType }> = {
  programada: { label: "Programada", variant: "secondary", icon: CircleDot },
  em_rota: { label: "Em Rota", variant: "default", icon: Navigation },
  chegou_cliente: { label: "Chegou no Cliente", variant: "warning", icon: MapPin },
  em_atendimento: { label: "Em Atendimento", variant: "accent", icon: Timer },
  finalizada: { label: "Finalizada", variant: "success", icon: CheckCircle2 },
  pulada: { label: "Pulada", variant: "destructive", icon: SkipForward },
  parada_excessiva: { label: "Parada Excessiva", variant: "pending", icon: AlertTriangle },
  fora_sequencia: { label: "Fora de Sequência", variant: "outline", icon: Shuffle },
  visita_inconsistente: { label: "Visita Inconsistente", variant: "destructive", icon: Zap },
};

// Maps variant names to semantic token classes
const VARIANT_CLASSES: Record<string, string> = {
  secondary: "bg-secondary text-secondary-foreground border-border",
  default: "bg-primary/15 text-primary border-primary/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  accent: "bg-accent/15 text-accent-foreground border-accent/30",
  success: "bg-success/15 text-success border-success/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
  pending: "bg-pending/15 text-pending border-pending/30",
  outline: "bg-muted text-muted-foreground border-border",
};

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.programada;
  const Icon = cfg.icon;
  const classes = VARIANT_CLASSES[cfg.variant] || VARIANT_CLASSES.secondary;

  return (
    <Badge
      variant="outline"
      className={`gap-1 ${classes} ${size === "sm" ? "text-xs px-1.5 py-0" : ""}`}
    >
      <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
      {cfg.label}
    </Badge>
  );
}

export function RotaStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    ativa: { label: "Ativa", classes: "bg-success/15 text-success border-success/30" },
    finalizada: { label: "Finalizada", classes: "bg-secondary text-secondary-foreground border-border" },
    pausada: { label: "Pausada", classes: "bg-warning/15 text-warning border-warning/30" },
  };
  const cfg = map[status] || map.pausada;

  return (
    <Badge variant="outline" className={`text-xs ${cfg.classes}`}>
      {cfg.label}
    </Badge>
  );
}
