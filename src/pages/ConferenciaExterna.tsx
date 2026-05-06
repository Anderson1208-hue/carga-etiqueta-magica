import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useLockPortrait } from "@/hooks/useLockPortrait";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CameraScanner } from "@/components/conferencia/CameraScanner";
import { useNativeScanner } from "@/hooks/useNativeScanner";
import { MobileLogoutButton } from "@/components/layout/MobileLogoutButton";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import {
  ScanLine,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Package,
  Loader2,
  Truck,
  ChevronLeft,
  Camera,
  Image as ImageIcon,
  Navigation,
  MapPin,
  AlertTriangle,
} from "lucide-react";

interface Veiculo {
  id: string;
  placa: string;
  motorista: string;
  data: string;
}

interface NfConferencia {
  nf_id: string;
  numero_nf: string;
  dest_razao_social: string;
  dest_logradouro: string;
  dest_numero: string;
  dest_bairro: string;
  dest_cidade: string;
  dest_uf: string;
  carga_id: string;
  totalEtiquetas: number;
  conferidas: number;
  baixa_status: string | null;
}

interface ScanResult {
  type: "success" | "error" | "warning";
  message: string;
  details?: string;
}

type OcorrenciaTipo = "entregue" | "recusado" | "endereco_nao_encontrado" | "ausente" | "outros";

const OCORRENCIAS: { value: OcorrenciaTipo; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "entregue", label: "Entregue", icon: <CheckCircle2 className="w-5 h-5" />, color: "text-green-600" },
  { value: "recusado", label: "Recusado", icon: <XCircle className="w-5 h-5" />, color: "text-red-600" },
  { value: "endereco_nao_encontrado", label: "End. não encontrado", icon: <MapPin className="w-5 h-5" />, color: "text-orange-600" },
  { value: "ausente", label: "Ausente", icon: <AlertTriangle className="w-5 h-5" />, color: "text-yellow-600" },
  { value: "outros", label: "Outros", icon: <AlertTriangle className="w-5 h-5" />, color: "text-muted-foreground" },
];

type ViewMode = "vehicle-select" | "nf-list" | "scanning" | "baixa";

