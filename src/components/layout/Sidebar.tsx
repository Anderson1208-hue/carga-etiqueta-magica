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
  Package,
  MapPin,
  CalendarClock,
  FileSearch,
  Users,
  Radio,
  Radar,
  Eye,
  ShieldCheck,
  FileSpreadsheet,
  BarChart3,
  ChevronRight,
  HandCoins,
  Building2,
  Plug,
  Contact,
  Upload,
  Receipt,
  
  
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState } from "react";

const topNav = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Cargas", href: "/cargas", icon: Truck },
  { name: "Consulta NF", href: "/consulta-nf", icon: FileSearch },
];

const depositoItems = [
  { name: "Romaneio", href: "/romaneio", icon: FileText },
  { name: "Etiquetas", href: "/etiquetas", icon: Tags },
  { name: "Endereçamento", href: "/enderecamento", icon: MapPin },
  { name: "Conf. Interna", href: "/conferencia-interna", icon: Warehouse },
];

const transporteItems = [
  { name: "Conf. Externa", href: "/conferencia-externa", icon: Smartphone },
  { name: "Roteirização", href: "/roteirizacao", icon: Route },
  { name: "Preparação", href: "/programacao", icon: ClipboardList },
  { name: "Agendamento", href: "/agendamento", icon: CalendarClock },
  { name: "Baixa Entrega", href: "/baixa-entrega", icon: ClipboardCheck },
  { name: "Pré-CT-e", href: "/pre-cte", icon: FileText },
  { name: "Prestação de Contas", href: "/prestacao-contas", icon: HandCoins },
  
  { name: "Histórico Entregas", href: "/historico-entregas", icon: History },
];

const torreControleItems = [
  { name: "Torre de Controle", href: "/torre-controle", icon: Radar },
  { name: "Acompanhamento Rápido", href: "/acompanhamento-rotas", icon: Radio },
];

const cadastrosItems = [
  { name: "Embarcadores", href: "/embarcadores", icon: Building2 },
  { name: "Destinatários", href: "/destinatarios", icon: Contact },
];

const relatoriosItems = [
  { name: "Relatório de Baixas", href: "/relatorios/baixas", icon: ClipboardCheck },
  { name: "NFs Pendentes Baixa", href: "/relatorios/pendentes-baixa", icon: ClipboardList },
  { name: "Agend. por Fornecedor", href: "/relatorios/agendamentos-fornecedor", icon: FileSpreadsheet },
];

function NavItem({ item, isActive, onClick }: { item: { name: string; href: string; icon: React.ElementType }; isActive: boolean; onClick?: () => void }) {
  return (
    <Link
      to={item.href}
      onClick={onClick}
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

function NavGroupFlyout({
  label,
  icon: Icon,
  items,
  pathname,
  groupActive,
}: {
  label: string;
  icon: React.ElementType;
  items: typeof depositoItems;
  pathname: string;
  groupActive: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-semibold transition-colors",
            groupActive
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-sidebar-foreground/90 hover:bg-sidebar-accent"
          )}
        >
          <Icon className="w-5 h-5" />
          <span className="flex-1 text-left">{label}</span>
          <ChevronRight className={cn("w-4 h-4 transition-transform", open && "rotate-90")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-60 p-2 bg-sidebar text-sidebar-foreground border-sidebar-border"
      >
        <p className="px-2 pt-1 pb-2 text-xs uppercase tracking-wide text-sidebar-foreground/50">
          {label}
        </p>
        <div className="space-y-0.5">
          {items.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isActive={pathname === item.href}
              onClick={() => setOpen(false)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Sidebar() {
  const location = useLocation();
  const { profile, signOut, isAdmin } = useAuth();

  const depositoActive = depositoItems.some((i) => location.pathname === i.href);
  const transporteActive = transporteItems.some((i) => location.pathname === i.href);
  const torreActive = torreControleItems.some((i) => location.pathname === i.href);
  const relatoriosActive = relatoriosItems.some((i) => location.pathname === i.href);
  const cadastrosActive = cadastrosItems.some((i) => location.pathname === i.href);

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
          <NavGroupFlyout
            label="Cadastros"
            icon={Building2}
            items={cadastrosItems}
            pathname={location.pathname}
            groupActive={cadastrosActive}
          />
          <NavGroupFlyout
            label="Depósito"
            icon={Package}
            items={depositoItems}
            pathname={location.pathname}
            groupActive={depositoActive}
          />
          <NavGroupFlyout
            label="Transporte"
            icon={MapPin}
            items={transporteItems}
            pathname={location.pathname}
            groupActive={transporteActive}
          />
          <NavGroupFlyout
            label="Torre de Controle"
            icon={Eye}
            items={torreControleItems}
            pathname={location.pathname}
            groupActive={torreActive}
          />
          <NavGroupFlyout
            label="Relatórios"
            icon={BarChart3}
            items={relatoriosItems}
            pathname={location.pathname}
            groupActive={relatoriosActive}
          />
          <div className="pt-2 space-y-0.5">
            {isAdmin && (
              <>
                <NavItem
                  item={{ name: "Operadores", href: "/operadores", icon: Users }}
                  isActive={location.pathname === "/operadores"}
                />
                <NavItem
                  item={{ name: "Auditoria", href: "/auditoria", icon: ShieldCheck }}
                  isActive={location.pathname === "/auditoria"}
                />
                <NavItem
                  item={{ name: "Integração IBAC", href: "/integracoes/ibac", icon: Plug }}
                  isActive={location.pathname === "/integracoes/ibac"}
                />
                <NavItem
                  item={{ name: "Importar OCOREN", href: "/integracoes/ocoren", icon: Upload }}
                  isActive={location.pathname === "/integracoes/ocoren"}
                />
                <NavItem
                  item={{ name: "Config. Fiscal", href: "/fiscal/configuracao", icon: Receipt }}
                  isActive={location.pathname === "/fiscal/configuracao"}
                />
              </>
            )}
          </div>
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
