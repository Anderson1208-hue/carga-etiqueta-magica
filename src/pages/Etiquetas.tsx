import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { generateEtiquetasPDF, downloadBlob } from "@/lib/pdf-generator";
import { getMacroRegiao, getMacroRegiaoLabel, getAllMacroRegioes } from "@/lib/macro-regioes";
import { Tags, Download, Loader2, Package, FileText, Printer } from "lucide-react";
import { format } from "date-fns";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
}

interface Etiqueta {
  id: string;
  numeroNf: string;
  cProd: string;
  xProd: string;
  seq: number;
  total: number;
  qrPayload: string;
  status: "pendente" | "conferido";
  cnpjDestinatario: string;
  destBairro: string;
  macroRegiao: number;
}

export default function Etiquetas() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [cargas, setCargas] = useState<Carga[]>([]);
  const [selectedCargaId, setSelectedCargaId] = useState<string>(
    searchParams.get("carga") || ""
  );
  const [selectedCarga, setSelectedCarga] = useState<Carga | null>(null);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [selectedNfs, setSelectedNfs] = useState<Set<string>>(new Set());
  const [selectedMR, setSelectedMR] = useState<string>("todas");

  useEffect(() => {
    loadCargas();
  }, []);

  useEffect(() => {
    if (selectedCargaId) {
      loadEtiquetas(selectedCargaId);
      setSelectedMR("todas");
    }
  }, [selectedCargaId]);

  // Available MRs based on loaded etiquetas
  const availableMRs = useMemo(() => {
    const mrSet = new Set(etiquetas.map((e) => e.macroRegiao));
    return getAllMacroRegioes().filter((mr) => mrSet.has(mr.value));
  }, [etiquetas]);

  // Filtered etiquetas by selected MR
  const filteredEtiquetas = useMemo(() => {
    if (selectedMR === "todas") return etiquetas;
    return etiquetas.filter((e) => e.macroRegiao === parseInt(selectedMR));
  }, [etiquetas, selectedMR]);

  async function loadCargas() {
    const { data } = await supabase
      .from("cargas")
      .select("id, data, placa, motorista")
      .order("created_at", { ascending: false });

    setCargas(data || []);

    if (searchParams.get("carga")) {
      const carga = data?.find((c) => c.id === searchParams.get("carga"));
      if (carga) {
        setSelectedCarga(carga);
      }
    }
  }

  async function loadEtiquetas(cargaId: string) {
    setLoading(true);
    try {
      const { data: cargaData } = await supabase
        .from("cargas")
        .select("*")
        .eq("id", cargaId)
        .single();

      if (cargaData) {
        setSelectedCarga(cargaData);
      }

      // Paginated fetch to overcome 1000 row limit
      const PAGE_SIZE = 1000;
      let allEtiquetas: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: etiquetasPage, error } = await supabase
          .from("etiquetas")
          .select(`
            *,
            notas_fiscais!etiquetas_nf_id_fkey(cnpj_destinatario, dest_bairro)
          `)
          .eq("carga_id", cargaId)
          .order("c_prod", { ascending: true })
          .order("seq", { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) {
          console.error("Error fetching etiquetas page:", error);
          break;
        }

        if (etiquetasPage && etiquetasPage.length > 0) {
          allEtiquetas = [...allEtiquetas, ...etiquetasPage];
          hasMore = etiquetasPage.length === PAGE_SIZE;
          page++;
        } else {
          hasMore = false;
        }
      }

      const mapped: Etiqueta[] = allEtiquetas.map((e: any) => {
        const destBairro = e.notas_fiscais?.dest_bairro || "";
        return {
          id: e.id,
          numeroNf: e.numero_nf,
          cProd: e.c_prod,
          xProd: e.x_prod,
          seq: e.seq,
          total: e.total,
          qrPayload: e.qr_payload,
          status: e.status as "pendente" | "conferido",
          cnpjDestinatario: e.notas_fiscais?.cnpj_destinatario || "",
          destBairro,
          macroRegiao: getMacroRegiao(destBairro),
        };
      });

      // Sort by MR → bairro → CNPJ → NF → cProd → seq
      mapped.sort((a, b) => {
        if (a.macroRegiao !== b.macroRegiao) return a.macroRegiao - b.macroRegiao;
        const bairroCompare = a.destBairro.localeCompare(b.destBairro);
        if (bairroCompare !== 0) return bairroCompare;
        const cnpjA = parseFloat(a.cnpjDestinatario.replace(/\D/g, '')) || 0;
        const cnpjB = parseFloat(b.cnpjDestinatario.replace(/\D/g, '')) || 0;
        if (cnpjA !== cnpjB) return cnpjA - cnpjB;
        const nfA = parseFloat(a.numeroNf.replace(/\D/g, '')) || 0;
        const nfB = parseFloat(b.numeroNf.replace(/\D/g, '')) || 0;
        if (nfA !== nfB) return nfA - nfB;
        const prodA = parseFloat(a.cProd.replace(/\D/g, '')) || 0;
        const prodB = parseFloat(b.cProd.replace(/\D/g, '')) || 0;
        if (prodA !== prodB) return prodA - prodB;
        return a.seq - b.seq;
      });

      setEtiquetas(mapped);
      setSelectedNfs(new Set());
    } catch (error) {
      console.error("Error loading etiquetas:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar etiquetas",
      });
    } finally {
      setLoading(false);
    }
  }

  // Get unique NFs for the checkbox list (filtered by MR)
  const uniqueNfs = useMemo(() => {
    const nfMap = new Map<string, { numeroNf: string; count: number; macroRegiao: number }>();
    filteredEtiquetas.forEach((e) => {
      if (!nfMap.has(e.numeroNf)) {
        nfMap.set(e.numeroNf, { numeroNf: e.numeroNf, count: 0, macroRegiao: e.macroRegiao });
      }
      nfMap.get(e.numeroNf)!.count++;
    });
    return Array.from(nfMap.values()).sort((a, b) => {
      if (a.macroRegiao !== b.macroRegiao) return a.macroRegiao - b.macroRegiao;
      const numA = parseInt(a.numeroNf.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.numeroNf.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
  }, [filteredEtiquetas]);

  function handleToggleNf(numeroNf: string) {
    setSelectedNfs((prev) => {
      const next = new Set(prev);
      if (next.has(numeroNf)) {
        next.delete(numeroNf);
      } else {
        next.add(numeroNf);
      }
      return next;
    });
  }

  function handleSelectAllNfs() {
    if (selectedNfs.size === uniqueNfs.length) {
      setSelectedNfs(new Set());
    } else {
      setSelectedNfs(new Set(uniqueNfs.map((nf) => nf.numeroNf)));
    }
  }

  async function handleGenerateEtiquetas(onlySelected: boolean = false) {
    if (!selectedCarga || filteredEtiquetas.length === 0) return;

    const etiquetasToGenerate = onlySelected
      ? filteredEtiquetas.filter((e) => selectedNfs.has(e.numeroNf))
      : filteredEtiquetas;

    if (etiquetasToGenerate.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhuma NF selecionada",
        description: "Selecione pelo menos uma NF para gerar as etiquetas.",
      });
      return;
    }

    setGenerating(true);
    try {
      const etiquetasData = etiquetasToGenerate.map((e) => ({
        numeroNf: e.numeroNf,
        cProd: e.cProd,
        xProd: e.xProd,
        seq: e.seq,
        total: e.total,
        qrPayload: e.qrPayload,
        cnpjDestinatario: e.cnpjDestinatario,
      }));

      const blob = await generateEtiquetasPDF(etiquetasData);

      const mrSuffix = selectedMR !== "todas" ? `_MR${selectedMR}` : "";
      const selSuffix = onlySelected ? "_selecionadas" : "";
      downloadBlob(
        blob,
        `etiquetas_${selectedCarga.placa}_${format(new Date(selectedCarga.data), "yyyyMMdd")}${mrSuffix}${selSuffix}.pdf`
      );

      toast({
        title: "PDF gerado com sucesso!",
        description: `${etiquetasToGenerate.length} etiquetas prontas para impressão.`,
      });
    } catch (error) {
      console.error("Error generating etiquetas PDF:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar PDF",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handlePrintEtiquetas() {
    if (!selectedCarga || selectedNfs.size === 0) {
      toast({
        variant: "destructive",
        title: "Nenhuma NF selecionada",
        description: "Selecione pelo menos uma NF para imprimir.",
      });
      return;
    }

    const etiquetasToGenerate = filteredEtiquetas.filter((e) => selectedNfs.has(e.numeroNf));

    if (etiquetasToGenerate.length === 0) return;

    setPrinting(true);
    try {
      const etiquetasData = etiquetasToGenerate.map((e) => ({
        numeroNf: e.numeroNf,
        cProd: e.cProd,
        xProd: e.xProd,
        seq: e.seq,
        total: e.total,
        qrPayload: e.qrPayload,
        cnpjDestinatario: e.cnpjDestinatario,
      }));

      const blob = await generateEtiquetasPDF(etiquetasData);
      const url = URL.createObjectURL(blob);

      const printWindow = window.open(url, "_blank");
      if (printWindow) {
        printWindow.addEventListener("load", () => {
          printWindow.focus();
          printWindow.print();
        });
      }

      toast({
        title: "Impressão iniciada",
        description: `${etiquetasToGenerate.length} etiquetas enviadas para impressão.`,
      });
    } catch (error) {
      console.error("Error printing etiquetas:", error);
      toast({
        variant: "destructive",
        title: "Erro ao imprimir",
      });
    } finally {
      setPrinting(false);
    }
  }

  const pendentes = filteredEtiquetas.filter((e) => e.status === "pendente").length;
  const conferidas = filteredEtiquetas.filter((e) => e.status === "conferido").length;

  // Group by product for summary (filtered)
  const produtosSummary = filteredEtiquetas.reduce((acc, e) => {
    if (!acc[e.cProd]) {
      acc[e.cProd] = { cProd: e.cProd, xProd: e.xProd, total: 0 };
    }
    acc[e.cProd].total++;
    return acc;
  }, {} as Record<string, { cProd: string; xProd: string; total: number }>);

  const produtosList = Object.values(produtosSummary).sort((a, b) =>
    a.cProd.localeCompare(b.cProd)
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Etiquetas</h1>
            <p className="text-muted-foreground">
              Gere etiquetas 60x40mm para impressão em Zebra
            </p>
          </div>
        </div>

        {/* Carga Selector */}
        <div className="wms-card p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 max-w-sm">
              <Select
                value={selectedCargaId}
                onValueChange={setSelectedCargaId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma carga" />
                </SelectTrigger>
                <SelectContent>
                  {cargas.map((carga) => (
                    <SelectItem key={carga.id} value={carga.id}>
                      {carga.placa} - {format(new Date(carga.data), "dd/MM/yyyy")}{" "}
                      - {carga.motorista}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCarga && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => handleGenerateEtiquetas(false)}
                  disabled={generating || filteredEtiquetas.length === 0}
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Gerar Todas ({filteredEtiquetas.length})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleGenerateEtiquetas(true)}
                  disabled={generating || printing || selectedNfs.size === 0}
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2" />
                  )}
                  Baixar Selecionadas ({selectedNfs.size})
                </Button>
                <Button
                  variant="secondary"
                  onClick={handlePrintEtiquetas}
                  disabled={generating || printing || selectedNfs.size === 0}
                >
                  {printing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4 mr-2" />
                  )}
                  Imprimir Selecionadas
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Route filter */}
        {selectedCarga && etiquetas.length > 0 && (
          <div className="wms-card p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="font-semibold">Filtrar por Rota</h3>
              <div className="w-64">
                <Select value={selectedMR} onValueChange={(v) => { setSelectedMR(v); setSelectedNfs(new Set()); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por rota" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as Rotas ({etiquetas.length} etiq.)</SelectItem>
                    {availableMRs.map((mr) => {
                      const count = etiquetas.filter((e) => e.macroRegiao === mr.value).length;
                      return (
                        <SelectItem key={mr.value} value={mr.value.toString()}>
                          {mr.label} ({count} etiq.)
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* MR chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              {availableMRs.map((mr) => {
                const count = etiquetas.filter((e) => e.macroRegiao === mr.value).length;
                return (
                  <div
                    key={mr.value}
                    className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                      selectedMR === mr.value.toString()
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted border-border hover:bg-accent"
                    }`}
                    onClick={() => {
                      setSelectedMR(selectedMR === mr.value.toString() ? "todas" : mr.value.toString());
                      setSelectedNfs(new Set());
                    }}
                  >
                    MR {mr.value} • {count} etiq.
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* NF Selection */}
        {selectedCarga && uniqueNfs.length > 0 && (
          <div className="wms-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Selecionar NFs para impressão</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAllNfs}
              >
                {selectedNfs.size === uniqueNfs.length ? "Desmarcar Todas" : "Selecionar Todas"}
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {uniqueNfs.map((nf) => (
                <label
                  key={nf.numeroNf}
                  className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                    selectedNfs.has(nf.numeroNf)
                      ? "bg-primary/10 border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  <Checkbox
                    checked={selectedNfs.has(nf.numeroNf)}
                    onCheckedChange={() => handleToggleNf(nf.numeroNf)}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">NF {nf.numeroNf}</span>
                    <span className="text-xs text-muted-foreground">{nf.count} etiq.</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        {selectedCarga && filteredEtiquetas.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="wms-stat-card">
              <p className="text-sm text-muted-foreground">Total de Etiquetas</p>
              <p className="text-3xl font-bold">{filteredEtiquetas.length}</p>
            </div>
            <div className="wms-stat-card">
              <p className="text-sm text-muted-foreground">Pendentes</p>
              <p className="text-3xl font-bold text-pending">{pendentes}</p>
            </div>
            <div className="wms-stat-card">
              <p className="text-sm text-muted-foreground">Conferidas</p>
              <p className="text-3xl font-bold text-success">{conferidas}</p>
            </div>
          </div>
        )}

        {/* Summary by Product */}
        {selectedCarga && (
          <div className="wms-card">
            <div className="p-4 border-b flex items-center gap-2">
              <Tags className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-semibold">Resumo por Produto</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Cód. Produto</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-32 text-right">Etiquetas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : produtosList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <Package className="w-10 h-10 text-muted-foreground/50" />
                        <p className="text-muted-foreground">
                          Nenhuma etiqueta encontrada
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  produtosList.map((prod) => (
                    <TableRow key={prod.cProd} className="wms-table-row">
                      <TableCell className="font-mono text-sm">
                        {prod.cProd}
                      </TableCell>
                      <TableCell>{prod.xProd}</TableCell>
                      <TableCell className="text-right font-medium">
                        {prod.total}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
