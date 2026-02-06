import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Package,
  Loader2,
  Smartphone,
} from "lucide-react";
import { format } from "date-fns";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
}

interface ConferenciaStats {
  total: number;
  conferidas: number;
  pendentes: number;
}

interface SkuProgress {
  cProd: string;
  xProd: string;
  total: number;
  conferidas: number;
}

interface ScanResult {
  type: "success" | "error" | "warning";
  message: string;
  details?: string;
}

export default function Conferencia() {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [cargas, setCargas] = useState<Carga[]>([]);
  const [selectedCargaId, setSelectedCargaId] = useState<string>("");
  const [selectedCarga, setSelectedCarga] = useState<Carga | null>(null);
  const [stats, setStats] = useState<ConferenciaStats>({
    total: 0,
    conferidas: 0,
    pendentes: 0,
  });
  const [skuProgress, setSkuProgress] = useState<SkuProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    loadCargas();
  }, []);

  useEffect(() => {
    if (selectedCargaId) {
      loadConferenciaData(selectedCargaId);
    }
  }, [selectedCargaId]);

  useEffect(() => {
    // Focus input for scanning
    if (selectedCargaId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedCargaId]);

  async function loadCargas() {
    const { data } = await supabase
      .from("cargas")
      .select("id, data, placa, motorista")
      .eq("status", "aberta")
      .order("created_at", { ascending: false });

    setCargas(data || []);
  }

  async function loadConferenciaData(cargaId: string) {
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
        .select("c_prod, x_prod, status")
        .eq("carga_id", cargaId);

      if (etiquetasData) {
        const total = etiquetasData.length;
        const conferidas = etiquetasData.filter(
          (e) => e.status === "conferido"
        ).length;

        setStats({
          total,
          conferidas,
          pendentes: total - conferidas,
        });

        // Calculate SKU progress
        const skuMap = new Map<
          string,
          { cProd: string; xProd: string; total: number; conferidas: number }
        >();

        etiquetasData.forEach((e) => {
          const key = e.c_prod;
          if (!skuMap.has(key)) {
            skuMap.set(key, {
              cProd: e.c_prod,
              xProd: e.x_prod,
              total: 0,
              conferidas: 0,
            });
          }
          const sku = skuMap.get(key)!;
          sku.total++;
          if (e.status === "conferido") {
            sku.conferidas++;
          }
        });

        const skuList = Array.from(skuMap.values()).sort((a, b) =>
          a.cProd.localeCompare(b.cProd)
        );
        setSkuProgress(skuList);
      }
    } catch (error) {
      console.error("Error loading conferencia data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleScan() {
    if (!qrInput.trim() || !selectedCargaId) return;

    setScanning(true);
    setLastResult(null);

    try {
      // Parse QR payload: carga_id;numero_nf;cProd;seq;total;chave_acesso
      const parts = qrInput.trim().split(";");

      if (parts.length < 6) {
        setLastResult({
          type: "error",
          message: "QR Code inválido",
          details: "Formato não reconhecido",
        });
        setQrInput("");
        inputRef.current?.focus();
        return;
      }

      const [qrCargaId, numeroNf, cProd, seqStr, totalStr] = parts;

      // Validate carga
      if (qrCargaId !== selectedCargaId) {
        setLastResult({
          type: "warning",
          message: "Etiqueta de outra carga",
          details: `Esta etiqueta pertence a outra carga`,
        });
        setQrInput("");
        inputRef.current?.focus();
        return;
      }

      // Find the etiqueta
      const { data: etiqueta, error: findError } = await supabase
        .from("etiquetas")
        .select("*")
        .eq("carga_id", selectedCargaId)
        .eq("qr_payload", qrInput.trim())
        .maybeSingle();

      if (findError || !etiqueta) {
        setLastResult({
          type: "error",
          message: "Etiqueta não encontrada",
          details: `NF ${numeroNf} - Produto ${cProd} - Caixa ${seqStr}/${totalStr}`,
        });
        setQrInput("");
        inputRef.current?.focus();
        return;
      }

      // Check if already scanned
      if (etiqueta.status === "conferido") {
        setLastResult({
          type: "warning",
          message: "Etiqueta já conferida",
          details: `NF ${numeroNf} - ${etiqueta.x_prod} - Caixa ${seqStr}/${totalStr}`,
        });
        setQrInput("");
        inputRef.current?.focus();
        return;
      }

      // Mark as conferido
      const { error: updateError } = await supabase
        .from("etiquetas")
        .update({
          status: "conferido",
          conferido_em: new Date().toISOString(),
          conferido_por: user?.id,
        })
        .eq("id", etiqueta.id);

      if (updateError) {
        throw updateError;
      }

      setLastResult({
        type: "success",
        message: "Etiqueta conferida!",
        details: `NF ${numeroNf} - ${etiqueta.x_prod} - Caixa ${seqStr}/${totalStr}`,
      });

      // Reload data
      loadConferenciaData(selectedCargaId);
    } catch (error) {
      console.error("Error scanning:", error);
      setLastResult({
        type: "error",
        message: "Erro ao processar",
        details: "Tente novamente",
      });
    } finally {
      setQrInput("");
      setScanning(false);
      inputRef.current?.focus();
    }
  }

  const progressPercent =
    stats.total > 0 ? Math.round((stats.conferidas / stats.total) * 100) : 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Conferência</h1>
            <p className="text-muted-foreground">
              Leia os QR Codes das etiquetas para conferir
            </p>
          </div>
          <Link to="/conferencia-mobile">
            <Button variant="outline" className="gap-2">
              <Smartphone className="w-4 h-4" />
              Modo Mobile
            </Button>
          </Link>
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
                  <SelectValue placeholder="Selecione uma carga aberta" />
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
          </div>
        </div>

        {selectedCarga && (
          <>
            {/* Scanner Input */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScanLine className="w-5 h-5" />
                  Leitura de QR Code
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Input
                    ref={inputRef}
                    placeholder="Escaneie ou digite o QR Code..."
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleScan();
                      }
                    }}
                    className="flex-1 font-mono"
                    disabled={scanning}
                  />
                  <Button onClick={handleScan} disabled={scanning || !qrInput}>
                    {scanning ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Conferir"
                    )}
                  </Button>
                </div>

                {/* Scan Result */}
                {lastResult && (
                  <div
                    className={`p-4 rounded-lg flex items-start gap-3 animate-fade-in ${
                      lastResult.type === "success"
                        ? "bg-success/10 text-success"
                        : lastResult.type === "warning"
                        ? "bg-warning/10 text-warning"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {lastResult.type === "success" ? (
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">{lastResult.message}</p>
                      {lastResult.details && (
                        <p className="text-sm opacity-80">{lastResult.details}</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Progress Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-3xl font-bold">{stats.total}</p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-3xl font-bold text-pending">
                  {stats.pendentes}
                </p>
              </div>
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Conferidas</p>
                <p className="text-3xl font-bold text-success">
                  {stats.conferidas}
                </p>
              </div>
            </div>

            {/* Overall Progress */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Progresso Geral</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {stats.conferidas} de {stats.total}
                    </span>
                    <span className="font-medium">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-3" />
                </div>
              </CardContent>
            </Card>

            {/* SKU Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Progresso por Produto
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {skuProgress.map((sku) => {
                      const skuPercent =
                        sku.total > 0
                          ? Math.round((sku.conferidas / sku.total) * 100)
                          : 0;
                      const isComplete = sku.conferidas === sku.total;

                      return (
                        <div key={sku.cProd} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              {isComplete && (
                                <CheckCircle2 className="w-4 h-4 text-success" />
                              )}
                              <span className="font-mono text-muted-foreground">
                                {sku.cProd}
                              </span>
                              <span className="truncate max-w-[200px]">
                                {sku.xProd}
                              </span>
                            </div>
                            <span className="font-medium">
                              {sku.conferidas}/{sku.total}
                            </span>
                          </div>
                          <Progress
                            value={skuPercent}
                            className={`h-2 ${isComplete ? "[&>div]:bg-success" : ""}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
