import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useGestaoComercial } from "@/hooks/useGestaoComercial";
import { useAcessoIbac } from "@/hooks/useAcessoIbac";
import { useAcessoOkEntrega } from "@/hooks/useAcessoOkEntrega";
import { useAcessoTrackingPandurata } from "@/hooks/useAcessoTrackingPandurata";
import { useAcessoEnvioCanhoto } from "@/hooks/useAcessoEnvioCanhoto";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import {
  Truck,
  FileText,
  FileWarning,
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
  CalendarDays,
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
  Calculator,
  Mail,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
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
  { name: "Romaneio por NF", href: "/romaneio-por-nf", icon: FileText },
  { name: "Etiquetas", href: "/etiquetas", icon: Tags },
  { name: "Endereçamento", href: "/enderecamento", icon: MapPin },
  { name: "Conf. Interna", href: "/conferencia-interna", icon: Warehouse },
];

const transporteItems = [
  { name: "Conf. Externa", href: "/conferencia-externa", icon: Smartphone },
  { name: "Roteirização", href: "/roteirizacao", icon: Route },
  { name: "Preparação", href: "/programacao", icon: ClipboardList },
  { name: "Baixa Entrega", href: "/baixa-entrega", icon: ClipboardCheck },
  { name: "Pré-CT-e", href: "/pre-cte", icon: FileText },
  { name: "Prestação de Contas", href: "/prestacao-contas", icon: HandCoins },
  { name: "Canhotos Pendentes", href: "/canhotos-pendentes", icon: FileWarning },
  { name: "Histórico Entregas", href: "/historico-entregas", icon: History },
];

const agendasItems = [
  { name: "Agendamento", href: "/agendamento", icon: CalendarClock },
  { name: "Cadastro de Agendas", href: "/agendas/cadastro", icon: CalendarDays },
];

const trackingItems = [
  { name: "Tracking Pandurata", href: "/integracoes/tracking-pandurata", icon: Plug },
];

const integracaoItemsBase = [
  { name: "Integração IBAC", href: "/integracoes/ibac", icon: Plug },
  { name: "Integração OK Entrega", href: "/integracoes/okentrega", icon: Plug },
  { name: "Envio de Canhoto", href: "/integracoes/envio-canhoto", icon: Mail },
];

const torreControleItems = [
  { name: "Torre de Controle", href: "/torre-controle", icon: Radar },
  { name: "Acompanhamento Rápido", href: "/acompanhamento-rotas", icon: Radio },
  { name: "Revisão de Coordenadas", href: "/monitoramento/revisao-coordenadas", icon: Radar },
];

const cadastrosItems = [
  { name: "Embarcadores", href: "/embarcadores", icon: Building2 },
  { name: "Destinatários", href: "/destinatarios", icon: Contact },
  { name: "Macro Regiões", href: "/macro-regioes", icon: MapIcon },
  { name: "Produtos", href: "/produtos", icon: Package },
  { name: "Cadastro na Chegada", href: "/produtos/chegada", icon: Package },
];

const relatoriosItems = [
  { name: "Relatório por Período", href: "/relatorios/periodo", icon: BarChart3 },
  { name: "Relatório de Baixas", href: "/relatorios/baixas", icon: ClipboardCheck },
  { name: "NFs Pendentes Baixa", href: "/relatorios/pendentes-baixa", icon: ClipboardList },
  { name: "Agend. por Fornecedor", href: "/relatorios/agendamentos-fornecedor", icon: FileSpreadsheet },
];