export default function ConferenciaExterna() {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Mantém tela acesa durante conferência + trava retrato no APK.
  useWakeLock(true);
  useLockPortrait();
  const nativeScanner = useNativeScanner();

  // Navigation
  const [viewMode, setViewMode] = useState<ViewMode>("vehicle-select");

  // Vehicle
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [selectedVeiculo, setSelectedVeiculo] = useState<Veiculo | null>(null);
  const [loadingVeiculos, setLoadingVeiculos] = useState(true);

  // NFs
  const [nfs, setNfs] = useState<NfConferencia[]>([]);
  const [loadingNfs, setLoadingNfs] = useState(false);
  const [selectedNf, setSelectedNf] = useState<NfConferencia | null>(null);

  // Scanning
  const [scanning, setScanning] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);

  // Baixa
  const [ocorrencia, setOcorrencia] = useState<OcorrenciaTipo | "">("");
  const [observacao, setObservacao] = useState("");
  const [recebedorNome, setRecebedorNome] = useState("");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadVeiculos();
    captureGPS();
  }, []);

  async function loadVeiculos() {
    setLoadingVeiculos(true);
    try {
      const { data } = await supabase
        .from("veiculos")
        .select("id, placa, motorista, data")
        .in("status", ["pendente", "em_rota"])
        .order("created_at", { ascending: false });
      setVeiculos(data || []);
    } catch (error) {
      console.error("Erro ao carregar veículos:", error);
    } finally {
      setLoadingVeiculos(false);
    }
  }

  async function selectVeiculo(veiculoId: string) {
    const veiculo = veiculos.find((v) => v.id === veiculoId);
    if (!veiculo) return;
    setSelectedVeiculo(veiculo);
    await loadNfsForVeiculo(veiculoId);
    setViewMode("nf-list");
  }

  async function loadNfsForVeiculo(veiculoId: string) {
    setLoadingNfs(true);
    try {
      // Get NFs linked to this vehicle
      const { data: vnfs, error: vnfsError } = await supabase
        .from("veiculo_nfs")
        .select("nf_id, carga_origem_id")
        .eq("veiculo_id", veiculoId)
        .limit(2000);

      if (vnfsError) throw vnfsError;

      if (!vnfs || vnfs.length === 0) {
        setNfs([]);
        return;
      }

      const nfIds = vnfs.map((v) => v.nf_id);
      const nfCargaMap = new Map(vnfs.map((v) => [v.nf_id, v.carga_origem_id]));
      const uniqueCargaIds = [...new Set(vnfs.map((v) => v.carga_origem_id))];

      // Get NF details
      const { data: nfsData, error: nfsError } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, dest_razao_social, dest_logradouro, dest_numero, dest_bairro, dest_cidade, dest_uf")
        .in("id", nfIds)
        .limit(2000);

      if (nfsError) throw nfsError;

      // Use RPC to get progress for each carga (avoids 1000 row limit)
      const progressResults = await Promise.all(
        uniqueCargaIds.map((cargaId) =>
          supabase.rpc("get_conferencia_progress", { p_carga_id: cargaId })
        )
      );

      // Build a map of numero_nf+carga_id -> { total, conferidas, conferidas_interno }
      const progressMap = new Map<string, { total: number; conferidas: number; conferidas_interno: number }>();
      uniqueCargaIds.forEach((cargaId, idx) => {
        const progressData = progressResults[idx].data as any;
        if (progressData?.nfs) {
          (progressData.nfs as any[]).forEach((nfProgress: any) => {
            progressMap.set(`${nfProgress.numero_nf}_${cargaId}`, {
              total: nfProgress.total || 0,
              conferidas: nfProgress.conferidas || 0,
              conferidas_interno: nfProgress.conferidas_interno || 0,
            });
          });
        }
      });

      // Get existing baixas
      const { data: baixasData } = await supabase
        .from("baixas_entrega")
        .select("nf_id, status")
        .eq("veiculo_id", veiculoId)
        .limit(2000);

      const baixasMap = new Map((baixasData || []).map((b) => [b.nf_id, b.status]));

      // Build NF list with etiqueta progress
      const result: NfConferencia[] = (nfsData || []).map((nf) => {
        const cargaId = nfCargaMap.get(nf.id) || "";
        const progress = progressMap.get(`${nf.numero_nf}_${cargaId}`) || { total: 0, conferidas: 0, conferidas_interno: 0 };

        return {
          nf_id: nf.id,
          numero_nf: nf.numero_nf,
          dest_razao_social: nf.dest_razao_social || "Não informado",
          dest_logradouro: nf.dest_logradouro || "",
          dest_numero: nf.dest_numero || "",
          dest_bairro: nf.dest_bairro || "",
          dest_cidade: nf.dest_cidade || "",
          dest_uf: nf.dest_uf || "",
          carga_id: cargaId,
          totalEtiquetas: progress.total,
          conferidas: progress.conferidas,
          baixa_status: baixasMap.get(nf.id) || null,
        };
      });

      // Only show NFs that have etiquetas with conferido_interno or conferido (ready for external)
      const filtered = result.filter((nf) => {
        const progress = progressMap.get(`${nf.numero_nf}_${nf.carga_id}`);
        return progress && (progress.conferidas_interno > 0 || progress.conferidas > 0);
      });

      filtered.sort((a, b) => {
        // Baixa done last
        if (a.baixa_status && !b.baixa_status) return 1;
        if (!a.baixa_status && b.baixa_status) return -1;
        // Fully conferidas first (ready for baixa)
        const aComplete = a.conferidas === a.totalEtiquetas && a.totalEtiquetas > 0;
        const bComplete = b.conferidas === b.totalEtiquetas && b.totalEtiquetas > 0;
        if (aComplete && !bComplete) return -1;
        if (!aComplete && bComplete) return 1;
        return a.numero_nf.localeCompare(b.numero_nf);
      });

      setNfs(filtered);
    } catch (error) {
      console.error("[ConferenciaExterna] Erro ao carregar NFs:", error);
      toast({ title: "Erro ao carregar NFs", description: "Tente novamente.", variant: "destructive" });
      setNfs([]);
    } finally {
      setLoadingNfs(false);
    }
  }

  // ---- SCANNING ----
  function startScanning(nf: NfConferencia) {
    setSelectedNf(nf);
    setLastResult(null);
    setScanHistory([]);
    setQrInput("");
    setViewMode("scanning");
  }

  function startBaixa(nf: NfConferencia) {
    setSelectedNf(nf);
    resetBaixaForm();
    captureGPS();
    setViewMode("baixa");
  }

  async function processScan(qrData: string) {
    if (!qrData.trim() || !selectedNf || !selectedVeiculo) return;

    setScanning(true);
    setLastResult(null);

    try {
      const parts = qrData.trim().split(";");

      if (parts.length < 6) {
        const result: ScanResult = { type: "error", message: "QR Code inválido", details: "Formato não reconhecido" };
        setLastResult(result);
        addToHistory(result);
        playSound("error");
        return;
      }

      const [qrCargaId, numeroNf, cProd, seqStr, totalStr] = parts;

      if (qrCargaId !== selectedNf.carga_id) {
        const result: ScanResult = { type: "warning", message: "Etiqueta de outra carga", details: "Esta etiqueta pertence a outra carga" };
        setLastResult(result);
        addToHistory(result);
        playSound("warning");
        return;
      }

      if (numeroNf !== selectedNf.numero_nf) {
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

      const { data: etiqueta, error: findError } = await supabase
        .from("etiquetas")
        .select("*")
        .eq("carga_id", selectedNf.carga_id)
        .eq("qr_payload", qrData.trim())
        .maybeSingle();

      if (findError || !etiqueta) {
        const result: ScanResult = {
          type: "error",
          message: "Etiqueta não encontrada",
          details: `NF ${numeroNf} - Cód ${cProd} - CX ${seqStr}/${totalStr}`,
        };
        setLastResult(result);
        addToHistory(result);
        playSound("error");
        return;
      }

      // Must be conferido_interno to proceed with external conference
      if (etiqueta.status === "conferido") {
        const result: ScanResult = {
          type: "warning",
          message: "Já conferida (final)",
          details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}`,
        };
        setLastResult(result);
        addToHistory(result);
        playSound("warning");
        return;
      }

      if (etiqueta.status === "pendente") {
        const result: ScanResult = {
          type: "error",
          message: "Não conferida internamente",
          details: "Esta etiqueta precisa ser conferida no galpão primeiro.",
        };
        setLastResult(result);
        addToHistory(result);
        playSound("error");
        return;
      }

      if (etiqueta.status === "divergencia") {
        const result: ScanResult = {
          type: "error",
          message: "Etiqueta bloqueada (Divergência)",
          details: `Bloqueada no depósito. Motivo: ${(etiqueta as any).divergencia_motivo || "não informado"}`,
        };
        setLastResult(result);
        addToHistory(result);
        playSound("error");
        return;
      }

      // Mark as conferido (final)
      const { error: updateError } = await supabase
        .from("etiquetas")
        .update({
          status: "conferido" as any,
          conferido_em: new Date().toISOString(),
          conferido_por: user?.id,
        })
        .eq("id", etiqueta.id);

      if (updateError) throw updateError;

      const result: ScanResult = {
        type: "success",
        message: "Conferido Final ✓",
        details: `NF ${numeroNf} - ${etiqueta.x_prod} - CX ${seqStr}/${totalStr}`,
      };
      setLastResult(result);
      addToHistory(result);
      playSound("success");

      await reloadSelectedNfProgress();
    } catch (error) {
      console.error("Erro:", error);
      const result: ScanResult = { type: "error", message: "Erro ao processar", details: "Tente novamente" };
      setLastResult(result);
      addToHistory(result);
      playSound("error");
    } finally {
      setQrInput("");
      setScanning(false);
    }
  }

  async function reloadSelectedNfProgress() {
    if (!selectedNf) return;

    try {
      const [totalRes, confRes, divRes] = await Promise.all([
        supabase
          .from("etiquetas")
          .select("id", { count: "exact", head: true })
          .eq("carga_id", selectedNf.carga_id)
          .eq("numero_nf", selectedNf.numero_nf),
        supabase
          .from("etiquetas")
          .select("id", { count: "exact", head: true })
          .eq("carga_id", selectedNf.carga_id)
          .eq("numero_nf", selectedNf.numero_nf)
          .eq("status", "conferido"),
        supabase
          .from("etiquetas")
          .select("id", { count: "exact", head: true })
          .eq("carga_id", selectedNf.carga_id)
          .eq("numero_nf", selectedNf.numero_nf)
          .eq("status", "divergencia" as any),
      ]);

      const divergencias = divRes.count || 0;
      const total = (totalRes.count || 0) - divergencias;
      const conferidas = confRes.count || 0;

      setSelectedNf((prev) => prev ? { ...prev, totalEtiquetas: total, conferidas } : null);

      if (conferidas === total && total > 0) {
        setTimeout(() => {
          const completeResult: ScanResult = {
            type: "success",
            message: `✅ NF ${selectedNf.numero_nf} - Conferência COMPLETA!`,
            details: `Todas as ${total} etiquetas conferidas. Baixa liberada.`,
          };
          setLastResult(completeResult);
          addToHistory(completeResult);
          playSound("success");
        }, 500);
      }
    } catch (error) {
      console.error("[ConferenciaExterna] Erro ao recarregar progresso:", error);
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

  // ---- BAIXA ----
  function captureGPS() {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleFotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setFotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function resetBaixaForm() {
    setOcorrencia("");
    setObservacao("");
    setRecebedorNome("");
    setFotoFile(null);
    setFotoPreview(null);
  }

  async function submitBaixa() {
    if (!selectedNf || !ocorrencia || !selectedVeiculo) {
      toast({ title: "Atenção", description: "Selecione a ocorrência", variant: "destructive" });
      return;
    }

    if (ocorrencia === "entregue" && !fotoFile) {
      toast({ title: "Atenção", description: "Foto obrigatória para entrega", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      let fotoPath: string | null = null;

      if (fotoFile) {
        const ext = fotoFile.name.split(".").pop() || "jpg";
        const fileName = `${selectedVeiculo.id}/${selectedNf.nf_id}_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("comprovantes")
          .upload(fileName, fotoFile, { contentType: fotoFile.type });
        if (uploadError) throw uploadError;
        fotoPath = fileName;
      }

      const { error: insertError } = await supabase
        .from("baixas_entrega")
        .insert({
          veiculo_id: selectedVeiculo.id,
          nf_id: selectedNf.nf_id,
          status: ocorrencia === "entregue" ? "entregue" : "ocorrencia",
          ocorrencia,
          recebedor_nome: recebedorNome || null,
          foto_path: fotoPath,
          latitude: gpsCoords?.lat || null,
          longitude: gpsCoords?.lng || null,
          registrado_por: user?.id || null,
          registrado_em: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      toast({
        title: "Baixa registrada!",
        description: `NF ${selectedNf.numero_nf} - ${OCORRENCIAS.find((o) => o.value === ocorrencia)?.label}`,
      });

      // Go back to NF list and reload
      setViewMode("nf-list");
      resetBaixaForm();
      setSelectedNf(null);
      await loadNfsForVeiculo(selectedVeiculo.id);
    } catch (error) {
      console.error("Erro ao registrar baixa:", error);
      toast({ title: "Erro", description: "Erro ao registrar baixa", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    if (viewMode === "scanning" || viewMode === "baixa") {
      setViewMode("nf-list");
      setSelectedNf(null);
      setLastResult(null);
      setScanHistory([]);
      resetBaixaForm();
      if (selectedVeiculo) loadNfsForVeiculo(selectedVeiculo.id);
    } else if (viewMode === "nf-list") {
      setViewMode("vehicle-select");
      setSelectedVeiculo(null);
      setNfs([]);
    }
  }

  const nfPercent =
    selectedNf && selectedNf.totalEtiquetas > 0
      ? Math.round((selectedNf.conferidas / selectedNf.totalEtiquetas) * 100)
      : 0;

  // ============ VEHICLE SELECT ============
  if (viewMode === "vehicle-select") {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              <h1 className="text-lg font-semibold">Conf. Externa</h1>
            </div>
            <MobileLogoutButton />
          </div>
        </header>

        <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
          <Card>
            <CardContent className="pt-4">
              <Label className="text-sm font-medium mb-2 block">Selecione o veículo</Label>
              {loadingVeiculos ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : veiculos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum veículo disponível
                </p>
              ) : (
                <div className="space-y-2">
                  {veiculos.map((v) => (
                    <Button
                      key={v.id}
                      variant="outline"
                      className="w-full justify-start h-auto py-3"
                      onClick={() => selectVeiculo(v.id)}
                    >
                      <Truck className="w-4 h-4 mr-3 shrink-0" />
                      <div className="text-left">
                        <p className="font-semibold">{v.placa}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.motorista} • {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  // ============ NF LIST ============
  if (viewMode === "nf-list") {
    const pendingConf = nfs.filter((n) => !n.baixa_status && n.conferidas < n.totalEtiquetas).length;
    const readyBaixa = nfs.filter((n) => !n.baixa_status && n.conferidas === n.totalEtiquetas && n.totalEtiquetas > 0).length;
    const done = nfs.filter((n) => !!n.baixa_status).length;

    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-sidebar-foreground h-8 w-8" onClick={goBack}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold">{selectedVeiculo?.placa}</h1>
                <p className="text-xs opacity-70">{selectedVeiculo?.motorista}</p>
              </div>
            </div>
            <MobileLogoutButton />
          </div>
        </header>

        <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <Card>
              <CardContent className="pt-3 text-center">
                <p className="text-[10px] text-muted-foreground">Conferir</p>
                <p className="text-xl font-bold text-orange-600">{pendingConf}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 text-center">
                <p className="text-[10px] text-muted-foreground">Baixa</p>
                <p className="text-xl font-bold text-blue-600">{readyBaixa}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 text-center">
                <p className="text-[10px] text-muted-foreground">Feitas</p>
                <p className="text-xl font-bold text-green-600">{done}</p>
              </CardContent>
            </Card>
          </div>

          {loadingNfs ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : nfs.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground text-sm">
                Nenhuma NF pronta para conferência externa neste veículo.
                <br />
                <span className="text-xs">As NFs precisam ser conferidas internamente primeiro.</span>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {nfs.map((nf) => {
                const isDone = !!nf.baixa_status;
                const isFullyConferida = nf.conferidas === nf.totalEtiquetas && nf.totalEtiquetas > 0;
                const pct = nf.totalEtiquetas > 0 ? Math.round((nf.conferidas / nf.totalEtiquetas) * 100) : 0;

                return (
                  <Card key={nf.nf_id} className={isDone ? "opacity-60" : ""}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-muted-foreground" />
                          <span className="font-semibold text-sm">NF {nf.numero_nf}</span>
                        </div>
                        {isDone ? (
                          <Badge variant="default" className="bg-green-600 text-xs">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Baixa OK
                          </Badge>
                        ) : isFullyConferida ? (
                          <Badge className="bg-blue-600 text-xs">Pronta p/ baixa</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">{pct}% conferido</Badge>
                        )}
                      </div>

                      <p className="text-sm font-medium">{nf.dest_razao_social}</p>
                      <p className="text-xs text-muted-foreground">
                        {[nf.dest_logradouro, nf.dest_numero, nf.dest_bairro, nf.dest_cidade, nf.dest_uf]
                          .filter(Boolean)
                          .join(", ")}
                      </p>

                      {!isDone && (
                        <div className="space-y-2">
                          <Progress value={pct} className="h-2" />
                          <p className="text-xs text-muted-foreground">
                            {nf.conferidas}/{nf.totalEtiquetas} etiquetas conferidas
                          </p>
                          <div className="flex gap-2">
                            {!isFullyConferida && (
                              <Button size="sm" variant="default" className="flex-1" onClick={() => startScanning(nf)}>
                                <ScanLine className="w-4 h-4 mr-1" />
                                Conferir
                              </Button>
                            )}
                            {isFullyConferida && (
                              <Button size="sm" variant="default" className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => startBaixa(nf)}>
                                <Camera className="w-4 h-4 mr-1" />
                                Registrar Baixa
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  // ============ SCANNING VIEW ============
  if (viewMode === "scanning" && selectedNf) {
    const canDoBaixa = selectedNf.conferidas === selectedNf.totalEtiquetas && selectedNf.totalEtiquetas > 0;

    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-sidebar-foreground h-8 w-8" onClick={goBack}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold">NF {selectedNf.numero_nf}</h1>
                <p className="text-xs opacity-70">{selectedVeiculo?.placa} • Conf. Externa</p>
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
                  <span className="text-muted-foreground">{selectedNf.conferidas} de {selectedNf.totalEtiquetas}</span>
                  <span className="font-bold text-lg">{nfPercent}%</span>
                </div>
                <Progress value={nfPercent} className="h-4" />
                {canDoBaixa && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-success font-semibold">
                      <CheckCircle2 className="w-5 h-5" />
                      Conferência Completa!
                    </div>
                    <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => startBaixa(selectedNf)}>
                      <Camera className="w-4 h-4 mr-2" />
                      Registrar Baixa
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Camera Scanner */}
          {!canDoBaixa && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ScanLine className="w-4 h-4" />
                    Scanner de Câmera
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {nativeScanner.isAvailable && (
                    <Button
                      type="button"
                      className="w-full h-12"
                      disabled={nativeScanner.scanning}
                      onClick={async () => {
                        const code = await nativeScanner.scanOnce();
                        if (code) processScan(code);
                      }}
                    >
                      <ScanLine className="w-4 h-4 mr-2" />
                      {nativeScanner.scanning ? "Abrindo câmera..." : "Scanner Nativo (ML Kit)"}
                    </Button>
                  )}
                  <CameraScanner onScan={processScan} enabled={true} />
                </CardContent>
              </Card>

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
            </>
          )}

          {/* Last Result */}
          {lastResult && (
            <div className={`p-4 rounded-lg flex items-start gap-3 animate-fade-in ${
              lastResult.type === "success" ? "bg-success/20 text-success border-2 border-success"
                : lastResult.type === "warning" ? "bg-warning/20 text-warning border-2 border-warning"
                : "bg-destructive/20 text-destructive border-2 border-destructive"
            }`}>
              {lastResult.type === "success" ? <CheckCircle2 className="w-6 h-6 shrink-0" /> : <AlertCircle className="w-6 h-6 shrink-0" />}
              <div>
                <p className="font-bold text-lg">{lastResult.message}</p>
                {lastResult.details && <p className="text-sm opacity-80">{lastResult.details}</p>}
              </div>
            </div>
          )}

          {/* History */}
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
                    <div key={index} className={`text-xs p-2 rounded flex items-center gap-2 ${
                      item.type === "success" ? "bg-success/10 text-success"
                        : item.type === "warning" ? "bg-warning/10 text-warning"
                        : "bg-destructive/10 text-destructive"
                    }`}>
                      {item.type === "success" ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                      <span className="font-medium">{item.message}</span>
                      {item.details && <span className="opacity-70 truncate">- {item.details}</span>}
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

  // ============ BAIXA VIEW ============
  if (viewMode === "baixa" && selectedNf) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-sidebar-foreground h-8 w-8" onClick={goBack}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-lg font-semibold">Baixa NF {selectedNf.numero_nf}</h1>
                <p className="text-xs opacity-70">{selectedNf.dest_razao_social}</p>
              </div>
            </div>
            <MobileLogoutButton />
          </div>
        </header>

        <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
          {/* Destination info */}
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium">{selectedNf.dest_razao_social}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {[selectedNf.dest_logradouro, selectedNf.dest_numero, selectedNf.dest_bairro, selectedNf.dest_cidade, selectedNf.dest_uf]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </CardContent>
          </Card>

          {/* Ocorrência */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Ocorrência *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {OCORRENCIAS.map((oc) => (
                    <Button
                      key={oc.value}
                      type="button"
                      variant={ocorrencia === oc.value ? "default" : "outline"}
                      size="sm"
                      className="justify-start text-xs h-auto py-2"
                      onClick={() => setOcorrencia(oc.value)}
                    >
                      <span className={ocorrencia === oc.value ? "" : oc.color}>{oc.icon}</span>
                      <span className="ml-1">{oc.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {ocorrencia === "entregue" && (
                <div>
                  <Label className="text-sm">Nome do recebedor</Label>
                  <Input
                    value={recebedorNome}
                    onChange={(e) => setRecebedorNome(e.target.value)}
                    placeholder="Nome de quem recebeu"
                    className="mt-1"
                  />
                </div>
              )}

              <div>
                <Label className="text-sm">Observação</Label>
                <Textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Detalhe a ocorrência..."
                  rows={2}
                  className="mt-1"
                />
              </div>

              {/* Photo */}
              <div>
                <Label className="text-sm mb-2 block">
                  Foto do comprovante {ocorrencia === "entregue" && "*"}
                </Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()} className="flex-1">
                    <Camera className="w-4 h-4 mr-1" />
                    Câmera
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="flex-1">
                    <ImageIcon className="w-4 h-4 mr-1" />
                    Galeria
                  </Button>
                </div>
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoCapture} />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoCapture} />
                {fotoPreview && (
                  <div className="mt-2 relative">
                    <img src={fotoPreview} alt="Comprovante" className="w-full h-40 object-cover rounded-lg border" />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-1 right-1 h-7 w-7 p-0"
                      onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* GPS */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Navigation className="w-3 h-3" />
                {gpsLoading ? (
                  <span>Obtendo localização...</span>
                ) : gpsCoords ? (
                  <span>GPS: {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}</span>
                ) : (
                  <span className="text-destructive">GPS indisponível</span>
                )}
              </div>

              {/* Submit */}
              <Button
                onClick={submitBaixa}
                disabled={submitting || !ocorrencia}
                className="w-full"
                size="lg"
              >
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Registrar Baixa
              </Button>
            </CardContent>
          </Card>
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  return null;
}
