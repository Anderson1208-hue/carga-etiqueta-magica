import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileText,
  FileInput,
  CalendarClock,
  MapPin,
  Truck,
  PackageCheck,
  AlertTriangle,
  Warehouse,
  Navigation,
  Home,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ReceiptText,
} from "lucide-react";

export type NfEvento = {
  id: string;
  nf_id: string;
  tipo: string;
  ocorrido_em: string;
  ator_id: string | null;
  ator_nome: string | null;
  payload: Record<string, any>;
  origem: string;
};

const TIPO_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  nf_emitida: { label: "NF emitida pelo embarcador", icon: FileText, color: "bg-slate-500" },
  nf_incluida: { label: "NF importada no sistema", icon: FileInput, color: "bg-slate-600" },
  cte_vinculado: { label: "Saída do embarcador", icon: ReceiptText, color: "bg-indigo-500" },
  chegada_cd: { label: "Chegada no CD-RJ", icon: Warehouse, color: "bg-amber-600" },
  conferencia_interna: { label: "Conferência interna (galpão)", icon: PackageCheck, color: "bg-cyan-600" },
  enderecada: { label: "Endereçada no CD", icon: MapPin, color: "bg-cyan-700" },
  agendada: { label: "Agendamento", icon: CalendarClock, color: "bg-blue-600" },
  expedicao_veiculo: { label: "Expedida em veículo", icon: Truck, color: "bg-violet-600" },
  conferencia_externa: { label: "Conferência externa (motorista)", icon: PackageCheck, color: "bg-purple-600" },
  divergencia: { label: "Divergência", icon: AlertTriangle, color: "bg-orange-600" },
  inicio_rota: { label: "Início de rota", icon: Navigation, color: "bg-blue-500" },
  chegada_cliente: { label: "Chegada no cliente", icon: Home, color: "bg-emerald-600" },
  entrega: { label: "Entregue", icon: CheckCircle2, color: "bg-green-600" },
  recusa: { label: "Recusada", icon: XCircle, color: "bg-red-600" },
  reentrega: { label: "Reentrega solicitada", icon: RotateCcw, color: "bg-orange-500" },
};

function fmt(ts: string) {
  try {
    return format(new Date(ts), "dd/MM/yyyy HH:mm");
  } catch {
    return ts;
  }
}

function renderDetalhe(ev: NfEvento) {
  const p = ev.payload || {};
  switch (ev.tipo) {
    case "nf_emitida":
      return `${p.emitente || ""}${p.valor_nf ? ` — R$ ${Number(p.valor_nf).toFixed(2)}` : ""}`;
    case "agendada":
      return `${p.status || ""}${p.data_agendamento ? ` para ${format(new Date(p.data_agendamento + "T00:00:00"), "dd/MM/yyyy")}` : ""}${p.observacao ? ` · ${p.observacao}` : ""}`;
    case "enderecada":
      return `Posição: ${p.posicao}${p.principal ? " (principal)" : ""}`;
    case "expedicao_veiculo":
      return `Placa ${p.placa || "—"}${p.motorista ? ` · ${p.motorista}` : ""}${p.origem_data === "roteirizacao" ? " · data da roteirização" : ""}`;
    case "conferencia_interna":
    case "conferencia_externa":
      return `Etiqueta ${p.seq}/${p.total} · ${p.c_prod || ""}`;
    case "divergencia":
      return `${p.c_prod || ""} · ${p.motivo || "sem motivo"}`;
    case "chegada_cliente":
      return p.endereco || "";
    case "entrega":
      return `Recebedor: ${p.recebedor_nome || "—"}`;
    case "recusa":
    case "reentrega":
      return `${p.ocorrencia || ""}${p.recebedor_nome ? ` · ${p.recebedor_nome}` : ""}`;
    case "cte_vinculado": {
      const base = `${p.tipo_documento || "CT-e"} ${p.numero_cte || ""} · ${p.razao_social || ""}`;
      return p.data_emissao
        ? base
        : `${base} · ⚠ CT-e sem data de emissão — exibindo data de importação no sistema`;
    }
    case "chegada_cd":
      return p.origem === "manual" ? "Registro manual" : "Detectada na conferência";
    default:
      return "";
  }
}

interface Props {
  nfId: string | null;
  showActions?: boolean;
}

export function HistoricoNFTimeline({ nfId, showActions = true }: Props) {
  const { toast } = useToast();
  const [eventos, setEventos] = useState<NfEvento[]>([]);
  const [loading, setLoading] = useState(false);
  const [registrandoChegada, setRegistrandoChegada] = useState(false);

  async function load() {
    if (!nfId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("nf_eventos")
        .select("id, nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem")
        .eq("nf_id", nfId)
        .order("ocorrido_em", { ascending: true });
      if (error) throw error;
      setEventos((data || []) as NfEvento[]);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao carregar histórico", description: err.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (nfId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfId]);

  async function registrarChegadaCd() {
    if (!nfId) return;
    setRegistrandoChegada(true);
    try {
      const { data, error } = await (supabase as any).rpc("registrar_chegada_cd_manual", {
        p_nf_id: nfId,
        p_observacao: null,
      });
      if (error) throw error;
      const status = (data as any)?.status;
      toast({
        title: status === "ja_registrado" ? "Chegada já registrada" : "Chegada registrada",
      });
      await load();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao registrar chegada", description: err.message });
    } finally {
      setRegistrandoChegada(false);
    }
  }

  const temChegadaCd = eventos.some((e) => e.tipo === "chegada_cd");

  return (
    <div className="space-y-4">
      {showActions && (
        <div className="flex items-center justify-between border-b pb-3">
          <div className="text-xs text-muted-foreground">{eventos.length} evento(s)</div>
          {!temChegadaCd && nfId && (
            <Button size="sm" onClick={registrarChegadaCd} disabled={registrandoChegada}>
              {registrandoChegada ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Warehouse className="w-4 h-4 mr-2" />
              )}
              Registrar chegada no CD
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : eventos.length === 0 ? (
        <p className="text-center text-muted-foreground py-12 text-sm">
          Nenhum evento registrado para esta NF.
        </p>
      ) : (
        <ol className="relative border-l border-border ml-3 py-2 space-y-4">
          {eventos.map((ev) => {
            const meta = TIPO_META[ev.tipo] || {
              label: ev.tipo,
              icon: FileText,
              color: "bg-muted-foreground",
            };
            const Icon = meta.icon;
            return (
              <li key={ev.id} className="ml-4">
                <span
                  className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full ${meta.color} text-white`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="bg-card border rounded-md p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm">{meta.label}</p>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {fmt(ev.ocorrido_em)}
                    </Badge>
                  </div>
                  {renderDetalhe(ev) && (
                    <p className="text-xs text-muted-foreground mt-1">{renderDetalhe(ev)}</p>
                  )}
                  {(ev.ator_nome || ev.origem === "manual" || ev.origem === "backfill") && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {ev.ator_nome ? `por ${ev.ator_nome}` : ""}
                      {ev.origem === "manual" ? " · manual" : ""}
                      {ev.origem === "backfill" ? " · histórico" : ""}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
