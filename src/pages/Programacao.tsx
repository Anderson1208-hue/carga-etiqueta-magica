import { useEffect, useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Truck,
  Package,
  FileText,
  Filter,
  Plus,
  Loader2,
  CheckCircle2,
  Weight,
  X,
  Link2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Search,
  Printer,
  Download,
  Edit,
  Trash2,
  ArrowRightLeft,
  CalendarDays,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { calculateBoxes } from "@/lib/xml-parser";
import {
  getMacroRegiao,
  getMacroRegiaoLabel,
} from "@/lib/macro-regioes";
import { generateNotaDeCargaPDF, downloadBlob, printBlob } from "@/lib/pdf-generator";

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
  totalCaixas: number;
  macroRegiao: number;
  carga_id: string;
  carga_placa: string;
  carga_motorista: string;
  carga_data: string;
}

interface VeiculoNfDetail {
  nf_id: string;
  numero_nf: string;
  razao_social: string;
  carga_origem: string;
  dest_cidade: string;
  dest_uf: string;
  dest_bairro: string;
  peso_bruto: number;
  volume_m3: number;
  totalCaixas: number;
}

interface VeiculoFormado {
  id: string;
  placa: string;
  motorista: string;
  data: string;
  status: string;
  access_code: string | null;
  nfs: VeiculoNfDetail[];
  pesoTotal: number;
  volumeTotal: number;
  caixasTotal: number;
}

