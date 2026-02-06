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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Package,
  Loader2,
  Smartphone,
  FileText,
  ChevronRight,
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

interface NfProgress {
  numeroNf: string;
  total: number;
  conferidas: number;
}

interface Etiqueta {
  id: string;
  c_prod: string;
  x_prod: string;
  seq: number;
  total: number;
  status: string;
  numero_nf: string;
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
  const [selectedNf, setSelectedNf] = useState<string | null>(null);
  const [stats, setStats] = useState<ConferenciaStats>({
    total: 0,
    conferidas: 0,
    pendentes: 0,
  });
  const [nfProgress, setNfProgress] = useState<NfProgress[]>([]);
  const [nfEtiquetas, setNfEtiquetas] = useState<Etiqueta[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingNfDetails, setLoadingNfDetails] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    loadCargas();
  }, []);

  useEffect(() => {
    if (selectedCargaId) {
      setSelectedNf(null);
      setNfEtiquetas([]);
      loadConferenciaData(selectedCargaId);
    }
  }, [selectedCargaId]);

  useEffect(() => {
    if (selectedNf && selectedCargaId) {
      loadNfEtiquetas(selectedCargaId, selectedNf);
    }
  }, [selectedNf, selectedCargaId]);

  useEffect(() => {
    // Focus input for scanning when NF is selected
    if (selectedNf && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedNf]);

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

      // Fetch ALL etiquetas using pagination to bypass 1000 row limit
      let allEtiquetas: { c_prod: string; x_prod: string; status: string; numero_nf: string }[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch } = await supabase
          .from("etiquetas")
          .select("c_prod, x_prod, status, numero_nf")
          .eq("carga_id", cargaId)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (batch && batch.length > 0) {
          allEtiquetas = [...allEtiquetas, ...batch];
          hasMore = batch.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      if (allEtiquetas.length > 0) {
        const total = allEtiquetas.length;
        const conferidas = allEtiquetas.filter(
          (e) => e.status === "conferido"
        ).length;

        setStats({
          total,
          conferidas,
          pendentes: total - conferidas,
        });

        // Calculate NF progress
        const nfMap = new Map<
          string,
          { numeroNf: string; total: number; conferidas: number }
        >();

        allEtiquetas.forEach((e) => {
          const key = e.numero_nf;
          if (!nfMap.has(key)) {
            nfMap.set(key, {
              numeroNf: e.numero_nf,
              total: 0,
              conferidas: 0,
            });
          }
          const nf = nfMap.get(key)!;
          nf.total++;
          if (e.status === "conferido") {
            nf.conferidas++;
          }
        });

        // Sort by numeric extraction for proper ordering
        const nfList = Array.from(nfMap.values()).sort((a, b) => {
          const numA = parseInt(a.numeroNf.replace(/\D/g, "") || "0", 10);
          const numB = parseInt(b.numeroNf.replace(/\D/g, "") || "0", 10);
          return numA - numB;
        });
        setNfProgress(nfList);
      } else {
        setStats({ total: 0, conferidas: 0, pendentes: 0 });
        setNfProgress([]);
      }
    } catch (error) {
      console.error("Error loading conferencia data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadNfEtiquetas(cargaId: string, numeroNf: string) {
    setLoadingNfDetails(true);
    try {
      const { data } = await supabase
        .from("etiquetas")
        .select("id, c_prod, x_prod, seq, total, status, numero_nf")
        .eq("carga_id", cargaId)
        .eq("numero_nf", numeroNf)
        .order("c_prod")
        .order("seq");

      setNfEtiquetas(data || []);
    } catch (error) {
      console.error("Error loading NF etiquetas:", error);
    } finally {
      setLoadingNfDetails(false);
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

      // Validate NF if one is selected
      if (selectedNf && numeroNf !== selectedNf) {
        setLastResult({
          type: "warning",
          message: "Etiqueta de outra NF",
          details: `Esta etiqueta é da NF ${numeroNf}, mas você está conferindo a NF ${selectedNf}`,
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
      if (selectedNf) {
        loadNfEtiquetas(selectedCargaId, selectedNf);
      }
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

  const selectedNfData = nfProgress.find((nf) => nf.numeroNf === selectedNf);
  const selectedNfPercent =
    selectedNfData && selectedNfData.total > 0
      ? Math.round((selectedNfData.conferidas / selectedNfData.total) * 100)
      : 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Conferência por NF</h1>
            <p className="text-muted-foreground">
              Selecione uma Nota Fiscal para conferir as etiquetas
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
            {/* Progress Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="wms-stat-card">
                <p className="text-sm text-muted-foreground">Total Carga</p>
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
                <CardTitle className="text-base">Progresso Geral da Carga</CardTitle>
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

            <div className="grid gap-6 lg:grid-cols-2">
              {/* NF List */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Notas Fiscais ({nfProgress.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="divide-y">
                        {nfProgress.map((nf) => {
                          const nfPercent =
                            nf.total > 0
                              ? Math.round((nf.conferidas / nf.total) * 100)
                              : 0;
                          const isComplete = nf.conferidas === nf.total;
                          const isSelected = selectedNf === nf.numeroNf;

                          return (
                            <button
                              key={nf.numeroNf}
                              onClick={() => setSelectedNf(nf.numeroNf)}
                              className={`w-full p-4 text-left transition-colors hover:bg-accent ${
                                isSelected ? "bg-accent" : ""
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {isComplete ? (
                                    <CheckCircle2 className="w-4 h-4 text-success" />
                                  ) : (
                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                  )}
                                  <span className="font-medium">
                                    NF {nf.numeroNf}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant={isComplete ? "default" : "secondary"}
                                    className={isComplete ? "bg-success" : ""}
                                  >
                                    {nf.conferidas}/{nf.total}
                                  </Badge>
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                </div>
                              </div>
                              <Progress
                                value={nfPercent}
                                className={`h-1.5 ${isComplete ? "[&>div]:bg-success" : ""}`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>

              {/* NF Details & Scanner */}
              <div className="space-y-4">
                {selectedNf ? (
                  <>
                    {/* NF Progress */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            NF {selectedNf}
                          </span>
                          {selectedNfData && selectedNfData.conferidas === selectedNfData.total && (
                            <Badge className="bg-success">Completa</Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {selectedNfData?.conferidas || 0} de {selectedNfData?.total || 0}
                            </span>
                            <span className="font-medium">{selectedNfPercent}%</span>
                          </div>
                          <Progress value={selectedNfPercent} className="h-3" />
                        </div>
                      </CardContent>
                    </Card>

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

                    {/* Etiquetas List */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Package className="w-5 h-5" />
                          Etiquetas da NF
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {loadingNfDetails ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <ScrollArea className="h-[250px]">
                            <div className="divide-y">
                              {nfEtiquetas.map((etiqueta) => (
                                <div
                                  key={etiqueta.id}
                                  className={`p-3 flex items-center justify-between ${
                                    etiqueta.status === "conferido"
                                      ? "bg-success/5"
                                      : ""
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    {etiqueta.status === "conferido" ? (
                                      <CheckCircle2 className="w-4 h-4 text-success" />
                                    ) : (
                                      <div className="w-4 h-4 rounded-full border-2 border-pending" />
                                    )}
                                    <div>
                                      <p className="text-sm font-medium">
                                        {etiqueta.x_prod}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Cód: {etiqueta.c_prod}
                                      </p>
                                    </div>
                                  </div>
                                  <Badge
                                    variant={
                                      etiqueta.status === "conferido"
                                        ? "default"
                                        : "outline"
                                    }
                                    className={
                                      etiqueta.status === "conferido"
                                        ? "bg-success"
                                        : ""
                                    }
                                  >
                                    {etiqueta.seq}/{etiqueta.total}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card className="h-full min-h-[400px] flex items-center justify-center">
                    <div className="text-center text-muted-foreground p-8">
                      <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">
                        Selecione uma Nota Fiscal
                      </p>
                      <p className="text-sm">
                        Clique em uma NF na lista ao lado para iniciar a conferência
                      </p>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
