import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useGpsTrackerHybrid } from "@/hooks/useGpsTrackerHybrid";
import { useGpsQueueWorker } from "@/hooks/useGpsQueueWorker";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useLockPortrait } from "@/hooks/useLockPortrait";
import { Truck, FileText, MapPin, Loader2, Package, CheckCircle2, AlertTriangle, Clock, XCircle, RotateCcw, Navigation, Camera, X } from "lucide-react";

interface NfMotorista {
  id: string;
  numero_nf: string;
  dest_razao_social: string | null;
  dest_logradouro: string | null;
  dest_numero: string | null;
  dest_bairro: string | null;
  dest_cidade: string | null;
  dest_uf: string | null;
  dest_cep: string | null;
  peso_bruto: number | null;
  entrega: {
    status: string;
    registrado_em: string | null;
    recebedor_nome: string | null;
    ocorrencia: string | null;
  } | null;
}

interface VeiculoInfo {
  id: string;
  placa: string;
  motorista: string;
  status: string;
  data: string;
}

type OcorrenciaTipo = "entregue" | "recusado" | "endereco_nao_encontrado" | "ausente" | "reentrega" | "outros";

const OCORRENCIAS: { value: OcorrenciaTipo; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "entregue", label: "Entregue", icon: <CheckCircle2 className="w-5 h-5" />, color: "text-success" },
  { value: "recusado", label: "Recusado", icon: <XCircle className="w-5 h-5" />, color: "text-destructive" },
  { value: "endereco_nao_encontrado", label: "Endereço não encontrado", icon: <MapPin className="w-5 h-5" />, color: "text-warning" },
  { value: "ausente", label: "Destinatário ausente", icon: <AlertTriangle className="w-5 h-5" />, color: "text-pending" },
  { value: "reentrega", label: "Reentrega", icon: <RotateCcw className="w-5 h-5" />, color: "text-primary" },
  { value: "outros", label: "Outros", icon: <AlertTriangle className="w-5 h-5" />, color: "text-muted-foreground" },
];

