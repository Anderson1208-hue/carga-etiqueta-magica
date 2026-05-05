import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Truck, FileText, MapPin, Loader2, Package, CheckCircle2, AlertTriangle, Clock, XCircle, RotateCcw, Navigation } from "lucide-react";

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
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [veiculo, setVeiculo] = useState<VeiculoInfo | null>(null);
  const [nfs, setNfs] = useState<NfMotorista[]>([]);

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
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
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
            {nfs.map((nf) => (
              <Card key={nf.id} className="p-3">
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
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
