import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Loader2, FileSpreadsheet, FileText, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { calculateBoxes } from "@/lib/xml-parser";
import {
  generateAgendamentosFornecedorPDF,
  type AgendamentoFornecedorItem,
} from "@/lib/agendamentos-fornecedor-pdf";
import { generateAgendamentosFornecedorExcel } from "@/lib/agendamentos-fornecedor-excel";

const STATUS_OPTIONS = [
  { value: "AGENDAMENTO", label: "Agendamento" },
  { value: "AGUARDANDO AGENDA", label: "Aguardando Agenda" },
  { value: "AGUARDANDO REAGENDA", label: "Aguardando Reagenda" },
  { value: "REENTREGA", label: "Reentrega" },
  { value: "DEVOLUCAO", label: "Devolução" },
];

function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function RelatorioAgendamentosFornecedor() {
  const { toast } = useToast();

  const [dataIni, setDataIni] = useState<string>(isoDay(-30));
  const [dataFim, setDataFim] = useState<string>(isoDay(30));
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [items, setItems] = useState<AgendamentoFornecedorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      // Statuses sem data_agendamento (pendentes) — sempre incluir quando o filtro permite
      const STATUS_SEM_DATA = ["AGUARDANDO AGENDA", "AGUARDANDO REAGENDA"];

      // 1) Agendamentos com data dentro do período
      let qComData = supabase
        .from("agendamentos")
        .select("id, nf_id, status, data_agendamento, created_at")
        .not("data_agendamento", "is", null)
        .order("data_agendamento", { ascending: false });
      if (dataIni) qComData = qComData.gte("data_agendamento", dataIni);
      if (dataFim) qComData = qComData.lte("data_agendamento", dataFim);
      if (statusFilter !== "todos") qComData = qComData.eq("status", statusFilter);

      // 2) Agendamentos pendentes (sem data) — sempre incluir se o filtro de status permitir
      const statusPendentes =
        statusFilter === "todos"
          ? STATUS_SEM_DATA
          : STATUS_SEM_DATA.includes(statusFilter)
          ? [statusFilter]
          : [];

      const queries: Promise<any>[] = [Promise.resolve(qComData.limit(5000))];
      if (statusPendentes.length > 0) {
        queries.push(
          Promise.resolve(
            supabase
              .from("agendamentos")
              .select("id, nf_id, status, data_agendamento, created_at")
              .is("data_agendamento", null)
              .in("status", statusPendentes)
              .order("created_at", { ascending: false })
              .limit(5000)
          )
        );
      }

      const results = await Promise.all(queries);
      for (const r of results) if (r.error) throw r.error;
      const agDataRaw = [
        ...((results[0]?.data as any[]) || []),
        ...((results[1]?.data as any[]) || []),
      ];

      if (!agDataRaw || agDataRaw.length === 0) {
        setItems([]);
        return;
      }

      // Deduplicação: manter apenas o agendamento mais relevante por NF.
      // Critério: agendamento com data_agendamento mais recente vence; em empate, created_at mais recente.
      const bestByNf = new Map<string, any>();
      for (const a of agDataRaw) {
        const cur = bestByNf.get(a.nf_id);
        if (!cur) {
          bestByNf.set(a.nf_id, a);
          continue;
        }
        const aHasDate = !!a.data_agendamento;
        const cHasDate = !!cur.data_agendamento;
        if (aHasDate && !cHasDate) {
          bestByNf.set(a.nf_id, a);
        } else if (aHasDate === cHasDate) {
          const aKey = a.data_agendamento || a.created_at || "";
          const cKey = cur.data_agendamento || cur.created_at || "";
          if (aKey > cKey) bestByNf.set(a.nf_id, a);
        }
      }
      const agData = Array.from(bestByNf.values());

      const nfIds = agData.map((a) => a.nf_id);
      const nfMap = new Map<string, any>();
      const itensMap = new Map<string, number>();
      const veiculoSet = new Set<string>();
      const batch = 200;

      for (let i = 0; i < nfIds.length; i += batch) {
        const slice2 = nfIds.slice(i, i + batch);
        const { data: vnfs } = await supabase
          .from("veiculo_nfs")
          .select("nf_id")
          .in("nf_id", slice2);
        (vnfs || []).forEach((v: any) => veiculoSet.add(v.nf_id));
      }

      for (let i = 0; i < nfIds.length; i += batch) {
        const slice = nfIds.slice(i, i + batch);
        const [{ data: nfsData }, { data: itensData }] = await Promise.all([
          supabase
            .from("notas_fiscais")
            .select(
              "id, numero_nf, razao_social_emitente, cnpj_emitente, dest_razao_social, dest_cidade, dest_uf, data_emissao, peso_bruto, volume_m3, valor_nf, status_entrega"
            )
            .in("id", slice),
          supabase.from("itens_nf").select("nf_id, q_com").in("nf_id", slice),
        ]);

        (nfsData || []).forEach((n) => nfMap.set(n.id, n));
        (itensData || []).forEach((it) => {
          const cx = calculateBoxes(Number(it.q_com));
          itensMap.set(it.nf_id, (itensMap.get(it.nf_id) || 0) + cx);
        });
      }

      // Esconde "AGUARDANDO AGENDA/REAGENDA" quando a NF já saiu do depósito
      const PENDENTES = new Set(["AGUARDANDO AGENDA", "AGUARDANDO REAGENDA"]);

      const result: AgendamentoFornecedorItem[] = agData
        .map((a) => {
          const nf = nfMap.get(a.nf_id);
          if (!nf) return null;
          const statusEntrega = (nf.status_entrega || "").toUpperCase();
          if (
            PENDENTES.has(a.status) &&
            statusEntrega &&
            statusEntrega !== "CARGA NO DEPOSITO"
          ) {
            return null; // já está em rota / entregue / recusado → não é mais pendente
          }
          return {
            numero_nf: nf.numero_nf || "—",
            razao_social_emitente: nf.razao_social_emitente || null,
            cnpj_emitente: nf.cnpj_emitente || null,
            dest_razao_social: nf.dest_razao_social || null,
            dest_cidade: nf.dest_cidade || null,
            dest_uf: nf.dest_uf || null,
            data_emissao: nf.data_emissao,
            data_agendamento: a.data_agendamento,
            status: a.status,
            status_entrega: nf.status_entrega || null,
            peso_bruto: Number(nf.peso_bruto || 0),
            volume_m3: Number(nf.volume_m3 || 0),
            valor_nf: Number(nf.valor_nf || 0),
            caixas: itensMap.get(a.nf_id) || 0,
          };
        })
        .filter((x): x is AgendamentoFornecedorItem => x !== null);

      setItems(result);
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erro ao carregar",
        description: err?.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) => {
      const hay = [
        it.numero_nf,
        it.razao_social_emitente,
        it.cnpj_emitente,
        it.dest_razao_social,
        it.dest_cidade,
        it.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [items, busca]);

  const grouped = useMemo(() => {
    const map = new Map<string, AgendamentoFornecedorItem[]>();
    const sorted = [...filtered].sort((a, b) => {
      const fa = a.razao_social_emitente || "";
      const fb = b.razao_social_emitente || "";
      if (fa !== fb) return fa.localeCompare(fb);
      const da = a.data_agendamento || "";
      const db = b.data_agendamento || "";
      return da.localeCompare(db);
    });
    for (const it of sorted) {
      const key = it.razao_social_emitente || "FORNECEDOR NÃO INFORMADO";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, it) => ({
        peso: acc.peso + it.peso_bruto,
        m3: acc.m3 + it.volume_m3,
        valor: acc.valor + it.valor_nf,
        cx: acc.cx + it.caixas,
      }),
      { peso: 0, m3: 0, valor: 0, cx: 0 }
    );
  }, [filtered]);

  function fmtDate(iso: string | null) {
    if (!iso) return "—";
    try {
      return format(new Date(iso + "T12:00:00"), "dd/MM/yyyy");
    } catch {
      return iso;
    }
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      AGENDAMENTO: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      "AGUARDANDO AGENDA": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      "AGUARDANDO REAGENDA": "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
      REENTREGA: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      DEVOLUCAO: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return <Badge className={map[status] || ""}>{status}</Badge>;
  }

  async function exportarPDF() {
    if (filtered.length === 0) {
      toast({ title: "Sem dados", description: "Não há registros para exportar." });
      return;
    }
    setGeneratingPdf(true);
    try {
      const blob = await generateAgendamentosFornecedorPDF(filtered, {
        de: dataIni,
        ate: dataFim,
        status: statusFilter,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agendamentos-fornecedor-${format(new Date(), "yyyy-MM-dd-HHmm")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "PDF gerado", description: `${filtered.length} NFs exportadas.` });
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Falha ao gerar PDF", variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function exportarExcel() {
    if (filtered.length === 0) {
      toast({ title: "Sem dados", description: "Não há registros para exportar." });
      return;
    }
    setGeneratingExcel(true);
    try {
      const blob = generateAgendamentosFornecedorExcel(filtered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agendamentos-fornecedor-${format(new Date(), "yyyy-MM-dd-HHmm")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Excel gerado", description: `${filtered.length} NFs exportadas.` });
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Falha ao gerar Excel", variant: "destructive" });
    } finally {
      setGeneratingExcel(false);
    }
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">Agendamentos por Fornecedor</h1>
            <p className="text-muted-foreground text-sm">
              Relatório de NFs agendadas com peso, m³, valor, caixas e datas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportarPDF}
              disabled={generatingPdf || filtered.length === 0}
            >
              {generatingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportarExcel}
              disabled={generatingExcel || filtered.length === 0}
            >
              {generatingExcel ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 mr-2" />
              )}
              Excel
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <Label className="text-xs">Data agenda (de)</Label>
                <Input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Data agenda (até)</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Buscar (NF, fornecedor, destinatário...)</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Digite para filtrar"
                  />
                </div>
              </div>
              <Button onClick={carregar} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10">
                Nenhum agendamento encontrado no período.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <p className="text-xs text-muted-foreground">
                    {filtered.length} NF(s) • {grouped.length} fornecedor(es)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Peso: {totals.peso.toFixed(1)} kg • M³: {totals.m3.toFixed(3)} • Valor: R${" "}
                    {totals.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} • Cx: {totals.cx}
                  </p>
                </div>

                <Tabs defaultValue="__todos__" className="w-full">
                  <TabsList className="flex flex-wrap h-auto justify-start gap-1">
                    <TabsTrigger value="__todos__" className="text-xs">
                      Todos ({filtered.length})
                    </TabsTrigger>
                    {grouped.map(([fornecedor, grupo]) => (
                      <TabsTrigger key={fornecedor} value={fornecedor} className="text-xs">
                        {fornecedor.length > 30 ? fornecedor.slice(0, 30) + "…" : fornecedor} ({grupo.length})
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {[
                    ["__todos__", filtered] as [string, AgendamentoFornecedorItem[]],
                    ...grouped.map(([f, g]) => [f, g] as [string, AgendamentoFornecedorItem[]]),
                  ].map(([tabKey, rows]) => {
                    const sub = rows.reduce(
                      (acc, it) => ({
                        peso: acc.peso + it.peso_bruto,
                        m3: acc.m3 + it.volume_m3,
                        valor: acc.valor + it.valor_nf,
                        cx: acc.cx + it.caixas,
                      }),
                      { peso: 0, m3: 0, valor: 0, cx: 0 }
                    );
                    const isTodos = tabKey === "__todos__";
                    return (
                      <TabsContent key={tabKey} value={tabKey} className="mt-3">
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                {isTodos && <TableHead>Fornecedor</TableHead>}
                                <TableHead>NF</TableHead>
                                <TableHead>Destinatário</TableHead>
                                <TableHead>Cidade/UF</TableHead>
                                <TableHead>Faturamento</TableHead>
                                <TableHead>Agenda</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Peso (kg)</TableHead>
                                <TableHead className="text-right">M³</TableHead>
                                <TableHead className="text-right">Valor (R$)</TableHead>
                                <TableHead className="text-right">Cx</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.map((it, idx) => (
                                <TableRow key={`${tabKey}-${idx}-${it.numero_nf}`}>
                                  {isTodos && (
                                    <TableCell className="text-xs max-w-[200px] truncate">
                                      {it.razao_social_emitente || "—"}
                                    </TableCell>
                                  )}
                                  <TableCell className="font-mono text-xs">{it.numero_nf}</TableCell>
                                  <TableCell className="text-xs max-w-[240px] truncate">
                                    {it.dest_razao_social || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {it.dest_cidade ? `${it.dest_cidade}/${it.dest_uf || ""}` : "—"}
                                  </TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">
                                    {fmtDate(it.data_emissao)}
                                  </TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">
                                    {fmtDate(it.data_agendamento)}
                                  </TableCell>
                                  <TableCell>{statusBadge(it.status)}</TableCell>
                                  <TableCell className="text-xs text-right">
                                    {it.peso_bruto.toFixed(1)}
                                  </TableCell>
                                  <TableCell className="text-xs text-right">
                                    {it.volume_m3.toFixed(3)}
                                  </TableCell>
                                  <TableCell className="text-xs text-right">
                                    {it.valor_nf.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-xs text-right">{it.caixas}</TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-muted/30 border-t-2 font-medium">
                                <TableCell
                                  colSpan={isTodos ? 7 : 6}
                                  className="text-xs"
                                >
                                  Total: {rows.length} NF(s)
                                </TableCell>
                                <TableCell className="text-xs text-right">{sub.peso.toFixed(1)}</TableCell>
                                <TableCell className="text-xs text-right">{sub.m3.toFixed(3)}</TableCell>
                                <TableCell className="text-xs text-right">
                                  {sub.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-xs text-right">{sub.cx}</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
