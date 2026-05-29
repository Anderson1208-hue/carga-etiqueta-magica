import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, RefreshCw, Download, Trash2, ChevronRight } from "lucide-react";
import {
  parsePrefaturaExcel,
  matchNF,
  matchCte,
  compararCampos,
  exportarRetornoExcel,
  TOLERANCIA_DEFAULT,
  type PrefaturaItemRaw,
  type NFInterna,
  type CteInterno,
  type StatusConciliacao,
  type LinhaRetorno,
} from "@/lib/prefatura-utils";
import { parseNotfisFile } from "@/lib/notfis-parser";

interface Prefatura {
  id: string;
  cliente_cnpj: string;
  cliente_nome: string | null;
  data_recebimento: string;
  arquivo_origem_nome: string | null;
  total_itens: number;
  total_valor_nf_cliente: number;
  total_valor_frete_cliente: number;
  status: string;
  created_at: string;
}

interface ItemComConciliacao {
  id: string;
  linha_arquivo: number;
  chave_acesso_cliente: string | null;
  numero_nf_cliente: string | null;
  valor_nf_cliente: number | null;
  valor_frete_cliente: number | null;
  valor_frete_cte: number | null;
  numero_cte: string | null;
  conciliacao: {
    nf_id: string | null;
    cte_id: string | null;
    matched_by: string | null;
    status_conciliacao: string;
    divergencias: { itens?: { campo: string; esperado: unknown; recebido: unknown; diff: unknown }[] };
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  ok: "bg-green-100 text-green-800",
  divergente: "bg-amber-100 text-amber-800",
  sem_nf: "bg-red-100 text-red-800",
  sem_cte: "bg-orange-100 text-orange-800",
  pendente: "bg-slate-100 text-slate-700",
};

function fmtMoney(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Conciliacao() {
  const { toast } = useToast();
  const [prefaturas, setPrefaturas] = useState<Prefatura[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [clienteCnpj, setClienteCnpj] = useState("");
  const [numeroPref, setNumeroPref] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemComConciliacao[]>([]);
  const [reconciliando, setReconciliando] = useState(false);

  const carregarPrefaturas = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("prefaturas")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao carregar pré-faturas", description: error.message, variant: "destructive" });
      return;
    }
    setPrefaturas((data || []) as Prefatura[]);
  }, [toast]);

  useEffect(() => {
    carregarPrefaturas();
  }, [carregarPrefaturas]);

  const carregarItens = useCallback(
    async (prefId: string) => {
      const { data, error } = await supabase
        .from("prefatura_itens")
        .select("id, linha_arquivo, chave_acesso_cliente, numero_nf_cliente, valor_nf_cliente, valor_frete_cliente")
        .eq("prefatura_id", prefId)
        .order("linha_arquivo", { ascending: true });
      if (error) {
        toast({ title: "Erro ao carregar itens", description: error.message, variant: "destructive" });
        return;
      }
      const { data: concData } = await supabase
        .from("prefatura_conciliacao")
        .select("prefatura_item_id, nf_id, cte_id, matched_by, status_conciliacao, divergencias")
        .eq("prefatura_id", prefId);
      const concMap = new Map<string, ItemComConciliacao["conciliacao"]>();
      const cteIdsSet = new Set<string>();
      (concData || []).forEach((c) => {
        const r = c as Record<string, unknown>;
        const cteId = (r.cte_id as string | null) ?? null;
        if (cteId) cteIdsSet.add(cteId);
        concMap.set(r.prefatura_item_id as string, {
          nf_id: (r.nf_id as string | null) ?? null,
          cte_id: cteId,
          matched_by: (r.matched_by as string | null) ?? null,
          status_conciliacao: r.status_conciliacao as string,
          divergencias: (r.divergencias as NonNullable<ItemComConciliacao["conciliacao"]>["divergencias"]) || { itens: [] },
        });
      });

      const cteMap = new Map<string, { numero_cte: string | null; valor_frete: number | null }>();
      if (cteIdsSet.size > 0) {
        const { data: ctesData } = await supabase
          .from("ctes")
          .select("id, numero_cte, valor_frete")
          .in("id", Array.from(cteIdsSet));
        (ctesData || []).forEach((c) => {
          const r = c as Record<string, unknown>;
          cteMap.set(r.id as string, {
            numero_cte: (r.numero_cte as string | null) ?? null,
            valor_frete: (r.valor_frete as number | null) ?? null,
          });
        });
      }

      const mapped: ItemComConciliacao[] = (data || []).map((row) => {
        const r = row as Record<string, unknown>;
        const conc = concMap.get(r.id as string) || null;
        const cte = conc?.cte_id ? cteMap.get(conc.cte_id) : null;
        return {
          id: r.id as string,
          linha_arquivo: r.linha_arquivo as number,
          chave_acesso_cliente: (r.chave_acesso_cliente as string | null) ?? null,
          numero_nf_cliente: (r.numero_nf_cliente as string | null) ?? null,
          valor_nf_cliente: (r.valor_nf_cliente as number | null) ?? null,
          valor_frete_cliente: (r.valor_frete_cliente as number | null) ?? null,
          valor_frete_cte: cte?.valor_frete ?? null,
          numero_cte: cte?.numero_cte ?? null,
          conciliacao: conc,
        };
      });
      setItens(mapped);
    },
    [toast]
  );

