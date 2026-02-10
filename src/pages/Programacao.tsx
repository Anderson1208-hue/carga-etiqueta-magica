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
  Box,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { calculateBoxes } from "@/lib/xml-parser";
import {
  getMacroRegiao,
  getMacroRegiaoLabel,
  getAllMacroRegioes,
} from "@/lib/macro-regioes";

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
  totalCaixas: number;
  macroRegiao: number;
  carga_id: string;
  carga_placa: string;
  carga_motorista: string;
  carga_data: string;
}

interface VeiculoFormado {
  id: string;
  placa: string;
  motorista: string;
  data: string;
  status: string;
  nfs: { nf_id: string; numero_nf: string; razao_social: string; carga_origem: string }[];
}

export default function Programacao() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [nfsDisponiveis, setNfsDisponiveis] = useState<NfDisponivel[]>([]);
  const [veiculosFormados, setVeiculosFormados] = useState<VeiculoFormado[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNfIds, setSelectedNfIds] = useState<Set<string>>(new Set());
  const [filtroMR, setFiltroMR] = useState<string>("todas");
  const [filtroCarga, setFiltroCarga] = useState<string>("todas");
  const [showDialog, setShowDialog] = useState(false);
  const [formPlaca, setFormPlaca] = useState("");
  const [formMotorista, setFormMotorista] = useState("");
  const [formData, setFormData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

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
    // Fetch all NFs from cargas with status 'aberta' that are NOT already assigned to a veiculo
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

    // Fetch NFs
    const { data: nfs } = await supabase
      .from("notas_fiscais")
      .select(`
        id, numero_nf, chave_acesso, cnpj_destinatario,
        dest_razao_social, dest_bairro, dest_cep,
        dest_logradouro, dest_numero, dest_cidade, dest_uf,
        peso_bruto, carga_id,
        itens_nf(q_com)
      `)
      .in("carga_id", cargaIds);

    if (!nfs) {
      setNfsDisponiveis([]);
      return;
    }

    // Fetch already assigned NF IDs
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
          totalCaixas,
          macroRegiao: getMacroRegiao(nf.dest_bairro),
          carga_id: nf.carga_id,
          carga_placa: carga?.placa || "",
          carga_motorista: carga?.motorista || "",
          carga_data: carga?.data || "",
        };
      });

    // Sort by MR → bairro → razão social
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
      .select("id, placa, motorista, data, status")
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

    // Get NF details
    const nfIds = (vnfs || []).map((v) => v.nf_id);
    let nfMap = new Map<string, { numero_nf: string; razao_social: string }>();
    if (nfIds.length > 0) {
      const { data: nfDetails } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, dest_razao_social")
        .in("id", nfIds);

      nfMap = new Map(
        (nfDetails || []).map((n) => [
          n.id,
          { numero_nf: n.numero_nf, razao_social: n.dest_razao_social || "N/I" },
        ])
      );
    }

    const result: VeiculoFormado[] = veiculos.map((v) => ({
      id: v.id,
      placa: v.placa,
      motorista: v.motorista,
      data: v.data,
      status: v.status || "pendente",
      nfs: (vnfs || [])
        .filter((vn) => vn.veiculo_id === v.id)
        .map((vn) => ({
          nf_id: vn.nf_id,
          numero_nf: nfMap.get(vn.nf_id)?.numero_nf || "?",
          razao_social: nfMap.get(vn.nf_id)?.razao_social || "N/I",
          carga_origem: vn.carga_origem_id,
        })),
    }));

    setVeiculosFormados(result);
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

  async function handleFormarVeiculo() {
    if (!formPlaca.trim() || !formMotorista.trim()) {
      toast({
        title: "Dados incompletos",
        description: "Preencha placa e motorista",
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

    setSaving(true);
    try {
      // Create vehicle
      const { data: veiculo, error: vErr } = await supabase
        .from("veiculos")
        .insert({
          placa: formPlaca.trim().toUpperCase(),
          motorista: formMotorista.trim(),
          data: formData,
          created_by: user?.id,
        })
        .select()
        .single();

      if (vErr) throw vErr;

      // Link NFs
      const selectedNfs = nfsDisponiveis.filter((nf) => selectedNfIds.has(nf.id));
      const links = selectedNfs.map((nf) => ({
        veiculo_id: veiculo.id,
        nf_id: nf.id,
        carga_origem_id: nf.carga_id,
      }));

      const { error: linkErr } = await supabase.from("veiculo_nfs").insert(links);
      if (linkErr) throw linkErr;

      toast({
        title: "Veículo formado!",
        description: `${formPlaca.toUpperCase()} com ${selectedNfs.length} NFs`,
      });

      setShowDialog(false);
      setSelectedNfIds(new Set());
      setFormPlaca("");
      setFormMotorista("");
      await loadData();
    } catch (error) {
      console.error("Error creating vehicle:", error);
      toast({
        title: "Erro",
        description: "Erro ao formar veículo",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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

  const filteredNfs = useMemo(() => {
    return nfsDisponiveis.filter((nf) => {
      if (filtroMR !== "todas" && nf.macroRegiao !== parseInt(filtroMR)) return false;
      if (filtroCarga !== "todas" && nf.carga_id !== filtroCarga) return false;
      return true;
    });
  }, [nfsDisponiveis, filtroMR, filtroCarga]);

  const macroRegioesPresentes = useMemo(() => {
    return [...new Set(nfsDisponiveis.map((nf) => nf.macroRegiao))].sort((a, b) => a - b);
  }, [nfsDisponiveis]);

  // Stats for selected NFs
  const selectedNfs = nfsDisponiveis.filter((nf) => selectedNfIds.has(nf.id));
  const selTotalNfs = selectedNfs.length;
  const selTotalCaixas = selectedNfs.reduce((sum, nf) => sum + nf.totalCaixas, 0);
  const selTotalPeso = selectedNfs.reduce((sum, nf) => sum + nf.peso_bruto, 0);

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
              Selecione NFs de múltiplas cargas para formar veículos
            </p>
          </div>
          {selectedNfIds.size > 0 && (
            <Button onClick={() => setShowDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Formar Veículo ({selectedNfIds.size} NFs)
            </Button>
          )}
        </div>

        {/* Veículos já formados */}
        {veiculosFormados.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Veículos Formados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {veiculosFormados.map((v) => (
                  <div
                    key={v.id}
                    className="border rounded-lg p-3 space-y-2"
                  >
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
                    <p className="text-sm">
                      <FileText className="w-3 h-3 inline mr-1" />
                      {v.nfs.length} NFs
                    </p>
                  </div>
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

            {/* MR Badges - click to select all NFs in that MR */}
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
          <div className="grid gap-4 md:grid-cols-4">
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
                {/* Group by MR */}
                {(() => {
                  const grouped = new Map<number, NfDisponivel[]>();
                  filteredNfs.forEach((nf) => {
                    const list = grouped.get(nf.macroRegiao) || [];
                    list.push(nf);
                    grouped.set(nf.macroRegiao, list);
                  });

                  return Array.from(grouped.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([mr, nfs]) => {
                      const mrNfsSel = nfs.filter((n) => selectedNfIds.has(n.id)).length;
                      return (
                        <div key={mr} className="mb-4">
                          <div
                            className="flex items-center gap-2 mb-2 p-2 bg-muted/50 rounded-md cursor-pointer"
                            onClick={() => toggleMR(mr)}
                          >
                            <Checkbox
                              checked={mrNfsSel === nfs.length}
                              className="pointer-events-none"
                            />
                            <span className="font-semibold text-sm">
                              {getMacroRegiaoLabel(mr)}
                            </span>
                            <Badge variant="outline" className="ml-auto">
                              {mrNfsSel}/{nfs.length} sel.
                            </Badge>
                          </div>
                          <div className="space-y-1 pl-2">
                            {nfs.map((nf) => (
                              <div
                                key={nf.id}
                                className={`flex items-center gap-3 p-2 rounded-md border text-sm cursor-pointer transition-colors ${
                                  selectedNfIds.has(nf.id)
                                    ? "bg-primary/5 border-primary/30"
                                    : "hover:bg-muted/30"
                                }`}
                                onClick={() => toggleNf(nf.id)}
                              >
                                <Checkbox
                                  checked={selectedNfIds.has(nf.id)}
                                  className="pointer-events-none"
                                />
                                <div className="flex-1 min-w-0 grid grid-cols-[80px_1fr_100px_80px_80px_120px] gap-2 items-center">
                                  <span className="font-mono font-bold">
                                    NF {nf.numero_nf}
                                  </span>
                                  <span className="truncate">
                                    {nf.dest_razao_social}
                                  </span>
                                  <span className="text-muted-foreground truncate">
                                    {nf.dest_bairro}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {nf.totalCaixas} cx
                                  </span>
                                  <span className="text-muted-foreground">
                                    {nf.peso_bruto.toFixed(1)} kg
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {nf.carga_placa}
                                  </span>
                                </div>
                              </div>
                            ))}
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

      {/* Dialog: Formar Veículo */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Formar Veículo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Placa</Label>
              <Input
                value={formPlaca}
                onChange={(e) => setFormPlaca(e.target.value)}
                placeholder="ABC-1234"
                className="uppercase"
              />
            </div>
            <div>
              <Label>Motorista</Label>
              <Input
                value={formMotorista}
                onChange={(e) => setFormMotorista(e.target.value)}
                placeholder="Nome do motorista"
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={formData}
                onChange={(e) => setFormData(e.target.value)}
              />
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
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleFormarVeiculo} disabled={saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Formar Veículo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