export default function Programacao() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [printingVeiculoId, setPrintingVeiculoId] = useState<string | null>(null);
  const [downloadingVeiculoId, setDownloadingVeiculoId] = useState<string | null>(null);

  async function fetchVeiculoNfsPDF(veiculo: VeiculoFormado) {
    const nfIds = veiculo.nfs.map((n) => n.nf_id);
    if (nfIds.length === 0) return null;

    const { data: nfsData } = await supabase
      .from("notas_fiscais")
      .select(`
        id, numero_nf, razao_social_emitente, cnpj_emitente,
        cnpj_destinatario, dest_bairro, data_emissao,
        itens_nf(c_prod, x_prod, q_com)
      `)
      .in("id", nfIds);

    if (!nfsData || nfsData.length === 0) return null;

    return nfsData.map((nf) => ({
      numeroNf: nf.numero_nf,
      razaoSocialEmitente: nf.razao_social_emitente,
      cnpjEmitente: nf.cnpj_emitente,
      cnpjDestinatario: nf.cnpj_destinatario || "",
      destBairro: nf.dest_bairro || undefined,
      macroRegiao: getMacroRegiao(nf.dest_bairro),
      dataEmissao: nf.data_emissao,
      itens: (nf.itens_nf || []).map((item: any) => ({
        cProd: item.c_prod,
        xProd: item.x_prod,
        qtdCaixas: calculateBoxes(Number(item.q_com)),
      })),
    }));
  }

  async function handlePrintNotaCarga(veiculo: VeiculoFormado) {
    setPrintingVeiculoId(veiculo.id);
    try {
      const notasFiscaisPDF = await fetchVeiculoNfsPDF(veiculo);
      if (!notasFiscaisPDF) {
        toast({ title: "Erro", description: "Não foi possível carregar os dados das NFs", variant: "destructive" });
        return;
      }
      const blob = await generateNotaDeCargaPDF(
        { data: veiculo.data, placa: veiculo.placa, motorista: veiculo.motorista },
        notasFiscaisPDF
      );
      printBlob(blob);
    } catch (error) {
      console.error("Error printing nota de carga:", error);
      toast({ title: "Erro", description: "Erro ao gerar PDF", variant: "destructive" });
    } finally {
      setPrintingVeiculoId(null);
    }
  }

  async function handleDownloadNotaCarga(veiculo: VeiculoFormado) {
    setDownloadingVeiculoId(veiculo.id);
    try {
      const notasFiscaisPDF = await fetchVeiculoNfsPDF(veiculo);
      if (!notasFiscaisPDF) {
        toast({ title: "Erro", description: "Não foi possível carregar os dados das NFs", variant: "destructive" });
        return;
      }
      const blob = await generateNotaDeCargaPDF(
        { data: veiculo.data, placa: veiculo.placa, motorista: veiculo.motorista },
        notasFiscaisPDF
      );
      downloadBlob(blob, `nota_carga_${veiculo.placa}_${format(new Date(veiculo.data + "T00:00:00"), "yyyyMMdd")}.pdf`);
      toast({ title: "PDF gerado!", description: `${notasFiscaisPDF.length} NFs incluídas.` });
    } catch (error) {
      console.error("Error downloading nota de carga:", error);
      toast({ title: "Erro", description: "Erro ao gerar PDF", variant: "destructive" });
    } finally {
      setDownloadingVeiculoId(null);
    }
  }

  const [nfsDisponiveis, setNfsDisponiveis] = useState<NfDisponivel[]>([]);
  const [totalNfsPorCarga, setTotalNfsPorCarga] = useState<Map<string, number>>(new Map());
  const [veiculosFormados, setVeiculosFormados] = useState<VeiculoFormado[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNfIds, setSelectedNfIds] = useState<Set<string>>(new Set());
  const [filtroMR, setFiltroMR] = useState<string>("todas");
  const [filtroCargaIds, setFiltroCargaIds] = useState<Set<string>>(new Set());

  // Dialog: Montar Veículo (2 etapas)
  const [showMontarDialog, setShowMontarDialog] = useState(false);
  const [montarStep, setMontarStep] = useState<1 | 2>(1);
  const [formPlaca, setFormPlaca] = useState("");
  const [formMotorista, setFormMotorista] = useState("");
  const [formData, setFormData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [savingMontar, setSavingMontar] = useState(false);

  // Dialog: Vincular NFs a veículo existente
  const [showVincularDialog, setShowVincularDialog] = useState(false);
  const [selectedVeiculoId, setSelectedVeiculoId] = useState<string>("");
  const [savingVinculo, setSavingVinculo] = useState(false);

  // Filtro de data dos veículos cadastrados
  const [filtroVeiculoAno, setFiltroVeiculoAno] = useState<string>("");
  const [filtroVeiculoMes, setFiltroVeiculoMes] = useState<string>("");
  const [filtroVeiculoDia, setFiltroVeiculoDia] = useState<string>("");

  // Dialog: Editar placa/motorista de veículo existente
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editVeiculo, setEditVeiculo] = useState<VeiculoFormado | null>(null);
  const [editPlaca, setEditPlaca] = useState("");
  const [editMotorista, setEditMotorista] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Dialog: Gerenciar NFs de veículo (remover / mover)
  const [showGerenciarNfsDialog, setShowGerenciarNfsDialog] = useState(false);
  const [gerenciarVeiculo, setGerenciarVeiculo] = useState<VeiculoFormado | null>(null);
  const [nfsToRemove, setNfsToRemove] = useState<Set<string>>(new Set());
  const [moveTargetVeiculoId, setMoveTargetVeiculoId] = useState<string>("");
  const [savingGerenciar, setSavingGerenciar] = useState(false);

  // Veículos cadastrados - colapsável, fechado por padrão
  const [showVeiculosCadastrados, setShowVeiculosCadastrados] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      await Promise.all([loadNfsDisponiveis(), loadVeiculosFormados()]);
    } finally {
      setLoading(false);
    }
  }

  async function loadNfsDisponiveis() {
    const { data: cargas } = await supabase
      .from("cargas")
      .select("id, placa, motorista, data")
      .in("status", ["aberta", "fechada"]);

    if (!cargas || cargas.length === 0) {
      setNfsDisponiveis([]);
      setTotalNfsPorCarga(new Map());
      return;
    }

    const cargaIds = cargas.map((c) => c.id);
    const cargaMap = new Map(cargas.map((c) => [c.id, c]));

    // Fetch NFs per carga to avoid 1000-row limit
    const nfPromises = cargaIds.map((cargaId) =>
      supabase
        .from("notas_fiscais")
        .select(`
          id, numero_nf, chave_acesso, cnpj_destinatario,
          dest_razao_social, dest_bairro, dest_cep,
          dest_logradouro, dest_numero, dest_cidade, dest_uf,
          peso_bruto, volume_m3, carga_id,
          itens_nf(q_com)
        `)
        .eq("carga_id", cargaId)
        .limit(2000)
    );

    const [nfResults, { data: assigned }] = await Promise.all([
      Promise.all(nfPromises),
      supabase.from("veiculo_nfs").select("nf_id"),
    ]);

    const nfs = nfResults.flatMap((r) => r.data || []);

    if (nfs.length === 0) {
      setNfsDisponiveis([]);
      setTotalNfsPorCarga(new Map());
      return;
    }

    // Count total NFs per carga (including already assigned)
    const totalMap = new Map<string, number>();
    nfs.forEach((nf) => {
      totalMap.set(nf.carga_id, (totalMap.get(nf.carga_id) || 0) + 1);
    });
    setTotalNfsPorCarga(totalMap);

    const assignedIds = new Set((assigned || []).map((a) => a.nf_id));

    const available: NfDisponivel[] = nfs
      .filter((nf) => !assignedIds.has(nf.id))
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
          totalCaixas,
          macroRegiao: getMacroRegiao(nf.dest_bairro),
          carga_id: nf.carga_id,
          carga_placa: carga?.placa || "",
          carga_motorista: carga?.motorista || "",
          carga_data: carga?.data || "",
        };
      });

    available.sort((a, b) => {
      if (a.macroRegiao !== b.macroRegiao) return a.macroRegiao - b.macroRegiao;
      const bComp = (a.dest_bairro || "").localeCompare(b.dest_bairro || "", "pt-BR");
      if (bComp !== 0) return bComp;
      return (a.dest_razao_social || "").localeCompare(b.dest_razao_social || "", "pt-BR");
    });

    setNfsDisponiveis(available);
  }

  async function loadVeiculosFormados() {
    const { data: veiculos } = await supabase
      .from("veiculos")
      .select("id, placa, motorista, data, status, access_code")
      .order("created_at", { ascending: false });

    if (!veiculos || veiculos.length === 0) {
      setVeiculosFormados([]);
      return;
    }

    const veiculoIds = veiculos.map((v) => v.id);
    const { data: vnfs } = await supabase
      .from("veiculo_nfs")
      .select("veiculo_id, nf_id, carga_origem_id")
      .in("veiculo_id", veiculoIds);

    const nfIds = (vnfs || []).map((v) => v.nf_id);
    let nfMap = new Map<string, { numero_nf: string; razao_social: string; dest_cidade: string; dest_uf: string; dest_bairro: string; peso_bruto: number; volume_m3: number; totalCaixas: number }>();
    if (nfIds.length > 0) {
      const { data: nfDetails } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, dest_razao_social, dest_cidade, dest_uf, dest_bairro, peso_bruto, volume_m3, itens_nf(q_com)")
        .in("id", nfIds);

      nfMap = new Map(
        (nfDetails || []).map((n) => {
          const items = (n.itens_nf || []) as { q_com: number }[];
          const totalCaixas = items.reduce((sum, i) => sum + calculateBoxes(Number(i.q_com)), 0);
          return [
            n.id,
            {
              numero_nf: n.numero_nf,
              razao_social: n.dest_razao_social || "N/I",
              dest_cidade: n.dest_cidade || "",
              dest_uf: n.dest_uf || "",
              dest_bairro: n.dest_bairro || "",
              peso_bruto: Number(n.peso_bruto) || 0,
              volume_m3: Number(n.volume_m3) || 0,
              totalCaixas,
            },
          ];
        })
      );
    }

    const result: VeiculoFormado[] = veiculos.map((v) => {
      const vNfs = (vnfs || [])
        .filter((vn) => vn.veiculo_id === v.id)
        .map((vn) => {
          const detail = nfMap.get(vn.nf_id);
          return {
            nf_id: vn.nf_id,
            numero_nf: detail?.numero_nf || "?",
            razao_social: detail?.razao_social || "N/I",
            carga_origem: vn.carga_origem_id,
            dest_cidade: detail?.dest_cidade || "",
            dest_uf: detail?.dest_uf || "",
            dest_bairro: detail?.dest_bairro || "",
            peso_bruto: detail?.peso_bruto || 0,
            volume_m3: detail?.volume_m3 || 0,
            totalCaixas: detail?.totalCaixas || 0,
          };
        });
      return {
        id: v.id,
        placa: v.placa,
        motorista: v.motorista,
        data: v.data,
        status: v.status || "pendente",
        access_code: (v as any).access_code || null,
        nfs: vNfs,
        pesoTotal: vNfs.reduce((s, n) => s + n.peso_bruto, 0),
        volumeTotal: vNfs.reduce((s, n) => s + n.volume_m3, 0),
        caixasTotal: vNfs.reduce((s, n) => s + n.totalCaixas, 0),
      };
    });

    setVeiculosFormados(result);
  }

  // Veículos disponíveis para vinculação (que ainda não estão em rota/entregue)
  const veiculosDisponiveis = useMemo(() => {
    return veiculosFormados.filter((v) => v.status === "pendente");
  }, [veiculosFormados]);

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
    const nfsInMR = nfsDisponiveis.filter((nf) => nf.macroRegiao === mr);
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

  // Track expanded entregas
  const [expandedEntregas, setExpandedEntregas] = useState<Set<string>>(new Set());
  function toggleExpandEntrega(key: string) {
    setExpandedEntregas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openMontarDialog() {
    if (selectedNfIds.size === 0) {
      toast({ title: "Nenhuma NF selecionada", description: "Selecione ao menos uma NF", variant: "destructive" });
      return;
    }
    setMontarStep(1);
    setFormPlaca("");
    setFormMotorista("");
    setFormData(format(new Date(), "yyyy-MM-dd"));
    setShowMontarDialog(true);
  }

  // Montar veículo: cria veículo + vincula NFs selecionadas
  async function handleMontarVeiculo() {
    if (!formPlaca.trim() || !formMotorista.trim()) {
      toast({ title: "Dados incompletos", description: "Preencha placa e motorista", variant: "destructive" });
      return;
    }

    setSavingMontar(true);
    try {
      const { data: veiculo, error: veicError } = await supabase
        .from("veiculos")
        .insert({
          placa: formPlaca.trim().toUpperCase(),
          motorista: formMotorista.trim(),
          data: formData,
          created_by: user?.id,
        })
        .select("id")
        .single();

      if (veicError) throw veicError;

      const sNfs = nfsDisponiveis.filter((nf) => selectedNfIds.has(nf.id));
      const links = sNfs.map((nf) => ({
        veiculo_id: veiculo.id,
        nf_id: nf.id,
        carga_origem_id: nf.carga_id,
      }));

      const { error: linkError } = await supabase.from("veiculo_nfs").insert(links);
      if (linkError) throw linkError;

      toast({
        title: "Veículo montado!",
        description: `${formPlaca.toUpperCase()} - ${formMotorista} com ${sNfs.length} NFs`,
      });

      setShowMontarDialog(false);
      setSelectedNfIds(new Set());
      await loadData();
    } catch (error) {
      console.error("Error creating vehicle:", error);
      toast({ title: "Erro", description: "Erro ao montar veículo", variant: "destructive" });
    } finally {
      setSavingMontar(false);
    }
  }

  // Vincular NFs selecionadas a um veículo existente
  async function handleVincularNfs() {
    if (!selectedVeiculoId) {
      toast({ title: "Selecione um veículo", description: "Escolha o veículo para vincular as NFs", variant: "destructive" });
      return;
    }

    if (selectedNfIds.size === 0) {
      toast({ title: "Nenhuma NF selecionada", description: "Selecione ao menos uma NF", variant: "destructive" });
      return;
    }

    setSavingVinculo(true);
    try {
      const selectedNfsArr = nfsDisponiveis.filter((nf) => selectedNfIds.has(nf.id));
      const links = selectedNfsArr.map((nf) => ({
        veiculo_id: selectedVeiculoId,
        nf_id: nf.id,
        carga_origem_id: nf.carga_id,
      }));

      const { error } = await supabase.from("veiculo_nfs").insert(links);
      if (error) throw error;

      const veiculo = veiculosFormados.find((v) => v.id === selectedVeiculoId);
      toast({
        title: "NFs vinculadas!",
        description: `${selectedNfsArr.length} NFs vinculadas ao veículo ${veiculo?.placa || ""}`,
      });

      setShowVincularDialog(false);
      setSelectedNfIds(new Set());
      setSelectedVeiculoId("");
      await loadData();
    } catch (error) {
      console.error("Error linking NFs:", error);
      toast({ title: "Erro", description: "Erro ao vincular NFs ao veículo", variant: "destructive" });
    } finally {
      setSavingVinculo(false);
    }
  }

  // Editar placa/motorista do veículo
  function openEditDialog(v: VeiculoFormado) {
    setEditVeiculo(v);
    setEditPlaca(v.placa);
    setEditMotorista(v.motorista);
    setShowEditDialog(true);
  }

  async function handleSaveEdit() {
    if (!editVeiculo || !editPlaca.trim() || !editMotorista.trim()) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("veiculos")
        .update({ placa: editPlaca.trim().toUpperCase(), motorista: editMotorista.trim() })
        .eq("id", editVeiculo.id);
      if (error) throw error;
      toast({ title: "Veículo atualizado!", description: `${editPlaca.toUpperCase()} - ${editMotorista}` });
      setShowEditDialog(false);
      await loadData();
    } catch (error) {
      console.error("Error updating vehicle:", error);
      toast({ title: "Erro", description: "Erro ao atualizar veículo", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  }

  // Gerenciar NFs de veículo (remover / mover)
  function openGerenciarNfsDialog(v: VeiculoFormado) {
    setGerenciarVeiculo(v);
    setNfsToRemove(new Set());
    setMoveTargetVeiculoId("");
    setShowGerenciarNfsDialog(true);
  }

  async function handleRemoveNfs() {
    if (!gerenciarVeiculo || nfsToRemove.size === 0) return;
    setSavingGerenciar(true);
    try {
      // Delete selected veiculo_nfs
      for (const nfId of nfsToRemove) {
        const { error } = await supabase
          .from("veiculo_nfs")
          .delete()
          .eq("veiculo_id", gerenciarVeiculo.id)
          .eq("nf_id", nfId);
        if (error) throw error;
      }
      toast({ title: "NFs removidas!", description: `${nfsToRemove.size} NFs desvinculadas do veículo ${gerenciarVeiculo.placa}` });
      setShowGerenciarNfsDialog(false);
      await loadData();
    } catch (error) {
      console.error("Error removing NFs:", error);
      toast({ title: "Erro", description: "Erro ao remover NFs", variant: "destructive" });
    } finally {
      setSavingGerenciar(false);
    }
  }

  async function handleMoveNfs() {
    if (!gerenciarVeiculo || nfsToRemove.size === 0 || !moveTargetVeiculoId) return;
    setSavingGerenciar(true);
    try {
      // Move: update veiculo_id on veiculo_nfs
      for (const nfId of nfsToRemove) {
        const { error } = await supabase
          .from("veiculo_nfs")
          .update({ veiculo_id: moveTargetVeiculoId })
          .eq("veiculo_id", gerenciarVeiculo.id)
          .eq("nf_id", nfId);
        if (error) throw error;
      }
      const target = veiculosFormados.find((v) => v.id === moveTargetVeiculoId);
      toast({ title: "NFs movidas!", description: `${nfsToRemove.size} NFs movidas para ${target?.placa || ""}` });
      setShowGerenciarNfsDialog(false);
      await loadData();
    } catch (error) {
      console.error("Error moving NFs:", error);
      toast({ title: "Erro", description: "Erro ao mover NFs", variant: "destructive" });
    } finally {
      setSavingGerenciar(false);
    }
  }

  // Filters
  const cargasUnicas = useMemo(() => {
    const map = new Map<string, { id: string; placa: string; motorista: string; data: string }>();
    nfsDisponiveis.forEach((nf) => {
      if (!map.has(nf.carga_id)) {
        map.set(nf.carga_id, { id: nf.carga_id, placa: nf.carga_placa, motorista: nf.carga_motorista, data: nf.carga_data });
      }
    });
    return Array.from(map.values());
  }, [nfsDisponiveis]);

  const [buscaNf, setBuscaNf] = useState("");

  const filteredNfs = useMemo(() => {
    if (filtroCargaIds.size === 0) return [];
    const searchTerm = buscaNf.trim().toLowerCase();
    return nfsDisponiveis.filter((nf) => {
      if (!filtroCargaIds.has(nf.carga_id)) return false;
      if (filtroMR !== "todas" && nf.macroRegiao !== parseInt(filtroMR)) return false;
      if (searchTerm) {
        const matchNf = nf.numero_nf.toLowerCase().includes(searchTerm);
        const matchRazao = nf.dest_razao_social.toLowerCase().includes(searchTerm);
        const matchBairro = nf.dest_bairro.toLowerCase().includes(searchTerm);
        const matchCidade = (nf.dest_cidade || "").toLowerCase().includes(searchTerm);
        if (!matchNf && !matchRazao && !matchBairro && !matchCidade) return false;
      }
      return true;
    });
  }, [nfsDisponiveis, filtroMR, filtroCargaIds, buscaNf]);

  const macroRegioesPresentes = useMemo(() => {
    return [...new Set(nfsDisponiveis.map((nf) => nf.macroRegiao))].sort((a, b) => a - b);
  }, [nfsDisponiveis]);

  // Stats for selected NFs
  const selectedNfs = nfsDisponiveis.filter((nf) => selectedNfIds.has(nf.id));
  const selTotalNfs = selectedNfs.length;
  const selTotalCaixas = selectedNfs.reduce((sum, nf) => sum + nf.totalCaixas, 0);
  const selTotalPeso = selectedNfs.reduce((sum, nf) => sum + nf.peso_bruto, 0);
  const selTotalVolume = selectedNfs.reduce((sum, nf) => sum + nf.volume_m3, 0);

  // Dashboard totals - filtered ONLY by selected cargas
  const cargaFilteredNfs = useMemo(() => {
    if (filtroCargaIds.size === 0) return [];
    return nfsDisponiveis.filter((nf) => filtroCargaIds.has(nf.carga_id));
  }, [nfsDisponiveis, filtroCargaIds]);

  const totalNfsDisponiveis = cargaFilteredNfs.length;
  const totalPesoDisponivel = cargaFilteredNfs.reduce((s, nf) => s + nf.peso_bruto, 0);
  const totalVolumeDisponivel = cargaFilteredNfs.reduce((s, nf) => s + nf.volume_m3, 0);
  const totalCaixasDisponivel = cargaFilteredNfs.reduce((s, nf) => s + nf.totalCaixas, 0);

  // Filter veiculos by selected cargas
  const dashboardVeiculos = useMemo(() => {
    if (filtroCargaIds.size === 0) return veiculosFormados;
    return veiculosFormados.filter((v) =>
      v.nfs.some((nf) => filtroCargaIds.has(nf.carga_origem))
    );
  }, [veiculosFormados, filtroCargaIds]);

  const filteredVeiculoStats = useMemo(() => {
    if (filtroCargaIds.size === 0) {
      return {
        volume: veiculosFormados.reduce((s, v) => s + v.volumeTotal, 0),
        peso: veiculosFormados.reduce((s, v) => s + v.pesoTotal, 0),
        caixas: veiculosFormados.reduce((s, v) => s + v.caixasTotal, 0),
        count: veiculosFormados.length,
      };
    }
    let volume = 0, peso = 0, caixas = 0;
    veiculosFormados.forEach((v) => {
      v.nfs.filter((nf) => filtroCargaIds.has(nf.carga_origem)).forEach((nf) => {
        volume += nf.volume_m3;
        peso += nf.peso_bruto;
        caixas += nf.totalCaixas;
      });
    });
    return { volume, peso, caixas, count: dashboardVeiculos.length };
  }, [veiculosFormados, filtroCargaIds, dashboardVeiculos]);

  const totalVeiculosVolume = filteredVeiculoStats.volume;
  const totalVeiculosPeso = filteredVeiculoStats.peso;
  const totalVeiculosCaixas = filteredVeiculoStats.caixas;

  // Group veículos by date
  const veiculosByDate = useMemo(() => {
    const groups = new Map<string, VeiculoFormado[]>();
    veiculosFormados.forEach((v) => {
      const list = groups.get(v.data) || [];
      list.push(v);
      groups.set(v.data, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [veiculosFormados]);

  // Available years/months/days for filter
  const filtroVeiculoOptions = useMemo(() => {
    const anos = new Set<string>();
    const meses = new Set<string>();
    const dias = new Set<string>();
    veiculosFormados.forEach((v) => {
      const [y, m, d] = v.data.split("-");
      anos.add(y);
      if (!filtroVeiculoAno || filtroVeiculoAno === y) {
        meses.add(m);
        if (!filtroVeiculoMes || filtroVeiculoMes === m) {
          dias.add(d);
        }
      }
    });
    return {
      anos: [...anos].sort((a, b) => b.localeCompare(a)),
      meses: [...meses].sort((a, b) => a.localeCompare(b)),
      dias: [...dias].sort((a, b) => a.localeCompare(b)),
    };
  }, [veiculosFormados, filtroVeiculoAno, filtroVeiculoMes]);

  const filteredVeiculosByDate = useMemo(() => {
    if (!filtroVeiculoAno && !filtroVeiculoMes && !filtroVeiculoDia) return veiculosByDate;
    return veiculosByDate
      .map(([dateStr, veiculos]) => {
        const [y, m, d] = dateStr.split("-");
        if (filtroVeiculoAno && y !== filtroVeiculoAno) return null;
        if (filtroVeiculoMes && m !== filtroVeiculoMes) return null;
        if (filtroVeiculoDia && d !== filtroVeiculoDia) return null;
        return [dateStr, veiculos] as [string, VeiculoFormado[]];
      })
      .filter(Boolean) as [string, VeiculoFormado[]][];
  }, [veiculosByDate, filtroVeiculoAno, filtroVeiculoMes, filtroVeiculoDia]);

  const totalVeiculosFiltrados = filteredVeiculosByDate.reduce((s, [, vs]) => s + vs.length, 0);

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="w-6 h-6" />
              Programação de Veículos
            </h1>
            <p className="text-muted-foreground">
              Cadastre veículos e vincule NFs para programação
            </p>
          </div>
          <div className="flex gap-2">
            {selectedNfIds.size > 0 && (
              <Button onClick={openMontarDialog}>
                <Truck className="w-4 h-4 mr-2" />
                Montar Veículo ({selectedNfIds.size} NFs)
              </Button>
            )}
            {selectedNfIds.size > 0 && veiculosDisponiveis.length > 0 && (
              <Button variant="outline" onClick={() => setShowVincularDialog(true)}>
                <Link2 className="w-4 h-4 mr-2" />
                Vincular a Existente
              </Button>
            )}
          </div>
        </div>

        {/* Dashboard M³ */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Volume Programado</CardTitle>
              <Truck className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalVeiculosVolume.toFixed(2)} <span className="text-lg font-normal">m³</span></div>
              <p className="text-xs text-muted-foreground mt-1">{totalVeiculosPeso.toFixed(1)} kg • {totalVeiculosCaixas} cx</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-primary">Volume Disponível</CardTitle>
              <Package className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{totalVolumeDisponivel.toFixed(2)} <span className="text-lg font-normal">m³</span></div>
              <p className="text-xs text-muted-foreground mt-1">{totalPesoDisponivel.toFixed(1)} kg • {totalCaixasDisponivel} cx</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-primary">Peso Disponível</CardTitle>
              <Weight className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{totalPesoDisponivel.toFixed(1)} <span className="text-lg font-normal">kg</span></div>
              <p className="text-xs text-muted-foreground mt-1">{totalCaixasDisponivel} caixas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">NFs Disponíveis</CardTitle>
              <FileText className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalNfsDisponiveis}</div>
              <p className="text-xs text-muted-foreground mt-1">{totalCaixasDisponivel} caixas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Veículos</CardTitle>
              <Truck className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{filteredVeiculoStats.count}</div>
              <p className="text-xs text-muted-foreground mt-1">montados</p>
            </CardContent>
          </Card>
        </div>

        {/* Veículos cadastrados - agrupados por data (colapsável) */}
        {veiculosFormados.length > 0 && (
          <Collapsible open={showVeiculosCadastrados} onOpenChange={setShowVeiculosCadastrados}>
            <Card>
              <CardHeader className="space-y-3">
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full text-left">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Veículos Cadastrados ({veiculosFormados.length})
                    </CardTitle>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showVeiculosCadastrados ? "rotate-180" : ""}`} />
                  </button>
                </CollapsibleTrigger>
                {showVeiculosCadastrados && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <Select value={filtroVeiculoAno} onValueChange={(v) => { setFiltroVeiculoAno(v === "todos" ? "" : v); setFiltroVeiculoMes(""); setFiltroVeiculoDia(""); }}>
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue placeholder="Ano" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {filtroVeiculoOptions.anos.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filtroVeiculoMes} onValueChange={(v) => { setFiltroVeiculoMes(v === "todos" ? "" : v); setFiltroVeiculoDia(""); }} disabled={!filtroVeiculoAno}>
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue placeholder="Mês" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {filtroVeiculoOptions.meses.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filtroVeiculoDia} onValueChange={(v) => setFiltroVeiculoDia(v === "todos" ? "" : v)} disabled={!filtroVeiculoMes}>
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue placeholder="Dia" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {filtroVeiculoOptions.dias.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(filtroVeiculoAno || filtroVeiculoMes || filtroVeiculoDia) && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => { setFiltroVeiculoAno(""); setFiltroVeiculoMes(""); setFiltroVeiculoDia(""); }}>
                        <X className="w-3 h-3" /> Limpar
                      </Button>
                    )}
                    {(filtroVeiculoAno || filtroVeiculoMes || filtroVeiculoDia) && (
                      <span className="text-xs text-muted-foreground">{totalVeiculosFiltrados} veículo(s)</span>
                    )}
                  </div>
                )}
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-6">
                  {filteredVeiculosByDate.map(([dateStr, veiculos]) => (
                    <div key={dateStr}>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary" className="text-sm px-3 py-1">
                          📅 {format(new Date(dateStr + "T00:00:00"), "dd/MM/yyyy")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{veiculos.length} veículo(s)</span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {veiculos.map((v) => (
                          <Collapsible key={v.id}>
                            <div className="border rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="font-semibold flex items-center gap-2">
                                  <Truck className="w-4 h-4" />
                                  {v.placa}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Badge
                                    variant={
                                      v.status === "pendente"
                                        ? "outline"
                                        : v.status === "em_rota"
                                        ? "default"
                                        : "secondary"
                                    }
                                  >
                                    {v.status}
                                  </Badge>
                                  {v.status === "pendente" && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditDialog(v)} title="Editar placa/motorista">
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {v.motorista}
                              </p>
                              {v.access_code && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Código motorista:</span>
                                  <code className="text-xs font-mono font-bold bg-muted px-2 py-0.5 rounded tracking-wider">
                                    {v.access_code}
                                  </code>
                                </div>
                              )}
                              <div className="flex items-center gap-3 text-sm flex-wrap">
                                <span><FileText className="w-3 h-3 inline mr-1" />{v.nfs.length} NFs</span>
                                <span><Package className="w-3 h-3 inline mr-1" />{v.caixasTotal} cx</span>
                                <span><Weight className="w-3 h-3 inline mr-1" />{v.pesoTotal.toFixed(1)} kg</span>
                                <span className="font-semibold text-primary">{v.volumeTotal.toFixed(2)} m³</span>
                              </div>
                              {v.nfs.length > 0 && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 text-xs gap-1"
                                    onClick={() => handlePrintNotaCarga(v)}
                                    disabled={printingVeiculoId === v.id}
                                  >
                                    {printingVeiculoId === v.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Printer className="w-3 h-3" />
                                    )}
                                    Imprimir
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 text-xs gap-1"
                                    onClick={() => handleDownloadNotaCarga(v)}
                                    disabled={downloadingVeiculoId === v.id}
                                  >
                                    {downloadingVeiculoId === v.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Download className="w-3 h-3" />
                                    )}
                                    PDF
                                  </Button>
                                  {v.status === "pendente" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-xs gap-1"
                                      onClick={() => openGerenciarNfsDialog(v)}
                                    >
                                      <ArrowRightLeft className="w-3 h-3" />
                                      NFs
                                    </Button>
                                  )}
                                </div>
                              )}
                              {v.nfs.length === 0 && v.status === "pendente" && (
                                <p className="text-xs text-muted-foreground text-center italic">Sem NFs vinculadas</p>
                              )}
                              {v.nfs.length > 0 && (
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="w-full text-xs gap-1">
                                    Ver detalhes
                                    <ChevronDown className="w-3 h-3" />
                                  </Button>
                                </CollapsibleTrigger>
                              )}
                              <CollapsibleContent>
                                <div className="mt-2 border-t pt-2 max-h-60 overflow-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs h-8 px-2">NF</TableHead>
                                        <TableHead className="text-xs h-8 px-2">Destinatário</TableHead>
                                        <TableHead className="text-xs h-8 px-2">Local</TableHead>
                                        <TableHead className="text-xs h-8 px-2 text-right">Peso</TableHead>
                                        <TableHead className="text-xs h-8 px-2 text-right">Cx</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {v.nfs.map((nf) => (
                                        <TableRow key={nf.nf_id}>
                                          <TableCell className="text-xs p-2 font-medium">{nf.numero_nf}</TableCell>
                                          <TableCell className="text-xs p-2 max-w-[120px] truncate">{nf.razao_social}</TableCell>
                                          <TableCell className="text-xs p-2">
                                            <span className="flex items-center gap-1">
                                              <MapPin className="w-3 h-3 shrink-0" />
                                              {nf.dest_bairro}{nf.dest_cidade ? ` - ${nf.dest_cidade}` : ""}{nf.dest_uf ? `/${nf.dest_uf}` : ""}
                                            </span>
                                          </TableCell>
                                          <TableCell className="text-xs p-2 text-right">{nf.peso_bruto.toFixed(1)}</TableCell>
                                          <TableCell className="text-xs p-2 text-right">{nf.totalCaixas}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

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
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Nº NF, destinatário, bairro..."
                    value={buscaNf}
                    onChange={(e) => setBuscaNf(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="min-w-[200px] flex-1 max-w-md">
                <Label className="text-xs">Carga Origem {filtroCargaIds.size > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{filtroCargaIds.size}</Badge>}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal h-10">
                      <Package className="w-4 h-4 mr-2 shrink-0" />
                      {filtroCargaIds.size === 0
                        ? "Selecione a(s) carga(s)"
                        : filtroCargaIds.size === 1
                        ? cargasUnicas.find((c) => filtroCargaIds.has(c.id))
                          ? `${cargasUnicas.find((c) => filtroCargaIds.has(c.id))!.placa}`
                          : "1 carga"
                        : `${filtroCargaIds.size} cargas selecionadas`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-2" align="start">
                    <div className="space-y-1">
                      {cargasUnicas.map((c) => {
                        const isChecked = filtroCargaIds.has(c.id);
                        const nfAvail = nfsDisponiveis.filter((nf) => nf.carga_id === c.id).length;
                        const nfTotal = totalNfsPorCarga.get(c.id) || nfAvail;
                        return (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                            onClick={() => {
                              setFiltroCargaIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.id)) next.delete(c.id);
                                else next.add(c.id);
                                return next;
                              });
                            }}
                          >
                            <Checkbox checked={isChecked} />
                            <div className="flex-1 text-sm">
                              <span className="font-medium">{c.placa}</span>
                              <span className="text-muted-foreground ml-1">
                                {format(new Date(c.data + "T00:00:00"), "dd/MM/yyyy")} - {c.motorista}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-[10px] px-1.5">{nfAvail}/{nfTotal} NFs</Badge>
                          </div>
                        );
                      })}
                      {filtroCargaIds.size > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs mt-1"
                          onClick={() => setFiltroCargaIds(new Set())}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Limpar seleção
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
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
                      const count = nfsDisponiveis.filter((n) => n.macroRegiao === mr).length;
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
                const nfsInMR = nfsDisponiveis.filter((n) => n.macroRegiao === mr);
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

        {/* Stats da seleção */}
        {selectedNfIds.size > 0 && (
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
        )}

        {/* NFs disponíveis */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" />
                NFs Disponíveis ({filteredNfs.length})
              </CardTitle>
              <Button variant="outline" size="sm" onClick={toggleAllFiltered}>
                {filteredNfs.every((nf) => selectedNfIds.has(nf.id))
                  ? "Desmarcar Todos"
                  : "Selecionar Todos"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {filtroCargaIds.size === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Package className="w-10 h-10 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground font-medium">Selecione uma ou mais cargas no filtro acima</p>
                <p className="text-xs text-muted-foreground">As NFs disponíveis aparecerão aqui</p>
              </div>
            ) : filteredNfs.length === 0 ? (
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

                      const entregasMap = new Map<string, NfDisponivel[]>();
                      nfsMR.forEach((nf) => {
                        const key = nf.cnpj_destinatario || nf.id;
                        const list = entregasMap.get(key) || [];
                        list.push(nf);
                        entregasMap.set(key, list);
                      });

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
                            <span className="font-semibold text-sm">
                              {getMacroRegiaoLabel(mr)}
                            </span>
                            <Badge variant="outline" className="ml-auto">
                              {mrNfsSel}/{nfsMR.length} sel.
                            </Badge>
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

                              return (
                                <div key={entregaKey} className="border rounded-md">
                                  <div
                                    className={`flex items-center gap-2 p-2 rounded-t-md cursor-pointer transition-colors ${
                                      allEntregaSel
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
                                      </div>
                                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                        <MapPin className="w-3 h-3 shrink-0" />
                                        <span className="truncate">
                                          {endereco ? `${endereco} – ` : ""}{first.dest_bairro}{first.dest_cidade ? `, ${first.dest_cidade}` : ""}{first.dest_uf ? `/${first.dest_uf}` : ""}
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
                                            selectedNfIds.has(nf.id)
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

      {/* Dialog: Montar Veículo (2 etapas) */}
      <Dialog open={showMontarDialog} onOpenChange={setShowMontarDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              {montarStep === 1 ? "Montar Veículo — Revisão" : "Montar Veículo — Vincular Placa"}
            </DialogTitle>
          </DialogHeader>

          {montarStep === 1 ? (
            <>
              <div className="space-y-3">
                <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                  <p className="font-semibold">{selectedNfIds.size} NFs selecionadas</p>
                  <p>{selTotalCaixas} caixas • {selTotalPeso.toFixed(1)} kg</p>
                  <p className="text-muted-foreground">
                    De {new Set(selectedNfs.map((n) => n.carga_id)).size} carga(s) origem
                  </p>
                </div>
                <div className="max-h-52 overflow-auto border rounded-md">
                  {selectedNfs.map((nf) => (
                    <div key={nf.id} className="flex items-center justify-between px-3 py-1.5 text-xs border-b last:border-b-0">
                      <div className="min-w-0">
                        <span className="font-mono font-bold">NF {nf.numero_nf}</span>
                        <span className="ml-2 text-muted-foreground truncate">{nf.dest_razao_social}</span>
                      </div>
                      <div className="shrink-0 text-muted-foreground">{nf.totalCaixas} cx • {nf.peso_bruto.toFixed(1)} kg</div>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowMontarDialog(false)}>Cancelar</Button>
                <Button onClick={() => setMontarStep(2)}>
                  Próximo: Vincular Placa
                  <ChevronDown className="w-4 h-4 ml-1 rotate-[-90deg]" />
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <Label>Placa</Label>
                  <Input value={formPlaca} onChange={(e) => setFormPlaca(e.target.value)} placeholder="ABC-1234" className="uppercase" />
                </div>
                <div>
                  <Label>Motorista</Label>
                  <Input value={formMotorista} onChange={(e) => setFormMotorista(e.target.value)} placeholder="Nome do motorista" />
                </div>
                <div>
                  <Label>Data de Expedição</Label>
                  <Input type="date" value={formData} onChange={(e) => setFormData(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMontarStep(1)}>Voltar</Button>
                <Button onClick={handleMontarVeiculo} disabled={savingMontar}>
                  {savingMontar ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Montar Veículo
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Vincular NFs ao Veículo */}
      <Dialog open={showVincularDialog} onOpenChange={setShowVincularDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Vincular NFs ao Veículo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Selecione o Veículo</Label>
              <Select value={selectedVeiculoId} onValueChange={setSelectedVeiculoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um veículo..." />
                </SelectTrigger>
                <SelectContent>
                  {veiculosDisponiveis.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.placa} - {v.motorista} ({v.nfs.length} NFs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
              <p className="font-semibold">{selectedNfIds.size} NFs selecionadas</p>
              <p>{selTotalCaixas} caixas • {selTotalPeso.toFixed(1)} kg</p>
              <p className="text-muted-foreground">
                De {new Set(selectedNfs.map((n) => n.carga_id)).size} carga(s) origem
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVincularDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleVincularNfs} disabled={savingVinculo || !selectedVeiculoId}>
              {savingVinculo ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 mr-2" />
              )}
              Vincular NFs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Veículo (placa/motorista) */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Editar Veículo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Placa</Label>
              <Input value={editPlaca} onChange={(e) => setEditPlaca(e.target.value)} placeholder="ABC-1234" className="uppercase" />
            </div>
            <div>
              <Label>Motorista</Label>
              <Input value={editMotorista} onChange={(e) => setEditMotorista(e.target.value)} placeholder="Nome do motorista" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit || !editPlaca.trim() || !editMotorista.trim()}>
              {savingEdit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Gerenciar NFs do Veículo (remover / mover) */}
      <Dialog open={showGerenciarNfsDialog} onOpenChange={setShowGerenciarNfsDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              Gerenciar NFs — {gerenciarVeiculo?.placa}
            </DialogTitle>
          </DialogHeader>
          {gerenciarVeiculo && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Selecione as NFs que deseja remover ou mover para outro veículo.</p>
              <div className="max-h-60 overflow-auto border rounded-md">
                {gerenciarVeiculo.nfs.map((nf) => (
                  <div
                    key={nf.nf_id}
                    className={`flex items-center gap-3 px-3 py-2 text-xs border-b last:border-b-0 cursor-pointer transition-colors ${
                      nfsToRemove.has(nf.nf_id) ? "bg-destructive/10" : "hover:bg-muted/30"
                    }`}
                    onClick={() => {
                      setNfsToRemove((prev) => {
                        const next = new Set(prev);
                        if (next.has(nf.nf_id)) next.delete(nf.nf_id);
                        else next.add(nf.nf_id);
                        return next;
                      });
                    }}
                  >
                    <Checkbox checked={nfsToRemove.has(nf.nf_id)} className="pointer-events-none" />
                    <span className="font-mono font-bold">NF {nf.numero_nf}</span>
                    <span className="text-muted-foreground truncate">{nf.razao_social}</span>
                    <span className="ml-auto text-muted-foreground">{nf.totalCaixas} cx</span>
                  </div>
                ))}
              </div>

              {nfsToRemove.size > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">{nfsToRemove.size} NF(s) selecionada(s)</p>

                  <div>
                    <Label className="text-xs">Mover para outro veículo (opcional)</Label>
                    <Select value={moveTargetVeiculoId} onValueChange={setMoveTargetVeiculoId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Apenas desvincular..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Apenas desvincular (voltar para disponíveis)</SelectItem>
                        {veiculosFormados
                          .filter((v) => v.id !== gerenciarVeiculo.id && v.status === "pendente")
                          .map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.placa} - {v.motorista} ({v.nfs.length} NFs)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGerenciarNfsDialog(false)}>Cancelar</Button>
            {nfsToRemove.size > 0 && (
              moveTargetVeiculoId && moveTargetVeiculoId !== "__none__" ? (
                <Button onClick={handleMoveNfs} disabled={savingGerenciar}>
                  {savingGerenciar ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-2" />}
                  Mover {nfsToRemove.size} NF(s)
                </Button>
              ) : (
                <Button variant="destructive" onClick={handleRemoveNfs} disabled={savingGerenciar}>
                  {savingGerenciar ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                  Desvincular {nfsToRemove.size} NF(s)
                </Button>
              )
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
