import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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
  generateRomaneioPDF,
  generateNotaDeCargaPDF,
  downloadBlob,
  printBlob,
} from "@/lib/pdf-generator";
import { calculateBoxes } from "@/lib/xml-parser";
import { getMacroRegiao, getMacroRegiaoLabel, getAllMacroRegioes } from "@/lib/macro-regioes";
import { generateResumoMRPDF } from "@/lib/resumo-mr-pdf";
import { FileText, Download, Loader2, Printer, Search, ArrowLeft, FileSpreadsheet, ClipboardList, List, CheckSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import * as XLSX from "xlsx";
import { TipoCargaBadge, isChocolate } from "@/components/TipoCargaBadge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

import { format } from "date-fns";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
  tipo_carga?: string;
}

interface RomaneioItem {
  cProd: string;
  xProd: string;
  quantidadeTotal: number;
}

interface NotaFiscalData {
  id: string;
  numeroNf: string;
  razaoSocialEmitente: string;
  cnpjEmitente: string;
  cnpjDestinatario: string;
  destRazaoSocial?: string;
  destLogradouro?: string;
  destNumero?: string;
  destBairro: string;
  destCidade?: string;
  destUf?: string;
  destCep?: string;
  dataEmissao: string | null;
  macroRegiao: number;
  itens: {
    cProd: string;
    xProd: string;
    qCom: number;
  }[];
}

