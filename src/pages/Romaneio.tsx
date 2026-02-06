import { useEffect, useState } from "react";
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
import { FileText, Download, Loader2, Printer } from "lucide-react";
import { format } from "date-fns";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
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
  dataEmissao: string | null;
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
  const [generating, setGenerating] = useState<"romaneio" | "nota" | "print-romaneio" | "print-nota" | null>(null);

  useEffect(() => {
    loadCargas();
  }, []);

  useEffect(() => {
    if (selectedCargaId) {
      loadRomaneio(selectedCargaId);
    }
  }, [selectedCargaId]);

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

  async function loadRomaneio(cargaId: string) {
    setLoading(true);
    try {
      // Get carga info
      const { data: cargaData } = await supabase
        .from("cargas")
        .select("*")
        .eq("id", cargaId)
        .single();

      if (cargaData) {
        setSelectedCarga(cargaData);
      }

      // Get all NFs with items
      const { data: nfsData } = await supabase
        .from("notas_fiscais")
        .select(`
          id,
          numero_nf,
          razao_social_emitente,
          cnpj_emitente,
          cnpj_destinatario,
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

      // Process NFs for Nota de Carga
      const nfsList: NotaFiscalData[] = nfsData.map((nf) => ({
        id: nf.id,
        numeroNf: nf.numero_nf,
        razaoSocialEmitente: nf.razao_social_emitente,
        cnpjEmitente: nf.cnpj_emitente,
        cnpjDestinatario: nf.cnpj_destinatario || "",
        dataEmissao: nf.data_emissao,
        itens: (nf.itens_nf || []).map((item: any) => ({
          cProd: item.c_prod,
          xProd: item.x_prod,
          qCom: item.q_com,
        })),
      }));

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

      downloadBlob(blob, `romaneio_${selectedCarga.placa}_${format(new Date(selectedCarga.data), "yyyyMMdd")}.pdf`);

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

  async function handleGenerateNotaDeCarga() {
    if (!selectedCarga || notasFiscais.length === 0) return;

    setGenerating("nota");
    try {
      const nfsPDF = notasFiscais.map((nf) => ({
        numeroNf: nf.numeroNf,
        razaoSocialEmitente: nf.razaoSocialEmitente,
        cnpjEmitente: nf.cnpjEmitente,
        cnpjDestinatario: nf.cnpjDestinatario,
        dataEmissao: nf.dataEmissao,
        itens: nf.itens.map((item) => ({
          cProd: item.cProd,
          xProd: item.xProd,
          qtdCaixas: calculateBoxes(item.qCom),
        })),
      }));

      const blob = await generateNotaDeCargaPDF(
        {
          data: selectedCarga.data,
          placa: selectedCarga.placa,
          motorista: selectedCarga.motorista,
        },
        nfsPDF
      );

      downloadBlob(blob, `nota_carga_${selectedCarga.placa}_${format(new Date(selectedCarga.data), "yyyyMMdd")}.pdf`);

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
    if (!selectedCarga || notasFiscais.length === 0) return;
    setGenerating("print-nota");
    try {
      const nfsPDF = notasFiscais.map((nf) => ({
        numeroNf: nf.numeroNf,
        razaoSocialEmitente: nf.razaoSocialEmitente,
        cnpjEmitente: nf.cnpjEmitente,
        cnpjDestinatario: nf.cnpjDestinatario,
        dataEmissao: nf.dataEmissao,
        itens: nf.itens.map((item) => ({
          cProd: item.cProd,
          xProd: item.xProd,
          qtdCaixas: calculateBoxes(item.qCom),
        })),
      }));
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
          </div>
        </div>

        {/* Carga Selector */}
        <div className="wms-card p-4">
          <div className="flex items-center gap-4">
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
                  onClick={handleGenerateNotaDeCarga}
                  disabled={generating !== null || notasFiscais.length === 0}
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
                  disabled={generating !== null || notasFiscais.length === 0}
                >
                  {generating === "print-nota" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4 mr-2" />
                  )}
                  Imprimir Nota de Carga
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Romaneio Table */}
        {selectedCarga && (
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
        )}
      </div>
    </MainLayout>
  );
}
