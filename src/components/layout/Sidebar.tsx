import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  Truck,
  Upload,
  FileText,
  Tags,
  CheckSquare,
  LogOut,
  User,
  LayoutDashboard,
  Smartphone,
  Route,
  CalendarClock,
  ClipboardCheck,
  History,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Cargas", href: "/cargas", icon: Truck },
  { name: "Upload XML", href: "/upload", icon: Upload },
  { name: "Romaneio", href: "/romaneio", icon: FileText },
  { name: "Etiquetas", href: "/etiquetas", icon: Tags },
  { name: "Conferência", href: "/conferencia", icon: CheckSquare },
  { name: "Conf. Interna", href: "/conferencia-interna", icon: Warehouse },
  { name: "Conf. Externa", href: "/conferencia-externa", icon: Smartphone },
  { name: "Roteirização", href: "/roteirizacao", icon: Route },
  { name: "Programação", href: "/programacao", icon: CalendarClock },
  { name: "Baixa Entrega", href: "/baixa-entrega", icon: ClipboardCheck },
  { name: "Histórico Entregas", href: "/historico-entregas", icon: History },
];

export function Sidebar() {
  const location = useLocation();
  const { profile, signOut, isAdmin } = useAuth();

  return (
    <div className="flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
          <Truck className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        <span className="font-semibold text-lg">WMS Recebimento</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {profile?.full_name || profile?.email}
            </p>
            <p className="text-xs text-sidebar-foreground/60 capitalize">
              {isAdmin ? "Administrador" : "Operador"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sair
        </Button>
      </div>
    </div>
  );
}