function CanhotosPendentesBadge() {
  const { data } = useQuery({
    queryKey: ["contar_canhotos_pendentes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("contar_canhotos_pendentes");
      if (error) return 0;
      return Number(data ?? 0);
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
  if (!data) return null;
  return (
    <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
      {data}
    </span>
  );
}

function NavItem({ item, isActive, onClick, compact = false }: { item: { name: string; href: string; icon: React.ElementType }; isActive: boolean; onClick?: () => void; compact?: boolean }) {
  return (
    <Link
      to={item.href}
      onClick={onClick}
      title={compact ? item.name : undefined}
      aria-label={item.name}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-primary"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <item.icon className="w-5 h-5 shrink-0" />
      {!compact && item.name}
      {item.href === "/canhotos-pendentes" && <CanhotosPendentesBadge />}
    </Link>
  );
}

function NavSubGroup({
  label,
  icon: Icon,
  items,
  pathname,
}: {
  label: string;
  icon: React.ElementType;
  items: typeof depositoItems;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const active = items.some((i) => pathname === i.href);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost"
          className={cn(
            "flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium transition-colors",
            active
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          )}
        >
          <Icon className="w-5 h-5" />
          <span className="flex-1 text-left">{label}</span>
          <ChevronRight className={cn("w-4 h-4 transition-transform", open && "rotate-90")} />
        </Button>
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

function NavGroupFlyout({
  label,
  icon: Icon,
  items,
  pathname,
  groupActive,
  subgroups,
  compact = false,
}: {
  label: string;
  icon: React.ElementType;
  items: typeof depositoItems;
  pathname: string;
  groupActive: boolean;
  subgroups?: { label: string; icon: React.ElementType; items: typeof depositoItems }[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" title={compact ? label : undefined} aria-label={label}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-semibold transition-colors",
            groupActive
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-sidebar-foreground/90 hover:bg-sidebar-accent"
          )}
        >
          <Icon className="w-5 h-5 shrink-0" />
          {!compact && <span className="flex-1 text-left">{label}</span>}
          {!compact && <ChevronRight className={cn("w-4 h-4 transition-transform", open && "rotate-90")} />}
        </Button>
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
          {subgroups?.map((sg) => (
            <NavSubGroup
              key={sg.label}
              label={sg.label}
              icon={sg.icon}
              items={sg.items}
              pathname={pathname}
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
  const { podeGestaoComercial } = useGestaoComercial();
  const { podeVerIbac } = useAcessoIbac();
  const { podeVerOkEntrega } = useAcessoOkEntrega();
  const { podeVerTrackingPandurata } = useAcessoTrackingPandurata();
  const { podeEnviarCanhoto } = useAcessoEnvioCanhoto();
  const [collapsed, setCollapsed] = useState(false);

  const integracaoItems = integracaoItemsBase.filter((i) =>
    i.href === "/integracoes/ibac"
      ? podeVerIbac
      : i.href === "/integracoes/okentrega"
        ? podeVerOkEntrega
        : podeEnviarCanhoto,
  );

  const depositoActive = depositoItems.some((i) => location.pathname === i.href);
  const transporteActive = transporteItems.some((i) => location.pathname === i.href);
  const agendasActive = agendasItems.some((i) => location.pathname === i.href);
  const torreActive = torreControleItems.some((i) => location.pathname === i.href);
  const relatoriosActive = relatoriosItems.some((i) => location.pathname === i.href);
  const cadastrosActive = cadastrosItems.some((i) => location.pathname === i.href);

  const financeiroItems = [transporteItems[4]];
  const comercialItems = podeGestaoComercial ? [
    { name: "Regiões e SLA", href: "/comercial/sla-fornecedor", icon: Calculator },
    { name: "Tarifas por Região", href: "/comercial/tarifas-regiao", icon: HandCoins },
  ] : [];
  const fiscalItems = isAdmin ? [
    { name: "Config. Fiscal", href: "/fiscal/configuracao", icon: Receipt },
    { name: "Motoristas (Fiscal)", href: "/fiscal/motoristas", icon: Receipt },
    { name: "Convênios Fiscais", href: "/fiscal/convenios", icon: Receipt },
    { name: "Tabelas de Frete", href: "/fiscal/tabelas-frete", icon: Receipt },
  ] : [];
  const administracaoItems = [
    { name: "Operadores", href: "/operadores", icon: Users },
    { name: "Auditoria", href: "/auditoria", icon: ShieldCheck },
  ];
  const integracoes = [
    ...integracaoItems,
    ...(podeVerTrackingPandurata ? trackingItems : []),
    ...(isAdmin ? [{ name: "Importar OCOREN", href: "/integracoes/ocoren", icon: Upload }] : []),
  ];
  const activeIn = (items: typeof depositoItems) => items.some((item) => item.href === location.pathname);

  return (
    <div className={cn("flex flex-col h-full shrink-0 bg-sidebar text-sidebar-foreground", collapsed ? "w-16" : "w-64")}>
      {/* Logo / Brand */}
      <div className={cn("flex items-center gap-2 h-16 shrink-0 border-b border-sidebar-border", collapsed ? "justify-center" : "px-3")}>
        {!collapsed && <div className="w-8 h-8 shrink-0 rounded-lg bg-sidebar-primary flex items-center justify-center">
          <Truck className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>}
        {!collapsed && <span className="font-semibold text-sm flex-1">WMS Recebimento</span>}
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expandir menu" : "Recolher menu"} title={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>

      {/* Navigation */}
      <nav aria-label="Menu principal" className={cn("flex-1 py-4 space-y-1 overflow-y-auto", collapsed ? "px-1" : "px-3")}>
        {topNav.map((item) => (
          <NavItem key={item.href} item={item} isActive={location.pathname === item.href} compact={collapsed} />
        ))}

        <div className="pt-2 space-y-1">
          <NavGroupFlyout
            label="Operação" icon={Truck} items={[]} pathname={location.pathname}
            compact={collapsed} groupActive={depositoActive || transporteActive || agendasActive}
            subgroups={[
              { label: "Depósito", icon: Warehouse, items: depositoItems },
              { label: "Transporte", icon: Route, items: transporteItems.filter((item) => item.href !== "/pre-cte") },
              { label: "Agendas", icon: CalendarDays, items: agendasItems },
            ]}
          />
          <NavGroupFlyout label="Monitoramento" icon={Eye} items={torreControleItems}
            pathname={location.pathname} compact={collapsed} groupActive={torreActive} />
          {integracoes.length > 0 && <NavGroupFlyout label="Integrações" icon={Plug}
            items={integracoes} pathname={location.pathname} compact={collapsed} groupActive={activeIn(integracoes)} />}
          <NavGroupFlyout label="Cadastros" icon={Building2} items={cadastrosItems}
            pathname={location.pathname} compact={collapsed} groupActive={cadastrosActive} />
          <NavGroupFlyout label="Relatórios" icon={BarChart3} items={relatoriosItems}
            pathname={location.pathname} compact={collapsed} groupActive={relatoriosActive} />
          <NavGroupFlyout label="Financeiro e Fiscal" icon={Receipt} items={financeiroItems}
            pathname={location.pathname} compact={collapsed}
            groupActive={activeIn(financeiroItems) || activeIn(comercialItems) || activeIn(fiscalItems)}
            subgroups={[
              ...(comercialItems.length ? [{ label: "Comercial", icon: HandCoins, items: comercialItems }] : []),
              ...(fiscalItems.length ? [{ label: "Fiscal", icon: Receipt, items: fiscalItems }] : []),
            ]} />
          {isAdmin && <NavGroupFlyout label="Administração" icon={ShieldCheck} items={administracaoItems}
            pathname={location.pathname} compact={collapsed} groupActive={activeIn(administracaoItems)} />}
        </div>
      </nav>

      {/* User section */}
      <div className={cn("border-t border-sidebar-border", collapsed ? "p-1" : "p-4")}>
        <div className={cn("flex items-center gap-3 mb-3", collapsed && "hidden")}>
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
          aria-label="Sair"
          title="Sair"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {!collapsed && "Sair"}
        </Button>
      </div>
    </div>
  );
}
