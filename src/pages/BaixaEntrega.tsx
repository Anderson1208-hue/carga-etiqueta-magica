import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useGpsTrackerHybrid } from "@/hooks/useGpsTrackerHybrid";
import { useGpsQueueWorker } from "@/hooks/useGpsQueueWorker";
import { PermissoesOnboarding } from "@/components/mobile/PermissoesOnboarding";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useLockPortrait } from "@/hooks/useLockPortrait";
import { useToast } from "@/hooks/use-toast";
import {
  useOfflineEntregas,
  type OfflineNf,
  saveFotoOffline,
  getFotoOffline,
  deleteFotoOffline,
} from "@/hooks/useOfflineEntregas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MobileLogoutButton } from "@/components/layout/MobileLogoutButton";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import {
  Truck,
  Camera,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Package,
  Image as ImageIcon,
  Navigation,
  Download,
  Upload,
  WifiOff,
  Wifi,
  RotateCcw,
} from "lucide-react";
import { proximoDiaUtilApos } from "@/lib/feriados-rj";
import { isNativeCameraAvailable, takeNativePhoto, type PhotoSource } from "@/hooks/useNativeCamera";

interface Veiculo {
  id: string;
  placa: string;
  motorista: string;
  data: string;
  status: string;
}

interface NfEntrega {
  id: string;
  nf_id: string;
  numero_nf: string;
  dest_razao_social: string;
  dest_logradouro: string;
  dest_numero: string;
  dest_bairro: string;
  dest_cidade: string;
  dest_uf: string;
  cnpj_destinatario: string;
  baixa_status: string | null;
  baixa_ocorrencia?: string | null;
  baixa_recebedor?: string | null;
  baixa_registrado_em?: string | null;
  baixa_foto_path?: string | null;
}

type OcorrenciaTipo = "entregue" | "recusado" | "endereco_nao_encontrado" | "ausente" | "reentrega" | "outros";

const OCORRENCIAS: { value: OcorrenciaTipo; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "entregue", label: "Entregue", icon: <CheckCircle2 className="w-5 h-5" />, color: "text-green-600" },
  { value: "recusado", label: "Recusado", icon: <XCircle className="w-5 h-5" />, color: "text-red-600" },
  { value: "endereco_nao_encontrado", label: "Endereço não encontrado", icon: <MapPin className="w-5 h-5" />, color: "text-orange-600" },
  { value: "ausente", label: "Destinatário ausente", icon: <AlertTriangle className="w-5 h-5" />, color: "text-yellow-600" },
  { value: "reentrega", label: "Reentrega", icon: <RotateCcw className="w-5 h-5" />, color: "text-blue-600" },
  { value: "outros", label: "Outros", icon: <AlertTriangle className="w-5 h-5" />, color: "text-muted-foreground" },
];

