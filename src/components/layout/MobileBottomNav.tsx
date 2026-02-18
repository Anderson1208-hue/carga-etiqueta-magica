import { useLocation, useNavigate } from "react-router-dom";
import { ScanLine, Truck, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { path: "/conferencia-interna", label: "Conf. Interna", icon: Warehouse },
  { path: "/conferencia-externa", label: "Conf. Externa", icon: ScanLine },
  { path: "/baixa-entrega", label: "Baixa Entrega", icon: Truck },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t flex">
      {tabs.map((tab) => {
        const active = location.pathname === tab.path;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors",
              active
                ? "text-primary font-semibold"
                : "text-muted-foreground"
            )}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
