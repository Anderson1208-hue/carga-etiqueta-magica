import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Search, Send, Mail, FileDown, Loader2 } from "lucide-react";
import { useAcessoEnvioCanhoto } from "@/hooks/useAcessoEnvioCanhoto";
import { SemPermissao } from "@/components/comercial/SemPermissao";

type PreviaItem = {
  numero_nf: string;
  destinatario: string;
  cidade: string;
  uf: string;
  emitente: string;
  placa: string;
  baixa: string;
  tem_canhoto: boolean;
  status: string | null;
  motivo_pendencia: string | null;
};

type Previa = {
  total: number;
  total_com_canhoto: number;
  total_sem_canhoto: number;
  volumes_previstos: number;
  excede_limite: boolean;
  limite: number;
  nfs_nao_encontradas: string[];
  itens: PreviaItem[];
};

export default function EnvioCanhoto() {
  const { podeEnviarCanhoto, isLoading } = useAcessoEnvioCanhoto();
  const qc = useQueryClient();

  const [embarcador, setEmbarcador] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [nfsTexto, setNfsTexto] = useState("");
  const [emails, setEmails] = useState("");
  const [observacao, setObservacao] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<string>("");

  const filtro = useMemo(() => {
    const nfs = nfsTexto
      .split(/[\s,;]+/)
      .map((n) => n.replace(/\D/g, ""))
      .filter(Boolean);
    return {
      embarcador: embarcador.trim() || null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null,
      nfs: nfs.length ? nfs : null,
    };
  }, [embarcador, dataInicio, dataFim, nfsTexto]);

  const { data: historico = [] } = useQuery({
    queryKey: ["envios-canhoto-manuais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("envios_canhoto_manuais")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    enabled: podeEnviarCanhoto,
  });

  async function chamar(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("enviar-canhotos-manual", { body });
    if (error) throw new Error(error.message);
    if (data && data.ok === false) throw new Error(data.error || "Falha no processamento");
    return data;
  }

  async function buscar() {
    if (!filtro.embarcador && !filtro.data_inicio && !filtro.data_fim && !filtro.nfs) {
      toast.error("Informe embarcador, período ou uma lista de NFs.");
      return;
    }
    setBuscando(true);
    setPrevia(null);
    try {
      const d = await chamar({ acao: "previa", filtro });
      setPrevia(d as Previa);
      if ((d as Previa).total === 0) toast.info("Nenhuma nota encontrada para esse filtro.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBuscando(false);
    }
  }

  async function enviar() {
    const destinatarios = emails
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (!destinatarios.length) {
      toast.error("Informe ao menos um e-mail de destino.");
      return;
    }
    if (!previa || previa.total === 0) {
      toast.error("Busque as notas antes de enviar.");
      return;
    }
    setEnviando(true);
    setProgresso("Preparando envio...");
    try {
      const criado: any = await chamar({ acao: "criar", filtro, destinatarios, observacao });
      const envioId = criado.envio_id;
      let seguro = 0;
      const limiteInvocacoes = criado.passos_previstos + 40;
      while (seguro++ < limiteInvocacoes) {
        const passo: any = await chamar({ acao: "passo", envio_id: envioId });
        if (passo.fase === "imagens") {
          setProgresso(`Preparando imagens ${passo.processados}/${passo.total}...`);
        } else if (passo.fase === "volumes") {
          setProgresso(`Montando arquivos ${passo.volume}/${passo.total_volumes}...`);
        } else if (passo.fase === "concluido") {
          setProgresso("");
          toast.success(`E-mail enviado para ${passo.enviados} destinatário(s).`);
          break;
        }
      }
      qc.invalidateQueries({ queryKey: ["envios-canhoto-manuais"] });
    } catch (e: any) {
      setProgresso("");
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["envios-canhoto-manuais"] });
    } finally {
      setEnviando(false);
    }
  }

  async function abrirArquivos(envioId: string) {
    try {
      const d: any = await chamar({ acao: "links", envio_id: envioId });
      const urls = [...(d.partes ?? []).map((p: any) => p.pdf), d.xlsx].filter(Boolean);
      if (!urls.length) {
        toast.info("Nenhum arquivo disponível para esse envio.");
        return;
      }
      urls.forEach((u: string) => window.open(u, "_blank"));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (isLoading) return null;
  if (!podeEnviarCanhoto) {
    return (
      <MainLayout>
        <SemPermissao />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Envio de Canhoto</h1>
          <p className="text-muted-foreground">
            Selecione embarcador, período ou notas específicas e envie os comprovantes por e-mail. Os links ficam ativos
            por 90 dias e nenhuma imagem é apagada do sistema.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Seleção das notas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Embarcador (parte do nome)</Label>
                <Input value={embarcador} onChange={(e) => setEmbarcador(e.target.value)} placeholder="ex: PANDURATA" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Baixa de</Label>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Baixa até</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ou notas específicas (uma por linha ou separadas por vírgula)</Label>
              <Textarea
                rows={3}
                value={nfsTexto}
                onChange={(e) => setNfsTexto(e.target.value)}
                placeholder="759539, 758306..."
              />
              <p className="text-xs text-muted-foreground">
                Quando há notas informadas, o período é ignorado. Limite de 500 notas por envio.
              </p>
            </div>
            <Button onClick={buscar} disabled={buscando}>
              {buscando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Buscar notas
            </Button>
          </CardContent>
        </Card>

        {previa && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">2. Conferência ({previa.total} notas)</CardTitle>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline">Com canhoto: {previa.total_com_canhoto}</Badge>
                <Badge variant="outline">Sem canhoto: {previa.total_sem_canhoto}</Badge>
                <Badge variant="outline">Arquivos: {previa.volumes_previstos}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {previa.excede_limite && (
                <p className="text-sm text-destructive">
                  Seleção acima de {previa.limite} notas. Reduza o período antes de enviar.
                </p>
              )}
              {previa.nfs_nao_encontradas?.length > 0 && (
                <p className="text-sm text-amber-600">
                  Sem baixa registrada: {previa.nfs_nao_encontradas.join(", ")}
                </p>
              )}
              <div className="max-h-80 overflow-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NF</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Baixa</TableHead>
                      <TableHead>Canhoto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previa.itens.map((i) => (
                      <TableRow key={`${i.numero_nf}-${i.baixa}`}>
                        <TableCell className="font-mono">{i.numero_nf}</TableCell>
                        <TableCell className="max-w-[240px] truncate">{i.destinatario}</TableCell>
                        <TableCell>
                          {i.cidade}/{i.uf}
                        </TableCell>
                        <TableCell className="font-mono">{i.placa}</TableCell>
                        <TableCell>{i.baixa}</TableCell>
                        <TableCell>
                          {i.tem_canhoto ? (
                            <Badge variant="outline" className="text-green-700 border-green-700">
                              foto ok
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-destructive border-destructive">
                              {i.motivo_pendencia || "sem foto"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Envio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">E-mails de destino (separados por vírgula)</Label>
              <Input
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="faturamento@tlmlogistica.com.br"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observação para o e-mail (opcional)</Label>
              <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={enviar} disabled={enviando || !previa || previa.total === 0 || previa.excede_limite}>
                {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar canhotos
              </Button>
              {progresso && <span className="text-sm text-muted-foreground">{progresso}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Remetente: canhotos@imagens.tlmlogistica.com.br — respostas vão para faturamento@tlmlogistica.com.br.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4" /> Histórico de envios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Enviado por</TableHead>
                  <TableHead>Destinatários</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.map((h: any) => (
                  <TableRow key={h.id}>
                    <TableCell>{new Date(h.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{h.criado_por_email ?? "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{(h.destinatarios ?? []).join(", ")}</TableCell>
                    <TableCell>
                      {h.total_notas} ({h.total_com_canhoto} c/ foto)
                    </TableCell>
                    <TableCell>
                      <Badge variant={h.status === "concluido" ? "outline" : h.status === "erro" ? "destructive" : "secondary"}>
                        {h.status}
                      </Badge>
                      {h.erro && <div className="text-xs text-destructive max-w-[240px] truncate">{h.erro}</div>}
                    </TableCell>
                    <TableCell>
                      {h.status === "concluido" && (
                        <Button size="sm" variant="ghost" onClick={() => abrirArquivos(h.id)}>
                          <FileDown className="w-4 h-4 mr-1" /> Arquivos
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {historico.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      Nenhum envio registrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
