import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  to?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  loading?: boolean;
}

const TONE: Record<NonNullable<KpiCardProps["tone"]>, { icon: string; ring: string }> = {
  default: { icon: "text-primary", ring: "" },
  success: { icon: "text-success", ring: "" },
  warning: { icon: "text-warning", ring: "" },
  danger: { icon: "text-destructive", ring: "ring-1 ring-destructive/30" },
  info: { icon: "text-primary", ring: "" },
};

export function KpiCard({ title, value, subtitle, icon: Icon, to, tone = "default", loading }: KpiCardProps) {
  const t = TONE[tone];
  const content = (
    <Card className={cn("h-full transition-shadow hover:shadow-md", t.ring, to && "cursor-pointer")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="flex items-center gap-1">
          <Icon className={cn("h-5 w-5", t.icon)} />
          {to && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">
          {loading ? <span className="inline-block h-8 w-16 animate-pulse rounded bg-muted" /> : value}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}
