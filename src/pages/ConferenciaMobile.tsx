import { useEffect, useState, useRef } from "react";
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
import { CameraScanner } from "@/components/conferencia/CameraScanner";
import { MobileLogoutButton } from "@/components/layout/MobileLogoutButton";
import {
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Package,
  Loader2,
  Smartphone,
  FileText,
  ChevronLeft,
  Search,
} from "lucide-react";
import { format } from "date-fns";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
}

interface NfProgress {
  numeroNf: string;
  total: number;
  conferidas: number;
}

interface ConferenciaStats {
  total: number;
  conferidas: number;
  pendentes: number;
}

interface ScanResult {
  type: "success" | "error" | "warning";
  message: string;
  details?: string;
}

export default function ConferenciaMobile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [cargas, setCargas] = useState<Carga[]>([]);
  const [selectedCargaId, setSelectedCargaId] = useState<string>("");
  const [selectedCarga, setSelectedCarga] = useState<Carga | null>(null);
  const [selectedNf, setSelectedNf] = useState<string | null>(null);
  const [nfProgress, setNfProgress] = useState<NfProgress[]>([]);
  const [nfSearch, setNfSearch] = useState("");
  const [stats, setStats] = useState<ConferenciaStats>({
    total: 0,
    conferidas: 0,
    pendentes: 0,
  });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);

  useEffect(() => {
    loadCargas();
  }, []);

  useEffect(() => {
    if (selectedCargaId) {
      setSelectedNf(null);
      setScanHistory([]);
      setLastResult(null);
      loadConferenciaData(selectedCargaId);
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
      // Fetch carga info and progress counts in parallel (single DB call for counts!)
      const [cargaRes, progressRes] = await Promise.all([
        supabase
          .from("cargas")
          .select("id, data, placa, motorista")
          .eq("id", cargaId)
          .single(),
        supabase.rpc("get_conferencia_progress", { p_carga_id: cargaId }),
      ]);

      if (cargaRes.data) {
        setSelectedCarga(cargaRes.data);
      }

      const progress = progressRes.data as {
        total: number;
        conferidas: number;
        nfs: { numero_nf: string; total: number; conferidas: number }[];
      } | null;

      if (progress) {
        setStats({
          total: progress.total,
          conferidas: progress.conferidas,
          pendentes: progress.total - progress.conferidas,
        });

        const nfList: NfProgress[] = (progress.nfs || []).map((nf) => ({
          numeroNf: nf.numero_nf,
          total: nf.total,
          conferidas: nf.conferidas,
        }));
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

  async function processScan(qrData: string) {
    if (!qrData.trim() || !selectedCargaId || !selectedNf) return;

    setScanning(true);
    setLastResult(null);

    try {
      const parts = qrData.trim().split(";");

      if (parts.length < 6) {
        const result: ScanResult = {
          type: "error",
          message: "QR Code inválido",
          details: "Formato não reconhecido",
        };
        setLastResult(result);
        addToHistory(result);
        playSound("error");
        return;
      }

      const [qrCargaId, numeroNf, cProd, seqStr, totalStr] = parts;

      // Validate carga
      if (qrCargaId !== selectedCargaId) {
        const result: ScanResult = {
          type: "warning",
          message: "Etiqueta de outra carga",
          details: "Esta etiqueta pertence a outra carga",
        };
        setLastResult(result);
        addToHistory(result);
        playSound("warning");
        return;
      }

      // Validate NF - MUST match selected NF
      if (numeroNf !== selectedNf) {
        const result: ScanResult = {
          type: "warning",
          message: "Etiqueta de outra NF",
          details: `Esta etiqueta é da NF ${numeroNf}. Selecione a NF correta para conferí-la.`,
        };
        setLastResult(result);
        addToHistory(result);
        playSound("warning");
        return;
      }

      // Find the etiqueta
      const { data: etiqueta, error: findError } = await supabase
        .from("etiquetas")
        .select("*")
        .eq("carga_id", selectedCargaId)
        .eq("qr_payload", qrData.trim())
        .maybeSingle();

      if (findError || !etiqueta) {
        const result: ScanResult = {
          type: "error",
          message: "Etiqueta não encontrada",
          details: `NF ${numeroNf} - Cód ${cProd} - Caixa ${seqStr}/${totalStr}`,
        };
        setLastResult(result);
        addToHistory(result);
        playSound("error");
        return;
      }

      // Check if already scanned
      if (etiqueta.status === "conferido") {
        const result: ScanResult = {
          type: "warning",
          message: "Já conferida",
          details: `NF ${numeroNf} - ${etiqueta.x_prod} - Caixa ${seqStr}/${totalStr}`,
        };
        setLastResult(result);
        addToHistory(result);
        playSound("warning");
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

      if (updateError) throw updateError;

      const result: ScanResult = {
        type: "success",
        message: "Conferido!",
        details: `NF ${numeroNf} - ${etiqueta.x_prod} - Caixa ${seqStr}/${totalStr}`,
      };
      setLastResult(result);
      addToHistory(result);
      playSound("success");

      // Reload data
      await loadConferenciaData(selectedCargaId);

      // Check if NF is now complete
      const updatedNf = nfProgress.find((nf) => nf.numeroNf === selectedNf);
      // +1 because we just conferiu one more
      if (updatedNf && updatedNf.conferidas + 1 === updatedNf.total) {
        setTimeout(() => {
          const completeResult: ScanResult = {
            type: "success",
            message: `✅ NF ${selectedNf} COMPLETA!`,
            details: `Todas as ${updatedNf.total} etiquetas foram conferidas.`,
          };
          setLastResult(completeResult);
          addToHistory(completeResult);
          playSound("success");
        }, 500);
      }
    } catch (error) {
      console.error("Error scanning:", error);
      const result: ScanResult = {
        type: "error",
        message: "Erro ao processar",
        details: "Tente novamente",
      };
      setLastResult(result);
      addToHistory(result);
      playSound("error");
    } finally {
      setQrInput("");
      setScanning(false);
    }
  }

  function addToHistory(result: ScanResult) {
    setScanHistory((prev) => [result, ...prev].slice(0, 10));
  }

  function playSound(type: "success" | "error" | "warning") {
    if ((window as any).__cameraScannerPlaySound) {
      (window as any).__cameraScannerPlaySound(type);
    }
  }

  async function handleManualScan() {
    await processScan(qrInput);
    inputRef.current?.focus();
  }

  const selectedNfData = nfProgress.find((nf) => nf.numeroNf === selectedNf);
  const selectedNfPercent =
    selectedNfData && selectedNfData.total > 0
      ? Math.round((selectedNfData.conferidas / selectedNfData.total) * 100)
      : 0;

  const filteredNfProgress = nfProgress.filter((nf) =>
    nf.numeroNf.toLowerCase().includes(nfSearch.toLowerCase().trim())
  );

  const progressPercent =
    stats.total > 0 ? Math.round((stats.conferidas / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedNf ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-sidebar-foreground h-8 w-8"
                onClick={() => {
                  setSelectedNf(null);
                  setLastResult(null);
                  setScanHistory([]);
                }}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            ) : (
              <Smartphone className="w-5 h-5" />
            )}
            <h1 className="text-lg font-semibold">
              {selectedNf ? `NF ${selectedNf}` : "Conferência Mobile"}
            </h1>
          </div>
          <MobileLogoutButton />
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Carga Selector */}
        <Card>
          <CardContent className="pt-4">
            <Select value={selectedCargaId} onValueChange={setSelectedCargaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma carga" />
              </SelectTrigger>
              <SelectContent>
                {cargas.map((carga) => (
                  <SelectItem key={carga.id} value={carga.id}>
                    {carga.placa} - {format(new Date(carga.data), "dd/MM")} -{" "}
                    {carga.motorista}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedCarga && !selectedNf && (
          <>
            {/* Overall Progress */}
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Progresso geral: {stats.conferidas}/{stats.total}
                    </span>
                    <span className="font-bold">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-3" />
                </div>
              </CardContent>
            </Card>

            {/* NF Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar NF..."
                value={nfSearch}
                onChange={(e) => setNfSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* NF List */}
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {filteredNfProgress.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      {nfSearch ? "Nenhuma NF encontrada" : "Nenhuma NF disponível"}
                    </CardContent>
                  </Card>
                ) : (
                  filteredNfProgress.map((nf) => {
                    const nfPercent =
                      nf.total > 0 ? Math.round((nf.conferidas / nf.total) * 100) : 0;
                    const isComplete = nf.conferidas === nf.total;

                    return (
                      <button
                        key={nf.numeroNf}
                        onClick={() => {
                          setSelectedNf(nf.numeroNf);
                          setLastResult(null);
                          setScanHistory([]);
                        }}
                        className="w-full"
                      >
                        <Card className={`transition-colors hover:border-primary ${isComplete ? "border-success/50 bg-success/5" : ""}`}>
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {isComplete ? (
                                  <CheckCircle2 className="w-5 h-5 text-success" />
                                ) : (
                                  <FileText className="w-5 h-5 text-muted-foreground" />
                                )}
                                <span className="font-semibold text-base">
                                  NF {nf.numeroNf}
                                </span>
                              </div>
                              <Badge
                                variant={isComplete ? "default" : "secondary"}
                                className={isComplete ? "bg-success" : ""}
                              >
                                {nf.conferidas}/{nf.total}
                              </Badge>
                            </div>
                            <Progress
                              value={nfPercent}
                              className={`h-2 ${isComplete ? "[&>div]:bg-success" : ""}`}
                            />
                          </CardContent>
                        </Card>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}

        {selectedCarga && selectedNf && (
          <>
            {/* NF Progress */}
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {selectedNfData?.conferidas || 0} de {selectedNfData?.total || 0} etiquetas
                    </span>
                    <span className="font-bold text-lg">{selectedNfPercent}%</span>
                  </div>
                  <Progress value={selectedNfPercent} className="h-4" />
                  {selectedNfData && selectedNfData.conferidas === selectedNfData.total && (
                    <div className="flex items-center gap-2 text-success font-semibold mt-2">
                      <CheckCircle2 className="w-5 h-5" />
                      NF Completa!
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Camera Scanner */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScanLine className="w-4 h-4" />
                  Scanner de Câmera
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CameraScanner
                  onScan={processScan}
                  enabled={!!selectedNf}
                />
              </CardContent>
            </Card>

            {/* Manual Input */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Entrada Manual / USB</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    placeholder="Escaneie ou digite..."
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleManualScan();
                      }
                    }}
                    className="flex-1 font-mono text-sm"
                    disabled={scanning}
                  />
                  <Button
                    onClick={handleManualScan}
                    disabled={scanning || !qrInput}
                    size="sm"
                  >
                    {scanning ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "OK"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Last Result */}
            {lastResult && (
              <div
                className={`p-4 rounded-lg flex items-start gap-3 animate-fade-in ${
                  lastResult.type === "success"
                    ? "bg-success/20 text-success border-2 border-success"
                    : lastResult.type === "warning"
                    ? "bg-warning/20 text-warning border-2 border-warning"
                    : "bg-destructive/20 text-destructive border-2 border-destructive"
                }`}
              >
                {lastResult.type === "success" ? (
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                ) : (
                  <AlertCircle className="w-6 h-6 shrink-0" />
                )}
                <div>
                  <p className="font-bold text-lg">{lastResult.message}</p>
                  {lastResult.details && (
                    <p className="text-sm opacity-80">{lastResult.details}</p>
                  )}
                </div>
              </div>
            )}

            {/* Scan History */}
            {scanHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Últimas leituras
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {scanHistory.map((item, index) => (
                      <div
                        key={index}
                        className={`text-xs p-2 rounded flex items-center gap-2 ${
                          item.type === "success"
                            ? "bg-success/10 text-success"
                            : item.type === "warning"
                            ? "bg-warning/10 text-warning"
                            : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {item.type === "success" ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        <span className="font-medium">{item.message}</span>
                        {item.details && (
                          <span className="opacity-70 truncate">
                            - {item.details}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
