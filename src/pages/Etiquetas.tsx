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
import { generateEtiquetasPDF, downloadBlob } from "@/lib/pdf-generator";
import { Tags, Download, Loader2, Package } from "lucide-react";
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

  useEffect(() => {
    loadCargas();
  }, []);

  useEffect(() => {
    if (selectedCargaId) {
      loadEtiquetas(selectedCargaId);
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

      const { data: etiquetasData } = await supabase
        .from("etiquetas")
        .select("*")
        .eq("carga_id", cargaId)
        .order("c_prod", { ascending: true })
        .order("seq", { ascending: true });

      if (etiquetasData) {
        setEtiquetas(
          etiquetasData.map((e) => ({
            id: e.id,
            numeroNf: e.numero_nf,
            cProd: e.c_prod,
            xProd: e.x_prod,
            seq: e.seq,
            total: e.total,
            qrPayload: e.qr_payload,
            status: e.status as "pendente" | "conferido",
          }))
        );
      }
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

  async function handleGenerateEtiquetas() {
    if (!selectedCarga || etiquetas.length === 0) return;

    setGenerating(true);
    try {
      const etiquetasData = etiquetas.map((e) => ({
        numeroNf: e.numeroNf,
        cProd: e.cProd,
        xProd: e.xProd,
        seq: e.seq,
        total: e.total,
        qrPayload: e.qrPayload,
      }));

      const blob = await generateEtiquetasPDF(etiquetasData);

      downloadBlob(
        blob,
        `etiquetas_${selectedCarga.placa}_${format(new Date(selectedCarga.data), "yyyyMMdd")}.pdf`
      );

      toast({
        title: "PDF gerado com sucesso!",
        description: `${etiquetas.length} etiquetas prontas para impressão.`,
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

  const pendentes = etiquetas.filter((e) => e.status === "pendente").length;
  const conferidas = etiquetas.filter((e) => e.status === "conferido").length;

  // Group by product for summary
  const produtosSummary = etiquetas.reduce((acc, e) => {
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
              <Button
                onClick={handleGenerateEtiquetas}
                disabled={generating || etiquetas.length === 0}
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Gerar PDF de Etiquetas
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        {selectedCarga && etiquetas.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="wms-stat-card">
              <p className="text-sm text-muted-foreground">Total de Etiquetas</p>
              <p className="text-3xl font-bold">{etiquetas.length}</p>
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
