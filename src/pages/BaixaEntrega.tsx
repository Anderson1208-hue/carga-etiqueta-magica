import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Truck,
  Camera,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Package,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Navigation,
} from "lucide-react";

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
}

type OcorrenciaTipo = "entregue" | "recusado" | "endereco_nao_encontrado" | "ausente" | "outros";

const OCORRENCIAS: { value: OcorrenciaTipo; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "entregue", label: "Entregue", icon: <CheckCircle2 className="w-5 h-5" />, color: "text-green-600" },
  { value: "recusado", label: "Recusado", icon: <XCircle className="w-5 h-5" />, color: "text-red-600" },
  { value: "endereco_nao_encontrado", label: "Endereço não encontrado", icon: <MapPin className="w-5 h-5" />, color: "text-orange-600" },
  { value: "ausente", label: "Destinatário ausente", icon: <AlertTriangle className="w-5 h-5" />, color: "text-yellow-600" },
  { value: "outros", label: "Outros", icon: <AlertTriangle className="w-5 h-5" />, color: "text-muted-foreground" },
];

export default function BaixaEntrega() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [selectedVeiculoId, setSelectedVeiculoId] = useState<string>("");
  const [nfs, setNfs] = useState<NfEntrega[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Baixa form state
  const [selectedNfId, setSelectedNfId] = useState<string | null>(null);
  const [ocorrencia, setOcorrencia] = useState<OcorrenciaTipo | "">("");
  const [observacao, setObservacao] = useState("");
  const [recebedorNome, setRecebedorNome] = useState("");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadVeiculos();
    captureGPS();
  }, []);

  useEffect(() => {
    if (selectedVeiculoId) {
      loadNfs(selectedVeiculoId);
    }
  }, [selectedVeiculoId]);

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
      // Get NFs linked to this vehicle
      const { data: vnfs } = await supabase
        .from("veiculo_nfs")
        .select("nf_id")
        .eq("veiculo_id", veiculoId);

      if (!vnfs || vnfs.length === 0) {
        setNfs([]);
        return;
      }

      const nfIds = vnfs.map((v) => v.nf_id);

      // Get NF details
      const { data: nfsData } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, cnpj_destinatario, dest_razao_social, dest_logradouro, dest_numero, dest_bairro, dest_cidade, dest_uf")
        .in("id", nfIds);

      // Get existing baixas for this vehicle
      const { data: baixasData } = await supabase
        .from("baixas_entrega")
        .select("nf_id, status")
        .eq("veiculo_id", veiculoId);

      const baixasMap = new Map((baixasData || []).map((b) => [b.nf_id, b.status]));

      const result: NfEntrega[] = (nfsData || []).map((nf) => ({
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
        baixa_status: baixasMap.get(nf.id) || null,
      }));

      // Sort: pending first, then by NF number
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

  function resetForm() {
    setSelectedNfId(null);
    setOcorrencia("");
    setObservacao("");
    setRecebedorNome("");
    setFotoFile(null);
    setFotoPreview(null);
  }

  function selectNf(nfId: string) {
    if (selectedNfId === nfId) {
      resetForm();
    } else {
      resetForm();
      setSelectedNfId(nfId);
      captureGPS();
    }
  }

  async function submitBaixa() {
    if (!selectedNfId || !ocorrencia || !selectedVeiculoId) {
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

      // Upload photo if exists
      if (fotoFile) {
        const ext = fotoFile.name.split(".").pop() || "jpg";
        const fileName = `${selectedVeiculoId}/${selectedNfId}_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("comprovantes")
          .upload(fileName, fotoFile, { contentType: fotoFile.type });

        if (uploadError) throw uploadError;
        fotoPath = fileName;
      }

      // Insert baixa record
      const { error: insertError } = await supabase
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
        });

      if (insertError) throw insertError;

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5" />
          <span className="font-semibold text-base">Baixa de Entrega</span>
        </div>
        <div className="flex items-center gap-2">
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
        {/* Vehicle Selector */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-sm font-medium mb-2 block">Veículo</Label>
            <Select value={selectedVeiculoId} onValueChange={setSelectedVeiculoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o veículo..." />
              </SelectTrigger>
              <SelectContent>
                {veiculos.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.placa} - {v.motorista}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedVeiculoId && (
          <>
            {/* Progress */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                  <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">Realizadas</p>
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
                {nfs.map((nf) => {
                  const isSelected = selectedNfId === nf.nf_id;
                  const isDone = !!nf.baixa_status;

                  return (
                    <Card
                      key={nf.nf_id}
                      className={`transition-all ${
                        isDone ? "opacity-60" : "cursor-pointer"
                      } ${isSelected ? "ring-2 ring-primary" : ""}`}
                      onClick={() => !isDone && selectNf(nf.nf_id)}
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

                            {/* Photo capture */}
                            <div>
                              <Label className="text-sm mb-2 block">
                                Foto do comprovante {ocorrencia === "entregue" && "*"}
                              </Label>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => cameraInputRef.current?.click()}
                                  className="flex-1"
                                >
                                  <Camera className="w-4 h-4 mr-1" />
                                  Câmera
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => fileInputRef.current?.click()}
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
                              ) : (
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                              )}
                              Registrar Baixa
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {nfs.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma NF vinculada a este veículo
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
