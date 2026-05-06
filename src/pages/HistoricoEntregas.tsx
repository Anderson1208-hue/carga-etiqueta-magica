import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages, fetchInChunks } from "@/lib/supabase-pagination";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MapPin,
  Search,
  Image as ImageIcon,
  Eye,
  Loader2,
  FileText,
  Truck,
  Calendar,
  User,
  Navigation,
  Package,
  Filter,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BaixaRegistro {
  id: string;
  nf_id: string;
  veiculo_id: string;
  status: string;
  ocorrencia: string | null;
  recebedor_nome: string | null;
  foto_path: string | null;
  latitude: number | null;
  longitude: number | null;
  registrado_por: string | null;
  registrado_em: string | null;
  created_at: string;
  // joined
  numero_nf: string;
  dest_razao_social: string;
  dest_cidade: string;
  dest_uf: string;
  placa: string;
  motorista: string;
  operador_nome: string | null;
}

const OCORRENCIA_MAP: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  entregue: { label: "Entregue", icon: <CheckCircle2 className="w-4 h-4" />, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  recusado: { label: "Recusado", icon: <XCircle className="w-4 h-4" />, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  endereco_nao_encontrado: { label: "End. não encontrado", icon: <MapPin className="w-4 h-4" />, color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  ausente: { label: "Ausente", icon: <AlertTriangle className="w-4 h-4" />, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  outros: { label: "Outros", icon: <AlertTriangle className="w-4 h-4" />, color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
};

export default function HistoricoEntregas() {
  const [baixas, setBaixas] = useState<BaixaRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroOcorrencia, setFiltroOcorrencia] = useState<string>("todas");
  const [selectedBaixa, setSelectedBaixa] = useState<BaixaRegistro | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [fotoLoading, setFotoLoading] = useState(false);

  useEffect(() => {
    loadBaixas();
  }, []);

  async function loadBaixas() {
    setLoading(true);
    try {
      // Load baixas with related data (paginado para >1000 registros)
      const baixasData = await fetchAllPages<any>((from, to) =>
        supabase
          .from("baixas_entrega")
          .select("*")
          .order("registrado_em", { ascending: false })
          .range(from, to)
      );

      if (!baixasData || baixasData.length === 0) {
        setBaixas([]);
        return;
      }

      // Get unique NF IDs and Vehicle IDs
      const nfIds = [...new Set(baixasData.map((b: any) => b.nf_id as string))];
      const veiculoIds = [...new Set(baixasData.map((b: any) => b.veiculo_id as string))];
      const operadorIds = [...new Set(baixasData.map((b: any) => b.registrado_por).filter(Boolean))] as string[];

      // Parallel fetch related data — chunked para suportar >1000 ids
      const [nfsArr, veiculosArr, profilesArr] = await Promise.all([
        fetchInChunks<string, any>(nfIds, async (chunk) => {
          const { data } = await supabase
            .from("notas_fiscais")
            .select("id, numero_nf, dest_razao_social, dest_cidade, dest_uf")
            .in("id", chunk);
          return data || [];
        }),
        fetchInChunks<string, any>(veiculoIds, async (chunk) => {
          const { data } = await supabase
            .from("veiculos")
            .select("id, placa, motorista")
            .in("id", chunk);
          return data || [];
        }),
        operadorIds.length > 0
          ? fetchInChunks<string, any>(operadorIds, async (chunk) => {
              const { data } = await supabase
                .from("profiles")
                .select("id, full_name, email")
                .in("id", chunk);
              return data || [];
            })
          : Promise.resolve([] as any[]),
      ]);
      const nfsRes = { data: nfsArr };
      const veiculosRes = { data: veiculosArr };
      const profilesRes = { data: profilesArr };

      const nfMap = new Map((nfsRes.data || []).map((n) => [n.id, n]));
      const veiculoMap = new Map((veiculosRes.data || []).map((v) => [v.id, v]));
      const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));

      const result: BaixaRegistro[] = baixasData.map((b) => {
        const nf = nfMap.get(b.nf_id);
        const veiculo = veiculoMap.get(b.veiculo_id);
        const operador = b.registrado_por ? profileMap.get(b.registrado_por) : null;

        return {
          ...b,
          numero_nf: nf?.numero_nf || "—",
          dest_razao_social: nf?.dest_razao_social || "—",
          dest_cidade: nf?.dest_cidade || "—",
          dest_uf: nf?.dest_uf || "—",
          placa: veiculo?.placa || "—",
          motorista: veiculo?.motorista || "—",
          operador_nome: operador?.full_name || operador?.email || null,
        };
      });

      setBaixas(result);
    } catch (error) {
      console.error("Error loading baixas:", error);
    } finally {
      setLoading(false);
    }
  }

  async function openDetalhes(baixa: BaixaRegistro) {
    setSelectedBaixa(baixa);
    setFotoUrl(null);

    if (baixa.foto_path) {
      setFotoLoading(true);
      const { data } = await supabase.storage
        .from("comprovantes")
        .createSignedUrl(baixa.foto_path, 300); // 5 min URL

      setFotoUrl(data?.signedUrl || null);
      setFotoLoading(false);
    }
  }

  // Filters
  const filtered = baixas.filter((b) => {
    const matchSearch =
      !searchTerm ||
      b.numero_nf.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.dest_razao_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.placa.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.motorista.toLowerCase().includes(searchTerm.toLowerCase());

    const matchOcorrencia = filtroOcorrencia === "todas" || b.ocorrencia === filtroOcorrencia;

    return matchSearch && matchOcorrencia;
  });

  // Stats
  const totalEntregues = baixas.filter((b) => b.ocorrencia === "entregue").length;
  const totalOcorrencias = baixas.filter((b) => b.ocorrencia && b.ocorrencia !== "entregue").length;

  const ocInfo = selectedBaixa?.ocorrencia ? OCORRENCIA_MAP[selectedBaixa.ocorrencia] : null;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico de Entregas</h1>
          <p className="text-muted-foreground">Acompanhe todas as baixas de entrega e visualize os comprovantes</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Baixas</p>
                <p className="text-2xl font-bold">{baixas.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Entregues</p>
                <p className="text-2xl font-bold text-green-600">{totalEntregues}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ocorrências</p>
                <p className="text-2xl font-bold text-orange-600">{totalOcorrencias}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por NF, destinatário, placa ou motorista..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filtroOcorrencia} onValueChange={setFiltroOcorrencia}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filtrar ocorrência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                  <SelectItem value="recusado">Recusado</SelectItem>
                  <SelectItem value="endereco_nao_encontrado">End. não encontrado</SelectItem>
                  <SelectItem value="ausente">Ausente</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
              {(searchTerm || filtroOcorrencia !== "todas") && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSearchTerm("");
                    setFiltroOcorrencia("todas");
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nenhuma baixa encontrada</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Ocorrência</TableHead>
                    <TableHead>Foto</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((b) => {
                    const oc = b.ocorrencia ? OCORRENCIA_MAP[b.ocorrencia] : null;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {b.registrado_em
                            ? format(new Date(b.registrado_em), "dd/MM/yy HH:mm", { locale: ptBR })
                            : "—"}
                        </TableCell>
                        <TableCell className="font-medium">{b.numero_nf}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{b.dest_razao_social}</TableCell>
                        <TableCell className="text-sm">
                          {b.dest_cidade}/{b.dest_uf}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{b.placa}</div>
                          <div className="text-xs text-muted-foreground">{b.motorista}</div>
                        </TableCell>
                        <TableCell>
                          {oc && (
                            <Badge variant="secondary" className={`gap-1 text-xs ${oc.color}`}>
                              {oc.icon}
                              {oc.label}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {b.foto_path ? (
                            <ImageIcon className="w-4 h-4 text-green-600" />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openDetalhes(b)}>
                            <Eye className="w-4 h-4 mr-1" />
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedBaixa} onOpenChange={(open) => !open && setSelectedBaixa(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Detalhes da Baixa — NF {selectedBaixa?.numero_nf}
            </DialogTitle>
          </DialogHeader>

          {selectedBaixa && (
            <div className="space-y-4">
              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> Destinatário
                  </p>
                  <p className="font-medium">{selectedBaixa.dest_razao_social}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Cidade
                  </p>
                  <p className="font-medium">{selectedBaixa.dest_cidade}/{selectedBaixa.dest_uf}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" /> Veículo
                  </p>
                  <p className="font-medium">{selectedBaixa.placa} — {selectedBaixa.motorista}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Data/Hora
                  </p>
                  <p className="font-medium">
                    {selectedBaixa.registrado_em
                      ? format(new Date(selectedBaixa.registrado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : "—"}
                  </p>
                </div>
                {selectedBaixa.operador_nome && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> Registrado por
                    </p>
                    <p className="font-medium">{selectedBaixa.operador_nome}</p>
                  </div>
                )}
                {selectedBaixa.recebedor_nome && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> Recebedor
                    </p>
                    <p className="font-medium">{selectedBaixa.recebedor_nome}</p>
                  </div>
                )}
              </div>

              {/* Ocorrência */}
              {ocInfo && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Ocorrência</p>
                  <Badge variant="secondary" className={`gap-1 ${ocInfo.color}`}>
                    {ocInfo.icon}
                    {ocInfo.label}
                  </Badge>
                </div>
              )}

              {/* GPS */}
              {selectedBaixa.latitude && selectedBaixa.longitude && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                    <Navigation className="w-3.5 h-3.5" /> Coordenadas GPS
                  </p>
                  <p className="text-sm font-mono">
                    {Number(selectedBaixa.latitude).toFixed(6)}, {Number(selectedBaixa.longitude).toFixed(6)}
                  </p>
                  <a
                    href={`https://www.google.com/maps?q=${selectedBaixa.latitude},${selectedBaixa.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Abrir no Google Maps →
                  </a>
                </div>
              )}

              {/* Foto do canhoto */}
              <div>
                <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5" /> Foto do Comprovante
                </p>
                {fotoLoading ? (
                  <div className="flex justify-center py-8 bg-muted rounded-lg">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : fotoUrl ? (
                  <a href={fotoUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={fotoUrl}
                      alt="Comprovante de entrega"
                      className="w-full rounded-lg border object-contain max-h-[400px] bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                    />
                  </a>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 bg-muted rounded-lg text-muted-foreground">
                    <ImageIcon className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">Sem foto registrada</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
