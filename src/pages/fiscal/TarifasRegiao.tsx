import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, History } from "lucide-react";
import { useGestaoComercial } from "@/hooks/useGestaoComercial";
import { SemPermissao } from "@/components/comercial/SemPermissao";

type Embarcador = { id: string; razao_social: string; nome_fantasia: string | null };
type Regiao = { id: string; nome: string; ativo: boolean };
type CatalogoComponente = {
  id: string;
  codigo: string;
  nome: string;
  nome_dacte: string | null;
  tipo_calculo: string;
  descricao: string | null;
  ordem: number;
};
type ComponenteExtra = {
  codigo: string;
  nome: string;
  nome_dacte: string | null;
  tipo_calculo: string;
  valor: number | null;
  embutido: boolean;
};
type Tarifa = {
  id?: string;
  regiao_id: string;
  tarifa_por_ton: number | null;
  tarifa_fixa: number | null;
  frete_minimo: number | null;
  gris_percentual: number | null;
  advalorem_percentual: number | null;
  pedagio_por_100kg: number | null;
  adicional_cte: number | null;
  componentes_extra: ComponenteExtra[];
  vigente_de: string;
  vigente_ate: string | null;
  observacao: string | null;
  ativo: boolean;
};

const TIPO_LABEL: Record<string, string> = {
  percentual_nf: "% sobre valor da NF",
  percentual_frete: "% sobre o frete",
  valor_por_ton: "R$ por tonelada",
  valor_por_100kg: "R$ por 100 kg",
  valor_fixo: "R$ fixo por CT-e",
  valor_por_entrega: "R$ por entrega",
};
const isPercent = (tipo: string) => tipo.startsWith("percentual");

const hoje = () => new Date().toISOString().slice(0, 10);
const num = (v: string) => (v === "" ? null : Number(v));
const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

const novaTarifa = (regiao_id: string): Tarifa => ({
  regiao_id,
  tarifa_por_ton: null,
  tarifa_fixa: null,
  frete_minimo: null,
  gris_percentual: null,
  advalorem_percentual: null,
  pedagio_por_100kg: null,
  adicional_cte: null,
  componentes_extra: [],
  vigente_de: hoje(),
  vigente_ate: null,
  observacao: null,
  ativo: true,
});

