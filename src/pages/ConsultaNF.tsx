import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Loader2,
  FileSearch,
  Package,
  MapPin,
  Weight,
  Truck,
  FileText,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { calculateBoxes } from "@/lib/xml-parser";
import { generateNotaDeCargaPDF, downloadBlob } from "@/lib/pdf-generator";
import { getMacroRegiao } from "@/lib/macro-regioes";

interface NfResult {
  id: string;
  numero_nf: string;
  chave_acesso: string;
  cnpj_emitente: string;
  razao_social_emitente: string;
  cnpj_destinatario: string | null;
  dest_razao_social: string | null;
  dest_logradouro: string | null;
  dest_numero: string | null;
  dest_bairro: string | null;
  dest_cidade: string | null;
  dest_uf: string | null;
  dest_cep: string | null;
  peso_bruto: number | null;
  peso_liquido: number | null;
  volume_m3: number | null;
  status_entrega: string;
  data_emissao: string | null;
  created_at: string;
  carga_id: string;
  carga?: {
    placa: string;
    motorista: string;
    data: string;
    status: string;
    tipo_carga: string;
  };
  itens?: { c_prod: string; x_prod: string; q_com: number; u_com: string }[];
  totalCaixas: number;
  agendamento?: {
    status: string;
    data_agendamento: string | null;
  } | null;
  ctes?: {
    numero_cte: string;
    chave_cte: string;
    razao_social_emitente: string | null;
    cnpj_emitente: string | null;
    valor_frete: number | null;
  }[];
  veiculo?: {
    placa: string;
    motorista: string | null;
    data: string;
    status: string;
  } | null;
}

const statusColors: Record<string, string> = {
  "CARGA NO DEPOSITO": "bg-muted text-muted-foreground",
  "NF EM ROTA": "bg-primary/10 text-primary",
  ENTREGUE: "bg-success/10 text-success",
  RECUSADO: "bg-destructive/10 text-destructive",
};