  useEffect(() => {
    if (selectedId) carregarItens(selectedId);
    else setItens([]);
  }, [selectedId, carregarItens]);

  const handleImportar = async () => {
    if (!arquivo) {
      toast({ title: "Selecione um arquivo", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      // Detect format: NOTFIS EDI (.txt fixed-width) vs Excel/CSV
      const nome = arquivo.name.toLowerCase();
      const isNotfis = nome.endsWith(".txt") || nome.endsWith(".edi") || nome.endsWith(".notfis");
      const parsed = isNotfis
        ? await parseNotfisFile(arquivo)
        : await parsePrefaturaExcel(arquivo);
      if (parsed.itens.length === 0) {
        toast({ title: "Arquivo sem itens válidos", variant: "destructive" });
        return;
      }
      // Resolve CNPJ: prefer typed value, otherwise use the one inferred from the file.
      const cnpjFinal = clienteCnpj.trim()
        ? clienteCnpj.replace(/\D/g, "")
        : (parsed.cliente_cnpj_inferido || "").replace(/\D/g, "");
      if (!cnpjFinal) {
        toast({ title: "Informe o CNPJ do cliente", variant: "destructive" });
        return;
      }

      const importBatchId = `pf_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const { data: pf, error: errPf } = await supabase
        .from("prefaturas")
        .insert({
          cliente_cnpj: cnpjFinal,
          cliente_nome: clienteNome || null,
          numero_prefatura_cliente: numeroPref || null,
          arquivo_origem_nome: arquivo.name,
          import_batch_id: importBatchId,
          total_itens: parsed.itens.length,
          total_valor_nf_cliente: parsed.total_valor_nf,
          total_valor_frete_cliente: parsed.total_valor_frete,
          status: "importada",
        })
        .select()
        .single();
      if (errPf) throw errPf;

      // Insert in chunks to respect payload limits
      const chunkSize = 500;
      for (let i = 0; i < parsed.itens.length; i += chunkSize) {
        const chunk = parsed.itens.slice(i, i + chunkSize).map((it) => ({
          prefatura_id: (pf as { id: string }).id,
          ...it,
        }));
        const { error: errIt } = await supabase.from("prefatura_itens").insert(chunk as never);
        if (errIt) throw errIt;
      }

      await supabase.from("prefatura_auditoria").insert({
        prefatura_id: (pf as { id: string }).id,
        acao: "importacao",
        detalhes: { arquivo: arquivo.name, total_itens: parsed.itens.length },
      });

      toast({ title: "Pré-fatura importada", description: `${parsed.itens.length} itens carregados.` });
      setImportDialogOpen(false);
      setArquivo(null);
      setClienteNome("");
      setClienteCnpj("");
      setNumeroPref("");
      await carregarPrefaturas();
      setSelectedId((pf as { id: string }).id);
    } catch (err) {
      toast({
        title: "Erro ao importar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleConciliar = async (prefId: string) => {
    setReconciliando(true);
    try {
      // Load all items
      const { data: itemsRaw, error: errIt } = await supabase
        .from("prefatura_itens")
        .select("*")
        .eq("prefatura_id", prefId);
      if (errIt) throw errIt;
      const items = (itemsRaw || []) as unknown as (PrefaturaItemRaw & { id: string })[];

      // Collect candidate keys/numbers
      const chaves = items.map((i) => i.chave_acesso_cliente).filter(Boolean) as string[];
      const numeros = items.map((i) => (i.numero_nf_cliente || "").replace(/^0+/, "")).filter(Boolean);

      const nfsResp = await supabase
        .from("notas_fiscais")
        .select("id, chave_acesso, numero_nf, serie, cnpj_emitente, valor_nf, peso_bruto, volume_m3, data_emissao")
        .or(
          [
            chaves.length ? `chave_acesso.in.(${chaves.map((c) => `"${c}"`).join(",")})` : "",
            numeros.length ? `numero_nf.in.(${numeros.map((n) => `"${n}"`).join(",")})` : "",
          ]
            .filter(Boolean)
            .join(",")
        );
      if (nfsResp.error) throw nfsResp.error;
      const nfs = (nfsResp.data || []) as unknown as NFInterna[];

      // Load CT-es referencing these NFs
      const nfIds = nfs.map((n) => n.id);
      const ctesResp = nfIds.length
        ? await supabase
            .from("ctes")
            .select("id, numero_cte, chave_nf_referenciada, numero_nf_referenciada, valor_frete, nf_id")
        : { data: [], error: null };
      if (ctesResp.error) throw ctesResp.error;
      const ctes = (ctesResp.data || []) as unknown as CteInterno[];

      // Clear previous conciliacao for this prefatura
      await supabase.from("prefatura_conciliacao").delete().eq("prefatura_id", prefId);

      const insertRows = items.map((it) => {
        const { nf, matched_by } = matchNF(it, nfs);
        if (!nf) {
          return {
            prefatura_id: prefId,
            prefatura_item_id: (it as { id: string }).id,
            nf_id: null,
            cte_id: null,
            matched_by,
            status_conciliacao: "sem_nf",
            divergencias: { itens: [] },
          };
        }
        const cte = matchCte(nf, ctes);
        const divs = compararCampos(it, nf, cte, TOLERANCIA_DEFAULT);
        let status: StatusConciliacao = "ok";
        if (!cte) status = "sem_cte";
        else if (divs.length > 0) status = "divergente";
        return {
          prefatura_id: prefId,
          prefatura_item_id: (it as { id: string }).id,
          nf_id: nf.id,
          cte_id: cte?.id || null,
          matched_by,
          status_conciliacao: status,
          divergencias: { itens: divs },
        };
      });

      // Insert in chunks
      const chunkSize = 500;
      for (let i = 0; i < insertRows.length; i += chunkSize) {
        const chunk = insertRows.slice(i, i + chunkSize);
        const { error } = await supabase.from("prefatura_conciliacao").insert(chunk as never);
        if (error) throw error;
      }

      await supabase.from("prefatura_auditoria").insert({
        prefatura_id: prefId,
        acao: "reprocessamento",
        detalhes: { total: insertRows.length },
      });

      await supabase.from("prefaturas").update({ status: "conciliada" }).eq("id", prefId);

      toast({ title: "Conciliação concluída", description: `${insertRows.length} itens processados.` });
      await carregarPrefaturas();
      await carregarItens(prefId);
    } catch (err) {
      toast({
        title: "Erro ao conciliar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setReconciliando(false);
    }
  };

  const handleExportar = async (prefId: string) => {
    try {
      const { data: concData, error } = await supabase
        .from("prefatura_conciliacao")
        .select("status_conciliacao, divergencias, nf_id, cte_id")
        .eq("prefatura_id", prefId);
      if (error) throw error;
      const concRows = (concData || []) as Array<{
        status_conciliacao: string;
        divergencias: { itens?: LinhaRetorno["divergencias"] } | null;
        nf_id: string | null;
        cte_id: string | null;
      }>;

      const nfIds = Array.from(new Set(concRows.map((r) => r.nf_id).filter(Boolean) as string[]));
      const cteIds = Array.from(new Set(concRows.map((r) => r.cte_id).filter(Boolean) as string[]));

      const nfMap = new Map<string, {
        chave_acesso: string; numero_nf: string; serie: string | null; cnpj_emitente: string;
        valor_nf: number | null; peso_bruto: number | null; volume_m3: number | null; data_emissao: string | null;
      }>();
      if (nfIds.length) {
        const { data: nfs } = await supabase
          .from("notas_fiscais")
          .select("id, chave_acesso, numero_nf, serie, cnpj_emitente, valor_nf, peso_bruto, volume_m3, data_emissao")
          .in("id", nfIds);
        (nfs || []).forEach((n) => nfMap.set(n.id as string, n as never));
      }

      const cteMap = new Map<string, { numero_cte: string; valor_frete: number | null }>();
      if (cteIds.length) {
        const { data: ctes } = await supabase
          .from("ctes")
          .select("id, numero_cte, valor_frete")
          .in("id", cteIds);
        (ctes || []).forEach((c) => cteMap.set(c.id as string, c as never));
      }

      const linhas: LinhaRetorno[] = concRows.map((r) => {
        const nf = r.nf_id ? nfMap.get(r.nf_id) : null;
        const cte = r.cte_id ? cteMap.get(r.cte_id) : null;
        return {
          chave_acesso: nf?.chave_acesso || "",
          numero_nf: nf?.numero_nf || "",
          serie: nf?.serie || null,
          cnpj_emitente: nf?.cnpj_emitente || "",
          cte_numero: cte?.numero_cte || null,
          valor_nf_xml: nf?.valor_nf ?? null,
          valor_frete_cte: cte?.valor_frete ?? null,
          peso: nf?.peso_bruto ?? null,
          volume_m3: nf?.volume_m3 ?? null,
          data_emissao: nf?.data_emissao || null,
          status: r.status_conciliacao,
          divergencias: r.divergencias?.itens || [],
        };
      });

      exportarRetornoExcel(linhas, `retorno_conciliacao_${prefId.substring(0, 8)}.xlsx`);
      await supabase.from("prefatura_auditoria").insert({
        prefatura_id: prefId,
        acao: "export_retorno",
        detalhes: { formato: "xlsx", total: linhas.length },
      });
    } catch (err) {
      toast({
        title: "Erro ao exportar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleExcluir = async (prefId: string) => {
    if (!confirm("Excluir esta pré-fatura e todos os seus itens?")) return;
    const { error } = await supabase.from("prefaturas").delete().eq("id", prefId);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    setSelectedId(null);
    await carregarPrefaturas();
  };

  const totaisItens = {
    ok: itens.filter((i) => i.conciliacao?.status_conciliacao === "ok").length,
    divergente: itens.filter((i) => i.conciliacao?.status_conciliacao === "divergente").length,
    sem_nf: itens.filter((i) => i.conciliacao?.status_conciliacao === "sem_nf").length,
    sem_cte: itens.filter((i) => i.conciliacao?.status_conciliacao === "sem_cte").length,
    pendente: itens.filter((i) => !i.conciliacao).length,
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Conciliação de Pré-Faturas</h1>
            <p className="text-sm text-muted-foreground">
              Importe a pré-fatura do cliente e confronte com as NFs (XML) e CT-e/Minutas do sistema.
            </p>
          </div>
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Importar pré-fatura
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Importar pré-fatura (Excel/CSV)</DialogTitle>
                <DialogDescription>
                  Suporta colunas como: chave, NF, série, CNPJ emitente, CT-e, valor NF, valor frete, peso, volumes, data.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Arquivo</Label>
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt,.edi,.notfis"
                    onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cliente — CNPJ</Label>
                    <Input value={clienteCnpj} onChange={(e) => setClienteCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
                  </div>
                  <div>
                    <Label>Cliente — Nome</Label>
                    <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Hershey's" />
                  </div>
                </div>
                <div>
                  <Label>Nº pré-fatura (cliente)</Label>
                  <Input value={numeroPref} onChange={(e) => setNumeroPref(e.target.value)} />
                </div>
                <Button onClick={handleImportar} disabled={importing} className="w-full">
                  {importing ? "Importando..." : "Importar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Pré-faturas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
              {!loading && prefaturas.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma pré-fatura ainda.</p>
              )}
              {prefaturas.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedId === p.id ? "border-primary bg-accent" : "border-border hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.cliente_nome || p.cliente_cnpj}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.arquivo_origem_nome} · {p.total_itens} itens
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">{p.status}</Badge>
                    <span className="text-xs text-muted-foreground">{fmtMoney(p.total_valor_nf_cliente)}</span>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="lg:col-span-2 space-y-4">
            {!selectedId && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  Selecione uma pré-fatura ao lado.
                </CardContent>
              </Card>
            )}

            {selectedId && (
              <>
                <Card>
                  <CardContent className="py-4 flex flex-wrap items-center gap-4">
                    <Button onClick={() => handleConciliar(selectedId)} disabled={reconciliando}>
                      <RefreshCw className={`w-4 h-4 mr-2 ${reconciliando ? "animate-spin" : ""}`} />
                      {reconciliando ? "Conciliando..." : "Conciliar / Reprocessar"}
                    </Button>
                    <Button variant="outline" onClick={() => handleExportar(selectedId)}>
                      <Download className="w-4 h-4 mr-2" />
                      Exportar retorno (Excel)
                    </Button>
                    <Button variant="ghost" onClick={() => handleExcluir(selectedId)} className="text-destructive ml-auto">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Excluir
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Resumo</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-5 gap-2 text-center">
                    {(["ok", "divergente", "sem_nf", "sem_cte", "pendente"] as const).map((k) => (
                      <div key={k} className={`p-3 rounded-lg ${STATUS_COLORS[k]}`}>
                        <p className="text-xs uppercase">{k.replace("_", " ")}</p>
                        <p className="text-2xl font-bold">{totaisItens[k]}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Itens da pré-fatura</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>NF cliente</TableHead>
                          <TableHead>Chave</TableHead>
                          <TableHead className="text-right">Valor NF</TableHead>
                          <TableHead className="text-right">Frete cliente</TableHead>
                          <TableHead className="text-right">Frete CT-e</TableHead>
                          <TableHead>CT-e</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Divergências</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itens.map((it) => {
                          const status = it.conciliacao?.status_conciliacao || "pendente";
                          const divs = it.conciliacao?.divergencias?.itens || [];
                          return (
                            <TableRow key={it.id}>
                              <TableCell className="text-xs">{it.linha_arquivo}</TableCell>
                              <TableCell className="text-sm">{it.numero_nf_cliente || "—"}</TableCell>
                              <TableCell className="text-xs font-mono truncate max-w-[180px]">
                                {it.chave_acesso_cliente || "—"}
                              </TableCell>
                              <TableCell className="text-right text-sm">{fmtMoney(it.valor_nf_cliente)}</TableCell>
                              <TableCell className="text-right text-sm">{fmtMoney(it.valor_frete_cliente)}</TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                {it.valor_frete_cte === null && status === "sem_cte" ? (
                                  <span className="text-orange-700">sem CT-e</span>
                                ) : (
                                  fmtMoney(it.valor_frete_cte)
                                )}
                              </TableCell>
                              <TableCell className="text-xs">{it.numero_cte || "—"}</TableCell>
                              <TableCell>
                                <Badge className={STATUS_COLORS[status]}>{status}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                {divs.length === 0 ? "—" : divs.map((d) => d.campo).join(", ")}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
