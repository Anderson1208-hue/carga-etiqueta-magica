import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  CalendarIcon,
  Clock,
  RotateCcw,
  PackageX,
  CalendarCheck,
  Loader2,
  FileText,
  FileDown,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TipoCargaBadge, chocolateRowClass } from "@/components/TipoCargaBadge";
import { generateAgendamentosResumoPDF, type AgendamentoResumoItem } from "@/lib/agendamentos-resumo-pdf";
import { generateAgendamentosResumoExcel } from "@/lib/agendamentos-resumo-excel";
import { calculateBoxes } from "@/lib/xml-parser";

type AgendamentoStatus = "AGENDAMENTO" | "AGUARDANDO AGENDA" | "AGUARDANDO REAGENDA" | "REENTREGA" | "DEVOLUCAO";

interface NfResult {
  id: string;
  numero_nf: string;
  chave_acesso: string;
  dest_razao_social: string | null;
  dest_cidade: string | null;
  dest_uf: string | null;
  cnpj_destinatario: string | null;
  status_entrega: string;
  carga_id: string;
  tipo_carga: string;
  agendamento_status?: string | null;
  agendamento_data?: string | null;
  numero_cte?: string | null;
  cte_emitente?: string | null;
}

interface AgendamentoRecord {
  id: string;
  nf_id: string;
  status: string;
  data_agendamento: string | null;
  observacao: string | null;
  ocorrencia: string | null;
  created_at: string;
  numero_nf?: string;
  dest_razao_social?: string | null;
  dest_cidade?: string | null;
  tipo_carga?: string;
  numero_cte?: string | null;
  cte_emitente?: string | null;
}