export default function BaixaEntrega() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const {
    isOnline,
    pendingSyncCount,
    downloadNfsForVeiculo,
    loadOfflineNfs,
    loadOfflineBaixas,
    saveBaixaOffline,
    getPendingBaixas,
    markAsSynced,
    hasOfflineData,
  } = useOfflineEntregas();

  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [selectedVeiculoId, setSelectedVeiculoId] = useState<string>("");
  const [selectedData, setSelectedData] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [nfs, setNfs] = useState<NfEntrega[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [vehicleHasOffline, setVehicleHasOffline] = useState(false);
  const [monitoramentoRotaId, setMonitoramentoRotaId] = useState<string | null>(null);

  const veiculosFiltrados = useMemo(
    () => veiculos.filter((v) => (v.data || "").startsWith(selectedData)),
    [veiculos, selectedData]
  );

  // GPS tracker for monitoring (web em browser / Foreground Service em APK Android)
  // Em ambos os casos, posições entram em fila local (IndexedDB) e o worker
  // drena com retry exponencial — não perde ponto em área sem sinal.
  useGpsTrackerHybrid({
    monitoramentoRotaId,
    enabled: !!selectedVeiculoId && !!monitoramentoRotaId,
  });
  useGpsQueueWorker(!!selectedVeiculoId && !!monitoramentoRotaId);

  // Mantém tela acesa enquanto há veículo selecionado (em rota).
  useWakeLock(!!selectedVeiculoId);
  // Trava retrato no APK.
  useLockPortrait();

  // Baixa form state
  const [selectedNfId, setSelectedNfId] = useState<string | null>(null);
  const [ocorrencia, setOcorrencia] = useState<OcorrenciaTipo | "">("");
  const [observacao, setObservacao] = useState("");
  const [recebedorNome, setRecebedorNome] = useState("");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [loadingFoto, setLoadingFoto] = useState<string | null>(null);
  const [mostrarBaixadas, setMostrarBaixadas] = useState(false);
  // Quando a IA detecta foto ruim, mantemos a baixa criada para permitir
  // refazer apenas a foto sem criar nova baixa.
  const [revalidacaoBaixaId, setRevalidacaoBaixaId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOnline) {
      loadVeiculos();
    }
    captureGPS();
  }, [isOnline]);

  // Auto-sync: ao voltar online (e fora do modo offline manual), sincroniza pendentes
  // automaticamente, com pequeno debounce para evitar disparo em rajada de eventos.
  useEffect(() => {
    if (!isOnline || offlineMode) return;
    const t = setTimeout(async () => {
      const pending = await getPendingBaixas();
      if (pending.length > 0 && !syncing) {
        handleSync();
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [isOnline, offlineMode]);

  useEffect(() => {
    if (selectedVeiculoId) {
      if (isOnline && !offlineMode) {
        loadNfs(selectedVeiculoId);
      } else {
        loadFromOffline(selectedVeiculoId);
      }
      checkOfflineData(selectedVeiculoId);
      // Find active monitoring route for this vehicle
      if (isOnline) {
        supabase
          .from("monitoramento_rotas")
          .select("id")
          .eq("veiculo_id", selectedVeiculoId)
          .eq("status", "ativa")
          .limit(1)
          .maybeSingle()
          .then(({ data }) => {
            setMonitoramentoRotaId(data ? (data as any).id : null);
          });
      }
    } else {
      setMonitoramentoRotaId(null);
    }
  }, [selectedVeiculoId, offlineMode]);

  async function checkOfflineData(veiculoId: string) {
    const has = await hasOfflineData(veiculoId);
    setVehicleHasOffline(has);
  }

  async function loadVeiculos() {
    const { data } = await supabase
      .from("veiculos")
      .select("id, placa, motorista, data, status")
      .in("status", ["pendente", "em_rota"])
      .order("created_at", { ascending: false });

    setVeiculos(data || []);
  }

  async function loadNfs(veiculoId: string) {
    setLoading(true);
    try {
      const { data: vnfs } = await supabase
        .from("veiculo_nfs")
        .select("nf_id")
        .eq("veiculo_id", veiculoId)
        .limit(2000);

      if (!vnfs || vnfs.length === 0) {
        setNfs([]);
        return;
      }

      const nfIds = vnfs.map((v) => v.nf_id);

      const { data: nfsData } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, cnpj_destinatario, dest_razao_social, dest_logradouro, dest_numero, dest_bairro, dest_cidade, dest_uf")
        .in("id", nfIds)
        .limit(2000);

      const { data: baixasData } = await supabase
        .from("baixas_entrega")
        .select("nf_id, status, ocorrencia, recebedor_nome, registrado_em, foto_path")
        .eq("veiculo_id", veiculoId)
        .limit(2000);

      const baixasMap = new Map((baixasData || []).map((b) => [b.nf_id, b]));

      const result: NfEntrega[] = (nfsData || []).map((nf) => {
        const baixa = baixasMap.get(nf.id);
        return {
          id: nf.id,
          nf_id: nf.id,
          numero_nf: nf.numero_nf,
          dest_razao_social: nf.dest_razao_social || "Não informado",
          dest_logradouro: nf.dest_logradouro || "",
          dest_numero: nf.dest_numero || "",
          dest_bairro: nf.dest_bairro || "",
          dest_cidade: nf.dest_cidade || "",
          dest_uf: nf.dest_uf || "",
          cnpj_destinatario: nf.cnpj_destinatario || "",
          baixa_status: baixa?.status || null,
          baixa_ocorrencia: baixa?.ocorrencia || null,
          baixa_recebedor: baixa?.recebedor_nome || null,
          baixa_registrado_em: baixa?.registrado_em || null,
          baixa_foto_path: baixa?.foto_path || null,
        };
      });

      result.sort((a, b) => {
        if (a.baixa_status && !b.baixa_status) return 1;
        if (!a.baixa_status && b.baixa_status) return -1;
        return a.numero_nf.localeCompare(b.numero_nf);
      });

      setNfs(result);
    } catch (error) {
      console.error("Error loading NFs:", error);
      toast({ title: "Erro", description: "Erro ao carregar notas fiscais", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function loadFromOffline(veiculoId: string) {
    setLoading(true);
    try {
      const cachedNfs = await loadOfflineNfs(veiculoId);
      const cachedBaixas = await loadOfflineBaixas(veiculoId);

      const baixasMap = new Map(cachedBaixas.map((b) => [b.nf_id, b.ocorrencia]));

      const result: NfEntrega[] = cachedNfs.map((nf) => ({
        id: nf.nf_id,
        nf_id: nf.nf_id,
        numero_nf: nf.numero_nf,
        dest_razao_social: nf.dest_razao_social || "Não informado",
        dest_logradouro: nf.dest_logradouro || "",
        dest_numero: nf.dest_numero || "",
        dest_bairro: nf.dest_bairro || "",
        dest_cidade: nf.dest_cidade || "",
        dest_uf: nf.dest_uf || "",
        cnpj_destinatario: nf.cnpj_destinatario || "",
        baixa_status: baixasMap.get(nf.nf_id) || null,
      }));

      result.sort((a, b) => {
        if (a.baixa_status && !b.baixa_status) return 1;
        if (!a.baixa_status && b.baixa_status) return -1;
        return a.numero_nf.localeCompare(b.numero_nf);
      });

      setNfs(result);
    } catch {
      setNfs([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadOffline() {
    if (!selectedVeiculoId) return;
    setDownloading(true);
    try {
      const { data: vnfs } = await supabase
        .from("veiculo_nfs")
        .select("nf_id")
        .eq("veiculo_id", selectedVeiculoId)
        .limit(2000);

      if (!vnfs || vnfs.length === 0) {
        toast({ title: "Sem NFs", description: "Nenhuma NF vinculada a este veículo", variant: "destructive" });
        return;
      }

      const nfIds = vnfs.map((v) => v.nf_id);

      const { data: nfsData } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, cnpj_destinatario, dest_razao_social, dest_logradouro, dest_numero, dest_bairro, dest_cidade, dest_uf")
        .in("id", nfIds)
        .limit(2000);

      const offlineData: OfflineNf[] = (nfsData || []).map((nf) => ({
        nf_id: nf.id,
        veiculo_id: selectedVeiculoId,
        numero_nf: nf.numero_nf,
        dest_razao_social: nf.dest_razao_social || "Não informado",
        dest_logradouro: nf.dest_logradouro || "",
        dest_numero: nf.dest_numero || "",
        dest_bairro: nf.dest_bairro || "",
        dest_cidade: nf.dest_cidade || "",
        dest_uf: nf.dest_uf || "",
        cnpj_destinatario: nf.cnpj_destinatario || "",
      }));

      const count = await downloadNfsForVeiculo(selectedVeiculoId, offlineData);
      setVehicleHasOffline(true);

      toast({
        title: "Download concluído!",
        description: `${count} NFs salvas para uso offline`,
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({ title: "Erro", description: "Erro ao baixar dados offline", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const pending = await getPendingBaixas();
      if (pending.length === 0) {
        toast({ title: "Nada para transmitir", description: "Todas as baixas já foram enviadas" });
        setSyncing(false);
        return;
      }

      const syncedIds: string[] = [];
      let errors = 0;

      for (const baixa of pending) {
        try {
          // 0) Idempotência: se já existe baixa com (nf_id, registrado_em) no servidor,
          // não re-insere — apenas marca como sincronizada localmente.
          // Cobre o caso onde insert anterior funcionou mas markAsSynced falhou.
          const { data: existente } = await supabase
            .from("baixas_entrega")
            .select("id")
            .eq("nf_id", baixa.nf_id)
            .eq("registrado_em", baixa.registrado_em)
            .maybeSingle();

          if (existente) {
            syncedIds.push(baixa.id);
            await deleteFotoOffline(baixa.id);
            continue;
          }

          // 1) Tenta upload da foto, se houver foto offline persistida
          let fotoPath: string | null = null;
          const fotoBlob = await getFotoOffline(baixa.id);
          if (fotoBlob) {
            const ext = (fotoBlob.type?.split("/")?.[1] || "jpg").replace("jpeg", "jpg");
            const fileName = `${baixa.veiculo_id}/${baixa.nf_id}_${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("comprovantes")
              .upload(fileName, fotoBlob, { contentType: fotoBlob.type || "image/jpeg" });
            if (upErr) throw upErr;
            fotoPath = fileName;
          }

          // 2) Insere a baixa
          const { data: baixaSync, error } = await supabase.from("baixas_entrega").insert({
            veiculo_id: baixa.veiculo_id,
            nf_id: baixa.nf_id,
            status: baixa.status,
            ocorrencia: baixa.ocorrencia,
            recebedor_nome: baixa.recebedor_nome,
            foto_path: fotoPath,
            latitude: baixa.latitude,
            longitude: baixa.longitude,
            registrado_por: baixa.registrado_por,
            registrado_em: baixa.registrado_em,
          }).select("id").single();

          if (error) throw error;

          // Valida foto em background
          if (fotoPath && baixaSync?.id) {
            supabase.functions
              .invoke("validar-canhoto", { body: { baixa_id: baixaSync.id } })
              .catch((e) => console.warn("validar-canhoto (sync) falhou:", e));
          }

          syncedIds.push(baixa.id);
          // 3) Limpa foto local após sucesso (libera storage do device)
          await deleteFotoOffline(baixa.id);
        } catch (err) {
          console.error("Sync error for baixa:", baixa.id, err);
          errors++;
        }
      }

      if (syncedIds.length > 0) {
        await markAsSynced(syncedIds);
      }

      if (errors > 0) {
        toast({
          title: "Transmissão parcial",
          description: `${syncedIds.length} enviadas, ${errors} com erro`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Transmissão concluída!",
          description: `${syncedIds.length} baixa(s) enviada(s) com sucesso`,
        });
      }

      // Reload data
      if (selectedVeiculoId && isOnline) {
        loadNfs(selectedVeiculoId);
      }
    } catch (error) {
      console.error("Sync error:", error);
      toast({ title: "Erro", description: "Erro na transmissão", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

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
    // Revoke previous URL if exists
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  }

  async function handleNativePhoto(source: PhotoSource) {
    // Em APK Android usa câmera/galeria nativa; em web cai no <input> tradicional.
    if (!isNativeCameraAvailable()) {
      if (source === "camera") cameraInputRef.current?.click();
      else fileInputRef.current?.click();
      return;
    }
    try {
      const result = await takeNativePhoto(source);
      if (!result) return;
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
      setFotoFile(result.file);
      setFotoPreview(result.previewUrl);
    } catch (err: any) {
      // Usuário cancelou ou negou permissão — silencioso, mas loga.
      console.warn("Captura nativa cancelada/falhou:", err?.message || err);
    }
  }

  function resetForm() {
    setSelectedNfId(null);
    setOcorrencia("");
    setObservacao("");
    setRecebedorNome("");
    // Revoke object URL to free memory
    if (fotoPreview) {
      URL.revokeObjectURL(fotoPreview);
    }
    setFotoFile(null);
    setFotoPreview(null);
    // Clear file inputs so device doesn't keep temp files referenced
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function selectNf(nfId: string) {
    if (selectedNfId === nfId) {
      resetForm();
    } else {
      resetForm();
      setSelectedNfId(nfId);
      captureGPS();
      // Carrega foto da baixa sob demanda (lazy)
      const nf = nfs.find((n) => n.nf_id === nfId);
      if (nf?.baixa_foto_path && !fotoUrls[nf.baixa_foto_path]) {
        loadFotoUrl(nf.baixa_foto_path);
      }
    }
  }

  async function loadFotoUrl(path: string) {
    setLoadingFoto(path);
    try {
      const { data } = await supabase.storage
        .from("comprovantes")
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) {
        setFotoUrls((prev) => ({ ...prev, [path]: data.signedUrl }));
      }
    } catch (e) {
      console.error("Erro ao carregar foto:", e);
    } finally {
      setLoadingFoto(null);
    }
  }

  async function submitBaixa() {
    if (!selectedNfId || !ocorrencia || !selectedVeiculoId) {
      toast({ title: "Atenção", description: "Selecione a ocorrência", variant: "destructive" });
      return;
    }

    // Foto obrigatória para entrega — vale online E offline (sync usa a foto salva)
    if (ocorrencia === "entregue" && !fotoFile) {
      toast({ title: "Atenção", description: "Foto obrigatória para entrega", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      // Reentrega exige conexão (precisa atualizar vínculos no servidor)
      if ((!isOnline || offlineMode) && ocorrencia === "reentrega") {
        toast({ title: "Sem conexão", description: "A ocorrência Reentrega requer conexão com a internet", variant: "destructive" });
        setSubmitting(false);
        return;
      }

      // If offline or offlineMode, save locally (com foto persistida em IndexedDB)
      if (!isOnline || offlineMode) {
        const record = await saveBaixaOffline({
          veiculo_id: selectedVeiculoId,
          nf_id: selectedNfId,
          status: ocorrencia === "entregue" ? "entregue" : "ocorrencia",
          ocorrencia: ocorrencia,
          recebedor_nome: recebedorNome || null,
          observacao: observacao || null,
          latitude: gpsCoords?.lat || null,
          longitude: gpsCoords?.lng || null,
          registrado_por: user?.id || null,
          registrado_em: new Date().toISOString(),
        });

        if (fotoFile) {
          await saveFotoOffline(record.id, fotoFile);
        }

        toast({
          title: "Baixa salva offline!",
          description: `NF ${nfs.find((n) => n.nf_id === selectedNfId)?.numero_nf} - será transmitida quando houver sinal`,
        });

        resetForm();
        // Reload from offline to update status
        await loadFromOffline(selectedVeiculoId);
        return;
      }

      // Online submission (original logic)
      let fotoPath: string | null = null;

      if (fotoFile) {
        const ext = fotoFile.name.split(".").pop() || "jpg";
        const fileName = `${selectedVeiculoId}/${selectedNfId}_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("comprovantes")
          .upload(fileName, fotoFile, { contentType: fotoFile.type });

        if (uploadError) throw uploadError;
        fotoPath = fileName;
      }

      const { data: baixaInserida, error: insertError } = await supabase
        .from("baixas_entrega")
        .insert({
          veiculo_id: selectedVeiculoId,
          nf_id: selectedNfId,
          status: ocorrencia === "entregue" ? "entregue" : "ocorrencia",
          ocorrencia: ocorrencia,
          recebedor_nome: recebedorNome || null,
          foto_path: fotoPath,
          latitude: gpsCoords?.lat || null,
          longitude: gpsCoords?.lng || null,
          registrado_por: user?.id || null,
          registrado_em: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Valida foto do canhoto em background (não bloqueia o motorista)
      if (fotoPath && baixaInserida?.id) {
        supabase.functions
          .invoke("validar-canhoto", { body: { baixa_id: baixaInserida.id } })
          .then(({ data }) => {
            const status = (data as { status?: string } | null)?.status;
            if (status === "ruim") {
              toast({
                title: "⚠️ Foto do canhoto com problemas",
                description: "Confira no Relatório de Baixas — pode ser necessário refazer.",
                variant: "destructive",
              });
            } else if (status === "alerta") {
              toast({
                title: "Atenção na foto do canhoto",
                description: "Qualidade abaixo do ideal — confira no Relatório.",
              });
            }
          })
          .catch((e) => console.warn("validar-canhoto falhou (não-crítico):", e));
      }

      // Se for "Reentrega": NF volta para a Preparação
      if (ocorrencia === "reentrega") {
        // 1) Garante status_entrega = CARGA NO DEPOSITO (não pode ser ENTREGUE/RECUSADO)
        await supabase
          .from("notas_fiscais")
          .update({ status_entrega: "CARGA NO DEPOSITO" })
          .eq("id", selectedNfId);

        // 2) Remove vínculo veiculo_nfs (libera para nova programação)
        await supabase
          .from("veiculo_nfs")
          .delete()
          .eq("nf_id", selectedNfId);

        // 3) Cria/atualiza agendamento REENTREGA com data = próximo dia útil
        const proxima = proximoDiaUtilApos(new Date());
        const dataAg = `${proxima.getFullYear()}-${String(proxima.getMonth() + 1).padStart(2, "0")}-${String(proxima.getDate()).padStart(2, "0")}`;

        const { data: existingAg } = await supabase
          .from("agendamentos")
          .select("id")
          .eq("nf_id", selectedNfId)
          .maybeSingle();

        if (existingAg?.id) {
          await supabase
            .from("agendamentos")
            .update({ status: "REENTREGA", data_agendamento: dataAg })
            .eq("id", existingAg.id);
        } else {
          await supabase
            .from("agendamentos")
            .insert({ nf_id: selectedNfId, status: "REENTREGA", data_agendamento: dataAg, created_by: user?.id || null });
        }
      }

      toast({
        title: "Baixa registrada!",
        description: `NF ${nfs.find((n) => n.nf_id === selectedNfId)?.numero_nf} - ${OCORRENCIAS.find((o) => o.value === ocorrencia)?.label}`,
      });

      resetForm();
      loadNfs(selectedVeiculoId);
    } catch (error) {
      console.error("Submit error:", error);
      toast({ title: "Erro", description: "Erro ao registrar baixa", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const pendingCount = nfs.filter((n) => !n.baixa_status).length;
  const doneCount = nfs.filter((n) => n.baixa_status).length;
  const nfsVisiveis = useMemo(
    () => (mostrarBaixadas ? nfs : nfs.filter((n) => !n.baixa_status)),
    [nfs, mostrarBaixadas]
  );

  return (
    <div className="min-h-screen bg-background">
      <PermissoesOnboarding active={!!selectedVeiculoId && !!monitoramentoRotaId} />
      {/* Header */}
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5" />
          <span className="font-semibold text-base">Baixa de Entrega</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Online/Offline indicator */}
          <Badge
            variant="secondary"
            className={`text-xs gap-1 ${isOnline ? "" : "bg-orange-500 text-white"}`}
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isOnline ? "Online" : "Offline"}
          </Badge>
          {gpsCoords && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Navigation className="w-3 h-3" />
              GPS
            </Badge>
          )}
          <MobileLogoutButton />
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Sync banner */}
        {pendingSyncCount > 0 && isOnline && (
          <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium">
                    {pendingSyncCount} baixa(s) pendente(s) de transmissão
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {syncing ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Upload className="w-4 h-4 mr-1" />
                  )}
                  Transmitir
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vehicle Selector */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label className="text-sm font-medium mb-2 block">Data da carga</Label>
              <Input
                type="date"
                value={selectedData}
                onChange={(e) => {
                  setSelectedData(e.target.value);
                  setSelectedVeiculoId("");
                }}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Veículo</Label>
              <Select value={selectedVeiculoId} onValueChange={setSelectedVeiculoId}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    veiculosFiltrados.length === 0
                      ? "Nenhum veículo nesta data"
                      : "Selecione o veículo..."
                  } />
                </SelectTrigger>
                <SelectContent>
                  {veiculosFiltrados.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.placa} - {v.motorista}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {selectedVeiculoId && (
          <>
            {/* Offline actions */}
            <div className="flex gap-2">
              {isOnline && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleDownloadOffline}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Download className="w-4 h-4 mr-1" />
                  )}
                  Baixar para Offline
                </Button>
              )}
              {vehicleHasOffline && (
                <Button
                  variant={offlineMode ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setOfflineMode(!offlineMode)}
                >
                  <WifiOff className="w-4 h-4 mr-1" />
                  {offlineMode ? "Modo Offline Ativo" : "Usar Offline"}
                </Button>
              )}
            </div>

            {(offlineMode || !isOnline) && (
              <div className="text-xs text-center text-orange-600 bg-orange-50 dark:bg-orange-950/20 rounded-lg py-2 px-3">
                ⚠️ Modo offline — baixas serão salvas localmente. Use "Transmitir" quando voltar ao sinal.
              </div>
            )}

            {/* Progress */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                  <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
                </CardContent>
              </Card>
              <Card
                role="button"
                tabIndex={0}
                onClick={() => setMostrarBaixadas((v) => !v)}
                className="cursor-pointer active:scale-[0.99] transition-transform"
              >
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    Realizadas {mostrarBaixadas ? "(ocultar)" : "(mostrar)"}
                  </p>
                  <p className="text-2xl font-bold text-green-600">{doneCount}</p>
                </CardContent>
              </Card>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              /* NF List */
              <div className="space-y-3">
                {nfsVisiveis.map((nf) => {
                  const isSelected = selectedNfId === nf.nf_id;
                  const isDone = !!nf.baixa_status;

                  return (
                    <Card
                      key={nf.nf_id}
                      role="button"
                      tabIndex={0}
                      className={`transition-all cursor-pointer active:scale-[0.99] ${
                        isDone && !isSelected ? "opacity-70" : ""
                      } ${isSelected ? "ring-2 ring-primary" : ""}`}
                      onClick={() => selectNf(nf.nf_id)}
                    >
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-muted-foreground" />
                            <span className="font-semibold text-sm">NF {nf.numero_nf}</span>
                          </div>
                          {isDone ? (
                            <Badge variant="default" className="bg-green-600 text-xs">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Registrada
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Pendente</Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium">{nf.dest_razao_social}</p>
                        <p className="text-xs text-muted-foreground">
                          {[nf.dest_logradouro, nf.dest_numero, nf.dest_bairro, nf.dest_cidade, nf.dest_uf]
                            .filter(Boolean)
                            .join(", ")}
                        </p>

                        {/* Visualização da baixa registrada */}
                        {isSelected && isDone && (
                          <div
                            className="mt-3 pt-3 border-t space-y-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className="text-muted-foreground">Ocorrência</p>
                                <p className="font-medium">
                                  {OCORRENCIAS.find((o) => o.value === nf.baixa_ocorrencia)?.label || nf.baixa_ocorrencia || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Data/Hora</p>
                                <p className="font-medium">
                                  {nf.baixa_registrado_em
                                    ? new Date(nf.baixa_registrado_em).toLocaleString("pt-BR")
                                    : "—"}
                                </p>
                              </div>
                              {nf.baixa_recebedor && (
                                <div className="col-span-2">
                                  <p className="text-muted-foreground">Recebedor</p>
                                  <p className="font-medium">{nf.baixa_recebedor}</p>
                                </div>
                              )}
                            </div>

                            {nf.baixa_foto_path ? (
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Comprovante</Label>
                                {loadingFoto === nf.baixa_foto_path ? (
                                  <div className="flex justify-center py-6 border rounded-lg">
                                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                  </div>
                                ) : fotoUrls[nf.baixa_foto_path] ? (
                                  <a
                                    href={fotoUrls[nf.baixa_foto_path]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <img
                                      src={fotoUrls[nf.baixa_foto_path]}
                                      alt="Canhoto"
                                      className="w-full max-h-64 object-contain rounded-lg border bg-muted"
                                      loading="lazy"
                                    />
                                  </a>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => nf.baixa_foto_path && loadFotoUrl(nf.baixa_foto_path)}
                                  >
                                    <ImageIcon className="w-4 h-4 mr-1" />
                                    Ver foto
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs italic text-muted-foreground">Sem foto registrada</p>
                            )}
                          </div>
                        )}

                        {/* Expanded form when selected */}
                        {isSelected && !isDone && (
                          <div
                            className="mt-3 pt-3 border-t space-y-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Ocorrência */}
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
                                    <span className={ocorrencia === oc.value ? "" : oc.color}>
                                      {oc.icon}
                                    </span>
                                    <span className="ml-1">{oc.label}</span>
                                  </Button>
                                ))}
                              </div>
                            </div>

                            {/* Recebedor */}
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

                            {/* Observação */}
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

                            {/* Photo capture - only in online mode */}
                            {/* Photo capture - sempre disponível (foto offline persiste em IndexedDB) */}
                            {true && (
                              <div>
                                <Label className="text-sm mb-2 block">
                                  Foto do comprovante {ocorrencia === "entregue" && "*"}
                                </Label>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleNativePhoto("camera")}
                                    className="flex-1"
                                  >
                                    <Camera className="w-4 h-4 mr-1" />
                                    Câmera
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleNativePhoto("gallery")}
                                    className="flex-1"
                                  >
                                    <ImageIcon className="w-4 h-4 mr-1" />
                                    Galeria
                                  </Button>
                                </div>
                                <input
                                  ref={cameraInputRef}
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  onChange={handleFotoCapture}
                                />
                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={handleFotoCapture}
                                />
                                {fotoPreview && (
                                  <div className="mt-2 relative">
                                    <img
                                      src={fotoPreview}
                                      alt="Comprovante"
                                      className="w-full h-40 object-cover rounded-lg border"
                                    />
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      className="absolute top-1 right-1 h-7 w-7 p-0"
                                      onClick={() => {
                                        setFotoFile(null);
                                        setFotoPreview(null);
                                      }}
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}

                            {(offlineMode || !isOnline) && (
                              <p className="text-xs text-muted-foreground italic">
                                📷 Foto salva no aparelho — será enviada ao sincronizar
                              </p>
                            )}

                            {/* GPS info */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Navigation className="w-3 h-3" />
                              {gpsLoading ? (
                                <span>Obtendo localização...</span>
                              ) : gpsCoords ? (
                                <span>
                                  GPS: {gpsCoords.lat.toFixed(6)}, {gpsCoords.lng.toFixed(6)}
                                </span>
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
                              {submitting ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : offlineMode || !isOnline ? (
                                <Download className="w-4 h-4 mr-2" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                              )}
                              {offlineMode || !isOnline ? "Salvar Offline" : "Registrar Baixa"}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {nfs.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {offlineMode || !isOnline
                      ? "Nenhuma NF offline. Baixe os dados antes de sair."
                      : "Nenhuma NF vinculada a este veículo"}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <MobileBottomNav />
    </div>
  );
}
