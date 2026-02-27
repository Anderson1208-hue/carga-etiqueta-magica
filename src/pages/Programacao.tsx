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
import { generateNotaDeCargaPDF, printBlob } from "@/lib/pdf-generator";

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

  async function handlePrintNotaCarga(veiculo: VeiculoFormado) {
    setPrintingVeiculoId(veiculo.id);
    try {
      const nfIds = veiculo.nfs.map((n) => n.nf_id);
      if (nfIds.length === 0) {
        toast({ title: "Sem NFs", description: "Este veículo não tem NFs vinculadas", variant: "destructive" });
        return;
      }

      const { data: nfsData } = await supabase
        .from("notas_fiscais")
        .select(`
          id, numero_nf, razao_social_emitente, cnpj_emitente,
          cnpj_destinatario, dest_bairro, data_emissao,
          itens_nf(c_prod, x_prod, q_com)
        `)
        .in("id", nfIds);

      if (!nfsData || nfsData.length === 0) {
        toast({ title: "Erro", description: "Não foi possível carregar os dados das NFs", variant: "destructive" });
        return;
      }

      const notasFiscaisPDF = nfsData.map((nf) => ({
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

  const [nfsDisponiveis, setNfsDisponiveis] = useState<NfDisponivel[]>([]);
  const [veiculosFormados, setVeiculosFormados] = useState<VeiculoFormado[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNfIds, setSelectedNfIds] = useState<Set<string>>(new Set());
  const [filtroMR, setFiltroMR] = useState<string>("todas");
  const [filtroCarga, setFiltroCarga] = useState<string>("todas");

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
      return;
    }

    const cargaIds = cargas.map((c) => c.id);
    const cargaMap = new Map(cargas.map((c) => [c.id, c]));

    const { data: nfs } = await supabase
      .from("notas_fiscais")
      .select(`
        id, numero_nf, chave_acesso, cnpj_destinatario,
        dest_razao_social, dest_bairro, dest_cep,
        dest_logradouro, dest_numero, dest_cidade, dest_uf,
        peso_bruto, volume_m3, carga_id,
        itens_nf(q_com)
      `)
      .in("carga_id", cargaIds);

    if (!nfs) {
      setNfsDisponiveis([]);
      return;
    }

    const { data: assigned } = await supabase
      .from("veiculo_nfs")
      .select("nf_id");

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
      toast({
        title: "Selecione um veículo",
        description: "Escolha o veículo para vincular as NFs",
        variant: "destructive",
      });
      return;
    }

    if (selectedNfIds.size === 0) {
      toast({
        title: "Nenhuma NF selecionada",
        description: "Selecione ao menos uma NF",
        variant: "destructive",
      });
      return;
    }

    setSavingVinculo(true);
    try {
      const selectedNfs = nfsDisponiveis.filter((nf) => selectedNfIds.has(nf.id));
      const links = selectedNfs.map((nf) => ({
        veiculo_id: selectedVeiculoId,
        nf_id: nf.id,
        carga_origem_id: nf.carga_id,
      }));

      const { error } = await supabase.from("veiculo_nfs").insert(links);
      if (error) throw error;

      const veiculo = veiculosFormados.find((v) => v.id === selectedVeiculoId);
      toast({
        title: "NFs vinculadas!",
        description: `${selectedNfs.length} NFs vinculadas ao veículo ${veiculo?.placa || ""}`,
      });

      setShowVincularDialog(false);
      setSelectedNfIds(new Set());
      setSelectedVeiculoId("");
      await loadData();
    } catch (error) {
      console.error("Error linking NFs:", error);
      toast({
        title: "Erro",
        description: "Erro ao vincular NFs ao veículo",
        variant: "destructive",
      });
    } finally {
      setSavingVinculo(false);
    }
  }

  // Filters
  const cargasUnicas = useMemo(() => {
    const map = new Map<string, { id: string; placa: string; data: string }>();
    nfsDisponiveis.forEach((nf) => {
      if (!map.has(nf.carga_id)) {
        map.set(nf.carga_id, { id: nf.carga_id, placa: nf.carga_placa, data: nf.carga_data });
      }
    });
    return Array.from(map.values());
  }, [nfsDisponiveis]);

  const [buscaNf, setBuscaNf] = useState("");

  const filteredNfs = useMemo(() => {
    const searchTerm = buscaNf.trim().toLowerCase();
    return nfsDisponiveis.filter((nf) => {
      if (filtroMR !== "todas" && nf.macroRegiao !== parseInt(filtroMR)) return false;
      if (filtroCarga !== "todas" && nf.carga_id !== filtroCarga) return false;
      if (searchTerm) {
        const matchNf = nf.numero_nf.toLowerCase().includes(searchTerm);
        const matchRazao = nf.dest_razao_social.toLowerCase().includes(searchTerm);
        const matchBairro = nf.dest_bairro.toLowerCase().includes(searchTerm);
        const matchCidade = (nf.dest_cidade || "").toLowerCase().includes(searchTerm);
        if (!matchNf && !matchRazao && !matchBairro && !matchCidade) return false;
      }
      return true;
    });
  }, [nfsDisponiveis, filtroMR, filtroCarga, buscaNf]);

  const macroRegioesPresentes = useMemo(() => {
    return [...new Set(nfsDisponiveis.map((nf) => nf.macroRegiao))].sort((a, b) => a - b);
  }, [nfsDisponiveis]);

  // Stats for selected NFs
  const selectedNfs = nfsDisponiveis.filter((nf) => selectedNfIds.has(nf.id));
  const selTotalNfs = selectedNfs.length;
  const selTotalCaixas = selectedNfs.reduce((sum, nf) => sum + nf.totalCaixas, 0);
  const selTotalPeso = selectedNfs.reduce((sum, nf) => sum + nf.peso_bruto, 0);
  const selTotalVolume = selectedNfs.reduce((sum, nf) => sum + nf.volume_m3, 0);

  // Dashboard totals - filtered by selected carga
  const dashboardNfs = filteredNfs;
  const totalNfsDisponiveis = dashboardNfs.length;
  const totalPesoDisponivel = dashboardNfs.reduce((s, nf) => s + nf.peso_bruto, 0);
  const totalVolumeDisponivel = dashboardNfs.reduce((s, nf) => s + nf.volume_m3, 0);
  const totalCaixasDisponivel = dashboardNfs.reduce((s, nf) => s + nf.totalCaixas, 0);

  // Filter veiculos by carga when a carga filter is active
  const dashboardVeiculos = useMemo(() => {
    if (filtroCarga === "todas") return veiculosFormados;
    return veiculosFormados.filter((v) =>
      v.nfs.some((nf) => nf.carga_origem === filtroCarga)
    );
  }, [veiculosFormados, filtroCarga]);

  const filteredVeiculoStats = useMemo(() => {
    if (filtroCarga === "todas") {
      return {
        volume: veiculosFormados.reduce((s, v) => s + v.volumeTotal, 0),
        peso: veiculosFormados.reduce((s, v) => s + v.pesoTotal, 0),
        caixas: veiculosFormados.reduce((s, v) => s + v.caixasTotal, 0),
        count: veiculosFormados.length,
      };
    }
    // Sum only NFs from the selected carga within each veiculo
    let volume = 0, peso = 0, caixas = 0;
    veiculosFormados.forEach((v) => {
      v.nfs.filter((nf) => nf.carga_origem === filtroCarga).forEach((nf) => {
        volume += nf.volume_m3;
        peso += nf.peso_bruto;
        caixas += nf.totalCaixas;
      });
    });
    return { volume, peso, caixas, count: dashboardVeiculos.length };
  }, [veiculosFormados, filtroCarga, dashboardVeiculos]);

  const totalVeiculosVolume = filteredVeiculoStats.volume;
  const totalVeiculosPeso = filteredVeiculoStats.peso;
  const totalVeiculosCaixas = filteredVeiculoStats.caixas;

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Volume Disponível</CardTitle>
              <Package className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalVolumeDisponivel.toFixed(2)} <span className="text-lg font-normal">m³</span></div>
              <p className="text-xs text-muted-foreground mt-1">{totalPesoDisponivel.toFixed(1)} kg</p>
            </CardContent>
          </Card>
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Volume Total</CardTitle>
              <Package className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{(totalVolumeDisponivel + totalVeiculosVolume).toFixed(2)} <span className="text-lg font-normal">m³</span></div>
              <p className="text-xs text-muted-foreground mt-1">{filteredVeiculoStats.count} veículos montados</p>
            </CardContent>
          </Card>
        </div>

        {/* Veículos cadastrados */}
        {veiculosFormados.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Veículos Cadastrados ({veiculosFormados.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {veiculosFormados.map((v) => (
                  <Collapsible key={v.id}>
                    <div className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold flex items-center gap-2">
                          <Truck className="w-4 h-4" />
                          {v.placa}
                        </div>
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
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {v.motorista} • {format(new Date(v.data + "T00:00:00"), "dd/MM/yyyy")}
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs gap-1"
                          onClick={() => handlePrintNotaCarga(v)}
                          disabled={printingVeiculoId === v.id}
                        >
                          {printingVeiculoId === v.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Printer className="w-3 h-3" />
                          )}
                          Imprimir Nota de Carga
                        </Button>
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
            </CardContent>
          </Card>
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
              <div className="min-w-[200px]">
                <Label className="text-xs">Carga Origem</Label>
                <Select value={filtroCarga} onValueChange={setFiltroCarga}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as cargas</SelectItem>
                    {cargasUnicas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.placa} - {format(new Date(c.data + "T00:00:00"), "dd/MM/yyyy")}
                      </SelectItem>
                    ))}
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
            {filteredNfs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma NF disponível para programação
              </p>
            ) : (
              <div className="space-y-1">
                {(() => {
                  // Group by MR
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

                      // Group by CNPJ (entrega) within MR
                      const entregasMap = new Map<string, NfDisponivel[]>();
                      nfsMR.forEach((nf) => {
                        const key = nf.cnpj_destinatario || nf.id;
                        const list = entregasMap.get(key) || [];
                        list.push(nf);
                        entregasMap.set(key, list);
                      });

                      return (
                        <div key={mr} className="mb-4">
                          {/* MR Header */}
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

                          {/* Entregas within MR */}
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
                                  {/* Entrega Header */}
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

                                  {/* Individual NFs (expanded) */}
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
                  <Label>Data</Label>
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
    </MainLayout>
  );
}