export default function TarifasRegiao() {
  const { podeGestaoComercial, isLoading: authLoading } = useGestaoComercial();

  const [embarcadores, setEmbarcadores] = useState<Embarcador[]>([]);
  const [embarcadorId, setEmbarcadorId] = useState("");
  const [regioes, setRegioes] = useState<Regiao[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Tarifa | null>(null);
  const [histRegiao, setHistRegiao] = useState<Regiao | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoComponente[]>([]);
  const [novoComponente, setNovoComponente] = useState("");

  useEffect(() => {
    supabase
      .from("embarcadores")
      .select("id, razao_social, nome_fantasia")
      .eq("ativo", true)
      .order("razao_social")
      .then(({ data }) => setEmbarcadores((data as Embarcador[]) || []));

    supabase
      .from("componentes_frete_catalogo")
      .select("id, codigo, nome, nome_dacte, tipo_calculo, descricao, ordem")
      .eq("ativo", true)
      .order("ordem")
      .then(({ data }) => setCatalogo((data as CatalogoComponente[]) || []));
  }, []);

  const load = async (embId: string) => {
    setLoading(true);
    const { data: regs, error } = await supabase
      .from("embarcador_regioes")
      .select("id, nome, ativo")
      .eq("embarcador_id", embId)
      .order("nome");
    if (error) { setLoading(false); toast.error(error.message); return; }
    const list = (regs as Regiao[]) || [];
    setRegioes(list);
    if (list.length === 0) { setTarifas([]); setLoading(false); return; }
    const { data: tar } = await supabase
      .from("embarcador_regiao_tarifas")
      .select("*")
      .in("regiao_id", list.map((r) => r.id))
      .order("vigente_de", { ascending: false });
    setTarifas(
      ((tar as any[]) || []).map((t) => ({
        ...t,
        componentes_extra: Array.isArray(t.componentes_extra)
          ? (t.componentes_extra as ComponenteExtra[])
          : [],
      })) as Tarifa[]
    );
    setLoading(false);
  };

  useEffect(() => {
    if (!embarcadorId) { setRegioes([]); setTarifas([]); return; }
    load(embarcadorId);
  }, [embarcadorId]);

  const vigentePorRegiao = useMemo(() => {
    const d = hoje();
    const map = new Map<string, Tarifa>();
    for (const t of tarifas) {
      if (!t.ativo || t.vigente_de > d || (t.vigente_ate && t.vigente_ate < d)) continue;
      if (!map.has(t.regiao_id)) map.set(t.regiao_id, t);
    }
    return map;
  }, [tarifas]);

  const addComponente = (codigo: string) => {
    if (!form || !codigo) return;
    const c = catalogo.find((x) => x.codigo === codigo);
    if (!c) return;
    if (form.componentes_extra.some((x) => x.codigo === codigo)) {
      return toast.error("Componente já lançado nesta tarifa");
    }
    setForm({
      ...form,
      componentes_extra: [
        ...form.componentes_extra,
        { codigo: c.codigo, nome: c.nome, nome_dacte: c.nome_dacte, tipo_calculo: c.tipo_calculo, valor: null, embutido: false },
      ],
    });
    setNovoComponente("");
  };

  const updComponente = (codigo: string, patch: Partial<ComponenteExtra>) => {
    if (!form) return;
    setForm({
      ...form,
      componentes_extra: form.componentes_extra.map((c) => (c.codigo === codigo ? { ...c, ...patch } : c)),
    });
  };

  const delComponente = (codigo: string) => {
    if (!form) return;
    setForm({ ...form, componentes_extra: form.componentes_extra.filter((c) => c.codigo !== codigo) });
  };

  const salvar = async () => {
    if (!form) return;
    if (form.tarifa_por_ton == null && form.tarifa_fixa == null) {
      return toast.error("Informe tarifa por tonelada ou tarifa fixa");
    }
    if (form.componentes_extra.some((c) => c.valor == null)) {
      return toast.error("Preencha o valor de todos os componentes adicionais");
    }
    const { id, ...rest } = form;
    const payload = { ...rest, componentes_extra: rest.componentes_extra as any };
    const { error } = id
      ? await supabase.from("embarcador_regiao_tarifas").update(payload).eq("id", id)
      : await supabase.from("embarcador_regiao_tarifas").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Tarifa salva");
    setOpen(false);
    setForm(null);
    load(embarcadorId);
  };

  const remover = async (id: string) => {
    if (!confirm("Excluir esta tarifa?")) return;
    const { error } = await supabase.from("embarcador_regiao_tarifas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load(embarcadorId);
  };

  if (authLoading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  if (!podeGestaoComercial) return <SemPermissao />;

  const historico = histRegiao ? tarifas.filter((t) => t.regiao_id === histRegiao.id) : [];

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tarifas por Fornecedor e Região</h1>
          <p className="text-sm text-muted-foreground">
            Valor único por região (sem faixa de peso). As regiões são cadastradas na tela de Regiões e SLA.
          </p>
        </div>
        <div className="w-72">
          <Label className="text-xs">Fornecedor (embarcador)</Label>
          <Select value={embarcadorId} onValueChange={setEmbarcadorId}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {embarcadores.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!embarcadorId ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Selecione um fornecedor para ver as tarifas.
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Tarifa vigente por região ({regioes.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Loader2 className="animate-spin" /> : regioes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este fornecedor ainda não tem regiões. Cadastre em "Regiões e SLA por Fornecedor".
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Região</TableHead>
                      <TableHead className="text-right">R$/ton</TableHead>
                      <TableHead className="text-right">Fixa</TableHead>
                      <TableHead className="text-right">Mínimo</TableHead>
                      <TableHead className="text-right">GRIS</TableHead>
                      <TableHead className="text-right">Ad val.</TableHead>
                      <TableHead className="text-right">Pedágio/100kg</TableHead>
                      <TableHead className="text-right">Adic. CT-e</TableHead>
                      <TableHead>Vigência</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {regioes.map((r) => {
                      const t = vigentePorRegiao.get(r.id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {r.nome} {!r.ativo && <Badge variant="outline" className="ml-1">inativa</Badge>}
                          </TableCell>
                          <TableCell className="text-right">{brl(t?.tarifa_por_ton)}</TableCell>
                          <TableCell className="text-right">{brl(t?.tarifa_fixa)}</TableCell>
                          <TableCell className="text-right">{brl(t?.frete_minimo)}</TableCell>
                          <TableCell className="text-right">{pct(t?.gris_percentual)}</TableCell>
                          <TableCell className="text-right">{pct(t?.advalorem_percentual)}</TableCell>
                          <TableCell className="text-right">{brl(t?.pedagio_por_100kg)}</TableCell>
                          <TableCell className="text-right">{brl(t?.adicional_cte)}</TableCell>
                          <TableCell className="text-xs">
                            {t ? `${t.vigente_de}${t.vigente_ate ? ` → ${t.vigente_ate}` : ""}` : <span className="text-muted-foreground">sem tarifa</span>}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Nova vigência"
                              onClick={() => { setForm({ ...(t ? { ...t, id: undefined, vigente_de: hoje(), vigente_ate: null } : novaTarifa(r.id)) }); setOpen(true); }}>
                              <Plus className="w-4 h-4" />
                            </Button>
                            {t && (
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar vigente"
                                onClick={() => { setForm(t); setOpen(true); }}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Histórico"
                              onClick={() => setHistRegiao(r)}>
                              <History className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog tarifa */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form?.id ? "Editar tarifa" : "Nova tarifa"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tarifa por tonelada (R$)</Label>
                <Input type="number" step="0.01" value={form.tarifa_por_ton ?? ""}
                  onChange={(e) => setForm({ ...form, tarifa_por_ton: num(e.target.value) })} />
              </div>
              <div>
                <Label>Tarifa fixa por entrega (R$)</Label>
                <Input type="number" step="0.01" value={form.tarifa_fixa ?? ""}
                  onChange={(e) => setForm({ ...form, tarifa_fixa: num(e.target.value) })} />
              </div>
              <div>
                <Label>Frete mínimo (R$)</Label>
                <Input type="number" step="0.01" value={form.frete_minimo ?? ""}
                  onChange={(e) => setForm({ ...form, frete_minimo: num(e.target.value) })} />
              </div>
              <div>
                <Label>Pedágio por 100kg (R$)</Label>
                <Input type="number" step="0.01" value={form.pedagio_por_100kg ?? ""}
                  onChange={(e) => setForm({ ...form, pedagio_por_100kg: num(e.target.value) })} />
              </div>
              <div>
                <Label>GRIS (%)</Label>
                <Input type="number" step="0.01" value={form.gris_percentual ?? ""}
                  onChange={(e) => setForm({ ...form, gris_percentual: num(e.target.value) })} />
              </div>
              <div>
                <Label>Ad valorem (%)</Label>
                <Input type="number" step="0.01" value={form.advalorem_percentual ?? ""}
                  onChange={(e) => setForm({ ...form, advalorem_percentual: num(e.target.value) })} />
              </div>
              <div>
                <Label>Adicional CT-e (R$)</Label>
                <Input type="number" step="0.01" value={form.adicional_cte ?? ""}
                  onChange={(e) => setForm({ ...form, adicional_cte: num(e.target.value) })} />
              </div>
              <div />
              <div>
                <Label>Vigente de</Label>
                <Input type="date" value={form.vigente_de}
                  onChange={(e) => setForm({ ...form, vigente_de: e.target.value })} />
              </div>
              <div>
                <Label>Vigente até</Label>
                <Input type="date" value={form.vigente_ate ?? ""}
                  onChange={(e) => setForm({ ...form, vigente_ate: e.target.value || null })} />
              </div>
              <div className="col-span-2">
                <Label>Observação</Label>
                <Input value={form.observacao ?? ""}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
              </div>

              {/* Componentes adicionais (nomes do DACTE) */}
              <div className="col-span-2 space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Componentes adicionais do frete</p>
                    <p className="text-xs text-muted-foreground">
                      Opções baseadas nos componentes do DACTE (FRETE PESO, FRETE VALOR, GRIS, CAT, PEDÁGIO, OUTROS) e nos acessórios usuais.
                    </p>
                  </div>
                  <div className="w-64">
                    <Select value={novoComponente} onValueChange={addComponente}>
                      <SelectTrigger><SelectValue placeholder="Adicionar componente" /></SelectTrigger>
                      <SelectContent>
                        {catalogo
                          .filter((c) => !form.componentes_extra.some((x) => x.codigo === c.codigo))
                          .map((c) => (
                            <SelectItem key={c.codigo} value={c.codigo}>
                              {c.nome} · {TIPO_LABEL[c.tipo_calculo] ?? c.tipo_calculo}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.componentes_extra.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum componente adicional lançado.</p>
                ) : (
                  <div className="divide-y">
                    {form.componentes_extra.map((c) => (
                      <div key={c.codigo} className="flex flex-wrap items-end gap-2 py-2">
                        <div className="min-w-40 flex-1">
                          <p className="text-sm font-medium">{c.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {TIPO_LABEL[c.tipo_calculo] ?? c.tipo_calculo}
                            {c.nome_dacte ? ` · DACTE: ${c.nome_dacte}` : ""}
                          </p>
                        </div>
                        <div className="w-32">
                          <Label className="text-xs">{isPercent(c.tipo_calculo) ? "%" : "R$"}</Label>
                          <Input type="number" step="0.0001" value={c.valor ?? ""}
                            onChange={(e) => updComponente(c.codigo, { valor: num(e.target.value) })} />
                        </div>
                        <label className="flex items-center gap-2 pb-2 text-xs">
                          <input type="checkbox" checked={c.embutido}
                            onChange={(e) => updComponente(c.codigo, { embutido: e.target.checked })} />
                          A embutir
                        </label>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => delComponente(c.codigo)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={salvar}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={!!histRegiao} onOpenChange={(v) => !v && setHistRegiao(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Histórico de tarifas — {histRegiao?.nome}</DialogTitle></DialogHeader>
          <div className="rounded-lg border divide-y max-h-96 overflow-auto">
            {historico.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhuma tarifa cadastrada.</p>}
            {historico.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-40 text-xs text-muted-foreground">
                  {t.vigente_de}{t.vigente_ate ? ` → ${t.vigente_ate}` : " → sem fim"}
                </span>
                <span className="flex-1">
                  {brl(t.tarifa_por_ton)}/ton · fixa {brl(t.tarifa_fixa)} · mín {brl(t.frete_minimo)}
                </span>
                {!t.ativo && <Badge variant="outline">inativo</Badge>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setForm(t); setHistRegiao(null); setOpen(true); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remover(t.id!)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
