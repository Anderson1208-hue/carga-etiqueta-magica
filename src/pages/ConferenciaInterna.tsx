import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CameraScanner } from "@/components/conferencia/CameraScanner";
import { MobileLogoutButton } from "@/components/layout/MobileLogoutButton";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import {
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Package,
  Loader2,
  Warehouse,
  ChevronLeft,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface CargaResumo {
  id: string;
  placa: string;
  motorista: string;
  data: string;
  totalEtiquetas: number;
  conferidosInterno: number;
}

interface NfProgress {
  numeroNf: string;
  total: number;
  conferidas: number;
}

interface ScanResult {
  type: "success" | "error" | "warning";
  message: string;
  details?: string;
}

export default function ConferenciaInterna() {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  // Stage: list cargas or scanning
  const [cargas, setCargas] = useState<CargaResumo[]>([]);
  const [loadingCargas, setLoadingCargas] = useState(true);
  const [expandedCarga, setExpandedCarga] = useState<string | null>(null);
  const [cargaNfs, setCargaNfs] = useState<NfProgress[]>([]);
  const [loadingNfs, setLoadingNfs] = useState(false);

  // Scanning state
  const [selectedCarga, setSelectedCarga] = useState<CargaResumo | null>(null);
  const [selectedNf, setSelectedNf] = useState<string | null>(null);
  const [nfProgress, setNfProgress] = useState<NfProgress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);

  // Search
  const [searchNf, setSearchNf] = useState("");

  useEffect(() => {
    loadCargas();
  }, []);

  async function loadCargas() {
    setLoadingCargas(true);
    try {
      // Get all open cargas
      const { data: cargasData, error } = await supabase
        .from("cargas")
        .select("id, placa, motorista, data")
        .in("status", ["aberta", "fechada"])
        .order("data", { ascending: false });

      if (error) throw error;
      if (!cargasData || cargasData.length === 0) {
        setCargas([]);
        setLoadingCargas(false);
        return;
      }

      // Get etiqueta counts per carga
      const resumos: CargaResumo[] = [];
      for (const c of cargasData) {
        const [totalRes, confRes] = await Promise.all([
          supabase
            .from("etiquetas")
            .select("id", { count: "exact", head: true })
            .eq("carga_id", c.id),
          supabase
            .from("etiquetas")
            .select("id", { count: "exact", head: true })
            .eq("carga_id", c.id)
            .in("status", ["conferido_interno", "conferido"]),
        ]);

        resumos.push({
          id: c.id,
          placa: c.placa,
          motorista: c.motorista,
          data: c.data,
          totalEtiquetas: totalRes.count || 0,
          conferidosInterno: confRes.count || 0,
        });
      }

      setCargas(resumos.filter((r) => r.totalEtiquetas > 0));
    } catch (error) {
      console.error("Erro ao carregar cargas:", error);
      toast({ title: "Erro ao carregar cargas", variant: "destructive" });
    } finally {
      setLoadingCargas(false);
    }
  }

  async function loadCargaNfs(cargaId: string) {
    if (expandedCarga === cargaId) {
      setExpandedCarga(null);
      return;
    }
    setExpandedCarga(cargaId);
    setLoadingNfs(true);
    try {
      const { data, error } = await supabase
        .from("etiquetas")
        .select("numero_nf, status")
        .eq("carga_id", cargaId);

      if (error) throw error;

      const nfMap = new Map<string, { total: number; conferidas: number }>();
      for (const et of data || []) {
        const current = nfMap.get(et.numero_nf) || { total: 0, conferidas: 0 };
        current.total++;
        if (et.status === "conferido_interno" || et.status === "conferido") {
          current.conferidas++;
        }
        nfMap.set(et.numero_nf, current);
      }

      const nfs: NfProgress[] = Array.from(nfMap.entries())
        .map(([nf, counts]) => ({
          numeroNf: nf,
          total: counts.total,
          conferidas: counts.conferidas,
        }))
        .sort((a, b) => {
          const na = parseInt(a.numeroNf) || 0;
          const nb = parseInt(b.numeroNf) || 0;
          return na - nb;
        });

      setCargaNfs(nfs);
    } catch (error) {
      console.error("Erro ao carregar NFs:", error);
    } finally {
      setLoadingNfs(false);
    }
  }

  function iniciarConferenciaNf(carga: CargaResumo, nf: NfProgress) {
    setSelectedCarga(carga);
    setSelectedNf(nf.numeroNf);
    setNfProgress(nf);
    setLastResult(null);
    setScanHistory([]);
  }

  function voltarParaLista() {
    setSelectedCarga(null);
    setSelectedNf(null);
    setNfProgress(null);
    setLastResult(null);
    setScanHistory([]);
    setQrInput("");
    // Reload to refresh counts
    loadCargas();
    if (expandedCarga) loadCargaNfs(expandedCarga);
  }

  // Quick NF search across all cargas
  async function buscarNfDireta() {
    const nf = searchNf.trim();
    if (!nf) return;
    setLoadingCargas(true);
    try {
      const { data: etiquetas, error } = await supabase
        .from("etiquetas")
        .select("carga_id, status, numero_nf")
        .eq("numero_nf", nf);

      if (error) throw error;
      if (!etiquetas || etiquetas.length === 0) {
        toast({
          title: "NF não encontrada",
          description: `NF ${nf} não existe em nenhuma carga acessível.`,
          variant: "destructive",
        });
        setLoadingCargas(false);
        return;
      }

      const cargaId = etiquetas[0].carga_id;
      const total = etiquetas.length;
      const conferidas = etiquetas.filter(
        (e) => e.status === "conferido_interno" || e.status === "conferido"
      ).length;

      // Get carga info
      const { data: cargaData } = await supabase
        .from("cargas")
        .select("id, placa, motorista, data")
        .eq("id", cargaId)
        .maybeSingle();

      if (!cargaData) {
        toast({ title: "Carga não encontrada", variant: "destructive" });
        setLoadingCargas(false);
        return;
      }

      const carga: CargaResumo = {
        id: cargaData.id,
        placa: cargaData.placa,
        motorista: cargaData.motorista,
        data: cargaData.data,
        totalEtiquetas: total,
        conferidosInterno: conferidas,
      };

      iniciarConferenciaNf(carga, { numeroNf: nf, total, conferidas });
    } catch (error) {
      console.error("Erro ao buscar NF:", error);
      toast({ title: "Erro ao buscar NF", variant: "destructive" });
    } finally {
      setLoadingCargas(false);
    }
  }

  async function processScan(qrData: string) {
    if (!qrData.trim() || !selectedCarga || !selectedNf) return;

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
      if (qrCargaId !== selectedCarga.id) {
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

      // Validate NF
      if (numeroNf !== selectedNf) {
        const result: ScanResult = {
          type: "warning",
          message: "Etiqueta de outra NF",
          details: `Esta etiqueta é da NF ${numeroNf}. Selecione a NF correta.`,
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
        .eq("carga_id", selectedCarga.id)
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

      // Check if already scanned internally or fully
      if (etiqueta.status === "conferido_interno" || etiqueta.status === "conferido") {
        const result: ScanResult = {
          type: "warning",
          message: "Já conferida (interno)",
          details: `NF ${numeroNf} - ${etiqueta.x_prod} - Caixa ${seqStr}/${totalStr}`,
        };
        setLastResult(result);
        addToHistory(result);
        playSound("warning");
        return;
      }

      // Mark as conferido_interno
      const { error: updateError } = await supabase
        .from("etiquetas")
        .update({
          status: "conferido_interno" as any,
          conferido_interno_em: new Date().toISOString(),
          conferido_interno_por: user?.id,
        })
        .eq("id", etiqueta.id);

      if (updateError) throw updateError;

      const result: ScanResult = {
        type: "success",
        message: "Conf. Interna ✓",
        details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}`,
      };
      setLastResult(result);
      addToHistory(result);
      playSound("success");

      await reloadNfProgress();
    } catch (error) {
      console.error("Erro ao processar scan:", error);
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

  async function reloadNfProgress() {
    if (!selectedCarga || !selectedNf) return;

    const [totalRes, confRes] = await Promise.all([
      supabase
        .from("etiquetas")
        .select("id", { count: "exact", head: true })
        .eq("carga_id", selectedCarga.id)
        .eq("numero_nf", selectedNf),
      supabase
        .from("etiquetas")
        .select("id", { count: "exact", head: true })
        .eq("carga_id", selectedCarga.id)
        .eq("numero_nf", selectedNf)
        .in("status", ["conferido_interno", "conferido"]),
    ]);

    const total = totalRes.count || 0;
    const conferidas = confRes.count || 0;

    setNfProgress({ numeroNf: selectedNf, total, conferidas });

    if (conferidas === total) {
      setTimeout(() => {
        const completeResult: ScanResult = {
          type: "success",
          message: `✅ NF ${selectedNf} COMPLETA!`,
          details: `Todas as ${total} etiquetas conferidas internamente.`,
        };
        setLastResult(completeResult);
        addToHistory(completeResult);
        playSound("success");
      }, 500);
    }
  }

  const nfPercent =
    nfProgress && nfProgress.total > 0
      ? Math.round((nfProgress.conferidas / nfProgress.total) * 100)
      : 0;

  // ---- SCANNING VIEW ----
  if (selectedCarga && selectedNf && nfProgress) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-sidebar-foreground h-8 w-8"
                onClick={voltarParaLista}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold">NF {selectedNf}</h1>
                <p className="text-xs opacity-70">
                  {selectedCarga.placa} • Conf. Interna
                </p>
              </div>
            </div>
            <MobileLogoutButton />
          </div>
        </header>

        <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
          {/* Progress */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {nfProgress.conferidas} de {nfProgress.total} etiquetas
                  </span>
                  <span className="font-bold text-lg">{nfPercent}%</span>
                </div>
                <Progress value={nfPercent} className="h-4" />
                {nfProgress.conferidas === nfProgress.total && (
                  <div className="flex items-center gap-2 text-success font-semibold mt-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Conf. Interna Completa!
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
              <CameraScanner onScan={processScan} enabled={true} />
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
                    if (e.key === "Enter") handleManualScan();
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
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  // ---- LIST VIEW ----
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Warehouse className="w-5 h-5" />
            <h1 className="text-lg font-semibold">Conf. Interna</h1>
          </div>
          <MobileLogoutButton />
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
        {/* Quick NF search */}
        <Card>
          <CardContent className="pt-4">
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Busca rápida por NF
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="Nº da NF..."
                value={searchNf}
                onChange={(e) => setSearchNf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") buscarNfDireta();
                }}
                className="flex-1 text-lg"
                inputMode="numeric"
              />
              <Button
                onClick={buscarNfDireta}
                disabled={loadingCargas || !searchNf.trim()}
              >
                {loadingCargas ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Cargas list */}
        {loadingCargas && cargas.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : cargas.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Nenhuma carga com etiquetas pendentes.
            </CardContent>
          </Card>
        ) : (
          cargas.map((carga) => {
            const percent =
              carga.totalEtiquetas > 0
                ? Math.round(
                    (carga.conferidosInterno / carga.totalEtiquetas) * 100
                  )
                : 0;
            const isExpanded = expandedCarga === carga.id;
            const isComplete = percent === 100;

            return (
              <Card key={carga.id}>
                <CardContent className="pt-4">
                  <button
                    className="w-full text-left"
                    onClick={() => loadCargaNfs(carga.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-base">
                          {carga.placa}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {carga.motorista} •{" "}
                          {new Date(carga.data + "T00:00:00").toLocaleDateString(
                            "pt-BR"
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={isComplete ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {percent}%
                        </Badge>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    <Progress value={percent} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {carga.conferidosInterno}/{carga.totalEtiquetas} etiquetas
                    </p>
                  </button>

                  {/* Expanded NF list */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      {loadingNfs ? (
                        <div className="flex justify-center py-2">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        cargaNfs.map((nf) => {
                          const nfPct =
                            nf.total > 0
                              ? Math.round((nf.conferidas / nf.total) * 100)
                              : 0;
                          const nfComplete = nf.conferidas === nf.total;

                          return (
                            <button
                              key={nf.numeroNf}
                              className="w-full text-left p-2 rounded-lg hover:bg-accent transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                iniciarConferenciaNf(carga, nf);
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">
                                  NF {nf.numeroNf}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {nf.conferidas}/{nf.total}
                                  </span>
                                  {nfComplete ? (
                                    <CheckCircle2 className="w-4 h-4 text-success" />
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {nfPct}%
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
      <MobileBottomNav />
    </div>
  );
}