const STATUS_OPTIONS: { value: AgendamentoStatus; label: string; icon: React.ReactNode; color: string; requiresDate: boolean }[] = [
  { value: "AGENDAMENTO", label: "Agendamento", icon: <CalendarCheck className="w-4 h-4" />, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", requiresDate: true },
  { value: "AGUARDANDO AGENDA", label: "Aguardando Agenda", icon: <Clock className="w-4 h-4" />, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", requiresDate: false },
  { value: "AGUARDANDO REAGENDA", label: "Aguardando Reagenda", icon: <Clock className="w-4 h-4" />, color: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100", requiresDate: false },
  { value: "REENTREGA", label: "Reentrega", icon: <RotateCcw className="w-4 h-4" />, color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", requiresDate: true },
  { value: "DEVOLUCAO", label: "Devolução", icon: <PackageX className="w-4 h-4" />, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", requiresDate: false },
];

// Ocorrências enviadas à Cacau (de-para IBAC). Exibidas no select da linha do Agendamento.
const OCORRENCIA_OPTIONS: { value: string; label: string; codigo: string }[] = [
  { value: "agendamento", label: "Entrega agendada", codigo: "91" },
  { value: "carga_aceita", label: "Carga aceita pela transportadora", codigo: "222" },
  { value: "inicio_rota", label: "Motorista iniciou a rota", codigo: "229" },
  { value: "chegada_cliente", label: "Chegada no cliente", codigo: "245" },
  { value: "entrega_realizada", label: "Entrega realizada com canhoto", codigo: "1" },
  { value: "reentrega", label: "Reentrega solicitada", codigo: "19" },
  { value: "avaria", label: "Avaria", codigo: "79" },
  { value: "recusa_entrega", label: "Recusa de entrega", codigo: "3" },
  { value: "devolucao", label: "Devolução", codigo: "101" },
  { value: "extravio_roubo", label: "Extravio ou Roubo", codigo: "14" },
];

function ocorrenciaLabel(value: string | null | undefined) {
  if (!value) return null;
  return OCORRENCIA_OPTIONS.find(o => o.value === value)?.label ?? value;
}

function statusBadge(status: string) {
  const opt = STATUS_OPTIONS.find(s => s.value === status);
  if (!opt) return <Badge variant="secondary">{status}</Badge>;
  return (
    <Badge className={cn("gap-1", opt.color)}>
      {opt.icon}
      {opt.label}
    </Badge>
  );
}

function statusEntregaBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    "CARGA NO DEPOSITO": { label: "Carga no Depósito", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    "NF EM ROTA": { label: "NF em Rota", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    "ENTREGUE": { label: "Entregue", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    "RECUSADO": { label: "Recusado", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  };
  const s = map[status] || { label: status, color: "" };
  return <Badge className={s.color}>{s.label}</Badge>;
}

export default function Agendamento() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [nfResults, setNfResults] = useState<NfResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedNfIds, setSelectedNfIds] = useState<Set<string>>(new Set());

  const [agendamentos, setAgendamentos] = useState<AgendamentoRecord[]>([]);
  const [loadingAgendamentos, setLoadingAgendamentos] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("todos");

  // Dialog state (single NF)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedNf, setSelectedNf] = useState<NfResult | null>(null);
  const [agStatus, setAgStatus] = useState<AgendamentoStatus>("AGUARDANDO AGENDA");
  const [agDate, setAgDate] = useState<Date | undefined>(undefined);
  const [agObs, setAgObs] = useState("");
  const [saving, setSaving] = useState(false);

  // Bulk dialog state
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<AgendamentoStatus>("AGENDAMENTO");
  const [bulkDate, setBulkDate] = useState<Date | undefined>(undefined);
  const [bulkObs, setBulkObs] = useState("");
  const [savingBulk, setSavingBulk] = useState(false);

  // Edit date dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAgendamento, setEditingAgendamento] = useState<AgendamentoRecord | null>(null);
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    loadAgendamentos();
  }, []);

  // Clear selection when results change (only on new search)
  useEffect(() => {
    setSelectedNfIds(new Set());
  }, [nfResults.length]);

  async function loadAgendamentos() {
    setLoadingAgendamentos(true);
    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, nf_id, status, data_agendamento, observacao, ocorrencia, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      if (data && data.length > 0) {
        const nfIds = data.map(a => a.nf_id);
        const { data: nfsData } = await supabase
          .from("notas_fiscais")
          .select("id, numero_nf, dest_razao_social, dest_cidade, carga_id")
          .in("id", nfIds)
          .limit(2000);

        const cargaIds = [...new Set((nfsData || []).map(n => n.carga_id))];
        const [{ data: cargasData }, { data: ctesData }] = await Promise.all([
          supabase.from("cargas").select("id, tipo_carga").in("id", cargaIds).limit(2000),
          supabase
            .from("ctes")
            .select("nf_id, numero_cte, razao_social_emitente, created_at")
            .in("nf_id", nfIds)
            .order("created_at", { ascending: false })
            .limit(2000),
        ]);

        const cargaMap = new Map((cargasData || []).map(c => [c.id, c.tipo_carga]));
        const nfMap = new Map((nfsData || []).map(n => [n.id, n]));
        const cteMap = new Map<string, { numero_cte: string; razao_social_emitente: string | null }>();
        (ctesData || []).forEach(c => {
          if (c.nf_id && !cteMap.has(c.nf_id)) {
            cteMap.set(c.nf_id, { numero_cte: c.numero_cte, razao_social_emitente: c.razao_social_emitente });
          }
        });

        const enriched: AgendamentoRecord[] = data.map(a => {
          const nf = nfMap.get(a.nf_id);
          const cte = cteMap.get(a.nf_id);
          return {
            ...a,
            numero_nf: nf?.numero_nf,
            dest_razao_social: nf?.dest_razao_social,
            dest_cidade: nf?.dest_cidade,
            tipo_carga: nf ? cargaMap.get(nf.carga_id) || "SECA" : "SECA",
            numero_cte: cte?.numero_cte ?? null,
            cte_emitente: cte?.razao_social_emitente ?? null,
          };
        });

        setAgendamentos(enriched);
      } else {
        setAgendamentos([]);
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Erro ao carregar agendamentos", variant: "destructive" });
    } finally {
      setLoadingAgendamentos(false);
    }
  }

  async function handleSearch() {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const term = search.trim();
      
      // Check if user typed multiple NF numbers (comma, semicolon, space, or newline separated)
      const multiTerms = term
        .split(/[,;\s\n]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      const isMultiSearch = multiTerms.length > 1;

      let allData: any[] = [];

      if (isMultiSearch) {
        // Batch search by multiple NF numbers
        const batchSize = 50;
        for (let i = 0; i < multiTerms.length; i += batchSize) {
          const batch = multiTerms.slice(i, i + batchSize);
          const { data, error } = await supabase
            .from("notas_fiscais")
            .select("id, numero_nf, chave_acesso, dest_razao_social, dest_cidade, dest_uf, cnpj_destinatario, status_entrega, carga_id")
            .in("numero_nf", batch);
          if (error) throw error;
          if (data) allData.push(...data);
        }
      } else {
        // Single term - search across multiple fields
        const { data, error } = await supabase
          .from("notas_fiscais")
          .select("id, numero_nf, chave_acesso, dest_razao_social, dest_cidade, dest_uf, cnpj_destinatario, status_entrega, carga_id")
          .or(`numero_nf.ilike.%${term}%,chave_acesso.ilike.%${term}%,dest_razao_social.ilike.%${term}%,cnpj_destinatario.ilike.%${term}%`)
          .limit(100);
        if (error) throw error;
        if (data) allData = data;
      }

      if (allData.length > 0) {
        const cargaIds = [...new Set(allData.map(n => n.carga_id))];
        const nfIdsAll = allData.map(n => n.id);
        const [{ data: cargasData }, { data: agData }, { data: ctesData }] = await Promise.all([
          supabase.from("cargas").select("id, tipo_carga").in("id", cargaIds).limit(2000),
          supabase
            .from("agendamentos")
            .select("nf_id, status, data_agendamento, created_at")
            .in("nf_id", nfIdsAll)
            .order("created_at", { ascending: false })
            .limit(2000),
          supabase
            .from("ctes")
            .select("nf_id, numero_cte, razao_social_emitente, created_at")
            .in("nf_id", nfIdsAll)
            .order("created_at", { ascending: false })
            .limit(2000),
        ]);

        const cargaMap = new Map((cargasData || []).map(c => [c.id, c.tipo_carga]));
        // pega o agendamento mais recente por nf_id (já vem ordenado desc)
        const agMap = new Map<string, { status: string; data_agendamento: string | null }>();
        (agData || []).forEach(a => {
          if (!agMap.has(a.nf_id)) {
            agMap.set(a.nf_id, { status: a.status, data_agendamento: a.data_agendamento });
          }
        });
        const cteMap = new Map<string, { numero_cte: string; razao_social_emitente: string | null }>();
        (ctesData || []).forEach(c => {
          if (c.nf_id && !cteMap.has(c.nf_id)) {
            cteMap.set(c.nf_id, { numero_cte: c.numero_cte, razao_social_emitente: c.razao_social_emitente });
          }
        });

        setNfResults(allData.map(n => ({
          ...n,
          tipo_carga: cargaMap.get(n.carga_id) || "SECA",
          agendamento_status: agMap.get(n.id)?.status ?? null,
          agendamento_data: agMap.get(n.id)?.data_agendamento ?? null,
          numero_cte: cteMap.get(n.id)?.numero_cte ?? null,
          cte_emitente: cteMap.get(n.id)?.razao_social_emitente ?? null,
        })));
      } else {
        setNfResults([]);
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Erro ao buscar NFs", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  function toggleNfSelection(nfId: string) {
    setSelectedNfIds(prev => {
      const next = new Set(prev);
      if (next.has(nfId)) {
        next.delete(nfId);
      } else {
        next.add(nfId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedNfIds.size === nfResults.length) {
      setSelectedNfIds(new Set());
    } else {
      setSelectedNfIds(new Set(nfResults.map(nf => nf.id)));
    }
  }

  async function exportNfResultsToExcel() {
    const rows = selectedNfIds.size > 0
      ? nfResults.filter(nf => selectedNfIds.has(nf.id))
      : nfResults;
    if (rows.length === 0) return;
    try {
      const XLSX = await import("xlsx");
      const data = rows.map(nf => ({
        NF: nf.numero_nf,
        "Chave de Acesso": nf.chave_acesso,
        Destinatário: nf.dest_razao_social || "",
        CNPJ: nf.cnpj_destinatario || "",
        Cidade: nf.dest_cidade || "",
        UF: nf.dest_uf || "",
        "CT-e": nf.numero_cte || "",
        "Emitente CT-e": nf.cte_emitente || "",
        "Status Entrega": nf.status_entrega,
        "Status Agenda": nf.agendamento_status || "",
        "Data Agenda": nf.agendamento_data
          ? format(new Date(nf.agendamento_data + "T12:00:00"), "dd/MM/yyyy")
          : "",
        Tipo: nf.tipo_carga,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 10 }, { wch: 46 }, { wch: 36 }, { wch: 20 },
        { wch: 22 }, { wch: 5 }, { wch: 12 }, { wch: 28 },
        { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "NFs Consultadas");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nfs-consulta-${format(new Date(), "yyyy-MM-dd-HHmm")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Excel gerado", description: `${rows.length} NF(s) exportada(s).` });
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Falha ao gerar Excel", variant: "destructive" });
    }
  }

  function openAgendamentoDialog(nf: NfResult) {
    setSelectedNf(nf);
    setAgStatus("AGUARDANDO AGENDA");
    setAgDate(undefined);
    setAgObs("");
    setDialogOpen(true);
  }

  function openBulkDialog() {
    setBulkStatus("AGENDAMENTO");
    setBulkDate(undefined);
    setBulkObs("");
    setBulkDialogOpen(true);
  }

  async function saveAgendamento() {
    if (!selectedNf || !user) return;

    const needsDate = agStatus === "AGENDAMENTO" || agStatus === "REENTREGA";
    if (needsDate && !agDate) {
      toast({ title: "Atenção", description: "Selecione a data do agendamento", variant: "destructive" });
      return;
    }

    const finalStatus = (agStatus === "AGUARDANDO AGENDA" && agDate) ? "AGENDAMENTO" : agStatus;

    setSaving(true);
    try {
      const { error } = await supabase.from("agendamentos").insert({
        nf_id: selectedNf.id,
        status: finalStatus,
        data_agendamento: agDate ? format(agDate, "yyyy-MM-dd") : null,
        observacao: agObs || null,
        created_by: user.id,
      });

      if (error) throw error;

      // REENTREGA ou novo AGENDAMENTO de NF que já saiu para rota:
      // libera a NF do veículo antigo e devolve para o depósito,
      // para reaparecer na Programação na véspera da nova data agendada.
      if (finalStatus === "REENTREGA" || finalStatus === "AGENDAMENTO") {
        await supabase.from("veiculo_nfs").delete().eq("nf_id", selectedNf.id);
        await supabase
          .from("notas_fiscais")
          .update({ status_entrega: "CARGA NO DEPOSITO" })
          .eq("id", selectedNf.id)
          .eq("status_entrega", "NF EM ROTA");
      }

      toast({
        title: "Agendamento salvo!",
        description: `NF ${selectedNf.numero_nf} → ${STATUS_OPTIONS.find(s => s.value === agStatus)?.label}`,
      });

      setDialogOpen(false);
      loadAgendamentos();
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Erro ao salvar agendamento", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function saveBulkAgendamento() {
    if (!user || selectedNfIds.size === 0) return;

    const needsDate = bulkStatus === "AGENDAMENTO" || bulkStatus === "REENTREGA";
    if (needsDate && !bulkDate) {
      toast({ title: "Atenção", description: "Selecione a data do agendamento", variant: "destructive" });
      return;
    }

    const finalStatus = (bulkStatus === "AGUARDANDO AGENDA" && bulkDate) ? "AGENDAMENTO" : bulkStatus;

    setSavingBulk(true);
    try {
      const inserts = Array.from(selectedNfIds).map(nfId => ({
        nf_id: nfId,
        status: finalStatus,
        data_agendamento: bulkDate ? format(bulkDate, "yyyy-MM-dd") : null,
        observacao: bulkObs || null,
        created_by: user.id,
      }));

      const { error } = await supabase.from("agendamentos").insert(inserts);
      if (error) throw error;

      // REENTREGA/AGENDAMENTO em lote: libera NFs que estavam em rota.
      if (finalStatus === "REENTREGA" || finalStatus === "AGENDAMENTO") {
        const ids = Array.from(selectedNfIds);
        await supabase.from("veiculo_nfs").delete().in("nf_id", ids);
        await supabase
          .from("notas_fiscais")
          .update({ status_entrega: "CARGA NO DEPOSITO" })
          .in("id", ids)
          .eq("status_entrega", "NF EM ROTA");
      }

      toast({
        title: "Agendamentos salvos!",
        description: `${inserts.length} NFs agendadas com sucesso.`,
      });

      setBulkDialogOpen(false);
      // Remove scheduled NFs from list, keep the rest for next batch
      const scheduledIds = new Set(selectedNfIds);
      setNfResults(prev => prev.filter(nf => !scheduledIds.has(nf.id)));
      setSelectedNfIds(new Set());
      loadAgendamentos();
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Erro ao salvar agendamentos em lote", variant: "destructive" });
    } finally {
      setSavingBulk(false);
    }
  }

  function openEditDateDialog(ag: AgendamentoRecord) {
    setEditingAgendamento(ag);
    setEditDate(ag.data_agendamento ? new Date(ag.data_agendamento + "T12:00:00") : undefined);
    setEditDialogOpen(true);
  }

  async function saveEditDate() {
    if (!editingAgendamento) return;
    setSavingEdit(true);
    try {
      const updateData: Record<string, any> = { 
        data_agendamento: editDate ? format(editDate, "yyyy-MM-dd") : null 
      };
      if (editingAgendamento.status === "AGUARDANDO AGENDA" && editDate) {
        updateData.status = "AGENDAMENTO";
      }
      const { error } = await supabase
        .from("agendamentos")
        .update(updateData)
        .eq("id", editingAgendamento.id);
      if (error) throw error;
      toast({ title: "Data alterada!", description: `Agendamento da NF ${editingAgendamento.numero_nf} atualizado.` });
      setEditDialogOpen(false);
      loadAgendamentos();
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Erro ao alterar data", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  }

  async function updateOcorrencia(ag: AgendamentoRecord, valor: string) {
    const novo = valor === "__none__" ? null : valor;
    if ((ag.ocorrencia ?? null) === novo) return;
    // Otimista
    setAgendamentos(prev => prev.map(a => a.id === ag.id ? { ...a, ocorrencia: novo } : a));
    try {
      const { error } = await supabase
        .from("agendamentos")
        .update({ ocorrencia: novo })
        .eq("id", ag.id);
      if (error) throw error;
      const label = novo ? ocorrenciaLabel(novo) : "removida";
      toast({
        title: novo ? "Ocorrência registrada" : "Ocorrência removida",
        description: novo
          ? `NF ${ag.numero_nf}: ${label} — enviada para a Cacau.`
          : `NF ${ag.numero_nf}: ocorrência removida.`,
      });
    } catch (err: any) {
      console.error(err);
      // Reverte em caso de erro
      setAgendamentos(prev => prev.map(a => a.id === ag.id ? { ...a, ocorrencia: ag.ocorrencia } : a));
      toast({ title: "Erro", description: err.message ?? "Falha ao salvar ocorrência", variant: "destructive" });
    }
  }

  const [generatingResumo, setGeneratingResumo] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);

  async function buildResumoItems(): Promise<AgendamentoResumoItem[] | null> {
    const base = filterStatus === "todos" ? agendamentos : agendamentos.filter(a => a.status === filterStatus);
    if (base.length === 0) {
      toast({ title: "Sem dados", description: "Não há agendamentos para gerar resumo." });
      return null;
    }
    const nfIds = base.map(a => a.nf_id);
    const nfMap = new Map<string, any>();
    const itensMap = new Map<string, number>();
    const batch = 200;
    for (let i = 0; i < nfIds.length; i += batch) {
      const slice = nfIds.slice(i, i + batch);
      const [{ data: nfsData }, { data: itensData }] = await Promise.all([
        supabase
          .from("notas_fiscais")
          .select("id, numero_nf, cnpj_destinatario, dest_razao_social, dest_bairro, dest_cidade, dest_uf, peso_bruto, volume_m3")
          .in("id", slice),
        supabase
          .from("itens_nf")
          .select("nf_id, q_com")
          .in("nf_id", slice),
      ]);
      (nfsData || []).forEach(n => nfMap.set(n.id, n));
      (itensData || []).forEach(it => {
        const cx = calculateBoxes(Number(it.q_com));
        itensMap.set(it.nf_id, (itensMap.get(it.nf_id) || 0) + cx);
      });
    }
    return base.map(a => {
      const nf = nfMap.get(a.nf_id);
      return {
        data_agendamento: a.data_agendamento,
        status: a.status,
        numero_nf: a.numero_nf || nf?.numero_nf || "—",
        cnpj_destinatario: nf?.cnpj_destinatario ?? null,
        dest_razao_social: nf?.dest_razao_social ?? a.dest_razao_social ?? null,
        dest_bairro: nf?.dest_bairro ?? null,
        dest_cidade: nf?.dest_cidade ?? a.dest_cidade ?? null,
        dest_uf: nf?.dest_uf ?? null,
        peso_bruto: Number(nf?.peso_bruto || 0),
        volume_m3: Number(nf?.volume_m3 || 0),
        caixas: itensMap.get(a.nf_id) || 0,
      };
    });
  }

  async function gerarResumoPDF() {
    setGeneratingResumo(true);
    try {
      const items = await buildResumoItems();
      if (!items) return;
      const blob = await generateAgendamentosResumoPDF(items);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resumo-agendamentos-${format(new Date(), "yyyy-MM-dd-HHmm")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF gerado!", description: `${items.length} agendamentos no resumo.` });
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Erro ao gerar resumo PDF", variant: "destructive" });
    } finally {
      setGeneratingResumo(false);
    }
  }

  async function gerarResumoExcel() {
    setGeneratingExcel(true);
    try {
      const items = await buildResumoItems();
      if (!items) return;
      const blob = generateAgendamentosResumoExcel(items);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resumo-agendamentos-${format(new Date(), "yyyy-MM-dd-HHmm")}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "Excel gerado!", description: `${items.length} agendamentos no resumo.` });
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Erro ao gerar resumo Excel", variant: "destructive" });
    } finally {
      setGeneratingExcel(false);
    }
  }

  const filteredAgendamentos = filterStatus === "todos"
    ? agendamentos
    : agendamentos.filter(a => a.status === filterStatus);

  const selectedNfs = nfResults.filter(nf => selectedNfIds.has(nf.id));

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agendamento de Entregas</h1>
          <p className="text-muted-foreground">Gerencie agendamentos, reentregas e devoluções de NFs</p>
        </div>

        {/* Search NF */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="w-5 h-5" />
              Buscar Nota Fiscal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Textarea
                placeholder="Digite números de NFs separados por vírgula, espaço ou um por linha. Ou busque por destinatário, CNPJ..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                className="flex-1 min-h-[60px]"
                rows={2}
              />
              <Button onClick={handleSearch} disabled={searching} className="self-end">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Buscar
              </Button>
            </div>

            {nfResults.length > 0 && (
              <>
                {/* Bulk action bar */}
                <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm text-muted-foreground">
                    {selectedNfIds.size > 0
                      ? `${selectedNfIds.size} de ${nfResults.length} NFs selecionadas`
                      : `${nfResults.length} NFs encontradas — selecione para agendar em lote`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button onClick={exportNfResultsToExcel} size="sm" variant="outline">
                      <FileDown className="w-4 h-4 mr-1" />
                      Exportar Excel{selectedNfIds.size > 0 ? ` (${selectedNfIds.size})` : ` (${nfResults.length})`}
                    </Button>
                    {selectedNfIds.size > 0 && (
                      <Button onClick={openBulkDialog} size="sm">
                        <CalendarCheck className="w-4 h-4 mr-1" />
                        Agendar {selectedNfIds.size} NF{selectedNfIds.size > 1 ? "s" : ""}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-2 border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={selectedNfIds.size === nfResults.length && nfResults.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead>NF</TableHead>
                        <TableHead>Destinatário</TableHead>
                        <TableHead>Cidade/UF</TableHead>
                        <TableHead>CT-e</TableHead>
                        <TableHead>Emitente CT-e</TableHead>
                        <TableHead>Status Entrega</TableHead>
                        <TableHead>Status Agenda</TableHead>
                        <TableHead>Data Agenda</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="w-[120px]">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {nfResults.map(nf => (
                        <TableRow key={nf.id} className={chocolateRowClass(nf.tipo_carga)}>
                          <TableCell>
                            <Checkbox
                              checked={selectedNfIds.has(nf.id)}
                              onCheckedChange={() => toggleNfSelection(nf.id)}
                            />
                          </TableCell>
                          <TableCell className="font-mono font-medium">{nf.numero_nf}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{nf.dest_razao_social || "—"}</TableCell>
                          <TableCell>{nf.dest_cidade ? `${nf.dest_cidade}/${nf.dest_uf}` : "—"}</TableCell>
                          <TableCell className="font-mono text-sm">{nf.numero_cte || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm">{nf.cte_emitente || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>{statusEntregaBadge(nf.status_entrega)}</TableCell>
                          <TableCell>{nf.agendamento_status ? statusBadge(nf.agendamento_status) : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm">
                            {nf.agendamento_data
                              ? format(new Date(nf.agendamento_data + "T12:00:00"), "dd/MM/yyyy")
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell><TipoCargaBadge tipoCarga={nf.tipo_carga} /></TableCell>
                          <TableCell>
                            <Button size="sm" onClick={() => openAgendamentoDialog(nf)}>
                              <CalendarIcon className="w-4 h-4 mr-1" />
                              Agendar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            {nfResults.length === 0 && search && !searching && (
              <p className="mt-4 text-sm text-muted-foreground text-center py-4">
                Nenhuma nota fiscal encontrada para "{search}"
              </p>
            )}
          </CardContent>
        </Card>

        {/* Agendamentos List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Agendamentos Registrados
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={gerarResumoPDF}
                disabled={generatingResumo || loadingAgendamentos}
              >
                {generatingResumo ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileDown className="w-4 h-4 mr-1" />}
                Resumo PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={gerarResumoExcel}
                disabled={generatingExcel || loadingAgendamentos}
              >
                {generatingExcel ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileDown className="w-4 h-4 mr-1" />}
                Resumo Excel
              </Button>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loadingAgendamentos ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAgendamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum agendamento registrado</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NF</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>CT-e</TableHead>
                      <TableHead>Emitente CT-e</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data Agenda</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="w-[80px]">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAgendamentos.map(ag => (
                      <TableRow key={ag.id} className={chocolateRowClass(ag.tipo_carga)}>
                        <TableCell className="font-mono font-medium">{ag.numero_nf || "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{ag.dest_razao_social || "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{ag.numero_cte || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm">{ag.cte_emitente || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>{statusBadge(ag.status)}</TableCell>
                        <TableCell>
                          {ag.data_agendamento
                            ? format(new Date(ag.data_agendamento + "T12:00:00"), "dd/MM/yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{ag.observacao || "—"}</TableCell>
                        <TableCell><TipoCargaBadge tipoCarga={ag.tipo_carga} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(ag.created_at), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => openEditDateDialog(ag)}>
                            <CalendarIcon className="w-4 h-4 mr-1" />
                            Alterar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Single NF Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>

          {selectedNf && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium">NF: <span className="font-mono">{selectedNf.numero_nf}</span></p>
                <p className="text-sm text-muted-foreground">{selectedNf.dest_razao_social}</p>
                <p className="text-sm text-muted-foreground">{selectedNf.dest_cidade}/{selectedNf.dest_uf}</p>
                <div className="flex gap-2 mt-1">
                  {statusEntregaBadge(selectedNf.status_entrega)}
                  <TipoCargaBadge tipoCarga={selectedNf.tipo_carga} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status do Agendamento</Label>
                <Select value={agStatus} onValueChange={v => setAgStatus(v as AgendamentoStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          {s.icon}
                          {s.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(agStatus === "AGENDAMENTO" || agStatus === "REENTREGA") && (
                <div className="space-y-2">
                  <Label>Data do Agendamento *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !agDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {agDate ? format(agDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={agDate}
                        onSelect={setAgDate}
                        disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea
                  placeholder="Motivo, detalhes adicionais..."
                  value={agObs}
                  onChange={e => setAgObs(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveAgendamento} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Agendamento Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar {selectedNfIds.size} NFs em Lote</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Summary of selected NFs */}
            <div className="bg-muted/50 rounded-lg p-3 max-h-[150px] overflow-y-auto">
              <p className="text-sm font-medium mb-2">NFs selecionadas:</p>
              <div className="flex flex-wrap gap-1">
                {selectedNfs.map(nf => (
                  <Badge key={nf.id} variant="secondary" className="font-mono text-xs">
                    {nf.numero_nf}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status do Agendamento</Label>
              <Select value={bulkStatus} onValueChange={v => setBulkStatus(v as AgendamentoStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      <div className="flex items-center gap-2">
                        {s.icon}
                        {s.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(bulkStatus === "AGENDAMENTO" || bulkStatus === "REENTREGA") && (
              <div className="space-y-2">
                <Label>Data do Agendamento *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !bulkDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {bulkDate ? format(bulkDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={bulkDate}
                      onSelect={setBulkDate}
                      disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="space-y-2">
              <Label>Observação (aplicada a todas)</Label>
              <Textarea
                placeholder="Motivo, detalhes adicionais..."
                value={bulkObs}
                onChange={e => setBulkObs(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveBulkAgendamento} disabled={savingBulk}>
              {savingBulk && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Agendar {selectedNfIds.size} NFs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Date Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Data do Agendamento</DialogTitle>
          </DialogHeader>
          {editingAgendamento && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium">NF: <span className="font-mono">{editingAgendamento.numero_nf}</span></p>
                <p className="text-sm text-muted-foreground">{editingAgendamento.dest_razao_social || "—"}</p>
                {statusBadge(editingAgendamento.status)}
              </div>
              <div className="space-y-2">
                <Label>Nova Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editDate ? format(editDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editDate}
                      onSelect={setEditDate}
                      disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveEditDate} disabled={savingEdit}>
              {savingEdit && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
