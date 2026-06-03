import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  Filter,
  Loader2,
  Weight,
  X,
  ChevronDown,
  ChevronUp,
  MapPin,
  Search,
  FileText,
  ClipboardList,
  Route,
  Download,
  List,
} from "lucide-react";
import { format } from "date-fns";
import { calculateBoxes } from "@/lib/xml-parser";
import {
  getMacroRegiao,
  getMacroRegiaoLabel,
} from "@/lib/macro-regioes";
import { TipoCargaBadge, chocolateRowClass, isChocolate } from "@/components/TipoCargaBadge";
import * as XLSX from "xlsx";
import { gerarPreparacaoPdf } from "@/lib/preparacao-pdf";
import { proximoDiaUtilApos } from "@/lib/feriados-rj";

interface NfDisponivel {
  id: string;
  numero_nf: string;
  chave_acesso: string;
  cnpj_destinatario: string;
  dest_razao_social: string;
  dest_bairro: string;
  dest_cep: string;
  dest_logradouro: string;
  dest_numero: string;
  dest_cidade: string;
  dest_uf: string;
  peso_bruto: number;
  volume_m3: number;
  valor_nf: number;
  totalCaixas: number;
  macroRegiao: number;
  carga_id: string;
  carga_placa: string;
  carga_motorista: string;
  carga_data: string;
  carga_tipo_carga: string;
  numero_cte: string;
  razao_social_emitente: string;
  tem_agendamento: boolean;
  data_agendamento: string | null;
  
}

