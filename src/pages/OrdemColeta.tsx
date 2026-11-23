import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageOpen, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { OrdemColetaDialog } from "@/components/ordens/OrdemColetaDialog";
import { CargasPendentesPandurata } from "@/components/ordens/CargasPendentesPandurata";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { coletaDePendentePandurata, type CargaPendentePandurata } from "@/lib/pandurata-pendentes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  coletaParaFormulario,
  formatarCpfColeta,
  formatarCubagemColeta,
  formatarDataColeta,
  formatarNumeroColeta,
  formatarPesoColeta,
  formularioColetaVazio,
  STATUS_ORDEM_COLETA,
  validarColeta,
  type OrdemColeta,
  type OrdemColetaForm,
} from "@/lib/ordem-coleta";

const statusBadge = {
  pendente: "secondary",
  agendada: "default",
  em_coleta: "outline",
  coletada: "default",
  cancelada: "destructive",
} as const;

export default function OrdemColetaPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OrdemColetaForm | null>(null);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const { data: embarcadores = [] } = useQuery({
    queryKey: ["ordens-coleta", "embarcadores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("embarcadores")
        .select("id, razao_social, nome_fantasia, ativo")
        .order("razao_social");
      if (error) throw error;
      return data;
    },
  });

  const ordensQuery = useQuery({
    queryKey: ["ordens-coleta", { status, dataInicio, dataFim }],
    queryFn: async () => {
      let query = supabase
        .from("ordens_coleta")
        .select("*")
        .order("data_coleta", { ascending: false })
        .order("numero", { ascending: false })
        .limit(200);
      if (status !== "todos") query = query.eq("status", status);
      if (dataInicio) query = query.gte("data_coleta", dataInicio);
      if (dataFim) query = query.lte("data_coleta", dataFim);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const salvarMutation = useMutation({
    mutationFn: async (dados: OrdemColetaForm) => {
      const erroValidacao = validarColeta(dados);
      if (erroValidacao) throw new Error(erroValidacao);

      const payload = {
        data_coleta: dados.data_coleta,
        hora_prevista: dados.hora_prevista || null,
        embarcador_id: dados.embarcador_id,
        embarcador_nome: dados.embarcador_nome.trim(),
        endereco: dados.endereco.trim(),
        cidade: dados.cidade.trim() || null,
        uf: dados.uf || null,
        contato: dados.contato.trim() || null,
        telefone: dados.telefone.trim() || null,
        motorista: dados.motorista.trim() || null,
        cpf_motorista: dados.cpf_motorista || null,
        placa: dados.placa || null,
        placa_carreta: dados.placa_carreta || null,
        codigo_otm: dados.codigo_otm.trim() || null,
        numero_roteiro: dados.numero_roteiro.trim() || null,
        notas_fiscais: dados.notas_fiscais.trim() || null,
        volumes: Number(dados.volumes),
        peso_kg: Number(dados.peso_kg),
        cubagem_m3: dados.cubagem_m3.trim() ? Number(dados.cubagem_m3) : null,
        volume_liquido_m3: dados.volume_liquido_m3.trim() ? Number(dados.volume_liquido_m3) : null,
        observacoes: dados.observacoes.trim() || null,
        status: dados.status,
      };

      if (dados.id) {
        const { error } = await supabase.from("ordens_coleta").update(payload).eq("id", dados.id);
        if (error) throw error;
        return null;
      }

      const { data, error } = await supabase
        .from("ordens_coleta")
        .insert(payload)
        .select("id, numero")
        .single();
      if (error) throw error;
      if (dados.pandurata_otm_id) {
        const { error: vinculoErro } = await supabase
          .from("pandurata_otm_cargas")
          .update({ ordem_coleta_id: data.id })
          .eq("id", dados.pandurata_otm_id);
        if (vinculoErro) toast.error("Ordem criada, mas não foi possível tirá-la da lista de pendentes.");
      }
      return data.numero;
    },
    onSuccess: (numero) => {
      toast.success(numero ? `${formatarNumeroColeta(numero)} criada com sucesso` : "Ordem de coleta atualizada");
      setForm(null);
      queryClient.invalidateQueries({ queryKey: ["ordens-coleta"] });
      queryClient.invalidateQueries({ queryKey: ["pandurata-otm-pendentes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ordens = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const termoNumerico = termo.replace(/\D/g, "");
    return (ordensQuery.data ?? []).filter((ordem) => {
      if (!termo) return true;
      const texto = [
        formatarNumeroColeta(ordem.numero),
        ordem.embarcador_nome,
        ordem.endereco,
        ordem.cidade,
        ordem.motorista,
        ordem.cpf_motorista,
        ordem.placa,
        ordem.placa_carreta,
        ordem.codigo_otm,
        ordem.numero_roteiro,
        ordem.notas_fiscais,
      ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return texto.includes(termo) || (termoNumerico.length > 0 && texto.includes(termoNumerico));
    });
  }, [busca, ordensQuery.data]);

  const emitirDoPortal = (carga: CargaPendentePandurata) => {
    const pandurata = embarcadores.find((e) => /pandurata|bauducco/i.test(`${e.razao_social} ${e.nome_fantasia ?? ""}`));
    setForm(coletaDePendentePandurata(carga, pandurata ? { id: pandurata.id, nome: pandurata.razao_social } : null));
  };

  const limparFiltros = () => {
    setBusca("");
    setStatus("todos");
    setDataInicio("");
    setDataFim("");
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <PackageOpen className="h-7 w-7" /> Ordem de Coleta
            </h1>
            <p className="text-sm text-muted-foreground">
              Cadastre e acompanhe as coletas dos veículos.
            </p>
          </div>
          <Button onClick={() => setForm(formularioColetaVazio())}>
            <Plus className="mr-2 h-4 w-4" /> Nova Ordem de Coleta
          </Button>
        </div>

        <Tabs defaultValue="pendentes">
          <TabsList>
            <TabsTrigger value="pendentes">Cargas pendentes Pandurata</TabsTrigger>
            <TabsTrigger value="ordens">Ordens emitidas</TabsTrigger>
          </TabsList>
          <TabsContent value="pendentes" className="mt-4">
            <CargasPendentesPandurata onEmitir={emitirDoPortal} />
          </TabsContent>
          <TabsContent value="ordens" className="mt-4 space-y-6">
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto] xl:items-end">
            <div className="space-y-2 md:col-span-2 xl:col-span-1">
              <Label htmlFor="busca-coleta">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="busca-coleta"
                  className="pl-9"
                  placeholder="Número, embarcador, placa, CPF, OTM, roteiro ou NF"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filtro-status-coleta">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="filtro-status-coleta" aria-label="Filtrar por status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {STATUS_ORDEM_COLETA.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filtro-inicio-coleta">Data inicial</Label>
              <Input id="filtro-inicio-coleta" type="date" value={dataInicio} onChange={(event) => setDataInicio(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filtro-fim-coleta">Data final</Label>
              <Input id="filtro-fim-coleta" type="date" value={dataFim} onChange={(event) => setDataFim(event.target.value)} />
            </div>
            <Button type="button" variant="outline" onClick={limparFiltros}>Limpar filtros</Button>
          </CardContent>
        </Card>

        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordem</TableHead>
                  <TableHead>Data / horário</TableHead>
                  <TableHead>Embarcador</TableHead>
                  <TableHead>Local da coleta</TableHead>
                  <TableHead>Motorista / placas</TableHead>
                  <TableHead className="text-right">Volumes</TableHead>
                  <TableHead className="text-right">Peso / cubagem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-14"><span className="sr-only">Ações</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordensQuery.isLoading ? (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Carregando ordens de coleta...</TableCell></TableRow>
                ) : ordensQuery.isError ? (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-destructive">Não foi possível carregar as coletas. Tente novamente.</TableCell></TableRow>
                ) : ordens.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">Nenhuma ordem de coleta encontrada.</TableCell></TableRow>
                ) : ordens.map((ordem: OrdemColeta) => {
                  const statusInfo = STATUS_ORDEM_COLETA.find((item) => item.value === ordem.status);
                  return (
                    <TableRow key={ordem.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {formatarNumeroColeta(ordem.numero)}
                        {ordem.codigo_otm && <div className="text-xs font-normal text-muted-foreground">OTM: {ordem.codigo_otm}</div>}
                        {ordem.numero_roteiro && <div className="text-xs font-normal text-muted-foreground">Roteiro: {ordem.numero_roteiro}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatarDataColeta(ordem.data_coleta)}
                        {ordem.hora_prevista && <span className="block text-xs text-muted-foreground">{ordem.hora_prevista.slice(0, 5)}</span>}
                      </TableCell>
                      <TableCell className="min-w-44">
                        <div className="font-medium">{ordem.embarcador_nome}</div>
                        {ordem.notas_fiscais && <div className="text-xs text-muted-foreground">NFs: {ordem.notas_fiscais}</div>}
                      </TableCell>
                      <TableCell className="min-w-56">
                        <div>{ordem.endereco}</div>
                        {(ordem.cidade || ordem.uf) && <div className="text-xs text-muted-foreground">{[ordem.cidade, ordem.uf].filter(Boolean).join(" / ")}</div>}
                      </TableCell>
                      <TableCell className="min-w-44">
                        <div>{ordem.motorista || "—"}</div>
                        {ordem.cpf_motorista && <div className="text-xs text-muted-foreground">CPF: {formatarCpfColeta(ordem.cpf_motorista)}</div>}
                        {ordem.placa && <div className="text-xs text-muted-foreground">Cavalo: {ordem.placa}</div>}
                        {ordem.placa_carreta && <div className="text-xs text-muted-foreground">Carreta: {ordem.placa_carreta}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{ordem.volumes}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarPesoColeta(ordem.peso_kg)}
                        {ordem.cubagem_m3 !== null && <div className="text-xs text-muted-foreground">{formatarCubagemColeta(ordem.cubagem_m3)} m³</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadge[ordem.status as keyof typeof statusBadge] ?? "secondary"}>
                          {statusInfo?.label ?? ordem.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar ${formatarNumeroColeta(ordem.numero)}`}
                          title="Editar ordem de coleta"
                          onClick={() => setForm(coletaParaFormulario(ordem))}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {!ordensQuery.isLoading && !ordensQuery.isError && (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              {ordens.length} ordem(ns) exibida(s). A consulta retorna no máximo as 200 mais recentes do filtro.
            </div>
          )}
        </div>
          </TabsContent>
        </Tabs>
      </div>

      <OrdemColetaDialog
        form={form}
        embarcadores={embarcadores}
        salvando={salvarMutation.isPending}
        onChange={setForm}
        onSave={(dados) => salvarMutation.mutate(dados)}
      />
    </MainLayout>
  );
}
