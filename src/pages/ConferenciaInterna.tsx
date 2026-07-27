import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLockPortrait } from "@/hooks/useLockPortrait";
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

  // Trava retrato no APK (tela operacional do galpão).
  useLockPortrait();

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
  const [cameraAtiva, setCameraAtiva] = useState(false);
  // Teclado do Android (IME) desligado por padrão: com leitor USB/Bluetooth o
  // Gboard tenta "compor" e sugerir cada caractere do QR (60+ chars), o que
  // engasga a bipagem em aparelhos fracos. inputMode="none" mantém o leitor
  // funcionando e elimina o IME. Ligue só para digitar à mão.
  const [tecladoManual, setTecladoManual] = useState(false);
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

  // Dupla checagem (bipe do cliente + bipe do nosso QR)
  const [duplaChecagem, setDuplaChecagem] = useState(false);
  const [codigoCliente, setCodigoCliente] = useState("");
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const codigoClienteRef = useRef("");
  const qrInputRef = useRef("");
  const collectorBufferRef = useRef("");
  const collectorStageRef = useRef<"cliente" | "qr">("cliente");
  const [collectorStage, setCollectorStage] = useState<"cliente" | "qr">("cliente");
  const processingScanRef = useRef(false);
  const pendingOnlineScansRef = useRef<Set<string>>(new Set());
  const reloadProgressTimerRef = useRef<number | null>(null);


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

  useEffect(() => {
    return () => {
      if (reloadProgressTimerRef.current) {
        window.clearTimeout(reloadProgressTimerRef.current);
      }
    };
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
    collectorBufferRef.current = "";
    collectorStageRef.current = duplaChecagem ? "cliente" : "qr";
    setCollectorStage(duplaChecagem ? "cliente" : "qr");
  }

  function voltarParaLista() {
    setSelectedCarga(null);
    setSelectedNf(null);
    setNfProgress(null);
    setLastResult(null);
    setScanHistory([]);
    qrInputRef.current = "";
    codigoClienteRef.current = "";
    collectorBufferRef.current = "";
    collectorStageRef.current = duplaChecagem ? "cliente" : "qr";
    setCollectorStage(duplaChecagem ? "cliente" : "qr");
    setQrInput("");
  }

  function focusClienteProximaLeitura() {
    if (!tecladoManual) {
      collectorBufferRef.current = "";
      collectorStageRef.current = duplaChecagem ? "cliente" : "qr";
      setCollectorStage(duplaChecagem ? "cliente" : "qr");
      clienteInputRef.current?.blur();
      inputRef.current?.blur();
      return;
    }

    const applyFocus = () => {
      const target = duplaChecagem ? clienteInputRef.current : inputRef.current;
      if (!target) return;
      target.focus({ preventScroll: true });
      target.select();
    };

    requestAnimationFrame(applyFocus);
    window.setTimeout(applyFocus, 80);
    window.setTimeout(applyFocus, 250);
  }

  function focusNossaEtiqueta() {
    if (!tecladoManual) {
      collectorBufferRef.current = "";
      collectorStageRef.current = "qr";
      setCollectorStage("qr");
      clienteInputRef.current?.blur();
      inputRef.current?.blur();
      return;
    }

    const applyFocus = () => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    };

    requestAnimationFrame(applyFocus);
    window.setTimeout(applyFocus, 60);
  }

  function scheduleReloadNfProgress() {
    if (reloadProgressTimerRef.current) {
      window.clearTimeout(reloadProgressTimerRef.current);
    }
    reloadProgressTimerRef.current = window.setTimeout(() => {
      reloadProgressTimerRef.current = null;
      void reloadNfProgress();
    }, 350);
  }

  // Atualiza o contador na hora (sem esperar o servidor) — o reload confirma depois
  function bumpProgressOtimista() {
    setNfProgress((prev) =>
      prev ? { ...prev, conferidas: Math.min(prev.conferidas + 1, prev.total) } : prev
    );
  }

  async function processScan(qrData: string, codigoClienteAtual?: string) {

    if (processingScanRef.current || !qrData.trim() || !selectedCarga || !selectedNf) return;

    processingScanRef.current = true;
    setScanning(true);
    setLastResult(null);
    let releasedForNextScan = false;

    const releaseForNextScan = () => {
      if (releasedForNextScan) return;
      releasedForNextScan = true;
      qrInputRef.current = "";
      codigoClienteRef.current = "";
      if (inputRef.current) inputRef.current.value = "";
      if (clienteInputRef.current) clienteInputRef.current.value = "";
      setQrInput("");
      if (duplaChecagem) setCodigoCliente("");
      collectorBufferRef.current = "";
      collectorStageRef.current = duplaChecagem ? "cliente" : "qr";
      setCollectorStage(duplaChecagem ? "cliente" : "qr");
      setScanning(false);
      processingScanRef.current = false;
      focusClienteProximaLeitura();
    };

    try {
      const qrPayload = qrData.trim();
      const parts = qrPayload.split(";");

      if (parts.length < 6) {
        const result: ScanResult = { type: "error", message: "QR Code inválido", details: "Formato não reconhecido" };
        setLastResult(result); addToHistory(result); playSound("error"); return;
      }

      const [qrCargaId, numeroNf, cProd, seqStr, totalStr] = parts;

      // Dupla checagem: exige código do cliente bipado antes e confere com cProd
      if (duplaChecagem) {
        const cliente = (codigoClienteAtual || codigoClienteRef.current || codigoCliente).trim();
        if (!cliente) {
          const result: ScanResult = {
            type: "warning",
            message: "Bipe o código do cliente primeiro",
            details: "Modo Dupla Checagem ativo",
          };
          setLastResult(result); addToHistory(result); playSound("warning");
          setTimeout(() => clienteInputRef.current?.focus(), 50);
          return;
        }
        const clienteNorm = cliente.replace(/^0+/, "");
        const nossoNorm = (cProd || "").replace(/^0+/, "");
        // Match direto pelo cProd (ou cProd contido no EAN-13, cobre GTIN que embute o código)
        const match =
          clienteNorm === nossoNorm ||
          (clienteNorm.length >= 12 && clienteNorm.includes(nossoNorm) && nossoNorm.length >= 4);
        if (!match) {
          const result: ScanResult = {
            type: "error",
            message: "DIVERGÊNCIA — códigos não batem",
            details: `Cliente: ${cliente}  ≠  Nosso cProd: ${nossoNorm}`,
          };
          setLastResult(result); addToHistory(result); playSound("error");
          setCodigoCliente("");
          setTimeout(() => clienteInputRef.current?.focus(), 50);
          return;
        }
      }


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
        bumpProgressOtimista();
        void reloadNfProgress();
      } else {
        if (pendingOnlineScansRef.current.has(qrPayload)) {
          const result: ScanResult = { type: "warning", message: "Etiqueta em gravação", details: `NF ${numeroNf} - Caixa ${seqStr}/${totalStr}` };
          setLastResult(result); addToHistory(result); playSound("warning"); return;
        }

        pendingOnlineScansRef.current.add(qrPayload);
        const cargaId = selectedCarga.id;
        const nfAtual = selectedNf;
        const usuarioId = user?.id;

        // No coletor/Chrome lento, não segura o próximo bipe esperando a rede/banco.
        // As validações locais já passaram; a gravação confirma em segundo plano.
        releaseForNextScan();

        // Caminho rápido em background: 1 único round-trip. Atualiza direto se estiver pendente.
        void (async () => {
          try {
            const { data: updated, error: updateError } = await supabase
              .from("etiquetas")
              .update({
                status: "conferido_interno" as any,
                conferido_interno_em: new Date().toISOString(),
                conferido_interno_por: usuarioId,
              })
              .eq("carga_id", cargaId)
              .eq("qr_payload", qrPayload)
              .eq("status", "pendente")
              .select("id, x_prod")
              .maybeSingle();

            if (updateError) throw updateError;

            if (updated) {
              const result: ScanResult = { type: "success", message: "Conf. Interna ✓", details: `NF ${numeroNf} - ${updated.x_prod} - CX ${seqStr}/${totalStr}` };
              setLastResult(result); addToHistory(result); playSound("success");
              bumpProgressOtimista();
              scheduleReloadNfProgress();
            } else {
              // Caminho raro: descobre o motivo (não existe / divergência / já conferida)
              const { data: etiqueta } = await supabase
                .from("etiquetas")
                .select("status, x_prod")
                .eq("carga_id", cargaId)
                .eq("qr_payload", qrPayload)
                .maybeSingle();

              if (!etiqueta) {
                const result: ScanResult = { type: "error", message: "Etiqueta não encontrada", details: `NF ${numeroNf} - Cód ${cProd} - Caixa ${seqStr}/${totalStr}` };
                setLastResult(result); addToHistory(result); playSound("error"); return;
              }
              if (etiqueta.status === "divergencia") {
                const result: ScanResult = { type: "error", message: "Etiqueta bloqueada (Divergência)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
                setLastResult(result); addToHistory(result); playSound("error"); return;
              }
              const result: ScanResult = { type: "warning", message: "Já conferida (interno)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
              setLastResult(result); addToHistory(result); playSound("warning");
              scheduleReloadNfProgress();
            }
          } catch (error) {
            console.error("Erro ao gravar scan interno:", error);
            const result: ScanResult = { type: "error", message: "Erro ao gravar", details: `NF ${nfAtual} - Caixa ${seqStr}/${totalStr}` };
            setLastResult(result); addToHistory(result); playSound("error");
          } finally {
            pendingOnlineScansRef.current.delete(qrPayload);
          }
        })();

        return;
      }

    } catch (error) {
      console.error("Erro ao processar scan:", error);
      const result: ScanResult = { type: "error", message: "Erro ao processar", details: "Tente novamente" };
      setLastResult(result); addToHistory(result); playSound("error");
    } finally {
      if (!releasedForNextScan) {
        setQrInput("");
        if (duplaChecagem) setCodigoCliente("");
        setScanning(false);
        processingScanRef.current = false;
      }
    }
  }

  useEffect(() => {
    if (tecladoManual || !selectedCarga || !selectedNf || !nfProgress) return;

    const writeCollectorValue = () => {
      const target = duplaChecagem && collectorStageRef.current === "cliente" ? clienteInputRef.current : inputRef.current;
      if (target) target.value = collectorBufferRef.current;
    };

    const handleCollectorKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;

      const key = event.key;
      const isScanChar = key.length === 1;
      const isControl = key === "Enter" || key === "Tab" || key === "Backspace" || key === "Escape";
      if (!isScanChar && !isControl) return;

      event.preventDefault();
      event.stopPropagation();

      if (key === "Escape") {
        collectorBufferRef.current = "";
        writeCollectorValue();
        return;
      }

      if (key === "Backspace") {
        collectorBufferRef.current = collectorBufferRef.current.slice(0, -1);
        writeCollectorValue();
        return;
      }

      if (key === "Enter" || key === "Tab") {
        const value = collectorBufferRef.current.trim();
        collectorBufferRef.current = "";
        writeCollectorValue();
        if (!value) return;

        if (duplaChecagem && collectorStageRef.current === "cliente") {
          codigoClienteRef.current = value;
          setCodigoCliente(value);
          if (clienteInputRef.current) clienteInputRef.current.value = value;
          collectorStageRef.current = "qr";
          setCollectorStage("qr");
          if (inputRef.current) inputRef.current.value = "";
          qrInputRef.current = "";
          return;
        }

        qrInputRef.current = value;
        void processScan(value, duplaChecagem ? codigoClienteRef.current : "");
        return;
      }

      collectorBufferRef.current += key;
      writeCollectorValue();
    };

    collectorBufferRef.current = "";
    collectorStageRef.current = duplaChecagem ? "cliente" : "qr";
    setCollectorStage(duplaChecagem ? "cliente" : "qr");
    clienteInputRef.current?.blur();
    inputRef.current?.blur();

    window.addEventListener("keydown", handleCollectorKeyDown, true);
    return () => window.removeEventListener("keydown", handleCollectorKeyDown, true);
  }, [tecladoManual, selectedCarga, selectedNf, nfProgress, duplaChecagem]);

  function addToHistory(result: ScanResult) {
    setScanHistory((prev) => [result, ...prev].slice(0, 10));
  }

  function playSound(type: "success" | "error" | "warning") {
    // Som próprio (não depende da câmera estar ligada)
    try {
      const w = window as any;
      if (!w.__conferenciaAudioCtx) {
        w.__conferenciaAudioCtx = new (window.AudioContext || w.webkitAudioContext)();
      }
      const ctx: AudioContext = w.__conferenciaAudioCtx;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "success") {
        osc.type = "sine";
        osc.frequency.value = 880;
      } else if (type === "error") {
        osc.type = "square";
        osc.frequency.value = 200;
      } else {
        osc.type = "triangle";
        osc.frequency.value = 440;
      }
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + (type === "success" ? 0.12 : 0.25));
    } catch {}
    // Vibração como reforço no celular
    try {
      if (navigator.vibrate) navigator.vibrate(type === "success" ? 60 : [80, 60, 80]);
    } catch {}
  }


  async function handleManualScan(value?: string) {
    const scanValue = value || qrInputRef.current || inputRef.current?.value || qrInput;
    if (processingScanRef.current || !scanValue.trim()) return;
    await processScan(scanValue, codigoClienteRef.current || clienteInputRef.current?.value || codigoCliente);
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
            message: `✅ ETAPA 1/2 concluída — NF ${selectedNf}`,
            details: `${total} etiquetas separadas. Ainda falta a ETAPA 2 (Expedição, só QR).`,
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
                  {selectedCarga.placa} • Conf. Interna • v2026.07.27e
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
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ScanLine className="w-4 h-4" />
                  Scanner de Câmera
                </CardTitle>
                <div className="flex items-center gap-2">
                  <label htmlFor="camera-ativa" className="text-xs text-muted-foreground cursor-pointer select-none">
                    Câmera
                  </label>
                  <Switch id="camera-ativa" checked={cameraAtiva} onCheckedChange={setCameraAtiva} />
                </div>
              </div>
              {!cameraAtiva && (
                <p className="text-xs text-muted-foreground mt-1">
                  Câmera desligada (recomendado com leitor USB/Bluetooth — deixa a bipagem bem mais rápida em aparelhos fracos).
                </p>
              )}
            </CardHeader>
            {cameraAtiva && (
              <CardContent>
                <CameraScanner onScan={processScan} enabled={true} />
              </CardContent>
            )}
          </Card>


          {/* Manual Input + Dupla Checagem */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Entrada Manual / USB</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="teclado-manual" className="text-xs text-muted-foreground cursor-pointer select-none">
                      Teclado
                    </label>
                    <Switch
                      id="teclado-manual"
                      checked={tecladoManual}
                      onCheckedChange={(v) => {
                        setTecladoManual(v);
                        collectorBufferRef.current = "";
                        collectorStageRef.current = duplaChecagem ? "cliente" : "qr";
                        setCollectorStage(duplaChecagem ? "cliente" : "qr");
                        setTimeout(() => {
                          if (v) {
                            (duplaChecagem ? clienteInputRef : inputRef).current?.focus();
                          } else {
                            clienteInputRef.current?.blur();
                            inputRef.current?.blur();
                          }
                        }, 50);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="dupla-check" className="text-xs text-muted-foreground cursor-pointer select-none">
                      Dupla Checagem
                    </label>
                    <Switch
                      id="dupla-check"
                      checked={duplaChecagem}
                      onCheckedChange={(v) => {
                        setDuplaChecagem(v);
                        codigoClienteRef.current = "";
                        qrInputRef.current = "";
                        setCodigoCliente("");
                        setQrInput("");
                        collectorBufferRef.current = "";
                        collectorStageRef.current = v ? "cliente" : "qr";
                        setCollectorStage(v ? "cliente" : "qr");
                        setTimeout(() => {
                          if (tecladoManual) {
                            (v ? clienteInputRef : inputRef).current?.focus();
                          } else {
                            clienteInputRef.current?.blur();
                            inputRef.current?.blur();
                          }
                        }, 50);
                      }}
                    />
                  </div>
                </div>
              </div>
              {duplaChecagem && (
                <p className="text-xs text-muted-foreground mt-1">
                  1) Bipe o código do cliente na caixa &nbsp;→&nbsp; 2) Bipe a nossa etiqueta (QR). Sistema bloqueia se não bater.
                </p>
              )}
              {!tecladoManual && (
                <p className="text-xs text-muted-foreground mt-1">
                  Modo coletor ativo: teclado do celular fechado, aguardando {duplaChecagem && collectorStage === "cliente" ? "código do cliente" : "nossa etiqueta QR"}.
                </p>
              )}
            </CardHeader>

            <CardContent className="space-y-2">
              {duplaChecagem && (
                <div>
                  <label className="text-xs font-medium mb-1 block text-primary">
                    1) Código do cliente (SKU / EAN)
                  </label>
                  <Input
                    ref={clienteInputRef}
                    placeholder="Bipe o código de barras do cliente..."
                    defaultValue=""
                    onChange={(e) => {
                      codigoClienteRef.current = e.target.value;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        codigoClienteRef.current = e.currentTarget.value;
                        focusNossaEtiqueta();
                      }
                    }}
                    className="flex-1 font-mono text-sm"
                    inputMode={tecladoManual ? "text" : "none"}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    readOnly={scanning || !tecladoManual}
                    tabIndex={tecladoManual ? 0 : -1}
                    autoFocus
                  />
                </div>
              )}
              <div>
                {duplaChecagem && (
                  <label className="text-xs font-medium mb-1 block text-primary">
                    2) Nossa etiqueta (QR)
                  </label>
                )}
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    placeholder={duplaChecagem ? "Bipe o QR da nossa etiqueta..." : "Escaneie ou digite..."}
                    defaultValue=""
                    onChange={(e) => {
                      qrInputRef.current = e.target.value;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        qrInputRef.current = e.currentTarget.value;
                        handleManualScan(e.currentTarget.value);
                      }
                    }}
                    className="flex-1 font-mono text-sm"
                    inputMode={tecladoManual ? "text" : "none"}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    readOnly={scanning || !tecladoManual}
                    tabIndex={tecladoManual ? 0 : -1}
                  />
                  <Button
                    onClick={() => handleManualScan()}
                    disabled={scanning}
                    size="sm"
                  >
                    {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
                  </Button>
                </div>
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
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">Cód: {et.c_prod.replace(/^0+/, "")} — {et.x_prod}</div>
                          <div className="text-xs text-muted-foreground">CX {et.seq}/{et.total}</div>
                        </div>
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
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
              v2026.07.27e
            </span>
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
