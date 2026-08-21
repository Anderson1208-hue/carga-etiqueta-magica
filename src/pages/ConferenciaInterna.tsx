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
  Eraser,
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
  codigo?: string;
  caixa?: string;
  pendencia?: string;
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
  // Etapa da conferência interna: 1 = Separação (dupla bipagem) | 2 = Expedição/carregamento (só QR)
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [selectedNf, setSelectedNf] = useState<string | null>(null);
  const [limpando, setLimpando] = useState(false);
  const podeLimparNf =
    isAdmin || profile?.email?.toLowerCase() === "gessica.rodrigues@tlmlogistica.com.br";

  const [nfProgress, setNfProgress] = useState<NfProgress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  // Último erro/aviso fica FIXO na tela até o próximo erro (ou até limpar),
  // para o operador não perder qual caixa falhou quando bipa rápido.
  const [lastError, setLastError] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);

  const [faltamAberto, setFaltamAberto] = useState(false);
  const [etiquetasFaltantes, setEtiquetasFaltantes] = useState<{id: string; x_prod: string; c_prod: string; seq: number; total: number}[]>([]);
  const [loadingFaltantes, setLoadingFaltantes] = useState(false);

  // Dupla checagem (bipe do cliente + bipe do nosso QR)
  const [duplaChecagem, setDuplaChecagem] = useState(false);
  // Dupla bipagem é regra de negócio exclusiva da IBAC (única com etiqueta QR
  // pareada por caixa). null = emitente ainda desconhecido (ex.: offline).
  const CNPJ_IBAC = "61472205000407";
  const [nfEhIbac, setNfEhIbac] = useState<boolean | null>(null);
  const [codigoCliente, setCodigoCliente] = useState("");
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const codigoClienteRef = useRef("");
  const qrInputRef = useRef("");
  const collectorBufferRef = useRef("");
  // Segmentos de um QR quebrado pelo leitor (";" enviado como Tab/Enter)
  const qrSegmentsRef = useRef<string[]>([]);
  const collectorStageRef = useRef<"cliente" | "qr">("cliente");
  const [collectorStage, setCollectorStage] = useState<"cliente" | "qr">("cliente");
  const processingScanRef = useRef(false);
  const pendingOnlineScansRef = useRef<Set<string>>(new Set());
  const reloadProgressTimerRef = useRef<number | null>(null);
  const manualInputIdleTimerRef = useRef<number | null>(null);

  // ---- Cache local da NF em conferência (validação 0ms, sem round-trip) ----
  type EtiquetaCache = { id: string; status: string; x_prod: string; c_prod: string };
  const nfCacheRef = useRef<Map<string, EtiquetaCache>>(new Map());
  const nfCprodsRef = useRef<Set<string>>(new Set());
  const cacheReadyRef = useRef(false);
  const setCacheReady = (v: boolean) => { cacheReadyRef.current = v; };

  // ---- Fila de gravação em lote (1 request para N bipes) ----
  type WriteItem = { qrPayload: string; cargaId: string; etapa: 1 | 2; usuarioId?: string };
  const writeQueueRef = useRef<WriteItem[]>([]);
  const writeTimerRef = useRef<number | null>(null);



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

  // Conta como "feita" apenas o que já passou pela etapa selecionada
  function contaComoConferida(status: string) {
    return etapa === 2
      ? status === "conferido"
      : status === "conferido_interno" || status === "conferido";
  }

  const etapaLabel = etapa === 2 ? "Etapa 2 • Expedição (só QR)" : "Etapa 1 • Separação (dupla bipagem)";



  useEffect(() => {
    hasOfflineData().then(setHasLocalData);
  }, []);

  // Ao trocar de etapa: Etapa 2 é bipagem única (só QR) e recarrega o progresso
  useEffect(() => {
    if (etapa === 2) {
      setDuplaChecagem(false);
      setCodigoCliente("");
      codigoClienteRef.current = "";
      collectorStageRef.current = "qr";
      setCollectorStage("qr");
    }
    if (selectedNf) {
      void reloadNfProgress();
      if (faltamAberto) void loadEtiquetasFaltantes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa]);


  useEffect(() => {
    return () => {
      if (reloadProgressTimerRef.current) {
        window.clearTimeout(reloadProgressTimerRef.current);
      }
      if (manualInputIdleTimerRef.current) {
        window.clearTimeout(manualInputIdleTimerRef.current);
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
      const conferidas = etiquetas.filter((e) => contaComoConferida(e.status)).length;

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
    setLastError(null);
    setScanHistory([]);
    collectorBufferRef.current = "";
    collectorStageRef.current = duplaChecagem ? "cliente" : "qr";
    setCollectorStage(duplaChecagem ? "cliente" : "qr");
  }

  function voltarParaLista() {
    void flushWrites();
    setSelectedCarga(null);

    setSelectedNf(null);
    setNfProgress(null);
    setLastResult(null);
    setLastError(null);
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
      qrSegmentsRef.current = [];
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
      qrSegmentsRef.current = [];
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

  // O QR da etiqueta tem formato fixo: cargaId;nf;cProd;seq;total;chave(44 dígitos).
  // Quando o buffer já está estruturalmente completo, não há motivo para esperar
  // pausa nem Enter — confirma na hora (elimina a latência do leitor lento).
  function isQrPayloadCompleto(value: string) {
    const parts = value.trim().split(";");
    if (parts.length !== 6) return false;
    if (!/^[0-9a-fA-F-]{36}$/.test(parts[0])) return false;
    return /^\d{44}$/.test(parts[5]);
  }

  // "1 de 2 bipadas" do código específico — lido do cache em RAM (0ms).
  function pendenciaDoCodigo(cProd?: string): string | undefined {
    if (!cProd || !cacheReadyRef.current) return undefined;
    const alvo = cProd.replace(/^0+/, "");
    const statusFeito = etapa === 2 ? "conferido" : "conferido_interno";
    let total = 0;
    let feitas = 0;
    nfCacheRef.current.forEach((et) => {
      if ((et.c_prod || "").replace(/^0+/, "") !== alvo) return;
      total += 1;
      if (et.status === statusFeito || (etapa === 1 && et.status === "conferido")) feitas += 1;
    });
    if (!total) return undefined;
    return `Código ${alvo}: ${feitas} de ${total} bipadas — faltam ${total - feitas}`;
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

  // ---------------------------------------------------------------------------
  // Cache local: carrega TODAS as etiquetas da NF uma única vez. A partir daí
  // toda validação do bipe (existe / status / divergência / cProd do cliente)
  // é resolvida em memória — resposta instantânea, sem esperar o banco.
  // ---------------------------------------------------------------------------
  const normalizaCodigo = (v: string) => v.trim().replace(/^0+/, "");

  async function carregarCacheNf(cargaId: string, numeroNf: string) {
    setCacheReady(false);
    nfCacheRef.current = new Map();
    nfCprodsRef.current = new Set();
    try {
      let rows: { qr_payload: string; id: string; status: string; x_prod: string; c_prod: string }[] = [];
      if (offlineMode || !isOnline) {
        const ets = await getOfflineEtiquetas(cargaId);
        rows = ets
          .filter((e) => e.numero_nf === numeroNf)
          .map((e) => ({ qr_payload: e.qr_payload, id: e.id, status: e.status, x_prod: e.x_prod, c_prod: e.c_prod }));
      } else {
        const { data, error } = await supabase
          .from("etiquetas")
          .select("qr_payload, id, status, x_prod, c_prod")
          .eq("carga_id", cargaId)
          .eq("numero_nf", numeroNf)
          .limit(5000);
        if (error) throw error;
        rows = (data as any[]) || [];
      }
      const map = new Map<string, EtiquetaCache>();
      const cprods = new Set<string>();
      for (const r of rows) {
        map.set(r.qr_payload, { id: r.id, status: r.status, x_prod: r.x_prod, c_prod: r.c_prod });
        if (r.c_prod) cprods.add(normalizaCodigo(r.c_prod));
      }
      nfCacheRef.current = map;
      nfCprodsRef.current = cprods;
      setCacheReady(map.size > 0);

      // Emitente da NF define se a dupla bipagem é obrigatória (IBAC).
      if (offlineMode || !isOnline) {
        setNfEhIbac(null);
      } else {
        const { data: nfRow } = await supabase
          .from("notas_fiscais")
          .select("cnpj_emitente")
          .eq("carga_id", cargaId)
          .eq("numero_nf", numeroNf)
          .maybeSingle();
        const digitos = ((nfRow as any)?.cnpj_emitente || "").replace(/\D/g, "");
        setNfEhIbac(digitos ? digitos === CNPJ_IBAC : null);
      }

      const divergencias = rows.filter((r) => r.status === "divergencia").length;
      const total = rows.length - divergencias;
      const conferidas = rows.filter((r) => contaComoConferida(r.status)).length;
      setNfProgress({ numeroNf, total, conferidas });
    } catch (e) {
      console.error("[ConferenciaInterna] Falha ao montar cache da NF:", e);
      setCacheReady(false);
    }
  }

  useEffect(() => {
    if (!selectedCarga || !selectedNf) {
      nfCacheRef.current = new Map();
      nfCprodsRef.current = new Set();
      setNfEhIbac(null);
      setCacheReady(false);
      return;
    }
    void carregarCacheNf(selectedCarga.id, selectedNf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCarga?.id, selectedNf, etapa, offlineMode, isOnline]);

  // Regra: Etapa 1 de NF da IBAC = dupla bipagem obrigatória. Demais emitentes
  // (etiqueta QR sem pareamento por caixa) seguem bipagem única.
  useEffect(() => {
    if (etapa !== 1 || nfEhIbac === null) return;
    setDuplaChecagem(nfEhIbac);
    setCodigoCliente("");
    codigoClienteRef.current = "";
    qrInputRef.current = "";
    collectorBufferRef.current = "";
    collectorStageRef.current = nfEhIbac ? "cliente" : "qr";
    setCollectorStage(nfEhIbac ? "cliente" : "qr");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfEhIbac, etapa, selectedNf]);


  // Código do cliente casa com algum cProd da NF? (usado para commit instantâneo)
  function clienteBateComNf(valor: string): boolean {
    const norm = normalizaCodigo(valor);
    if (!norm) return false;
    if (nfCprodsRef.current.has(norm)) return true;
    if (/^\d{13}$/.test(norm)) {
      for (const c of nfCprodsRef.current) {
        if (c.length >= 4 && norm.includes(c)) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Fila de gravação em lote: N bipes → 1 UPDATE. O operador nunca espera rede.
  // ---------------------------------------------------------------------------
  function enqueueWrite(item: WriteItem) {
    writeQueueRef.current.push(item);
    if (writeQueueRef.current.length >= 25) {
      void flushWrites();
      return;
    }
    if (!writeTimerRef.current) {
      writeTimerRef.current = window.setTimeout(() => {
        writeTimerRef.current = null;
        void flushWrites();
      }, 400);
    }
  }

  async function flushWrites() {
    if (writeTimerRef.current) {
      window.clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
    }
    const items = writeQueueRef.current.splice(0, writeQueueRef.current.length);
    if (!items.length) return;

    // Agrupa por carga + etapa + usuário (mesmo patch = 1 request)
    const grupos = new Map<string, WriteItem[]>();
    for (const it of items) {
      const k = `${it.cargaId}|${it.etapa}|${it.usuarioId ?? ""}`;
      const arr = grupos.get(k) || [];
      arr.push(it);
      grupos.set(k, arr);
    }

    for (const arr of grupos.values()) {
      const { cargaId, etapa: etapaAtual, usuarioId } = arr[0];
      const qrs = Array.from(new Set(arr.map((a) => a.qrPayload)));
      const agora = new Date().toISOString();
      const statusEsperado = etapaAtual === 2 ? "conferido_interno" : "pendente";
      const patch =
        etapaAtual === 2
          ? { status: "conferido" as any, conferido_em: agora, conferido_por: usuarioId }
          : { status: "conferido_interno" as any, conferido_interno_em: agora, conferido_interno_por: usuarioId };

      try {
        const { data, error } = await supabase
          .from("etiquetas")
          .update(patch)
          .eq("carga_id", cargaId)
          .in("qr_payload", qrs)
          .eq("status", statusEsperado)
          .select("qr_payload");
        if (error) throw error;
        const gravadas = new Set(((data as any[]) || []).map((d) => d.qr_payload));
        const naoGravadas = qrs.filter((q) => !gravadas.has(q));
        if (naoGravadas.length) {
          // Outro operador bipou antes (ou status mudou): reconcilia com o servidor.
          console.warn("[ConferenciaInterna] etiquetas não gravadas no lote:", naoGravadas.length);
          scheduleReloadNfProgress();
        }
      } catch (e) {
        console.error("[ConferenciaInterna] Erro ao gravar lote de bipes:", e);
        // Devolve para a fila e tenta novamente no próximo ciclo
        writeQueueRef.current.push(...arr);
        toast({
          title: "Falha ao gravar bipes",
          description: "Sem conexão estável — tentando novamente.",
          variant: "destructive",
        });
        if (!writeTimerRef.current) {
          writeTimerRef.current = window.setTimeout(() => {
            writeTimerRef.current = null;
            void flushWrites();
          }, 2000);
        }
      }
    }
  }

  // Garante que nada fica na fila ao sair da NF / desmontar
  useEffect(() => {
    return () => {
      void flushWrites();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  async function processScan(qrData: string, codigoClienteAtual?: string) {

    if (processingScanRef.current || !qrData.trim() || !selectedCarga || !selectedNf) return;

    processingScanRef.current = true;
    setScanning(true);
    setLastResult(null);
    let releasedForNextScan = false;

    // Contexto da leitura atual (código do produto + nº da caixa) para que
    // qualquer erro na tela mostre EXATAMENTE qual etiqueta falhou.
    const scanCtx: { cProd?: string; seq?: string; total?: string } = {};
    const reportResult = (result: ScanResult): ScanResult => {
      const codigo = result.codigo ?? (scanCtx.cProd ? scanCtx.cProd.replace(/^0+/, "") : undefined);
      const caixa =
        result.caixa ??
        (scanCtx.seq && scanCtx.total ? `${Number(scanCtx.seq)} de ${Number(scanCtx.total)}` : undefined);
      const enriched: ScanResult = { ...result, codigo, caixa, pendencia: pendenciaDoCodigo(scanCtx.cProd) };
      setLastResult(enriched);
      if (enriched.type !== "success") setLastError(enriched);
      return enriched;
    };


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
      qrSegmentsRef.current = [];
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
        addToHistory(reportResult(result)); playSound("error"); return;
      }

      const [qrCargaId, numeroNf, cProd, seqStr, totalStr] = parts;
      scanCtx.cProd = cProd;
      scanCtx.seq = seqStr;
      scanCtx.total = totalStr;


      // Dupla checagem: exige código do cliente bipado antes e confere com cProd
      if (duplaChecagem) {
        const cliente = (codigoClienteAtual || codigoClienteRef.current || codigoCliente).trim();
        if (!cliente) {
          const result: ScanResult = {
            type: "warning",
            message: "Bipe o código do cliente primeiro",
            details: "Modo Dupla Checagem ativo",
          };
          addToHistory(reportResult(result)); playSound("warning");
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
          addToHistory(reportResult(result)); playSound("error");
          setCodigoCliente("");
          setTimeout(() => clienteInputRef.current?.focus(), 50);
          return;
        }
      }


      // Validate carga
      if (qrCargaId !== selectedCarga.id) {
        const result: ScanResult = { type: "warning", message: "Etiqueta de outra carga", details: "Esta etiqueta pertence a outra carga" };
        addToHistory(reportResult(result)); playSound("warning"); return;
      }

      // Validate NF
      if (numeroNf !== selectedNf) {
        const result: ScanResult = { type: "warning", message: "Etiqueta de outra NF", details: `Esta etiqueta é da NF ${numeroNf}. Selecione a NF correta.` };
        addToHistory(reportResult(result)); playSound("warning"); return;
      }

      if (offlineMode || !isOnline) {
        if (etapa === 2) {
          const result: ScanResult = { type: "error", message: "Etapa 2 exige conexão", details: "A expedição precisa gravar online. Volte para Etapa 1 ou conecte-se." };
          addToHistory(reportResult(result)); playSound("error"); return;
        }
        const etiqueta = await findEtiquetaByQr(qrData.trim());

        if (!etiqueta) {
          const result: ScanResult = { type: "error", message: "Etiqueta não encontrada (offline)", details: `NF ${numeroNf} - Cód ${cProd} - Caixa ${seqStr}/${totalStr}` };
          addToHistory(reportResult(result)); playSound("error"); return;
        }
        if (etiqueta.status === "divergencia") {
          const result: ScanResult = { type: "error", message: "Etiqueta bloqueada (Divergência)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
          addToHistory(reportResult(result)); playSound("error"); return;
        }
        if (etiqueta.status === "conferido_interno" || etiqueta.status === "conferido") {
          const result: ScanResult = { type: "warning", message: "Já conferida (interno)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - Caixa ${seqStr}/${totalStr}` };
          addToHistory(reportResult(result)); playSound("warning"); return;
        }
        await saveScanOffline({
          etiqueta_id: etiqueta.id,
          carga_id: etiqueta.carga_id,
          numero_nf: etiqueta.numero_nf,
          conferido_interno_por: user?.id || "",
          conferido_interno_em: new Date().toISOString(),
        });
        const result: ScanResult = { type: "success", message: "Conf. Interna ✓ (offline)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
        addToHistory(reportResult(result)); playSound("success");
        bumpProgressOtimista();
        void reloadNfProgress();
      } else {
        if (pendingOnlineScansRef.current.has(qrPayload)) {
          const result: ScanResult = { type: "warning", message: "Etiqueta em gravação", details: `NF ${numeroNf} - Caixa ${seqStr}/${totalStr}` };
          addToHistory(reportResult(result)); playSound("warning"); return;
        }

        const cargaId = selectedCarga.id;
        const nfAtual = selectedNf;
        const usuarioId = user?.id;
        const etapaAtual = etapa;

        // ---- CAMINHO INSTANTÂNEO: valida no cache local e grava em lote ----
        if (cacheReadyRef.current) {
          const cached = nfCacheRef.current.get(qrPayload);
          if (!cached) {
            const result: ScanResult = { type: "error", message: "Etiqueta não encontrada", details: `NF ${numeroNf} - Cód ${cProd} - Caixa ${seqStr}/${totalStr}` };
            addToHistory(reportResult(result)); playSound("error"); return;
          }
          if (cached.status === "divergencia") {
            const result: ScanResult = { type: "error", message: "Etiqueta bloqueada (Divergência)", details: `NF ${numeroNf} - ${cached.x_prod} - CX ${seqStr}/${totalStr}` };
            addToHistory(reportResult(result)); playSound("error"); return;
          }
          const statusEsperado = etapaAtual === 2 ? "conferido_interno" : "pendente";
          if (cached.status !== statusEsperado) {
            if (etapaAtual === 2 && cached.status === "pendente") {
              const result: ScanResult = { type: "error", message: "Falta a Etapa 1 (separação)", details: `NF ${numeroNf} - ${cached.x_prod} - CX ${seqStr}/${totalStr}` };
              addToHistory(reportResult(result)); playSound("error"); return;
            }
            const result: ScanResult = { type: "warning", message: etapaAtual === 2 ? "Já expedida" : "Já separada (Etapa 1)", details: `NF ${numeroNf} - ${cached.x_prod} - CX ${seqStr}/${totalStr}` };
            addToHistory(reportResult(result)); playSound("warning"); return;
          }

          // Confirma na hora: som, contador e liberação do próximo bipe.
          nfCacheRef.current.set(qrPayload, {
            ...cached,
            status: etapaAtual === 2 ? "conferido" : "conferido_interno",
          });
          const result: ScanResult = { type: "success", message: etapaAtual === 2 ? "Expedição ✓" : "Separação ✓", details: `NF ${numeroNf} - ${cached.x_prod} - CX ${seqStr}/${totalStr}` };
          addToHistory(reportResult(result)); playSound("success");
          bumpProgressOtimista();
          releaseForNextScan();
          enqueueWrite({ qrPayload, cargaId, etapa: etapaAtual, usuarioId });

          // NF fechou? confirma com o servidor (e dispara o aviso de etapa concluída)
          let faltam = 0;
          for (const e of nfCacheRef.current.values()) {
            if (e.status !== "divergencia" && !contaComoConferida(e.status)) faltam++;
          }
          if (faltam === 0) {
            void flushWrites().then(() => scheduleReloadNfProgress());
          }
          return;

        }

        pendingOnlineScansRef.current.add(qrPayload);

        // No coletor/Chrome lento, não segura o próximo bipe esperando a rede/banco.
        // As validações locais já passaram; a gravação confirma em segundo plano.
        releaseForNextScan();


        // Caminho rápido em background: 1 único round-trip. Atualiza direto se estiver no status esperado.
        void (async () => {
          try {
            const statusEsperado = etapaAtual === 2 ? "conferido_interno" : "pendente";
            const patch =
              etapaAtual === 2
                ? {
                    status: "conferido" as any,
                    conferido_em: new Date().toISOString(),
                    conferido_por: usuarioId,
                  }
                : {
                    status: "conferido_interno" as any,
                    conferido_interno_em: new Date().toISOString(),
                    conferido_interno_por: usuarioId,
                  };

            const { data: updated, error: updateError } = await supabase
              .from("etiquetas")
              .update(patch)
              .eq("carga_id", cargaId)
              .eq("qr_payload", qrPayload)
              .eq("status", statusEsperado)
              .select("id, x_prod")
              .maybeSingle();

            if (updateError) throw updateError;

            if (updated) {
              const result: ScanResult = { type: "success", message: etapaAtual === 2 ? "Expedição ✓" : "Separação ✓", details: `NF ${numeroNf} - ${updated.x_prod} - CX ${seqStr}/${totalStr}` };
              addToHistory(reportResult(result)); playSound("success");
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
                addToHistory(reportResult(result)); playSound("error"); return;
              }
              if (etiqueta.status === "divergencia") {
                const result: ScanResult = { type: "error", message: "Etiqueta bloqueada (Divergência)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
                addToHistory(reportResult(result)); playSound("error"); return;
              }
              if (etapaAtual === 2 && etiqueta.status === "pendente") {
                const result: ScanResult = { type: "error", message: "Falta a Etapa 1 (separação)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
                addToHistory(reportResult(result)); playSound("error"); return;
              }
              const result: ScanResult = { type: "warning", message: etapaAtual === 2 ? "Já expedida" : "Já separada (Etapa 1)", details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}` };
              addToHistory(reportResult(result)); playSound("warning");
              scheduleReloadNfProgress();

            }
          } catch (error) {
            console.error("Erro ao gravar scan interno:", error);
            const result: ScanResult = { type: "error", message: "Erro ao gravar", details: `NF ${nfAtual} - Caixa ${seqStr}/${totalStr}` };
            addToHistory(reportResult(result)); playSound("error");
          } finally {
            pendingOnlineScansRef.current.delete(qrPayload);
          }
        })();

        return;
      }

    } catch (error) {
      console.error("Erro ao processar scan:", error);
      const result: ScanResult = { type: "error", message: "Erro ao processar", details: "Tente novamente" };
      addToHistory(reportResult(result)); playSound("error");
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

    let rafId = 0;
    let idleTimer = 0;
    // Média móvel do intervalo entre caracteres do leitor (ms)
    let interCharMs = 25;
    let lastCharTs = 0;


    // No modo coletor NÃO espelhamos caractere a caractere no input: cada write
    // no DOM por caractere (60+ por etiqueta) é o que fazia a leitura "aparecer
    // aos poucos" e engasgar em aparelhos fracos. O buffer fica só em RAM e o
    // input é limpo apenas nos commits.
    const writeCollectorValue = () => {};

    const flushWrite = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      const target = duplaChecagem && collectorStageRef.current === "cliente" ? clienteInputRef.current : inputRef.current;
      if (target && target.value) target.value = "";
    };


    const clearIdleTimer = () => {
      if (idleTimer) {
        window.clearTimeout(idleTimer);
        idleTimer = 0;
      }
    };

    const commitBuffer = () => {
      clearIdleTimer();
      const value = collectorBufferRef.current.trim();
      collectorBufferRef.current = "";
      flushWrite();
      if (!value) return;

      // ---- Reassembly de QR quebrado pelo leitor ----
      // Alguns leitores/teclados Android enviam o ";" do payload como Tab/Enter,
      // partindo o QR (cargaId;nf;cProd;seq;total;chave) em 6 leituras separadas.
      // Detectamos o início pelo UUID da carga e remontamos o payload completo.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      if (isUuid) {
        qrSegmentsRef.current = [value];
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      if (qrSegmentsRef.current.length > 0) {
        qrSegmentsRef.current.push(value);
        if (qrSegmentsRef.current.length >= 6) {
          const full = qrSegmentsRef.current.slice(0, 6).join(";");
          qrSegmentsRef.current = [];
          qrInputRef.current = full;
          if (inputRef.current) inputRef.current.value = full;
          void processScan(full, duplaChecagem ? codigoClienteRef.current : "");
        }
        return;
      }

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
    };

    // Fallback: alguns leitores USB/Bluetooth não enviam Enter/Tab no final,
    // ou digitam muito devagar. A espera é ADAPTATIVA: mede o intervalo real
    // entre caracteres do leitor e usa ~4x esse intervalo (90ms a 400ms),
    // em vez de um valor fixo alto.
    const armIdleCommit = () => {
      clearIdleTimer();
      const isClienteStage = duplaChecagem && collectorStageRef.current === "cliente";
      const minLen = isClienteStage ? 4 : 12;
      if (collectorBufferRef.current.trim().length < minLen) return;
      const wait = Math.min(400, Math.max(90, Math.round(interCharMs * 4)));
      idleTimer = window.setTimeout(commitBuffer, wait);
    };


    const handleCollectorKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;

      const key = event.key;
      const isEnterLike =
        key === "Enter" ||
        key === "Tab" ||
        event.keyCode === 13 ||
        event.keyCode === 9 ||
        ((key === "Unidentified" || key === "Process") && (event.keyCode === 13 || event.keyCode === 9));
      const isScanChar = key.length === 1;
      const isControl = isEnterLike || key === "Backspace" || key === "Escape";
      if (!isScanChar && !isControl) return;

      event.preventDefault();
      event.stopPropagation();

      if (key === "Escape") {
        clearIdleTimer();
        collectorBufferRef.current = "";
      qrSegmentsRef.current = [];
        flushWrite();
        return;
      }

      if (key === "Backspace") {
        clearIdleTimer();
        collectorBufferRef.current = collectorBufferRef.current.slice(0, -1);
        flushWrite();
        return;
      }

      if (isEnterLike) {
        commitBuffer();
        return;
      }

      const now = performance.now();
      if (lastCharTs) {
        const delta = now - lastCharTs;
        if (delta < 400) interCharMs = interCharMs * 0.7 + delta * 0.3;
      }
      lastCharTs = now;

      collectorBufferRef.current += key;
      writeCollectorValue();

      // Commit instantâneo: QR completo (6 campos + chave de 44 dígitos) não espera pausa.
      const isQrStage = !duplaChecagem || collectorStageRef.current === "qr";
      if (isQrStage && isQrPayloadCompleto(collectorBufferRef.current)) {
        commitBuffer();
        return;
      }

      // Commit instantâneo do 1º bipe (código do cliente): assim que o valor casa
      // exatamente com um cProd da NF (ou é um EAN-13 completo que contém o cProd),
      // não há motivo para esperar pausa/Enter — elimina 90–400ms por caixa.
      if (!isQrStage) {
        const buf = collectorBufferRef.current.trim();
        if (buf.length >= 4 && clienteBateComNf(buf)) {
          commitBuffer();
          return;
        }
      }

      armIdleCommit();

    };

    collectorBufferRef.current = "";
    collectorStageRef.current = duplaChecagem ? "cliente" : "qr";
    setCollectorStage(duplaChecagem ? "cliente" : "qr");
    clienteInputRef.current?.blur();
    inputRef.current?.blur();

    window.addEventListener("keydown", handleCollectorKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleCollectorKeyDown, true);
      clearIdleTimer();
      if (rafId) window.cancelAnimationFrame(rafId);
    };
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

  function clearManualInputIdleTimer() {
    if (!manualInputIdleTimerRef.current) return;
    window.clearTimeout(manualInputIdleTimerRef.current);
    manualInputIdleTimerRef.current = null;
  }

  function armManualInputIdleCommit(stage: "cliente" | "qr", value: string) {
    clearManualInputIdleTimer();
    const normalized = value.trim();
    const minLength = stage === "cliente" ? 4 : 12;
    if (normalized.length < minLength) return;

    // Commit instantâneo quando o QR já está estruturalmente completo.
    if (stage === "qr" && isQrPayloadCompleto(normalized)) {
      if (!processingScanRef.current) void handleManualScan(normalized);
      return;
    }

    // Alguns leitores HID escrevem no campo via IME/input e não disparam Enter.
    // A pausa identifica o fim do código sem interferir nos leitores que enviam Enter.
    manualInputIdleTimerRef.current = window.setTimeout(() => {

      manualInputIdleTimerRef.current = null;
      if (stage === "cliente") {
        if (codigoClienteRef.current.trim() !== normalized) return;
        focusNossaEtiqueta();
        return;
      }
      if (qrInputRef.current.trim() !== normalized || processingScanRef.current) return;
      void handleManualScan(normalized);
    }, 250);
  }


  async function limparConferenciaNf() {
    if (!selectedNf || limpando) return;
    if (!window.confirm(`Limpar a conferência da NF ${selectedNf}? Todas as etiquetas voltam para pendente.`)) return;

    setLimpando(true);
    try {
      const { data, error } = await supabase.rpc("limpar_conferencia_nf", { p_numero_nf: selectedNf });
      if (error) throw error;
      const limpas = (data as any)?.etiquetas_limpas ?? 0;
      toast({ title: "NF limpa", description: `${limpas} etiqueta(s) voltaram para pendente.` });
      setScanHistory([]);
      setLastResult(null);
      await reloadNfProgress();
    } catch (e: any) {
      console.error("Erro ao limpar conferência:", e);
      toast({ title: "Erro ao limpar NF", description: e?.message ?? "Sem permissão ou falha de rede.", variant: "destructive" });
    } finally {
      setLimpando(false);
    }
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
      const conferidas = all.filter((e) => contaComoConferida(e.status)).length;

      setNfProgress({ numeroNf: selectedNf, total, conferidas });

      if (conferidas === total && total > 0) {
        setTimeout(() => {
          const completeResult: ScanResult = {
            type: "success",
            message: etapa === 2
              ? `✅ ETAPA 2/2 concluída — NF ${selectedNf} expedida`
              : `✅ ETAPA 1/2 concluída — NF ${selectedNf}`,
            details: etapa === 2
              ? `${total} etiquetas carregadas no veículo.`
              : `${total} etiquetas separadas. Ainda falta a ETAPA 2 (Expedição, só QR).`,
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
      const statusFaltante = etapa === 2 ? "conferido_interno" : "pendente";
      if (offlineMode || !isOnline) {
        const ets = await getOfflineEtiquetas(selectedCarga.id);
        const faltantes = ets
          .filter((e) => e.numero_nf === selectedNf && e.status === statusFaltante)
          .map((e) => ({ id: e.id, x_prod: e.x_prod, c_prod: e.c_prod, seq: e.seq, total: e.total }));
        setEtiquetasFaltantes(faltantes);
      } else {
        const { data, error } = await supabase
          .from("etiquetas")
          .select("id, x_prod, c_prod, seq, total")
          .eq("carga_id", selectedCarga.id)
          .eq("numero_nf", selectedNf)
          .eq("status", statusFaltante)
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
                  {selectedCarga.placa} • {etapa === 2 ? "Etapa 2 Expedição" : "Etapa 1 Separação"} • v2026.07.27f
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
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[11px]">
                    {etapa === 2 ? "ETAPA 2 de 2 • Expedição (só QR)" : "ETAPA 1 de 2 • Separação (dupla bipagem)"}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {nfProgress.conferidas} de {nfProgress.total} etiquetas {etapa === 2 ? "expedidas" : "separadas"}
                  </span>
                  <span className="font-bold text-lg">{nfPercent}%</span>
                </div>
                <Progress value={nfPercent} className="h-4" />
                {nfProgress.conferidas === nfProgress.total && (
                  etapa === 2 ? (
                    <div className="mt-2 rounded-md border border-success bg-success/10 p-2">
                      <div className="flex items-center gap-2 text-success font-semibold text-sm">
                        <CheckCircle2 className="w-5 h-5" />
                        Etapa 2 concluída — NF expedida
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-md border border-warning bg-warning/10 p-2">
                      <div className="flex items-center gap-2 text-success font-semibold text-sm">
                        <CheckCircle2 className="w-5 h-5" />
                        Etapa 1 concluída (separação)
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Esta NF <strong>ainda não está expedida</strong>. Troque para a
                        <strong> ETAPA 2 — Expedição</strong> no botão acima e bipe só o QR no carregamento.
                      </p>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>


          {/* Seletor de etapa */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={etapa === 1 ? "default" : "outline"}
              size="sm"
              onClick={() => setEtapa(1)}
            >
              Etapa 1 • Separação
            </Button>
            <Button
              variant={etapa === 2 ? "default" : "outline"}
              size="sm"
              onClick={() => setEtapa(2)}
            >
              Etapa 2 • Expedição
            </Button>
          </div>

          {/* Limpar NF — apenas admin e operadora Gessica */}
          {podeLimparNf && (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={limparConferenciaNf}
              disabled={limpando || offlineMode || !isOnline}
            >
              {limpando ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Eraser className="w-4 h-4 mr-2" />
              )}
              Limpar NF (voltar tudo para pendente)
            </Button>
          )}





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
      qrSegmentsRef.current = [];
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
                      {nfEhIbac === true && <span className="ml-1 text-primary">(IBAC)</span>}
                    </label>
                    <Switch
                      id="dupla-check"
                      checked={duplaChecagem}
                      disabled={etapa === 2 || nfEhIbac !== null}
                      onCheckedChange={(v) => {
                        setDuplaChecagem(v);
                        codigoClienteRef.current = "";
                        qrInputRef.current = "";
                        setCodigoCliente("");
                        setQrInput("");
                        collectorBufferRef.current = "";
      qrSegmentsRef.current = [];
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
              {etapa === 1 && nfEhIbac === true && (
                <p className="text-xs text-primary mt-1">
                  NF da IBAC: dupla bipagem obrigatória (definida pelo emitente).
                </p>
              )}
              {etapa === 1 && nfEhIbac === false && (
                <p className="text-xs text-muted-foreground mt-1">
                  Emitente sem etiqueta QR pareada: bipagem única (só nossa etiqueta).
                </p>
              )}
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
                       armManualInputIdleCommit("cliente", e.target.value);
                    }}
                    onKeyDown={(e) => {
                       if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                         clearManualInputIdleTimer();
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
                       armManualInputIdleCommit("qr", e.target.value);
                    }}
                    onKeyDown={(e) => {
                       if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                         clearManualInputIdleTimer();
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
                {(lastResult.codigo || lastResult.caixa) && (
                  <p className="font-mono font-bold text-xl leading-tight">
                    {lastResult.codigo ?? "—"}
                    {lastResult.caixa && <span className="ml-2">· CX {lastResult.caixa}</span>}
                  </p>
                )}
                {lastResult.details && <p className="text-sm opacity-80">{lastResult.details}</p>}
              </div>
            </div>
          )}

          {/* Último erro — permanece fixo até o próximo erro */}
          {lastError && (!lastResult || lastResult.type === "success") && (
            <div className="p-4 rounded-lg border-2 border-destructive bg-destructive/10 text-destructive">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold uppercase opacity-70">Último erro (não resolvido)</p>
                  <p className="font-bold">{lastError.message}</p>
                  <p className="font-mono font-bold text-2xl leading-tight">
                    {lastError.codigo ?? "—"}
                    {lastError.caixa && <span className="ml-2">· CX {lastError.caixa}</span>}
                  </p>
                  {lastError.pendencia && <p className="text-sm font-medium">{lastError.pendencia}</p>}
                  {lastError.details && <p className="text-xs opacity-80">{lastError.details}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => setLastError(null)}>
                  OK
                </Button>
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
                      {(item.codigo || item.caixa) && (
                        <span className="font-mono font-bold">{item.codigo}{item.caixa ? ` CX ` : ""}</span>
                      )}
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
                      <p className="text-sm text-muted-foreground text-center py-2">{etapa === 2 ? "Todas expedidas (Etapa 2)!" : "Todas separadas (Etapa 1)!"}</p>
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
