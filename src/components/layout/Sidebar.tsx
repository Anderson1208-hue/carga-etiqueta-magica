import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  Truck,
  FileText,
  Tags,
  LogOut,
  User,
  LayoutDashboard,
  Smartphone,
  Route,
  ClipboardList,
  ClipboardCheck,
  History,
  Warehouse,
  ChevronDown,
  Package,
  MapPin,
  CalendarClock,
  FileSearch,
  Users,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const topNav = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Cargas", href: "/cargas", icon: Truck },
  { name: "Consulta NF", href: "/consulta-nf", icon: FileSearch },
];

const depositoItems = [
  { name: "Romaneio", href: "/romaneio", icon: FileText },
  { name: "Etiquetas", href: "/etiquetas", icon: Tags },
  { name: "Conf. Interna", href: "/conferencia-interna", icon: Warehouse },
];

const transporteItems = [
  { name: "Conf. Externa", href: "/conferencia-externa", icon: Smartphone },
  { name: "Roteirização", href: "/roteirizacao", icon: Route },
  { name: "Preparação", href: "/programacao", icon: ClipboardList },
  { name: "Agendamento", href: "/agendamento", icon: CalendarClock },
  { name: "Baixa Entrega", href: "/baixa-entrega", icon: ClipboardCheck },
  { name: "Histórico Entregas", href: "/historico-entregas", icon: History },
];

function NavItem({ item, isActive }: { item: { name: string; href: string; icon: React.ElementType }; isActive: boolean }) {
  return (
    <Link
      to={item.href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-primary"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <item.icon className="w-5 h-5" />
      {item.name}
    </Link>
  );
}

function NavGroup({
  label,
  icon: Icon,
  items,
  pathname,
  defaultOpen,
}: {
  label: string;
  icon: React.ElementType;
  items: typeof depositoItems;
  pathname: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-semibold text-sidebar-foreground/90 hover:bg-sidebar-accent transition-colors"
      >
        <Icon className="w-5 h-5" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="ml-3 pl-3 border-l border-sidebar-border space-y-0.5 mt-0.5">
          {items.map((item) => (
            <NavItem key={item.href} item={item} isActive={pathname === item.href} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const location = useLocation();
  const { profile, signOut, isAdmin } = useAuth();

  const depositoActive = depositoItems.some((i) => location.pathname === i.href);
  const transporteActive = transporteItems.some((i) => location.pathname === i.href);

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
        {topNav.map((item) => (
          <NavItem key={item.href} item={item} isActive={location.pathname === item.href} />
        ))}

        <div className="pt-2 space-y-1">
          <NavGroup
            label="Depósito"
            icon={Package}
            items={depositoItems}
            pathname={location.pathname}
            defaultOpen={depositoActive}
          />
          <NavGroup
            label="Transporte"
            icon={MapPin}
            items={transporteItems}
            pathname={location.pathname}
            defaultOpen={transporteActive}
          />
          {isAdmin && (
            <div className="pt-2">
              <NavItem
                item={{ name: "Operadores", href: "/operadores", icon: Users }}
                isActive={location.pathname === "/operadores"}
              />
            </div>
          )}
        </div>
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