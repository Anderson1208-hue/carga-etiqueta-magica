import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ScanLine, Truck, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPendingBaixasCount } from "@/hooks/useOfflineEntregas";

const tabs = [
  { path: "/conferencia-interna", label: "Conf. Interna", icon: Warehouse, showPendingBadge: false },
  { path: "/conferencia-externa", label: "Conf. Externa", icon: ScanLine, showPendingBadge: false },
  { path: "/baixa-entrega", label: "Baixa Entrega", icon: Truck, showPendingBadge: true },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = () => getPendingBaixasCount().then(setPending).catch(() => setPending(0));
    refresh();
    window.addEventListener("offline-pending-changed", refresh);
    window.addEventListener("online", refresh);
    // Atualização periódica leve, garante consistência se algo escapou do evento.
    const interval = setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("offline-pending-changed", refresh);
      window.removeEventListener("online", refresh);
      clearInterval(interval);
    };
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t flex">
      {tabs.map((tab) => {
        const active = location.pathname === tab.path;
        const showBadge = tab.showPendingBadge && pending > 0;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors relative",
              active ? "text-primary font-semibold" : "text-muted-foreground"
            )}
          >
            <div className="relative">
              <tab.icon className="w-5 h-5" />
              {showBadge && (
                <span
                  aria-label={`${pending} pendentes para sincronizar`}
                  className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center leading-none"
                >
                  {pending > 99 ? "99+" : pending}
                </span>
              )}
            </div>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
