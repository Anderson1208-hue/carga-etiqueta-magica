import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CameraScanner } from "@/components/conferencia/CameraScanner";
import { MobileLogoutButton } from "@/components/layout/MobileLogoutButton";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import {
  useOfflineConferencia,
  type OfflineEtiqueta,
} from "@/hooks/useOfflineConferencia";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Package,
  Loader2,
  Warehouse,
  ChevronLeft,
  Search,
  Ban,
  ShieldAlert,
  Download,
  Upload,
  Wifi,
  WifiOff,
  ChevronDown,
  ClipboardList,
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

interface NfListItem {
  numeroNf: string;
  cargaId: string;
  placa: string;
  motorista: string;
  total: number;
  conferidas: number;
}

interface ScanResult {
  type: "success" | "error" | "warning";
  message: string;
  details?: string;
}

export default function ConferenciaInterna() {
  const { user, isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const canDivergencia = isAdmin || !!(profile as any)?.pode_divergencia;

  // Offline
  const {
    isOnline,
    pendingSyncCount,
    downloadEtiquetas,
    getOfflineCargas,
    getOfflineEtiquetas,
    findEtiquetaByQr,
    saveScanOffline,
    getPendingScans,
    markScansAsSynced,
    hasOfflineData,
  } = useOfflineConferencia();
  const [offlineMode, setOfflineMode] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [hasLocalData, setHasLocalData] = useState(false);

  // Search
  const [searchNf, setSearchNf] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  // Scanning state
  const [selectedCarga, setSelectedCarga] = useState<CargaResumo | null>(null);
  const [selectedNf, setSelectedNf] = useState<string | null>(null);
  const [nfProgress, setNfProgress] = useState<NfProgress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [faltamAberto, setFaltamAberto] = useState(false);
  const [etiquetasFaltantes, setEtiquetasFaltantes] = useState<{id: string; x_prod: string; c_prod: string; seq: number; total: number}[]>([]);
  const [loadingFaltantes, setLoadingFaltantes] = useState(false);

  // Divergência management (admin only)
  const [showDivergencia, setShowDivergencia] = useState(false);
  const [pendingEtiquetas, setPendingEtiquetas] = useState<any[]>([]);
  const [selectedEtiquetaIds, setSelectedEtiquetaIds] = useState<Set<string>>(new Set());
  const [divergenciaMotivo, setDivergenciaMotivo] = useState("");
  const [loadingDivergencia, setLoadingDivergencia] = useState(false);
  const [submittingDivergencia, setSubmittingDivergencia] = useState(false);

  const MOTIVOS_DIVERGENCIA = [
    { value: "avaria", label: "Avaria" },
    { value: "falta", label: "Falta / Não localizado" },
    { value: "extravio", label: "Extravio" },
    { value: "erro_emissao", label: "Erro de emissão" },
    { value: "outros", label: "Outros" },
  ];

  useEffect(() => {
    hasOfflineData().then(setHasLocalData);
  }, []);

  // Search NF across all cargas
  async function buscarNfDireta() {
    const nf = searchNf.trim();
    if (!nf) return;
    setSearchLoading(true);
    try {
      const { data: etiquetas, error } = await supabase
        .from("etiquetas")
        .select("carga_id, status, numero_nf")
        .eq("numero_nf", nf);

      if (error) throw error;
      if (!etiquetas || etiquetas.length === 0) {
        toast({ title: "NF não encontrada", description: `NF ${nf} não existe em nenhuma carga acessível.`, variant: "destructive" });
        setSearchLoading(false);
        return;
      }

      const cargaId = etiquetas[0].carga_id;
      const divergencias = etiquetas.filter((e) => e.status === "divergencia").length;
      const total = etiquetas.length - divergencias;
      const conferidas = etiquetas.filter((e) => e.status === "conferido_interno" || e.status === "conferido").length;

      const { data: cargaData } = await supabase
        .from("cargas")
        .select("id, placa, motorista, data")
        .eq("id", cargaId)
        .maybeSingle();

      if (!cargaData) {
        toast({ title: "Carga não encontrada", variant: "destructive" });
        setSearchLoading(false);
        return;
      }

      const nfItem: NfListItem = {
        numeroNf: nf,
        cargaId: cargaData.id,
        placa: cargaData.placa,
        motorista: cargaData.motorista,
        total,
        conferidas,
      };
      iniciarConferenciaNf(nfItem);
    } catch (error) {
      console.error("Erro ao buscar NF:", error);
      toast({ title: "Erro ao buscar NF", variant: "destructive" });
    } finally {
      setSearchLoading(false);
    }
  }

  // ---- OFFLINE FUNCTIONS ----
  async function downloadAllForOffline() {
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const { data: cargasData, error } = await supabase
        .from("cargas")
        .select("id, placa, motorista, data")
        .in("status", ["aberta", "fechada"])
        .order("data", { ascending: false });

      if (error) throw error;
      if (!cargasData || cargasData.length === 0) {
        toast({ title: "Nenhuma carga para baixar", variant: "destructive" });
        setDownloading(false);
        return;
      }

      let totalEstimated = 0;
      for (const c of cargasData) {
        const { count } = await supabase
          .from("etiquetas")
          .select("id", { count: "exact", head: true })
          .eq("carga_id", c.id);
        totalEstimated += count || 0;
      }

      const cargaResumos = cargasData.map((c) => ({ id: c.id, placa: c.placa, motorista: c.motorista, data: c.data }));
      await downloadEtiquetas(cargaResumos, []);

      let totalDownloaded = 0;
      const PAGE_SIZE = 500;

      for (const cid of cargasData.map((c) => c.id)) {
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error: fetchError } = await supabase
            .from("etiquetas")
            .select("id, carga_id, nf_id, numero_nf, c_prod, x_prod, seq, total, qr_payload, status, divergencia_motivo")
            .eq("carga_id", cid)
            .order("id")
            .range(from, from + PAGE_SIZE - 1);
          if (fetchError) throw fetchError;
          if (data && data.length > 0) {
            await downloadEtiquetas([], data as unknown as OfflineEtiqueta[], true);
            totalDownloaded += data.length;
            setDownloadProgress(totalEstimated > 0 ? Math.min(99, Math.round((totalDownloaded / totalEstimated) * 100)) : 0);
          }
          hasMore = (data?.length ?? 0) === PAGE_SIZE;
          from += PAGE_SIZE;
          await new Promise((r) => setTimeout(r, 50));
        }
      }

      setDownloadProgress(100);
      setHasLocalData(true);
      toast({
        title: "Download concluído",
        description: `${totalDownloaded} etiquetas salvas para uso offline.`,
      });
    } catch (error) {
      console.error("Erro ao baixar dados offline:", error);
      toast({ title: "Erro ao baixar dados", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  // (offline NF search handled via buscarNfDireta with offline fallback below)

  async function syncPendingScans() {
    setSyncing(true);
    try {
      const pending = await getPendingScans();
      if (pending.length === 0) {
        toast({ title: "Nada para transmitir" });
        setSyncing(false);
        return;
      }

      let successCount = 0;
      const syncedIds: string[] = [];

      for (const scan of pending) {
        const { error } = await supabase
          .from("etiquetas")
          .update({
            status: "conferido_interno" as any,
            conferido_interno_em: scan.conferido_interno_em,
            conferido_interno_por: scan.conferido_interno_por,
          })
          .eq("id", scan.etiqueta_id);

        if (!error) {
          successCount++;
          syncedIds.push(scan.id);
        }
      }

      if (syncedIds.length > 0) {
        await markScansAsSynced(syncedIds);
      }

      toast({
        title: "Transmissão concluída",
        description: `${successCount} de ${pending.length} conferência(s) sincronizada(s).`,
      });
    } catch (error) {
      console.error("Erro na sincronização:", error);
      toast({ title: "Erro na transmissão", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  function iniciarConferenciaNf(nfItem: NfListItem) {
    const carga: CargaResumo = {
      id: nfItem.cargaId,
      placa: nfItem.placa,
      motorista: nfItem.motorista,
      data: "",
      totalEtiquetas: nfItem.total,
      conferidosInterno: nfItem.conferidas,
    };
    setSelectedCarga(carga);
    setSelectedNf(nfItem.numeroNf);
    setNfProgress({ numeroNf: nfItem.numeroNf, total: nfItem.total, conferidas: nfItem.conferidas });
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
  }

  async function processScan(qrData: string) {
    if (!qrData.trim() || !selectedCarga || !selectedNf) return;

    setScanning(true);
    setLastResult(null);

    try {
      const parts = qrData.trim().split(";");

      if (parts.length < 6) {
        const result: ScanResult = { type: "error", message: "QR Code inválido", details: "Formato não reconhecido" };
        setLastResult(result); addToHistory(result); playSound("error"); return;
      }

      const [qrCargaId, numeroNf, cProd, seqStr, totalStr] = parts;

      // Validate carga
      if (qrCargaId !== selectedCarga.id) {
        const result: ScanResult = { type: "warning", message: "Etiqueta de outra carga", details: "Esta etiqueta pertence a outra carga" };
        setLastResult(result); addToHistory(result); playSound("warning"); return;
      }

      // Validate NF
      if (numeroNf !== selectedNf) {
        const result: ScanResult = { type: "warning", message: "Etiqueta de outra NF", details: `Esta etiqueta é da NF ${numeroNf}. Selecione a NF correta.` };
        setLastResult(result); addToHistory(result); playSound("warning"); return;
      }

      if (offlineMode || !isOnline) {
        const etiqueta = await findEtiquetaByQr(qrData.trim());
        if (!etiqueta) {
          const result: ScanResult = { type: "error", message: "Etiqueta não encontrada (offline)", details: `NF ${numeroNf} - Cód ${cProd} - Caixa ${seqStr}/${totalStr}` };
          setLastResult(result); addToHistory(result); playSound("error"); return;
        }
        if (etiqueta.status === "divergencia") {
          const result: ScanResult = { type: "error", message: "Etiqueta bloqueada (Divergência)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
          setLastResult(result); addToHistory(result); playSound("error"); return;
        }
        if (etiqueta.status === "conferido_interno" || etiqueta.status === "conferido") {
          const result: ScanResult = { type: "warning", message: "Já conferida (interno)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - Caixa ${seqStr}/${totalStr}` };
          setLastResult(result); addToHistory(result); playSound("warning"); return;
        }
        await saveScanOffline({
          etiqueta_id: etiqueta.id,
          carga_id: etiqueta.carga_id,
          numero_nf: etiqueta.numero_nf,
          conferido_interno_por: user?.id || "",
          conferido_interno_em: new Date().toISOString(),
        });
        const result: ScanResult = { type: "success", message: "Conf. Interna ✓ (offline)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
        setLastResult(result); addToHistory(result); playSound("success");
        await reloadNfProgress();
      } else {
        const { data: etiqueta, error: findError } = await supabase
          .from("etiquetas")
          .select("*")
          .eq("carga_id", selectedCarga.id)
          .eq("qr_payload", qrData.trim())
          .maybeSingle();

        if (findError || !etiqueta) {
          const result: ScanResult = { type: "error", message: "Etiqueta não encontrada", details: `NF ${numeroNf} - Cód ${cProd} - Caixa ${seqStr}/${totalStr}` };
          setLastResult(result); addToHistory(result); playSound("error"); return;
        }
        if (etiqueta.status === "divergencia") {
          const result: ScanResult = { type: "error", message: "Etiqueta bloqueada (Divergência)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
          setLastResult(result); addToHistory(result); playSound("error"); return;
        }
        if (etiqueta.status === "conferido_interno" || etiqueta.status === "conferido") {
          const result: ScanResult = { type: "warning", message: "Já conferida (interno)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - Caixa ${seqStr}/${totalStr}` };
          setLastResult(result); addToHistory(result); playSound("warning"); return;
        }

        const { error: updateError } = await supabase
          .from("etiquetas")
          .update({
            status: "conferido_interno" as any,
            conferido_interno_em: new Date().toISOString(),
            conferido_interno_por: user?.id,
          })
          .eq("id", etiqueta.id);

        if (updateError) throw updateError;

        const result: ScanResult = { type: "success", message: "Conf. Interna ✓", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
        setLastResult(result); addToHistory(result); playSound("success");
        await reloadNfProgress();
      }
    } catch (error) {
      console.error("Erro ao processar scan:", error);
      const result: ScanResult = { type: "error", message: "Erro ao processar", details: "Tente novamente" };
      setLastResult(result); addToHistory(result); playSound("error");
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

    try {
      let all: { id: string; status: string }[] = [];

      if (offlineMode || !isOnline) {
        const ets = await getOfflineEtiquetas(selectedCarga.id);
        all = ets.filter((e) => e.numero_nf === selectedNf).map((e) => ({ id: e.id, status: e.status }));
      } else {
        const { data: etiquetasData } = await supabase
          .from("etiquetas")
          .select("id, status")
          .eq("carga_id", selectedCarga.id)
          .eq("numero_nf", selectedNf);
        all = etiquetasData || [];
      }

      const divergencias = all.filter((e) => e.status === "divergencia").length;
      const total = all.length - divergencias;
      const conferidas = all.filter(
        (e) => e.status === "conferido_interno" || e.status === "conferido"
      ).length;

      setNfProgress({ numeroNf: selectedNf, total, conferidas });

      if (conferidas === total && total > 0) {
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
    } catch (error) {
      console.error("[ConferenciaInterna] Erro ao recarregar progresso:", error);
    }
    // Refresh faltantes list if open
    if (faltamAberto) {
      loadEtiquetasFaltantes();
    }
  }

  async function loadEtiquetasFaltantes() {
    if (!selectedCarga || !selectedNf) return;
    setLoadingFaltantes(true);
    try {
      if (offlineMode || !isOnline) {
        const ets = await getOfflineEtiquetas(selectedCarga.id);
        const faltantes = ets
          .filter((e) => e.numero_nf === selectedNf && e.status === "pendente")
          .map((e) => ({ id: e.id, x_prod: e.x_prod, c_prod: e.c_prod, seq: e.seq, total: e.total }));
        setEtiquetasFaltantes(faltantes);
      } else {
        const { data, error } = await supabase
          .from("etiquetas")
          .select("id, x_prod, c_prod, seq, total")
          .eq("carga_id", selectedCarga.id)
          .eq("numero_nf", selectedNf)
          .eq("status", "pendente")
          .order("c_prod")
          .order("seq");
        if (error) throw error;
        setEtiquetasFaltantes(data || []);
      }
    } catch (error) {
      console.error("Erro ao carregar faltantes:", error);
    } finally {
      setLoadingFaltantes(false);
    }
  }

  // ---- DIVERGÊNCIA MANAGEMENT (Admin only) ----
  async function loadPendingEtiquetas() {
    if (!selectedCarga || !selectedNf) return;
    setLoadingDivergencia(true);
    try {
      const { data, error } = await supabase
        .from("etiquetas")
        .select("id, c_prod, x_prod, seq, total, status, divergencia_motivo")
        .eq("carga_id", selectedCarga.id)
        .eq("numero_nf", selectedNf)
        .order("seq", { ascending: true });

      if (error) throw error;
      setPendingEtiquetas(data || []);
      setSelectedEtiquetaIds(new Set());
      setDivergenciaMotivo("");
      setShowDivergencia(true);
    } catch (error) {
      console.error("Erro ao carregar etiquetas:", error);
      toast({ title: "Erro ao carregar etiquetas", variant: "destructive" });
    } finally {
      setLoadingDivergencia(false);
    }
  }

  async function marcarDivergencia() {
    if (selectedEtiquetaIds.size === 0 || !divergenciaMotivo) {
      toast({ title: "Atenção", description: "Selecione as etiquetas e informe o motivo.", variant: "destructive" });
      return;
    }
    setSubmittingDivergencia(true);
    try {
      const ids = Array.from(selectedEtiquetaIds);
      const { error } = await supabase
        .from("etiquetas")
        .update({
          status: "divergencia" as any,
          divergencia_motivo: divergenciaMotivo,
          divergencia_por: user?.id,
          divergencia_em: new Date().toISOString(),
        } as any)
        .in("id", ids);

      if (error) throw error;
      toast({ title: "Divergência registrada", description: `${ids.length} etiqueta(s) bloqueada(s).` });
      setShowDivergencia(false);
      await reloadNfProgress();
      await loadPendingEtiquetas();
    } catch (error) {
      console.error("Erro ao registrar divergência:", error);
      toast({ title: "Erro ao registrar divergência", variant: "destructive" });
    } finally {
      setSubmittingDivergencia(false);
    }
  }

  async function reverterDivergencia(etiquetaId: string) {
    try {
      const { error } = await supabase
        .from("etiquetas")
        .update({ status: "pendente" as any, divergencia_motivo: null, divergencia_por: null, divergencia_em: null } as any)
        .eq("id", etiquetaId);
      if (error) throw error;
      toast({ title: "Divergência revertida" });
      await reloadNfProgress();
      await loadPendingEtiquetas();
    } catch (error) {
      console.error("Erro ao reverter divergência:", error);
      toast({ title: "Erro ao reverter", variant: "destructive" });
    }
  }

  function toggleEtiquetaSelection(id: string) {
    setSelectedEtiquetaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
              <Button variant="ghost" size="icon" className="text-sidebar-foreground h-8 w-8" onClick={voltarParaLista}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold">NF {selectedNf}</h1>
                <p className="text-xs opacity-70">
                  {selectedCarga.placa} • Conf. Interna
                  {(offlineMode || !isOnline) && " (Offline)"}
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
                  <span className="text-muted-foreground">{nfProgress.conferidas} de {nfProgress.total} etiquetas</span>
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
                  onKeyDown={(e) => { if (e.key === "Enter") handleManualScan(); }}
                  className="flex-1 font-mono text-sm"
                  disabled={scanning}
                />
                <Button onClick={handleManualScan} disabled={scanning || !qrInput} size="sm">
                  {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
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
              {lastResult.type === "success" ? <CheckCircle2 className="w-6 h-6 shrink-0" /> : <AlertCircle className="w-6 h-6 shrink-0" />}
              <div>
                <p className="font-bold text-lg">{lastResult.message}</p>
                {lastResult.details && <p className="text-sm opacity-80">{lastResult.details}</p>}
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
                        item.type === "success" ? "bg-success/10 text-success"
                        : item.type === "warning" ? "bg-warning/10 text-warning"
                        : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {item.type === "success" ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      <span className="font-medium">{item.message}</span>
                      {item.details && <span className="opacity-70 truncate">- {item.details}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Etiquetas Faltantes */}
          {nfProgress.conferidas < nfProgress.total && (
            <Collapsible open={faltamAberto} onOpenChange={(open) => {
              setFaltamAberto(open);
              if (open) loadEtiquetasFaltantes();
            }}>
              <Card className="border-warning/50">
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2 text-warning">
                        <ClipboardList className="w-4 h-4" />
                        <span>Faltam conferir ({nfProgress.total - nfProgress.conferidas})</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${faltamAberto ? "rotate-180" : ""}`} />
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {loadingFaltantes ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : etiquetasFaltantes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">Todas conferidas!</p>
                    ) : (
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {etiquetasFaltantes.map((et) => (
                          <div key={et.id} className="flex items-center gap-2 p-2 rounded bg-warning/10 text-sm">
                            <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{et.x_prod}</div>
                              <div className="text-xs text-muted-foreground">Cód: {et.c_prod}</div>
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0 border-warning/50 text-warning">
                              CX {et.seq}/{et.total}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Divergência Management - Admin Only */}
          {canDivergencia && !showDivergencia && (
            <Button
              variant="outline"
              className="w-full border-destructive text-destructive hover:bg-destructive/10"
              onClick={loadPendingEtiquetas}
              disabled={loadingDivergencia}
            >
              {loadingDivergencia ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldAlert className="w-4 h-4 mr-2" />}
              Registrar Divergência
            </Button>
          )}

          {canDivergencia && showDivergencia && (
            <Card className="border-destructive">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2 text-destructive">
                    <Ban className="w-4 h-4" />
                    Bloquear Etiquetas
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowDivergencia(false)}>Cancelar</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Motivo</label>
                  <Select value={divergenciaMotivo} onValueChange={setDivergenciaMotivo}>
                    <SelectTrigger><SelectValue placeholder="Selecione o motivo..." /></SelectTrigger>
                    <SelectContent>
                      {MOTIVOS_DIVERGENCIA.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1">
                  {pendingEtiquetas.map((et) => {
                    const isDivergencia = et.status === "divergencia";
                    const isConferido = et.status === "conferido_interno" || et.status === "conferido";
                    return (
                      <div
                        key={et.id}
                        className={`flex items-center gap-2 p-2 rounded text-sm ${
                          isDivergencia ? "bg-destructive/10 opacity-80" : isConferido ? "bg-success/10 opacity-60" : "bg-muted/50"
                        }`}
                      >
                        {isDivergencia ? (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={() => reverterDivergencia(et.id)}>Reverter</Button>
                        ) : !isConferido ? (
                          <Checkbox checked={selectedEtiquetaIds.has(et.id)} onCheckedChange={() => toggleEtiquetaSelection(et.id)} />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        )}
                        <span className="flex-1 truncate">{et.c_prod} — {et.x_prod} — CX {et.seq}/{et.total}</span>
                        {isDivergencia && <Badge variant="destructive" className="text-xs">{et.divergencia_motivo}</Badge>}
                      </div>
                    );
                  })}
                </div>

                {pendingEtiquetas.some((e) => e.status === "pendente") && (
                  <Button
                    className="w-full"
                    variant="destructive"
                    disabled={selectedEtiquetaIds.size === 0 || !divergenciaMotivo || submittingDivergencia}
                    onClick={marcarDivergencia}
                  >
                    {submittingDivergencia ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Ban className="w-4 h-4 mr-2" />}
                    Bloquear {selectedEtiquetaIds.size} etiqueta(s)
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  // ---- LIST VIEW (search only) ----
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Warehouse className="w-5 h-5" />
            <h1 className="text-lg font-semibold">Conf. Interna</h1>
            <Badge variant={isOnline ? "default" : "destructive"} className="text-xs">
              {isOnline ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
              {isOnline ? "Online" : "Offline"}
            </Badge>
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
                onKeyDown={(e) => { if (e.key === "Enter") buscarNfDireta(); }}
                className="flex-1 text-lg"
                inputMode="numeric"
              />
              <Button onClick={buscarNfDireta} disabled={searchLoading || !searchNf.trim()}>
                {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Offline Controls */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Modo Offline</span>
              </div>
              <Switch
                checked={offlineMode}
                onCheckedChange={setOfflineMode}
                disabled={!hasLocalData && !offlineMode}
              />
            </div>

            {isOnline && !offlineMode && (
              <Button onClick={downloadAllForOffline} disabled={downloading} variant="outline" className="w-full" size="sm">
                {downloading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Baixando... {downloadProgress}%</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" />Baixar dados para offline</>
                )}
              </Button>
            )}

            {!hasLocalData && !offlineMode && (
              <p className="text-xs text-muted-foreground">
                Baixe os dados antes de entrar na câmara refrigerada.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Sync Banner */}
        {isOnline && pendingSyncCount > 0 && !offlineMode && (
          <div className="bg-warning/20 border-2 border-warning rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-warning text-sm">{pendingSyncCount} conferência(s) pendente(s)</p>
                <p className="text-xs text-muted-foreground">Registradas offline, prontas para transmitir.</p>
              </div>
              <Button size="sm" onClick={syncPendingScans} disabled={syncing} className="bg-warning text-warning-foreground hover:bg-warning/90">
                {syncing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                Transmitir
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Digite o número da NF acima para iniciar a conferência.</p>
          </CardContent>
        </Card>
      </div>
      <MobileBottomNav />
    </div>
  );
}