export default function Romaneio() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [cargas, setCargas] = useState<Carga[]>([]);
  const [selectedCargaId, setSelectedCargaId] = useState<string>(
    searchParams.get("carga") || ""
  );
  const [selectedCarga, setSelectedCarga] = useState<Carga | null>(null);
  const [romaneioItems, setRomaneioItems] = useState<RomaneioItem[]>([]);
  const [notasFiscais, setNotasFiscais] = useState<NotaFiscalData[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<"romaneio" | "nota" | "print-romaneio" | "print-nota" | "nota-por-nf" | null>(null);
  const [selectedMR, setSelectedMR] = useState<string>("todas");
  const [searchNf, setSearchNf] = useState("");
  const [selectedNfDetail, setSelectedNfDetail] = useState<NotaFiscalData | null>(null);
  const [nfDialogOpen, setNfDialogOpen] = useState(false);
  const [romaneioPorNfOpen, setRomaneioPorNfOpen] = useState(false);
  const [romaneioPorNfInput, setRomaneioPorNfInput] = useState("");
  const [generatingPorNf, setGeneratingPorNf] = useState(false);
  const [notaCargaPorNfOpen, setNotaCargaPorNfOpen] = useState(false);
  const [selectedNfIds, setSelectedNfIds] = useState<Set<string>>(new Set());
  const [nfSearchFilter, setNfSearchFilter] = useState("");

  useEffect(() => {
    loadCargas();
  }, []);

  useEffect(() => {
    if (selectedCargaId) {
      loadRomaneio(selectedCargaId);
      setSelectedMR("todas");
    }
  }, [selectedCargaId]);

  // Available MRs based on loaded NFs
  const availableMRs = useMemo(() => {
    const mrSet = new Set(notasFiscais.map((nf) => nf.macroRegiao));
    return getAllMacroRegioes().filter((mr) => mrSet.has(mr.value));
  }, [notasFiscais]);

  // Filtered NFs by selected MR
  const filteredNFs = useMemo(() => {
    if (selectedMR === "todas") return notasFiscais;
    return notasFiscais.filter((nf) => nf.macroRegiao === parseInt(selectedMR));
  }, [notasFiscais, selectedMR]);

  async function loadCargas() {
    const { data } = await supabase
      .from("cargas")
      .select("id, data, placa, motorista, tipo_carga")
      .order("created_at", { ascending: false });

    setCargas(data || []);

    if (searchParams.get("carga")) {
      const carga = data?.find((c) => c.id === searchParams.get("carga"));
      if (carga) {
        setSelectedCarga(carga);
      }
    }
  }

  async function loadRomaneio(cargaId: string) {
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

      const { data: nfsData } = await supabase
        .from("notas_fiscais")
        .select(`
          id,
          numero_nf,
          razao_social_emitente,
          cnpj_emitente,
          cnpj_destinatario,
          dest_bairro,
          data_emissao,
          itens_nf(
            c_prod,
            x_prod,
            q_com
          )
        `)
        .eq("carga_id", cargaId);

      if (!nfsData) return;

      // Process for Romaneio (consolidated by cProd)
      const consolidatedMap = new Map<string, RomaneioItem>();

      nfsData.forEach((nf) => {
        (nf.itens_nf || []).forEach((item: any) => {
          const key = item.c_prod;
          const boxes = calculateBoxes(item.q_com);

          if (consolidatedMap.has(key)) {
            const existing = consolidatedMap.get(key)!;
            existing.quantidadeTotal += boxes;
          } else {
            consolidatedMap.set(key, {
              cProd: item.c_prod,
              xProd: item.x_prod,
              quantidadeTotal: boxes,
            });
          }
        });
      });

      const sortedItems = Array.from(consolidatedMap.values()).sort((a, b) =>
        a.cProd.localeCompare(b.cProd)
      );

      setRomaneioItems(sortedItems);

      // Process NFs for Nota de Carga with Macro Região
      const nfsList: NotaFiscalData[] = nfsData.map((nf) => ({
        id: nf.id,
        numeroNf: nf.numero_nf,
        razaoSocialEmitente: nf.razao_social_emitente,
        cnpjEmitente: nf.cnpj_emitente,
        cnpjDestinatario: nf.cnpj_destinatario || "",
        destBairro: nf.dest_bairro || "",
        dataEmissao: nf.data_emissao,
        macroRegiao: getMacroRegiao(nf.dest_bairro),
        itens: (nf.itens_nf || []).map((item: any) => ({
          cProd: item.c_prod,
          xProd: item.x_prod,
          qCom: item.q_com,
        })),
      }));

      // Sort by MR → bairro → CNPJ → NF number
      nfsList.sort((a, b) => {
        if (a.macroRegiao !== b.macroRegiao) return a.macroRegiao - b.macroRegiao;
        const bairroCompare = (a.destBairro || "").localeCompare(b.destBairro || "");
        if (bairroCompare !== 0) return bairroCompare;
        const cnpjA = parseFloat(a.cnpjDestinatario.replace(/\D/g, '')) || 0;
        const cnpjB = parseFloat(b.cnpjDestinatario.replace(/\D/g, '')) || 0;
        if (cnpjA !== cnpjB) return cnpjA - cnpjB;
        const nfA = parseFloat(a.numeroNf.replace(/\D/g, '')) || 0;
        const nfB = parseFloat(b.numeroNf.replace(/\D/g, '')) || 0;
        return nfA - nfB;
      });

      setNotasFiscais(nfsList);
    } catch (error) {
      console.error("Error loading romaneio:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar dados",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateRomaneio() {
    if (!selectedCarga) return;

    setGenerating("romaneio");
    try {
      const blob = await generateRomaneioPDF(
        {
          data: selectedCarga.data,
          placa: selectedCarga.placa,
          motorista: selectedCarga.motorista,
        },
        romaneioItems
      );

      downloadBlob(blob, `romaneio_${selectedCarga.placa}_${format(new Date(selectedCarga.data + "T00:00:00"), "yyyyMMdd")}.pdf`);

      toast({
        title: "PDF gerado com sucesso!",
        description: "O download foi iniciado.",
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar PDF",
      });
    } finally {
      setGenerating(null);
    }
  }

  function buildNfsPDF(nfs: NotaFiscalData[]) {
    return nfs.map((nf) => ({
      numeroNf: nf.numeroNf,
      razaoSocialEmitente: nf.razaoSocialEmitente,
      cnpjEmitente: nf.cnpjEmitente,
      cnpjDestinatario: nf.cnpjDestinatario,
      destBairro: nf.destBairro,
      macroRegiao: nf.macroRegiao,
      dataEmissao: nf.dataEmissao,
      itens: nf.itens.map((item) => ({
        cProd: item.cProd,
        xProd: item.xProd,
        qtdCaixas: calculateBoxes(item.qCom),
      })),
    }));
  }

  async function handleGenerateNotaDeCarga() {
    if (!selectedCarga || filteredNFs.length === 0) return;

    setGenerating("nota");
    try {
      const nfsPDF = buildNfsPDF(filteredNFs);
      const blob = await generateNotaDeCargaPDF(
        {
          data: selectedCarga.data,
          placa: selectedCarga.placa,
          motorista: selectedCarga.motorista,
        },
        nfsPDF
      );

      const suffix = selectedMR !== "todas" ? `_MR${selectedMR}` : "";
      downloadBlob(blob, `nota_carga_${selectedCarga.placa}_${format(new Date(selectedCarga.data + "T00:00:00"), "yyyyMMdd")}${suffix}.pdf`);

      toast({
        title: "PDF gerado com sucesso!",
        description: `${filteredNFs.length} NFs incluídas.`,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        variant: "destructive",
        title: "Erro ao gerar PDF",
      });
    } finally {
      setGenerating(null);
    }
  }

  async function handlePrintRomaneio() {
    if (!selectedCarga) return;
    setGenerating("print-romaneio");
    try {
      const blob = await generateRomaneioPDF(
        {
          data: selectedCarga.data,
          placa: selectedCarga.placa,
          motorista: selectedCarga.motorista,
        },
        romaneioItems
      );
      printBlob(blob);
      toast({ title: "Enviado para impressão!" });
    } catch (error) {
      console.error("Error printing PDF:", error);
      toast({ variant: "destructive", title: "Erro ao imprimir" });
    } finally {
      setGenerating(null);
    }
  }

  async function handlePrintNotaDeCarga() {
    if (!selectedCarga || filteredNFs.length === 0) return;
    setGenerating("print-nota");
    try {
      const nfsPDF = buildNfsPDF(filteredNFs);
      const blob = await generateNotaDeCargaPDF(
        {
          data: selectedCarga.data,
          placa: selectedCarga.placa,
          motorista: selectedCarga.motorista,
        },
        nfsPDF
      );
      printBlob(blob);
      toast({ title: "Enviado para impressão!" });
    } catch (error) {
      console.error("Error printing PDF:", error);
      toast({ variant: "destructive", title: "Erro ao imprimir" });
    } finally {
      setGenerating(null);
    }
  }

  async function handleRomaneioPorNf() {
    if (!selectedCarga || !romaneioPorNfInput.trim()) return;
    setGeneratingPorNf(true);
    try {
      const inputNumbers = romaneioPorNfInput
        .split(/[,;\s\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const matchedNFs = notasFiscais.filter((nf) =>
        inputNumbers.includes(nf.numeroNf)
      );

      if (matchedNFs.length === 0) {
        toast({
          variant: "destructive",
          title: "Nenhuma NF encontrada",
          description: "Nenhum dos números informados corresponde a NFs desta carga.",
        });
        setGeneratingPorNf(false);
        return;
      }

      const notFound = inputNumbers.filter(
        (num) => !notasFiscais.some((nf) => nf.numeroNf === num)
      );

      // Consolidate items from matched NFs
      const consolidatedMap = new Map<string, RomaneioItem>();
      matchedNFs.forEach((nf) => {
        nf.itens.forEach((item) => {
          const key = item.cProd;
          const boxes = calculateBoxes(item.qCom);
          if (consolidatedMap.has(key)) {
            consolidatedMap.get(key)!.quantidadeTotal += boxes;
          } else {
            consolidatedMap.set(key, {
              cProd: item.cProd,
              xProd: item.xProd,
              quantidadeTotal: boxes,
            });
          }
        });
      });

      const sortedItems = Array.from(consolidatedMap.values()).sort((a, b) =>
        a.cProd.localeCompare(b.cProd)
      );

      const blob = await generateRomaneioPDF(
        {
          data: selectedCarga.data,
          placa: selectedCarga.placa,
          motorista: selectedCarga.motorista,
        },
        sortedItems
      );

      downloadBlob(
        blob,
        `romaneio_por_nf_${selectedCarga.placa}_${format(new Date(selectedCarga.data + "T00:00:00"), "yyyyMMdd")}.pdf`
      );

      let description = `${matchedNFs.length} NFs totalizadas.`;
      if (notFound.length > 0) {
        description += ` NFs não encontradas: ${notFound.join(", ")}`;
      }

      toast({
        title: "PDF gerado com sucesso!",
        description,
      });

      setRomaneioPorNfOpen(false);
      setRomaneioPorNfInput("");
    } catch (error) {
      console.error("Error generating romaneio por NF:", error);
      toast({ variant: "destructive", title: "Erro ao gerar PDF" });
    } finally {
      setGeneratingPorNf(false);
    }
  }

  async function handleNotaCargaPorNf() {
    if (!selectedCarga || selectedNfIds.size === 0) return;
    setGenerating("nota-por-nf");
    try {
      const selectedNfs = notasFiscais.filter((nf) => selectedNfIds.has(nf.id));
      const nfsPDF = buildNfsPDF(selectedNfs);
      const blob = await generateNotaDeCargaPDF(
        {
          data: selectedCarga.data,
          placa: selectedCarga.placa,
          motorista: selectedCarga.motorista,
        },
        nfsPDF
      );
      downloadBlob(
        blob,
        `nota_carga_por_nf_${selectedCarga.placa}_${format(new Date(selectedCarga.data + "T00:00:00"), "yyyyMMdd")}.pdf`
      );
      toast({
        title: "PDF gerado com sucesso!",
        description: `${selectedNfs.length} NFs incluídas.`,
      });
      setNotaCargaPorNfOpen(false);
      setSelectedNfIds(new Set());
      setNfSearchFilter("");
    } catch (error) {
      console.error("Error generating nota de carga por NF:", error);
      toast({ variant: "destructive", title: "Erro ao gerar PDF" });
    } finally {
      setGenerating(null);
    }
  }

  const filteredNfsDialog = useMemo(() => {
    if (!nfSearchFilter.trim()) return notasFiscais;
    const term = nfSearchFilter.trim().toLowerCase();
    return notasFiscais.filter(
      (nf) =>
        nf.numeroNf.includes(term) ||
        (nf.cnpjDestinatario || "").includes(term) ||
        (nf.destBairro || "").toLowerCase().includes(term)
    );
  }, [notasFiscais, nfSearchFilter]);

  const totalCaixas = romaneioItems.reduce(
    (acc, item) => acc + item.quantidadeTotal,
    0
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Romaneio</h1>
            <p className="text-muted-foreground">
              Gere o Romaneio Totalizado e Nota de Carga
            </p>
            {selectedCarga && isChocolate(selectedCarga.tipo_carga) && (
              <TipoCargaBadge tipoCarga={selectedCarga.tipo_carga} size="md" className="mt-1" />
            )}
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
                      <span className="flex items-center gap-2">
                        {isChocolate(carga.tipo_carga) && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                        {carga.placa} - {format(new Date(carga.data + "T00:00:00"), "dd/MM/yyyy")}{" "}
                        - {carga.motorista}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCarga && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleGenerateRomaneio}
                  disabled={generating !== null || romaneioItems.length === 0}
                >
                  {generating === "romaneio" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Romaneio PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePrintRomaneio}
                  disabled={generating !== null || romaneioItems.length === 0}
                >
                  {generating === "print-romaneio" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4 mr-2" />
                  )}
                  Imprimir Romaneio
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRomaneioPorNfOpen(true)}
                  disabled={notasFiscais.length === 0}
                >
                  <List className="w-4 h-4 mr-2" />
                  Romaneio por NF
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Nota de Carga por NF */}
        {selectedCarga && notasFiscais.length > 0 && (
          <div className="wms-card p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="font-semibold">Nota de Carga por NF</h3>
              <Button
                variant="secondary"
                onClick={() => {
                  setNotaCargaPorNfOpen(true);
                  setSelectedNfIds(new Set());
                  setNfSearchFilter("");
                }}
              >
                <FileText className="w-4 h-4 mr-2" />
                Selecionar NFs
              </Button>
            </div>
          </div>
        )}

        {/* Nota de Carga section with route filter */}
        {selectedCarga && notasFiscais.length > 0 && (
          <div className="wms-card p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="font-semibold">Nota de Carga por Rota</h3>
              <div className="w-64">
                <Select value={selectedMR} onValueChange={setSelectedMR}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por rota" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as Rotas ({notasFiscais.length} NFs)</SelectItem>
                    {availableMRs.map((mr) => {
                      const count = notasFiscais.filter((nf) => nf.macroRegiao === mr.value).length;
                      return (
                        <SelectItem key={mr.value} value={mr.value.toString()}>
                          {mr.label} ({count} NFs)
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={handleGenerateNotaDeCarga}
                  disabled={generating !== null || filteredNFs.length === 0}
                >
                  {generating === "nota" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Nota de Carga PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePrintNotaDeCarga}
                  disabled={generating !== null || filteredNFs.length === 0}
                >
                  {generating === "print-nota" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4 mr-2" />
                  )}
                  Imprimir Nota de Carga
                </Button>
              </div>
            </div>
            {/* Summary of NFs by MR */}
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              {availableMRs.map((mr) => {
                const nfsInMR = notasFiscais.filter((nf) => nf.macroRegiao === mr.value);
                const totalBoxes = nfsInMR.reduce((acc, nf) => 
                  acc + nf.itens.reduce((sum, item) => sum + calculateBoxes(item.qCom), 0), 0
                );
                return (
                  <div
                    key={mr.value}
                    className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                      selectedMR === mr.value.toString()
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted border-border hover:bg-accent"
                    }`}
                    onClick={() => setSelectedMR(
                      selectedMR === mr.value.toString() ? "todas" : mr.value.toString()
                    )}
                  >
                    MR {mr.value} • {nfsInMR.length} NFs • {totalBoxes} cx
                  </div>
                );
              })}
              {selectedMR !== "todas" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!selectedCarga) return;
                    const mrNum = parseInt(selectedMR);
                    const nfsMR = notasFiscais.filter((nf) => nf.macroRegiao === mrNum);
                    const blob = generateResumoMRPDF({
                      placa: selectedCarga.placa,
                      motorista: selectedCarga.motorista,
                      data: selectedCarga.data,
                      macroRegiao: mrNum,
                      nfs: nfsMR.map((nf) => ({
                        numeroNf: nf.numeroNf,
                        cnpjDestinatario: nf.cnpjDestinatario,
                        destBairro: nf.destBairro,
                        itens: nf.itens,
                      })),
                    });
                    downloadBlob(blob, `resumo_MR${mrNum}_${selectedCarga.placa}.pdf`);
                    toast({ title: "PDF gerado!", description: `Resumo MR ${mrNum} com ${nfsMR.length} NFs.` });
                  }}
                >
                  <ClipboardList className="w-4 h-4 mr-1" />
                  Resumo MR PDF
                </Button>
              )}
            </div>
          </div>
        )}

        {/* NF Detail - A4 Page View (replaces table when open) */}
        {selectedNfDetail && nfDialogOpen ? (
          <div className="wms-card">
            <div className="bg-foreground text-background px-6 py-3 rounded-t-lg">
              <p className="font-bold text-sm tracking-wide">
                {getMacroRegiaoLabel(selectedNfDetail.macroRegiao)}
              </p>
            </div>
            <div className="p-6 space-y-5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setNfDialogOpen(false); setSelectedNfDetail(null); }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
              <h2 className="text-xl font-bold">NF: {selectedNfDetail.numeroNf}</h2>
              <div className="space-y-1 text-sm">
                <p>Emitente: {selectedNfDetail.razaoSocialEmitente}</p>
                <p>CNPJ Emitente: <span className="font-mono">{selectedNfDetail.cnpjEmitente}</span></p>
                <div className="flex gap-8">
                  <p>CNPJ Destinatário: <span className="font-mono">{selectedNfDetail.cnpjDestinatario || "N/A"}</span></p>
                  {selectedNfDetail.dataEmissao && (
                    <p>Data Emissão: {format(new Date(selectedNfDetail.dataEmissao), "dd/MM/yyyy")}</p>
                  )}
                </div>
                {selectedNfDetail.destBairro && (
                  <p className="italic text-muted-foreground text-xs">
                    Bairro: {selectedNfDetail.destBairro} — MR {selectedNfDetail.macroRegiao}
                  </p>
                )}
              </div>
              <div className="border-t border-border" />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32 bg-muted font-bold">Cód. Produto</TableHead>
                    <TableHead className="bg-muted font-bold">Descrição</TableHead>
                    <TableHead className="w-28 text-right bg-muted font-bold">Qtd Caixas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...selectedNfDetail.itens]
                    .sort((a, b) => {
                      const numA = parseFloat(a.cProd.replace(/\D/g, '')) || 0;
                      const numB = parseFloat(b.cProd.replace(/\D/g, '')) || 0;
                      return numA - numB;
                    })
                    .map((item, idx) => (
                    <TableRow key={idx} className={idx % 2 === 1 ? "bg-muted/30" : ""}>
                      <TableCell className="font-mono text-sm">
                        {parseInt(item.cProd, 10) || item.cProd}
                      </TableCell>
                      <TableCell className="text-sm">{item.xProd}</TableCell>
                      <TableCell className="text-right font-medium">
                        {calculateBoxes(item.qCom)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end">
                <p className="text-base font-bold">
                  TOTAL DE CAIXAS DA NF: {selectedNfDetail.itens.reduce((acc, item) => acc + calculateBoxes(item.qCom), 0)}
                </p>
              </div>
            </div>
          </div>
        ) : selectedCarga ? (
          <>
            <div className="wms-card">
              <div className="p-4 border-b">
                <h3 className="font-semibold">Romaneio Totalizado</h3>
                <p className="text-sm text-muted-foreground">
                  {romaneioItems.length} produtos • {totalCaixas} caixas total
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Cód. Produto</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-32 text-right">Qtd Caixas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : romaneioItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8">
                        <p className="text-muted-foreground">
                          Nenhum item encontrado
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    romaneioItems.map((item) => (
                      <TableRow key={item.cProd} className="wms-table-row">
                        <TableCell className="font-mono text-sm">
                          {item.cProd}
                        </TableCell>
                        <TableCell>{item.xProd}</TableCell>
                        <TableCell className="text-right font-medium">
                          {item.quantidadeTotal}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {romaneioItems.length > 0 && (
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={2}>TOTAL</TableCell>
                      <TableCell className="text-right">{totalCaixas}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Lista de NFs */}
            {filteredNFs.length > 0 && (
              <div className="wms-card">
                <div className="p-4 border-b flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Notas Fiscais ({filteredNFs.length})</h3>
                    <p className="text-sm text-muted-foreground">
                      Todas as NFs da carga{selectedMR !== "todas" ? ` — ${getMacroRegiaoLabel(parseInt(selectedMR))}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const rows = filteredNFs.map((nf) => ({
                        "NF": nf.numeroNf,
                        "Destinatário (CNPJ)": nf.cnpjDestinatario || "",
                        "Bairro": nf.destBairro || "",
                        "MR": nf.macroRegiao,
                        "Caixas": nf.itens.reduce((acc, item) => acc + calculateBoxes(item.qCom), 0),
                      }));
                      const ws = XLSX.utils.json_to_sheet(rows);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "NFs");
                      const suffix = selectedMR !== "todas" ? `_MR${selectedMR}` : "";
                      XLSX.writeFile(wb, `nfs_${selectedCarga?.placa || "carga"}${suffix}.xlsx`);
                    }}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Exportar Excel
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">NF</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead className="hidden md:table-cell">Bairro</TableHead>
                      <TableHead className="hidden md:table-cell w-20">MR</TableHead>
                      <TableHead className="w-24 text-right">Caixas</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNFs.map((nf, idx) => {
                      const totalCaixasNf = nf.itens.reduce((acc, item) => acc + calculateBoxes(item.qCom), 0);
                      return (
                        <TableRow key={nf.id} className={idx % 2 === 1 ? "bg-muted/30" : ""}>
                          <TableCell className="font-mono text-sm font-medium">{nf.numeroNf}</TableCell>
                          <TableCell className="text-sm truncate max-w-[200px]">
                            {nf.cnpjDestinatario || "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {nf.destBairro || "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
                            MR {nf.macroRegiao}
                          </TableCell>
                          <TableCell className="text-right font-medium">{totalCaixasNf}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedNfDetail(nf); setNfDialogOpen(true); }}
                            >
                              <Search className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={4}>TOTAL</TableCell>
                      <TableCell className="text-right">
                        {filteredNFs.reduce((acc, nf) => acc + nf.itens.reduce((sum, item) => sum + calculateBoxes(item.qCom), 0), 0)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Dialog Romaneio por NF */}
      <Dialog open={romaneioPorNfOpen} onOpenChange={setRomaneioPorNfOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Romaneio por NF</DialogTitle>
            <DialogDescription>
              Digite os números das NFs (separados por vírgula, espaço ou quebra de linha) para gerar um romaneio totalizado apenas com essas notas.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={"Ex:\n12345\n12346\n12347"}
            value={romaneioPorNfInput}
            onChange={(e) => setRomaneioPorNfInput(e.target.value)}
            rows={6}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRomaneioPorNfOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRomaneioPorNf}
              disabled={generatingPorNf || !romaneioPorNfInput.trim()}
            >
              {generatingPorNf ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Nota de Carga por NF */}
      <Dialog open={notaCargaPorNfOpen} onOpenChange={setNotaCargaPorNfOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nota de Carga por NF</DialogTitle>
            <DialogDescription>
              Selecione as NFs para gerar o PDF da Nota de Carga.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por NF, CNPJ ou bairro..."
                value={nfSearchFilter}
                onChange={(e) => setNfSearchFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{selectedNfIds.size} de {notasFiscais.length} selecionadas</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedNfIds(new Set(filteredNfsDialog.map((nf) => nf.id)))}
                >
                  Selecionar todos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedNfIds(new Set())}
                >
                  Limpar
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-1">
                {filteredNfsDialog.map((nf) => {
                  const totalBoxes = nf.itens.reduce((sum, item) => sum + calculateBoxes(item.qCom), 0);
                  return (
                    <label
                      key={nf.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedNfIds.has(nf.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedNfIds);
                          if (checked) next.add(nf.id);
                          else next.delete(nf.id);
                          setSelectedNfIds(next);
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">NF {nf.numeroNf}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {nf.destBairro || "Sem bairro"} • {totalBoxes} cx
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotaCargaPorNfOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleNotaCargaPorNf}
              disabled={generating === "nota-por-nf" || selectedNfIds.size === 0}
            >
              {generating === "nota-por-nf" ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Gerar PDF ({selectedNfIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </MainLayout>
  );
}