const agendamentoColors: Record<string, string> = {
  "AGENDAMENTO": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "AGUARDANDO AGENDA": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  "AGUARDANDO REAGENDA": "bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100",
  "REENTREGA": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "DEVOLUCAO": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function getDisplayStatus(nf: NfResult) {
  if (nf.agendamento) {
    return { label: nf.agendamento.status, colors: agendamentoColors[nf.agendamento.status] || "bg-muted text-muted-foreground" };
  }
  return { label: nf.status_entrega, colors: statusColors[nf.status_entrega] || "" };
}

export default function ConsultaNF() {
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<NfResult[]>([]);
  const [selectedNf, setSelectedNf] = useState<NfResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  async function handleGerarPdf(nf: NfResult) {
    if (!nf.carga) return;
    setGeneratingPdf(true);
    try {
      const nfPDF = {
        numeroNf: nf.numero_nf,
        razaoSocialEmitente: nf.razao_social_emitente,
        cnpjEmitente: nf.cnpj_emitente,
        cnpjDestinatario: nf.cnpj_destinatario || "",
        destRazaoSocial: nf.dest_razao_social || undefined,
        destLogradouro: nf.dest_logradouro || undefined,
        destNumero: nf.dest_numero || undefined,
        destBairro: nf.dest_bairro || "",
        destCidade: nf.dest_cidade || undefined,
        destUf: nf.dest_uf || undefined,
        destCep: nf.dest_cep || undefined,
        macroRegiao: getMacroRegiao(nf.dest_bairro, nf.dest_cidade),
        dataEmissao: nf.data_emissao,
        itens: (nf.itens || []).map((item) => ({
          cProd: item.c_prod,
          xProd: item.x_prod,
          qtdCaixas: calculateBoxes(Number(item.q_com)),
        })),
      };
      const blob = await generateNotaDeCargaPDF(
        {
          data: nf.carga.data,
          placa: nf.carga.placa,
          motorista: nf.carga.motorista,
        },
        [nfPDF]
      );
      downloadBlob(blob, `nota_carga_NF_${nf.numero_nf}.pdf`);
      toast({ title: "PDF gerado com sucesso!" });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({ variant: "destructive", title: "Erro ao gerar PDF" });
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function pesquisar() {
    const termo = busca.trim();
    if (!termo) return;

    setLoading(true);
    setSearched(true);
    setSelectedNf(null);

    try {
      // Search by numero_nf (partial match)
      const { data: nfs, error } = await supabase
        .from("notas_fiscais")
        .select(`
          id, numero_nf, chave_acesso, cnpj_emitente, razao_social_emitente,
          cnpj_destinatario, dest_razao_social, dest_logradouro, dest_numero,
          dest_bairro, dest_cidade, dest_uf, dest_cep,
          peso_bruto, peso_liquido, volume_m3, status_entrega, data_emissao,
          created_at, carga_id,
          cargas(placa, motorista, data, status, tipo_carga),
          itens_nf(c_prod, x_prod, q_com, u_com),
          agendamentos(status, data_agendamento, created_at),
          ctes(numero_cte, chave_cte, razao_social_emitente, cnpj_emitente, valor_frete),
          veiculo_nfs(veiculos(placa, motorista, data, status))
        `)
        .ilike("numero_nf", `%${termo}%`)
        .limit(50);

      if (error) throw error;

      const results: NfResult[] = (nfs || []).map((nf: any) => {
        const agendamentos = [...(nf.agendamentos || [])].sort((a: any, b: any) => {
          const da = new Date(a.created_at || 0).getTime();
          const db = new Date(b.created_at || 0).getTime();
          return db - da;
        });
        const latestAgendamento = agendamentos.length > 0 ? agendamentos[0] : null;
        const veiculoLink = (nf.veiculo_nfs || [])[0];
        const veiculo = veiculoLink?.veiculos || null;

        return {
          ...nf,
          carga: nf.cargas,
          itens: nf.itens_nf || [],
          totalCaixas: (nf.itens_nf || []).reduce(
            (sum: number, i: any) => sum + calculateBoxes(Number(i.q_com)),
            0
          ),
          agendamento: latestAgendamento,
          ctes: nf.ctes || [],
          veiculo,
        };
      });

      setResultados(results);

      if (results.length === 0) {
        toast({
          title: "Nenhuma NF encontrada",
          description: `Não foi encontrada nenhuma NF com o número "${termo}"`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro na busca",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") pesquisar();
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSearch className="w-6 h-6" />
            Consulta de NF
          </h1>
          <p className="text-muted-foreground">
            Pesquise e visualize detalhes de qualquer Nota Fiscal no sistema
          </p>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Digite o número da NF..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-9"
                />
              </div>
              <Button onClick={pesquisar} disabled={loading || !busca.trim()}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Detail view */}
        {selectedNf && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5" />
                NF {selectedNf.numero_nf}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleGerarPdf(selectedNf)}
                  disabled={generatingPdf}
                >
                  {generatingPdf ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Gerar PDF
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedNf(null)}>
                  Voltar à lista
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status & Carga */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge className={statusColors[selectedNf.status_entrega] || ""}>
                      {selectedNf.status_entrega}
                    </Badge>
                    {selectedNf.agendamento && (
                      <Badge className={agendamentoColors[selectedNf.agendamento.status] || ""}>
                        {selectedNf.agendamento.status}
                        {selectedNf.agendamento.data_agendamento && (
                          <span className="ml-1">
                            ({format(new Date(selectedNf.agendamento.data_agendamento + "T00:00:00"), "dd/MM/yyyy")})
                          </span>
                        )}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Truck className="w-3 h-3" /> Carga
                  </p>
                  <p className="font-medium">
                    {selectedNf.carga?.placa} — {selectedNf.carga?.motorista}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedNf.carga?.data
                      ? format(new Date(selectedNf.carga.data + "T00:00:00"), "dd/MM/yyyy")
                      : ""}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Emissão</p>
                  <p className="font-medium">
                    {selectedNf.data_emissao
                      ? format(new Date(selectedNf.data_emissao + "T00:00:00"), "dd/MM/yyyy")
                      : "N/I"}
                  </p>
                </div>
              </div>

              {/* Veículo Expedido */}
              {selectedNf.veiculo && (
                <div className="border-t pt-4 bg-primary/5 -mx-6 px-6 py-4">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <Truck className="w-4 h-4" /> Veículo de Expedição
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Placa</p>
                      <p className="font-mono font-bold text-base">{selectedNf.veiculo.placa}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Motorista</p>
                      <p className="font-medium">{selectedNf.veiculo.motorista || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data Expedição</p>
                      <p className="font-medium">
                        {format(new Date(selectedNf.veiculo.data + "T00:00:00"), "dd/MM/yyyy")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* CT-e vinculados */}
              {selectedNf.ctes && selectedNf.ctes.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> CT-e Vinculado{selectedNf.ctes.length > 1 ? "s" : ""}
                  </p>
                  <div className="space-y-2">
                    {selectedNf.ctes.map((cte, idx) => (
                      <div key={idx} className="rounded border p-3 bg-muted/30">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <p className="text-sm font-medium">CT-e nº {cte.numero_cte}</p>
                            <p className="text-xs text-muted-foreground">
                              {cte.razao_social_emitente || "—"} {cte.cnpj_emitente ? `· ${cte.cnpj_emitente}` : ""}
                            </p>
                          </div>
                          {cte.valor_frete != null && Number(cte.valor_frete) > 0 && (
                            <Badge variant="outline">
                              R$ {Number(cte.valor_frete).toFixed(2)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground mt-1 break-all">
                          {cte.chave_cte}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Emitente */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-2">Emitente</p>
                <p className="text-sm">{selectedNf.razao_social_emitente}</p>
                <p className="text-xs text-muted-foreground">{selectedNf.cnpj_emitente}</p>
              </div>

              {/* Destinatário */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Destinatário
                </p>
                <p className="text-sm">{selectedNf.dest_razao_social || "N/I"}</p>
                <p className="text-xs text-muted-foreground">{selectedNf.cnpj_destinatario}</p>
                <p className="text-sm mt-1">
                  {[
                    selectedNf.dest_logradouro,
                    selectedNf.dest_numero,
                    selectedNf.dest_bairro,
                    selectedNf.dest_cidade,
                    selectedNf.dest_uf,
                    selectedNf.dest_cep,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>

              {/* Totais */}
              <div className="border-t pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <Weight className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Peso Bruto</p>
                    <p className="font-medium">{Number(selectedNf.peso_bruto || 0).toFixed(1)} kg</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Volume</p>
                    <p className="font-medium">{Number(selectedNf.volume_m3 || 0).toFixed(3)} m³</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Caixas</p>
                    <p className="font-medium">{selectedNf.totalCaixas}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Itens</p>
                    <p className="font-medium">{selectedNf.itens?.length || 0}</p>
                  </div>
                </div>
              </div>

              {/* Itens */}
              {selectedNf.itens && selectedNf.itens.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-2">Itens da NF</p>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead>Unidade</TableHead>
                          <TableHead className="text-right">Caixas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedNf.itens.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{item.c_prod}</TableCell>
                            <TableCell className="text-sm">{item.x_prod}</TableCell>
                            <TableCell className="text-right">{item.q_com}</TableCell>
                            <TableCell>{item.u_com}</TableCell>
                            <TableCell className="text-right">
                              {calculateBoxes(Number(item.q_com))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Chave de acesso */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-1">Chave de Acesso</p>
                <p className="text-xs font-mono text-muted-foreground break-all">
                  {selectedNf.chave_acesso}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results list */}
        {!selectedNf && searched && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {resultados.length} resultado(s) encontrado(s)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resultados.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma NF encontrada
                </p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>NF</TableHead>
                        <TableHead>Destinatário</TableHead>
                        <TableHead>Cidade/UF</TableHead>
                        <TableHead>Carga (Placa)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Peso (kg)</TableHead>
                        <TableHead className="text-right">Vol (m³)</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resultados.map((nf) => (
                        <TableRow key={nf.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedNf(nf)}>
                          <TableCell className="font-medium">{nf.numero_nf}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {nf.dest_razao_social || "N/I"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {nf.dest_cidade}/{nf.dest_uf}
                          </TableCell>
                          <TableCell className="text-sm">{nf.carga?.placa}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline" className={`text-xs ${statusColors[nf.status_entrega] || ""}`}>
                                {nf.status_entrega}
                              </Badge>
                              {nf.agendamento && (
                                <Badge variant="outline" className={`text-xs ${agendamentoColors[nf.agendamento.status] || ""}`}>
                                  {nf.agendamento.status}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{Number(nf.peso_bruto || 0).toFixed(1)}</TableCell>
                          <TableCell className="text-right">{Number(nf.volume_m3 || 0).toFixed(3)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm">
                              <Search className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