export default function Programacao() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [nfsDisponiveis, setNfsDisponiveis] = useState<NfDisponivel[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedNfIds, setSelectedNfIds] = useState<Set<string>>(new Set());
  const [filtroMR, setFiltroMR] = useState<string>("todas");
  
  const [buscaNf, setBuscaNf] = useState("");
  const [expandedEntregas, setExpandedEntregas] = useState<Set<string>>(new Set());
  const [filtroTipoCarga, setFiltroTipoCarga] = useState<string>("todos");
  const [buscaMultipla, setBuscaMultipla] = useState(false);
  const [buscaMultiplaTexto, setBuscaMultiplaTexto] = useState("");
  const [filtroBairro, setFiltroBairro] = useState<string>("todos");

  useEffect(() => {
    loadNfsDisponiveis();
  }, []);

  async function loadNfsDisponiveis() {
    setLoading(true);
    try {
      // Carga 'fechada' = estado inicial (apenas cadastrada). NFs só ficam
      // disponíveis na Preparação após o operador abrir a carga manualmente
      // na tela de Cargas. Por isso filtramos apenas cargas com status='aberta'.
      const cargasRes = await supabase
        .from("cargas")
        .select("id, placa, motorista, data, tipo_carga, status")
        .eq("status", "aberta")
        .order("created_at", { ascending: false });

      if (cargasRes.error) throw cargasRes.error;
      const cargas = cargasRes.data;

      if (!cargas || cargas.length === 0) {
        setNfsDisponiveis([]);
        return;
      }

      const cargaIds = cargas.map((c) => c.id);
      const cargaMap = new Map(cargas.map((c) => [c.id, c]));

      const pageSize = 1000;
      const nfSelect = `
        id, numero_nf, chave_acesso, cnpj_destinatario,
        dest_razao_social, dest_bairro, dest_cep,
        dest_logradouro, dest_numero, dest_cidade, dest_uf,
        peso_bruto, volume_m3, valor_nf, carga_id, status_entrega,
        itens_nf(q_com)
      `;

      const fetchNfsForCarga = async (cargaId: string) => {
        const all: any[] = [];
        let from = 0;

        while (true) {
          const { data, error } = await supabase
            .from("notas_fiscais")
            .select(nfSelect)
            .eq("carga_id", cargaId)
            .neq("status_entrega", "ENTREGUE")
            .neq("status_entrega", "RECUSADO")
            .order("numero_nf", { ascending: true })
            .range(from, from + pageSize - 1);

          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }

        return all;
      };

      const nfPromises = cargaIds.map((cargaId) => fetchNfsForCarga(cargaId));

      // Buscar TODOS os vínculos veiculo_nfs paginando (limite default Supabase é 1000)
      const fetchAllAssigned = async () => {
        const all: { nf_id: string }[] = [];
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from("veiculo_nfs")
            .select("nf_id")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      };

      // Paginar agendamentos (default Supabase corta em 1000)
      const fetchAllAgendamentos = async () => {
        const all: { nf_id: string; data_agendamento: string | null; status: string; created_at: string }[] = [];
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from("agendamentos")
            .select("nf_id, data_agendamento, status, created_at")
            .order("created_at", { ascending: false })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      };

      const [nfResults, assigned, agendamentos, { data: ctes }] = await Promise.all([
        Promise.all(nfPromises),
        fetchAllAssigned(),
        fetchAllAgendamentos(),
        supabase.from("ctes" as any).select("nf_id, numero_cte").in("carga_id", cargaIds),
      ]);

      const nfs = nfResults.flat();

      if (nfs.length === 0) {
        setNfsDisponiveis([]);
        
        return;
      }


      const assignedIds = new Set((assigned || []).map((a) => a.nf_id));

      // Build map of CT-e numbers by NF id
      const cteMap = new Map<string, string>();
      ((ctes as any[]) || []).forEach((cte: any) => {
        if (cte.nf_id) cteMap.set(cte.nf_id, cte.numero_cte);
      });

      // Build map of NF agendamentos - only the latest per NF (lista vem ordenada desc por created_at)
      const agendamentoMap = new Map<string, { data_agendamento: string | null; status: string }>();
      (agendamentos || []).forEach((ag) => {
        if (!agendamentoMap.has(ag.nf_id)) {
          agendamentoMap.set(ag.nf_id, { data_agendamento: ag.data_agendamento, status: ag.status });
        }
      });

      // Liberar NFs agendadas na véspera considerando dias úteis (exclui sáb,
      // dom e feriados nacionais/estaduais RJ). Ex.: se amanhã é feriado,
      // libera hoje as NFs agendadas para o próximo dia útil.
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const proximoDiaUtil = proximoDiaUtilApos(hoje);
      const limiteLiberacao = format(proximoDiaUtil, "yyyy-MM-dd");

      const available: NfDisponivel[] = nfs
        .filter((nf) => {
          if (assignedIds.has(nf.id)) return false;
          const ag = agendamentoMap.get(nf.id);
          if (ag) {
            // AGUARDANDO AGENDA ou DEVOLUCAO: NF bloqueada, nunca libera
            if (ag.status === 'AGUARDANDO AGENDA' || ag.status === 'AGUARDANDO REAGENDA' || ag.status === 'DEVOLUCAO') return false;
            // AGENDAMENTO ou REENTREGA: libera na véspera (data <= amanhã)
            if ((ag.status === 'AGENDAMENTO' || ag.status === 'REENTREGA') && ag.data_agendamento && ag.data_agendamento > limiteLiberacao) return false;
          }
          return true;
        })
        .map((nf) => {
          const carga = cargaMap.get(nf.carga_id);
          const items = (nf.itens_nf || []) as { q_com: number }[];
          const totalCaixas = items.reduce((sum, i) => sum + calculateBoxes(Number(i.q_com)), 0);

          return {
            id: nf.id,
            numero_nf: nf.numero_nf,
            chave_acesso: nf.chave_acesso,
            cnpj_destinatario: nf.cnpj_destinatario || "",
            dest_razao_social: nf.dest_razao_social || "N/I",
            dest_bairro: nf.dest_bairro || "",
            dest_cep: nf.dest_cep || "",
            dest_logradouro: nf.dest_logradouro || "",
            dest_numero: nf.dest_numero || "",
            dest_cidade: nf.dest_cidade || "",
            dest_uf: nf.dest_uf || "",
            peso_bruto: Number(nf.peso_bruto) || 0,
            volume_m3: Number(nf.volume_m3) || 0,
            valor_nf: Number(nf.valor_nf) || 0,
            totalCaixas,
            macroRegiao: getMacroRegiao(nf.dest_bairro, nf.dest_cidade),
            carga_id: nf.carga_id,
            carga_placa: carga?.placa || "",
            carga_motorista: carga?.motorista || "",
            carga_data: carga?.data || "",
            carga_tipo_carga: (carga as any)?.tipo_carga || "SECA",
            numero_cte: cteMap.get(nf.id) || "",
            tem_agendamento: !!(agendamentoMap.get(nf.id) && (agendamentoMap.get(nf.id)!.status === 'AGENDAMENTO' || agendamentoMap.get(nf.id)!.status === 'REENTREGA')),
            data_agendamento: agendamentoMap.get(nf.id)?.data_agendamento ?? null,
          };
        });

      available.sort((a, b) => {
        if (a.macroRegiao !== b.macroRegiao) return a.macroRegiao - b.macroRegiao;
        const bComp = (a.dest_bairro || "").localeCompare(b.dest_bairro || "", "pt-BR");
        if (bComp !== 0) return bComp;
        return (a.dest_razao_social || "").localeCompare(b.dest_razao_social || "", "pt-BR");
      });

      setNfsDisponiveis(available);
    } catch (error) {
      console.error("[Programacao] Erro ao carregar NFs:", error);
      toast({ title: "Erro ao carregar preparação", description: "Tente recarregar a página.", variant: "destructive" });
      setNfsDisponiveis([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleNf(nfId: string) {
    setSelectedNfIds((prev) => {
      const next = new Set(prev);
      if (next.has(nfId)) next.delete(nfId);
      else next.add(nfId);
      return next;
    });
  }

  function toggleAllFiltered() {
    const filtered = filteredNfs;
    const allSelected = filtered.every((nf) => selectedNfIds.has(nf.id));
    setSelectedNfIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filtered.forEach((nf) => next.delete(nf.id));
      } else {
        filtered.forEach((nf) => next.add(nf.id));
      }
      return next;
    });
  }

  function toggleMR(mr: number) {
    const nfsInMR = cargaFilteredNfs.filter((nf) => nf.macroRegiao === mr);
    const allSelected = nfsInMR.every((nf) => selectedNfIds.has(nf.id));
    setSelectedNfIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        nfsInMR.forEach((nf) => next.delete(nf.id));
      } else {
        nfsInMR.forEach((nf) => next.add(nf.id));
      }
      return next;
    });
  }

  function toggleEntrega(cnpj: string) {
    const nfsEntrega = filteredNfs.filter((nf) => nf.cnpj_destinatario === cnpj);
    const allSelected = nfsEntrega.every((nf) => selectedNfIds.has(nf.id));
    setSelectedNfIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        nfsEntrega.forEach((nf) => next.delete(nf.id));
      } else {
        nfsEntrega.forEach((nf) => next.add(nf.id));
      }
      return next;
    });
  }

  function toggleExpandEntrega(key: string) {
    setExpandedEntregas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function buscarEMarcarMultiplas() {
    const texto = buscaMultiplaTexto.trim();
    if (!texto) return;
    // Split by comma, semicolon, newline, space, or tab
    const numeros = texto
      .split(/[,;\n\r\t\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    
    if (numeros.length === 0) return;

    const encontradas: string[] = [];
    const naoEncontradas: string[] = [];

    numeros.forEach((num) => {
      const match = nfsDisponiveis.find((nf) => nf.numero_nf === num);
      if (match) {
        encontradas.push(match.id);
      } else {
        naoEncontradas.push(num);
      }
    });

    if (encontradas.length > 0) {
      setSelectedNfIds((prev) => {
        const next = new Set(prev);
        encontradas.forEach((id) => next.add(id));
        return next;
      });
    }

    toast({
      title: `${encontradas.length} NF(s) selecionada(s)`,
      description: naoEncontradas.length > 0
        ? `Não encontradas: ${naoEncontradas.join(", ")}`
        : `Todas as ${encontradas.length} NFs foram encontradas e selecionadas.`,
      variant: naoEncontradas.length > 0 ? "destructive" : "default",
    });

    setBuscaMultiplaTexto("");
    setBuscaMultipla(false);
  }

  function exportarExcel(nfs: NfDisponivel[], label?: string) {
    if (nfs.length === 0) return;

    // Group by MR then by entrega (CNPJ), mirroring the visual layout
    const groupedByMR = new Map<number, NfDisponivel[]>();
    nfs.forEach((nf) => {
      const list = groupedByMR.get(nf.macroRegiao) || [];
      list.push(nf);
      groupedByMR.set(nf.macroRegiao, list);
    });

    const headers = [
      "Macro Região", "Entrega", "Razão Social", "CNPJ Destinatário",
      "Endereço", "Bairro", "Cidade", "UF", "CEP",
      "Nº NF", "Nº CT-e", "Caixas", "Peso (kg)", "Volume (m³)", "Placa Carga", "Tipo Carga",
    ];

    const wsData: (string | number | null)[][] = [headers];

    Array.from(groupedByMR.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([mr, nfsMR]) => {
        const mrTotalCaixas = nfsMR.reduce((s, n) => s + n.totalCaixas, 0);
        const mrTotalPeso = nfsMR.reduce((s, n) => s + n.peso_bruto, 0);
        const mrTotalVolume = nfsMR.reduce((s, n) => s + n.volume_m3, 0);

        const entregasMap = new Map<string, NfDisponivel[]>();
        nfsMR.forEach((nf) => {
          const key = nf.cnpj_destinatario || nf.id;
          const list = entregasMap.get(key) || [];
          list.push(nf);
          entregasMap.set(key, list);
        });
        const mrTotalEntregas = entregasMap.size;

        // MR header row
        wsData.push([
          getMacroRegiaoLabel(mr),
          `${mrTotalEntregas} entrega(s)`,
          "", "", "", "", "", "", "",
          `${nfsMR.length} NFs`,
          "",
          mrTotalCaixas,
          Number(mrTotalPeso.toFixed(2)),
          Number(mrTotalVolume.toFixed(4)),
          "", "",
        ]);

        let entregaIdx = 1;
        Array.from(entregasMap.entries()).forEach(([, nfsEntrega]) => {
          const first = nfsEntrega[0];
          const totalCx = nfsEntrega.reduce((s, n) => s + n.totalCaixas, 0);
          const totalPeso = nfsEntrega.reduce((s, n) => s + n.peso_bruto, 0);
          const totalVol = nfsEntrega.reduce((s, n) => s + n.volume_m3, 0);
          const endereco = [first.dest_logradouro, first.dest_numero].filter(Boolean).join(", ");

          // Entrega sub-header
          const ctesEntrega = nfsEntrega.map((n) => n.numero_cte).filter(Boolean);
          wsData.push([
            "",
            `Entrega ${entregaIdx}`,
            first.dest_razao_social || "",
            first.cnpj_destinatario || "",
            endereco,
            first.dest_bairro || "",
            first.dest_cidade || "",
            first.dest_uf || "",
            first.dest_cep || "",
            `NFs: ${nfsEntrega.map((n) => n.numero_nf).join(", ")}`,
            ctesEntrega.length > 0 ? `CTes: ${ctesEntrega.join(", ")}` : "",
            totalCx,
            Number(totalPeso.toFixed(2)),
            Number(totalVol.toFixed(4)),
            first.carga_placa || "",
            first.carga_tipo_carga || "",
          ]);


          entregaIdx++;
        });

        // Empty separator row between MRs
        wsData.push([]);
      });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto-size columns
    const colWidths = headers.map((h, i) => {
      let max = h.length;
      wsData.forEach((row) => {
        const cell = row[i];
        if (cell != null) {
          const len = String(cell).length;
          if (len > max) max = len;
        }
      });
      return { wch: Math.min(max + 2, 50) };
    });
    ws["!cols"] = colWidths;

    // Bold header row
    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) {
        ws[ref].s = { font: { bold: true } };
      }
    }

    const suffix = label ? `_${label.replace(/[^a-zA-Z0-9]/g, "_")}` : "";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Preparação");
    XLSX.writeFile(wb, `preparacao${suffix}_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);

    toast({ title: `${nfs.length} NFs exportadas para Excel` });
  }

  useEffect(() => {
    const searchTerm = buscaNf.trim().toLowerCase();
    if (!searchTerm) return;

    const matchingKeys = new Set<string>();
    nfsDisponiveis.forEach((nf) => {
      if (filtroMR !== "todas" && nf.macroRegiao !== parseInt(filtroMR)) return;
      const matchNf = nf.numero_nf.toLowerCase().includes(searchTerm);
      const matchRazao = nf.dest_razao_social.toLowerCase().includes(searchTerm);
      const matchBairro = nf.dest_bairro.toLowerCase().includes(searchTerm);
      const matchCidade = (nf.dest_cidade || "").toLowerCase().includes(searchTerm);
      if (matchNf || matchRazao || matchBairro || matchCidade) {
        const cnpj = nf.cnpj_destinatario || nf.id;
        matchingKeys.add(`${nf.macroRegiao}_${cnpj}`);
      }
    });

    if (matchingKeys.size > 0) {
      setExpandedEntregas(matchingKeys);
    }
  }, [buscaNf, nfsDisponiveis, filtroMR]);


  // Bairros disponíveis baseados no filtro de MR atual
  const bairrosDisponiveis = useMemo(() => {
    let base = nfsDisponiveis;
    if (filtroMR !== "todas") {
      base = base.filter((nf) => nf.macroRegiao === parseInt(filtroMR));
    }
    const bairros = [...new Set(base.map((nf) => nf.dest_bairro).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return bairros;
  }, [nfsDisponiveis, filtroMR]);

  // Reset bairro filter when MR changes
  useEffect(() => {
    setFiltroBairro("todos");
  }, [filtroMR]);

  const filteredNfs = useMemo(() => {
    const searchTerm = buscaNf.trim().toLowerCase();
    return nfsDisponiveis.filter((nf) => {
      if (filtroMR !== "todas" && nf.macroRegiao !== parseInt(filtroMR)) return false;
      if (filtroTipoCarga !== "todos" && nf.carga_tipo_carga !== filtroTipoCarga) return false;
      if (filtroBairro !== "todos" && nf.dest_bairro !== filtroBairro) return false;
      if (searchTerm) {
        const matchNf = nf.numero_nf.toLowerCase().includes(searchTerm);
        const matchRazao = nf.dest_razao_social.toLowerCase().includes(searchTerm);
        const matchBairro = nf.dest_bairro.toLowerCase().includes(searchTerm);
        const matchCidade = (nf.dest_cidade || "").toLowerCase().includes(searchTerm);
        if (!matchNf && !matchRazao && !matchBairro && !matchCidade) return false;
      }
      return true;
    });
  }, [nfsDisponiveis, filtroMR, buscaNf, filtroTipoCarga, filtroBairro]);

  // Dashboard totals - all available NFs
  const cargaFilteredNfs = nfsDisponiveis;

  const macroRegioesPresentes = useMemo(() => {
    return [...new Set(cargaFilteredNfs.map((nf) => nf.macroRegiao))].sort((a, b) => a - b);
  }, [cargaFilteredNfs]);

  // Stats for selected NFs
  const selectedNfs = nfsDisponiveis.filter((nf) => selectedNfIds.has(nf.id));
  const selTotalNfs = selectedNfs.length;
  const selTotalCaixas = selectedNfs.reduce((sum, nf) => sum + nf.totalCaixas, 0);
  const selTotalPeso = selectedNfs.reduce((sum, nf) => sum + nf.peso_bruto, 0);
  const selTotalVolume = selectedNfs.reduce((sum, nf) => sum + nf.volume_m3, 0);
  const selTotalValor = selectedNfs.reduce((sum, nf) => sum + (nf.valor_nf || 0), 0);
  const selTotalEntregas = useMemo(() => {
    if (selectedNfs.length === 0) return 0;
    return new Set(selectedNfs.map((nf) => nf.cnpj_destinatario || nf.id)).size;
  }, [selectedNfs]);

  const totalNfsDisponiveis = cargaFilteredNfs.length;
  const totalPesoDisponivel = cargaFilteredNfs.reduce((s, nf) => s + nf.peso_bruto, 0);
  const totalVolumeDisponivel = cargaFilteredNfs.reduce((s, nf) => s + nf.volume_m3, 0);
  const totalCaixasDisponivel = cargaFilteredNfs.reduce((s, nf) => s + nf.totalCaixas, 0);
  const totalValorDisponivel = cargaFilteredNfs.reduce((s, nf) => s + (nf.valor_nf || 0), 0);
  const totalEntregasDisponivel = useMemo(() => {
    const cnpjs = new Set(cargaFilteredNfs.map((nf) => nf.cnpj_destinatario || nf.id));
    return cnpjs.size;
  }, [cargaFilteredNfs]);

  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Dashboard shows selected when there's a selection, otherwise available
  const hasSelection = selectedNfIds.size > 0;
  const dashVolume = hasSelection ? selTotalVolume : totalVolumeDisponivel;
  const dashPeso = hasSelection ? selTotalPeso : totalPesoDisponivel;
  const dashCaixas = hasSelection ? selTotalCaixas : totalCaixasDisponivel;
  const dashNfs = hasSelection ? selTotalNfs : totalNfsDisponiveis;
  const dashEntregas = hasSelection ? selTotalEntregas : totalEntregasDisponivel;
  const dashValor = hasSelection ? selTotalValor : totalValorDisponivel;
  const dashLabel = hasSelection ? "Selecionado" : "Disponível";

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6" />
            Preparação de Carga
          </h1>
          <p className="text-muted-foreground">
            Visualize e agrupe NFs por Macro Região e Entrega antes da roteirização
          </p>
        </div>

        {/* Dashboard */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-6">
          <Card className={hasSelection ? "border-success/30 bg-success/5" : "border-primary/30 bg-primary/5"}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${hasSelection ? "text-success" : "text-primary"}`}>Volume {dashLabel}</CardTitle>
              <Package className={`h-5 w-5 ${hasSelection ? "text-success" : "text-primary"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${hasSelection ? "text-success" : "text-primary"}`}>{dashVolume.toFixed(2)} <span className="text-lg font-normal">m³</span></div>
              <p className="text-xs text-muted-foreground mt-1">{dashPeso.toFixed(1)} kg • {dashCaixas} cx</p>
              {hasSelection && <p className="text-[10px] text-muted-foreground">Disponível: {totalVolumeDisponivel.toFixed(2)} m³</p>}
            </CardContent>
          </Card>
          <Card className={hasSelection ? "border-success/30 bg-success/5" : "border-primary/30 bg-primary/5"}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${hasSelection ? "text-success" : "text-primary"}`}>Peso {dashLabel}</CardTitle>
              <Weight className={`h-5 w-5 ${hasSelection ? "text-success" : "text-primary"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${hasSelection ? "text-success" : "text-primary"}`}>{dashPeso.toFixed(1)} <span className="text-lg font-normal">kg</span></div>
              <p className="text-xs text-muted-foreground mt-1">{dashCaixas} caixas</p>
              {hasSelection && <p className="text-[10px] text-muted-foreground">Disponível: {totalPesoDisponivel.toFixed(1)} kg</p>}
            </CardContent>
          </Card>
          <Card className={hasSelection ? "border-success/30 bg-success/5" : "border-primary/30 bg-primary/5"}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${hasSelection ? "text-success" : "text-primary"}`}>Caixas {dashLabel}</CardTitle>
              <Package className={`h-5 w-5 ${hasSelection ? "text-success" : "text-primary"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${hasSelection ? "text-success" : "text-primary"}`}>{dashCaixas}</div>
              <p className="text-xs text-muted-foreground mt-1">{dashNfs} NFs</p>
              {hasSelection && <p className="text-[10px] text-muted-foreground">Disponível: {totalCaixasDisponivel} cx</p>}
            </CardContent>
          </Card>
          <Card className={hasSelection ? "border-success/30 bg-success/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${hasSelection ? "text-success" : "text-muted-foreground"}`}>Entregas {hasSelection ? dashLabel : ""}</CardTitle>
              <MapPin className={`h-5 w-5 ${hasSelection ? "text-success" : "text-primary"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${hasSelection ? "text-success" : ""}`}>{dashEntregas}</div>
              <p className="text-xs text-muted-foreground mt-1">{dashNfs} NFs</p>
              {hasSelection && <p className="text-[10px] text-muted-foreground">Disponível: {totalEntregasDisponivel} entregas</p>}
            </CardContent>
          </Card>
          <Card className={hasSelection ? "border-success/30 bg-success/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${hasSelection ? "text-success" : "text-muted-foreground"}`}>NFs {hasSelection ? dashLabel : "Disponíveis"}</CardTitle>
              <FileText className={`h-5 w-5 ${hasSelection ? "text-success" : "text-primary"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${hasSelection ? "text-success" : ""}`}>{dashNfs}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {hasSelection
                  ? `de ${totalNfsDisponiveis} disponíveis`
                  : cargaFilteredNfs.length > 0
                  ? `${new Set(cargaFilteredNfs.map((n) => n.carga_id)).size} carga(s)`
                  : "—"}
              </p>
            </CardContent>
          </Card>
          <Card className={hasSelection ? "border-success/30 bg-success/5" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${hasSelection ? "text-success" : "text-muted-foreground"}`}>Valor {hasSelection ? dashLabel : "Disponível"}</CardTitle>
              <FileText className={`h-5 w-5 ${hasSelection ? "text-success" : "text-primary"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${hasSelection ? "text-success" : ""}`}>{fmtBRL(dashValor)}</div>
              {hasSelection && <p className="text-[10px] text-muted-foreground mt-1">Disponível: {fmtBRL(totalValorDisponivel)}</p>}
            </CardContent>
          </Card>
        </div>


        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              <div className="min-w-[200px] flex-1 max-w-sm">
                <Label className="text-xs">Buscar NF</Label>
                <div className="relative flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Nº NF, destinatário, bairro..."
                      value={buscaNf}
                      onChange={(e) => setBuscaNf(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button
                    variant={buscaMultipla ? "default" : "outline"}
                    size="icon"
                    title="Buscar e selecionar várias NFs de uma vez"
                    onClick={() => setBuscaMultipla(!buscaMultipla)}
                  >
                    <FileText className="w-4 h-4" />
                  </Button>
                </div>
                {buscaMultipla && (
                  <div className="mt-2 space-y-2 p-3 border rounded-md bg-muted/30">
                    <Label className="text-xs font-semibold">Busca Múltipla — cole ou digite vários números de NF</Label>
                    <textarea
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                      placeholder={"Ex:\n12345\n67890\n11111\n\nOu separados por vírgula: 12345, 67890, 11111"}
                      value={buscaMultiplaTexto}
                      onChange={(e) => setBuscaMultiplaTexto(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={buscarEMarcarMultiplas} disabled={!buscaMultiplaTexto.trim()}>
                        <Search className="w-3 h-3 mr-1" />
                        Buscar e Selecionar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setBuscaMultipla(false); setBuscaMultiplaTexto(""); }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="min-w-[140px]">
                <Label className="text-xs">Tipo Carga</Label>
                <Select value={filtroTipoCarga} onValueChange={setFiltroTipoCarga}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="SECA">Seca</SelectItem>
                    <SelectItem value="CHOCOLATE">Chocolate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[180px]">
                <Label className="text-xs">Bairro</Label>
                <Select value={filtroBairro} onValueChange={setFiltroBairro}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos ({bairrosDisponiveis.length})</SelectItem>
                    {bairrosDisponiveis.map((bairro) => {
                      const count = nfsDisponiveis.filter((n) => {
                        if (filtroMR !== "todas" && n.macroRegiao !== parseInt(filtroMR)) return false;
                        return n.dest_bairro === bairro;
                      }).length;
                      return (
                        <SelectItem key={bairro} value={bairro}>
                          {bairro} ({count})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[200px]">
                <Label className="text-xs">Macro Região</Label>
                <Select value={filtroMR} onValueChange={setFiltroMR}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {macroRegioesPresentes.map((mr) => {
                      const count = cargaFilteredNfs.filter((n) => n.macroRegiao === mr).length;
                      return (
                        <SelectItem key={mr} value={String(mr)}>
                          MR {mr} ({count})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* MR Badges */}
            <div className="flex flex-wrap gap-2 mt-3">
              {macroRegioesPresentes.map((mr) => {
                const nfsInMR = cargaFilteredNfs.filter((n) => n.macroRegiao === mr);
                const selectedInMR = nfsInMR.filter((n) => selectedNfIds.has(n.id)).length;
                return (
                  <Badge
                    key={mr}
                    variant={selectedInMR === nfsInMR.length ? "default" : selectedInMR > 0 ? "secondary" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleMR(mr)}
                  >
                    MR {mr} ({selectedInMR}/{nfsInMR.length})
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Stats da seleção + botão roteirização */}
        {selectedNfIds.size > 0 && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">NFs Selecionadas</p>
                <p className="text-2xl font-bold">{selTotalNfs}</p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Total Caixas</p>
                <p className="text-2xl font-bold">{selTotalCaixas}</p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Weight className="w-3 h-3" /> Peso Total
                </p>
                <p className="text-2xl font-bold">{selTotalPeso.toFixed(1)} kg</p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Package className="w-3 h-3" /> Volume Total
                </p>
                <p className="text-2xl font-bold">{selTotalVolume.toFixed(2)} m³</p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Cargas Origem</p>
                <p className="text-2xl font-bold">
                  {new Set(selectedNfs.map((nf) => nf.carga_id)).size}
                </p>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <Button
                size="lg"
                className="w-full md:w-auto"
                onClick={() => {
                  const nfIds = [...selectedNfIds];
                  const cargaIds = [...new Set(selectedNfs.map((nf) => nf.carga_id))];
                  navigate("/roteirizacao", { 
                    state: { 
                      nfIds, 
                      cargaIds,
                      totais: {
                        nfs: selTotalNfs,
                        caixas: selTotalCaixas,
                        peso: selTotalPeso,
                        volume: selTotalVolume,
                        entregas: selTotalEntregas,
                      }
                    } 
                  });
                }}
              >
                <Route className="w-4 h-4 mr-2" />
                Enviar para Roteirização ({selTotalNfs} NFs)
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full md:w-auto"
                title="Pula a geocodificação automática — você define a ordem das paradas manualmente (drag-and-drop). O sistema calcula km/tempo em background respeitando sua ordem."
                onClick={() => {
                  const nfIds = [...selectedNfIds];
                  const cargaIds = [...new Set(selectedNfs.map((nf) => nf.carga_id))];
                  navigate("/roteirizacao", { 
                    state: { 
                      nfIds, 
                      cargaIds,
                      modoManual: true,
                      totais: {
                        nfs: selTotalNfs,
                        caixas: selTotalCaixas,
                        peso: selTotalPeso,
                        volume: selTotalVolume,
                        entregas: selTotalEntregas,
                      }
                    } 
                  });
                }}
              >
                <List className="w-4 h-4 mr-2" />
                Roteirizar Manualmente
              </Button>
            </div>
          </div>
        )}

        {/* NFs disponíveis */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" />
                NFs Disponíveis ({filteredNfs.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportarExcel(filteredNfs)}>
                  <Download className="w-4 h-4 mr-1" />
                  Exportar Excel
                </Button>
                <Button variant="outline" size="sm" onClick={toggleAllFiltered}>
                  {filteredNfs.every((nf) => selectedNfIds.has(nf.id))
                    ? "Desmarcar Todos"
                    : "Selecionar Todos"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredNfs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma NF disponível para programação
              </p>
            ) : (
              <div className="space-y-1">
                {(() => {
                  const groupedByMR = new Map<number, NfDisponivel[]>();
                  filteredNfs.forEach((nf) => {
                    const list = groupedByMR.get(nf.macroRegiao) || [];
                    list.push(nf);
                    groupedByMR.set(nf.macroRegiao, list);
                  });

                  return Array.from(groupedByMR.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([mr, nfsMR]) => {
                      const mrNfsSel = nfsMR.filter((n) => selectedNfIds.has(n.id)).length;
                      const mrTotalCaixas = nfsMR.reduce((s, n) => s + n.totalCaixas, 0);
                      const mrTotalPeso = nfsMR.reduce((s, n) => s + n.peso_bruto, 0);
                      const mrTotalVolume = nfsMR.reduce((s, n) => s + n.volume_m3, 0);
                      const mrTotalValor = nfsMR.reduce((s, n) => s + (n.valor_nf || 0), 0);

                      const entregasMap = new Map<string, NfDisponivel[]>();
                      nfsMR.forEach((nf) => {
                        const key = nf.cnpj_destinatario || nf.id;
                        const list = entregasMap.get(key) || [];
                        list.push(nf);
                        entregasMap.set(key, list);
                      });
                      const mrTotalEntregas = entregasMap.size;

                      return (
                        <div key={mr} className="mb-4">
                          <div
                            className="flex items-center gap-2 mb-2 p-2 bg-primary/10 rounded-md cursor-pointer border border-primary/20"
                            onClick={() => toggleMR(mr)}
                          >
                            <Checkbox
                              checked={mrNfsSel === nfsMR.length}
                              className="pointer-events-none"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-sm">
                                {getMacroRegiaoLabel(mr)}
                              </span>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span>{mrTotalEntregas} entrega{mrTotalEntregas > 1 ? "s" : ""}</span>
                                <span>{nfsMR.length} NFs</span>
                                <span>{mrTotalCaixas} cx</span>
                                <span>{mrTotalPeso.toFixed(1)} kg</span>
                                {mrTotalVolume > 0 && <span className="font-semibold text-primary">{mrTotalVolume.toFixed(2)} m³</span>}
                                {mrTotalValor > 0 && <span className="font-semibold text-success">{fmtBRL(mrTotalValor)}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  gerarPreparacaoPdf(nfsMR, getMacroRegiaoLabel(mr));
                                }}
                                title={`Gerar PDF da MR ${mr}`}
                              >
                                <FileText className="w-3 h-3 mr-1" />
                                PDF
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  exportarExcel(nfsMR, getMacroRegiaoLabel(mr));
                                }}
                                title={`Exportar MR ${mr} para Excel`}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                Excel
                              </Button>
                              <Badge variant="outline">
                                {mrNfsSel}/{nfsMR.length} sel.
                              </Badge>
                            </div>
                          </div>

                          <div className="space-y-2 pl-2">
                            {Array.from(entregasMap.entries()).map(([cnpj, nfsEntrega]) => {
                              const entregaKey = `${mr}_${cnpj}`;
                              const first = nfsEntrega[0];
                              const allEntregaSel = nfsEntrega.every((n) => selectedNfIds.has(n.id));
                              const someEntregaSel = nfsEntrega.some((n) => selectedNfIds.has(n.id));
                              const totalCaixasEntrega = nfsEntrega.reduce((s, n) => s + n.totalCaixas, 0);
                              const totalPesoEntrega = nfsEntrega.reduce((s, n) => s + n.peso_bruto, 0);
                              const totalVolumeEntrega = nfsEntrega.reduce((s, n) => s + n.volume_m3, 0);
                              const isExpanded = expandedEntregas.has(entregaKey);
                              const endereco = [first.dest_logradouro, first.dest_numero].filter(Boolean).join(", ");
                              const hasAgendamento = nfsEntrega.some((n) => n.tem_agendamento);
                              const proxAgendamento = nfsEntrega
                                .filter((n) => n.tem_agendamento && n.data_agendamento)
                                .map((n) => n.data_agendamento as string)
                                .sort()[0];

                              return (
                                <div key={entregaKey} className={`border rounded-md ${hasAgendamento ? "border-green-500 border-2" : ""}`}>
                                  <div
                                    className={`flex items-center gap-2 p-2 rounded-t-md cursor-pointer transition-colors ${
                                      hasAgendamento
                                        ? "bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-950/50"
                                        : allEntregaSel
                                        ? "bg-primary/5"
                                        : someEntregaSel
                                        ? "bg-accent/30"
                                        : "hover:bg-muted/30"
                                    }`}
                                  >
                                    <Checkbox
                                      checked={allEntregaSel}
                                      className="shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleEntrega(cnpj);
                                        if (!allEntregaSel && !isExpanded) {
                                          toggleExpandEntrega(entregaKey);
                                        }
                                      }}
                                    />
                                    <div
                                      className="flex-1 min-w-0 cursor-pointer"
                                      onClick={() => toggleExpandEntrega(entregaKey)}
                                    >
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-sm truncate">
                                          {first.dest_razao_social}
                                        </span>
                                        <Badge variant="outline" className="text-xs shrink-0">
                                          {nfsEntrega.length} NF{nfsEntrega.length > 1 ? "s" : ""}
                                        </Badge>
                                        {hasAgendamento && (
                                          <Badge className="text-xs shrink-0 bg-green-600 hover:bg-green-700 text-white border-transparent">
                                            ⭐ PRIORIDADE — AGENDADA{proxAgendamento ? ` ${format(new Date(proxAgendamento + "T00:00:00"), "dd/MM")}` : ""}
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                        <MapPin className="w-3 h-3 shrink-0" />
                                        <span className="truncate">
                                          {endereco ? `${endereco} – ` : ""}{first.dest_bairro}{first.dest_cidade ? `, ${first.dest_cidade}` : ""}{first.dest_uf ? `/${first.dest_uf}` : ""}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                        <FileText className="w-3 h-3 shrink-0" />
                                        <span className="truncate">
                                          NFs: {nfsEntrega.map((n) => n.numero_nf).join(", ")}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                                      <span>{totalCaixasEntrega} cx</span>
                                      <span>{totalPesoEntrega.toFixed(1)} kg</span>
                                      {totalVolumeEntrega > 0 && <span className="font-semibold text-primary">{totalVolumeEntrega.toFixed(2)} m³</span>}
                                      <button
                                        className="p-0.5"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleExpandEntrega(entregaKey);
                                        }}
                                      >
                                        {isExpanded ? (
                                          <ChevronUp className="w-4 h-4" />
                                        ) : (
                                          <ChevronDown className="w-4 h-4" />
                                        )}
                                      </button>
                                    </div>
                                  </div>

                                  {isExpanded && (
                                    <div className="border-t px-2 py-1 space-y-1 bg-muted/20">
                                      {nfsEntrega.map((nf) => (
                                        <div
                                          key={nf.id}
                                          className={`flex items-center gap-3 p-1.5 rounded text-sm cursor-pointer transition-colors ${
                                            nf.tem_agendamento
                                              ? "bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-950/50 border-l-4 border-green-500"
                                              : selectedNfIds.has(nf.id)
                                              ? "bg-primary/5"
                                              : "hover:bg-muted/30"
                                          }`}
                                          onClick={() => toggleNf(nf.id)}
                                        >
                                          <Checkbox
                                            checked={selectedNfIds.has(nf.id)}
                                            className="pointer-events-none"
                                          />
                                          <span className="font-mono font-bold text-xs">
                                            NF {nf.numero_nf}
                                          </span>
                                          <TipoCargaBadge tipoCarga={nf.carga_tipo_carga} />
                                          {nf.tem_agendamento && (
                                            <Badge className="text-[10px] h-4 px-1 bg-green-600 hover:bg-green-700 text-white border-transparent">
                                              AGENDADA{nf.data_agendamento ? ` ${format(new Date(nf.data_agendamento + "T00:00:00"), "dd/MM")}` : ""}
                                            </Badge>
                                          )}
                                          <span className="text-xs text-muted-foreground">
                                            {nf.totalCaixas} cx
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {nf.peso_bruto.toFixed(1)} kg
                                          </span>
                                          <span className="text-xs text-muted-foreground ml-auto">
                                            {nf.carga_placa}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Floating summary bar */}
      {hasSelection && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-card border border-border shadow-xl rounded-full px-6 py-3 flex items-center gap-4 text-sm">
            <span className="font-semibold text-primary">{selTotalEntregas} <span className="text-muted-foreground font-normal">entreg.</span></span>
            <span className="text-border">|</span>
            <span className="font-semibold text-primary">{selTotalNfs} <span className="text-muted-foreground font-normal">NFs</span></span>
            <span className="text-border">|</span>
            <span className="font-semibold text-primary">{selTotalCaixas} <span className="text-muted-foreground font-normal">cx</span></span>
            <span className="text-border">|</span>
            <span className="font-semibold text-primary">{selTotalPeso.toFixed(0)} <span className="text-muted-foreground font-normal">kg</span></span>
            <span className="text-border">|</span>
            <span className="font-semibold text-primary">{selTotalVolume.toFixed(2)} <span className="text-muted-foreground font-normal">m³</span></span>
            <button
              onClick={() => setSelectedNfIds(new Set())}
              className="ml-2 text-muted-foreground hover:text-destructive transition-colors"
              title="Limpar seleção"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