export default function MotoristaAcesso() {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [veiculo, setVeiculo] = useState<VeiculoInfo | null>(null);
  const [nfs, setNfs] = useState<NfMotorista[]>([]);
  const [monitoramentoRotaId, setMonitoramentoRotaId] = useState<string | null>(null);
  const [selectedNfId, setSelectedNfId] = useState<string | null>(null);
  const [ocorrencia, setOcorrencia] = useState<OcorrenciaTipo | "">("");
  const [recebedorNome, setRecebedorNome] = useState("");
  const [observacao, setObservacao] = useState("");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  // Rastreamento GPS em segundo plano (Foreground Service no APK / navigator no web).
  // Posições caem na fila IndexedDB e o worker drena para o backend com retry.
  useGpsTrackerHybrid({
    monitoramentoRotaId,
    enabled: !!veiculo && !!monitoramentoRotaId,
  });
  useGpsQueueWorker(!!veiculo && !!monitoramentoRotaId);
  useWakeLock(!!veiculo);
  useLockPortrait();

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  }

  function clearFoto() {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoFile(null);
    setFotoPreview(null);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length !== 6) {
      setError("O código deve ter 6 caracteres");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("motorista-acesso", {
        body: { code: code.trim().toUpperCase() },
      });

      if (fnError || data?.error) {
        setError(data?.error || "Código não encontrado");
        setVeiculo(null);
        setNfs([]);
      } else {
        setVeiculo(data.veiculo);
        setNfs(data.nfs || []);
        resetBaixaForm();
        captureGPS();
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function resetBaixaForm() {
    setSelectedNfId(null);
    setOcorrencia("");
    setRecebedorNome("");
    setObservacao("");
    clearFoto();
  }

  function selectNf(nf: NfMotorista) {
    if (nf.entrega) return;

    if (selectedNfId === nf.id) {
      resetBaixaForm();
      return;
    }

    resetBaixaForm();
    setSelectedNfId(nf.id);
    captureGPS();
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

  async function reloadMotoristaData() {
    const { data, error: fnError } = await supabase.functions.invoke("motorista-acesso", {
      body: { code: code.trim().toUpperCase() },
    });

    if (!fnError && !data?.error) {
      setVeiculo(data.veiculo);
      setNfs(data.nfs || []);
    }
  }

  async function submitBaixa() {
    if (!selectedNfId || !ocorrencia) {
      toast({ title: "Atenção", description: "Selecione a ocorrência", variant: "destructive" });
      return;
    }
    if (!fotoFile) {
      toast({ title: "Foto obrigatória", description: "Tire ou anexe a foto do canhoto antes de registrar a baixa", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const foto_base64 = await fileToBase64(fotoFile);

      const { data, error: fnError } = await supabase.functions.invoke("motorista-acesso", {
        body: {
          code: code.trim().toUpperCase(),
          action: "registrar-baixa",
          nf_id: selectedNfId,
          ocorrencia,
          recebedor_nome: recebedorNome || null,
          observacao: observacao || null,
          latitude: gpsCoords?.lat ?? null,
          longitude: gpsCoords?.lng ?? null,
          foto_base64,
          foto_mime: fotoFile.type || "image/jpeg",
        },
      });

      if (fnError || data?.error) throw new Error(data?.error || "Erro ao registrar baixa");

      toast({ title: "Baixa registrada!", description: "A NF foi atualizada com sucesso." });
      resetBaixaForm();
      await reloadMotoristaData();
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao registrar baixa",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function getStatusBadge(nf: NfMotorista) {
    if (!nf.entrega) {
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="w-3 h-3" />
          Pendente
        </Badge>
      );
    }
    if (nf.entrega.status === "entregue") {
      return (
        <Badge className="gap-1 bg-green-600">
          <CheckCircle2 className="w-3 h-3" />
          Entregue
        </Badge>
      );
    }
    if (nf.entrega.status === "ocorrencia") {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="w-3 h-3" />
          Ocorrência
        </Badge>
      );
    }
    return <Badge variant="secondary">{nf.entrega.status}</Badge>;
  }

  function formatEndereco(nf: NfMotorista) {
    const parts = [
      nf.dest_logradouro,
      nf.dest_numero,
      nf.dest_bairro,
      nf.dest_cidade,
      nf.dest_uf,
    ].filter(Boolean);
    return parts.join(", ") || "Endereço não informado";
  }

  // Not logged in view - just the access code form
  if (!veiculo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary mx-auto mb-4 flex items-center justify-center">
              <Truck className="w-9 h-9 text-primary-foreground" />
            </div>
            <CardTitle className="text-xl">Acesso do Motorista</CardTitle>
            <p className="text-sm text-muted-foreground">
              Insira o código de 6 dígitos fornecido pelo administrador
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().slice(0, 6));
                  setError("");
                }}
                placeholder="EX: A1B2C3"
                className="text-center text-2xl tracking-[0.3em] font-mono uppercase"
                maxLength={6}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || code.trim().length !== 6}
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Acessar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Vehicle + NFs view
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6" />
            <div>
              <h1 className="font-bold text-lg">{veiculo.placa}</h1>
              <p className="text-sm opacity-80">{veiculo.motorista}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground hover:text-primary-foreground/80"
            onClick={() => {
              setVeiculo(null);
              setNfs([]);
              setCode("");
            }}
          >
            Sair
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Card className="text-center p-3">
            <p className="text-2xl font-bold">{nfs.length}</p>
            <p className="text-xs text-muted-foreground">Total NFs</p>
          </Card>
          <Card className="text-center p-3">
            <p className="text-2xl font-bold text-green-600">
              {nfs.filter((n) => n.entrega?.status === "entregue").length}
            </p>
            <p className="text-xs text-muted-foreground">Entregues</p>
          </Card>
          <Card className="text-center p-3">
            <p className="text-2xl font-bold text-orange-500">
              {nfs.filter((n) => !n.entrega).length}
            </p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </Card>
        </div>

        {/* NF List */}
        <h2 className="font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Notas Fiscais
        </h2>

        {nfs.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nenhuma NF vinculada a este veículo</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {nfs.map((nf) => {
              const isSelected = selectedNfId === nf.id;

              return (
                <Card
                  key={nf.id}
                  role="button"
                  tabIndex={0}
                  className={`p-3 transition-all active:scale-[0.99] ${nf.entrega ? "opacity-70" : "cursor-pointer"} ${isSelected ? "ring-2 ring-primary" : ""}`}
                  onClick={() => selectNf(nf)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") selectNf(nf);
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-mono font-semibold text-sm">
                      NF {nf.numero_nf}
                    </span>
                    {getStatusBadge(nf)}
                  </div>
                  <p className="text-sm font-medium mb-1">
                    {nf.dest_razao_social || "Destinatário não informado"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                    {formatEndereco(nf)}
                  </p>
                  {nf.entrega?.recebedor_nome && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Recebedor: {nf.entrega.recebedor_nome}
                    </p>
                  )}
                  {nf.entrega?.ocorrencia && (
                    <p className="text-xs text-destructive mt-1">
                      Ocorrência: {nf.entrega.ocorrencia}
                    </p>
                  )}

                  {isSelected && !nf.entrega && (
                    <div className="mt-3 pt-3 border-t space-y-4" onClick={(e) => e.stopPropagation()}>
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

                      <div>
                        <Label className="text-sm font-medium mb-2 block">
                          Foto do canhoto <span className="text-destructive">*</span>
                        </Label>
                        {fotoPreview ? (
                          <div className="relative">
                            <img
                              src={fotoPreview}
                              alt="Prévia do canhoto"
                              className="w-full max-h-64 object-contain rounded-md border"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2 h-8 w-8"
                              onClick={clearFoto}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 rounded-md p-6 cursor-pointer hover:bg-muted/50 transition">
                            <Camera className="w-8 h-8 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Tirar foto do canhoto</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={handleFotoChange}
                            />
                          </label>
                        )}
                      </div>

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

                      <Button onClick={submitBaixa} disabled={submitting || !ocorrencia || !fotoFile} className="w-full" size="lg">
                        {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Registrar Baixa
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
