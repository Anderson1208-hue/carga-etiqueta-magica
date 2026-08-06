import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Pencil, MapPin, AlertTriangle, Clock } from "lucide-react";
import { useGestaoComercial } from "@/hooks/useGestaoComercial";
import { SemPermissao } from "@/components/comercial/SemPermissao";

type Embarcador = { id: string; razao_social: string; nome_fantasia: string | null };
type Regiao = { id: string; embarcador_id: string; nome: string; ativo: boolean };
type Cidade = { id: string; regiao_id: string; uf: string; municipio: string };
type Sla = {
  id: string;
  regiao_id: string;
  prazo_dias_uteis: number;
  vigente_de: string;
  vigente_ate: string | null;
  observacao: string | null;
  ativo: boolean;
};

const hoje = () => new Date().toISOString().slice(0, 10);

/** Aceita "Niterói", "Niterói/RJ", "RJ - Niterói", "Niterói;RJ" */
function parseLinhaCidade(linha: string, ufPadrao: string) {
  const t = linha.trim();
  if (!t) return null;
  let uf = ufPadrao;
  let municipio = t;
  const m1 = t.match(/^(.+?)\s*[\/;,]\s*([A-Za-z]{2})$/);
  const m2 = t.match(/^([A-Za-z]{2})\s*[-\/;,]\s*(.+)$/);
  if (m1) { municipio = m1[1]; uf = m1[2]; }
  else if (m2) { uf = m2[1]; municipio = m2[2]; }
  municipio = municipio.replace(/\s+/g, " ").trim();
  uf = uf.trim().toUpperCase();
  if (!municipio || uf.length !== 2) return null;
  return { uf, municipio };
}

export default function SlaFornecedor() {
  const { podeGestaoComercial, isLoading: authLoading } = useGestaoComercial();

  const [embarcadores, setEmbarcadores] = useState<Embarcador[]>([]);
  const [embarcadorId, setEmbarcadorId] = useState("");
  const [regioes, setRegioes] = useState<Regiao[]>([]);
  const [regiaoSel, setRegiaoSel] = useState<Regiao | null>(null);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [outrasCidades, setOutrasCidades] = useState<Cidade[]>([]);
  const [slas, setSlas] = useState<Sla[]>([]);
  const [loading, setLoading] = useState(false);

  const [openRegiao, setOpenRegiao] = useState(false);
  const [formRegiao, setFormRegiao] = useState<{ id?: string; nome: string }>({ nome: "" });

  const [ufPadrao, setUfPadrao] = useState("RJ");
  const [bulkCidades, setBulkCidades] = useState("");
  const [salvandoCidades, setSalvandoCidades] = useState(false);

  const [openSla, setOpenSla] = useState(false);
  const [formSla, setFormSla] = useState<Partial<Sla>>({ prazo_dias_uteis: 1, vigente_de: hoje() });

  useEffect(() => {
    supabase
      .from("embarcadores")
      .select("id, razao_social, nome_fantasia")
      .eq("ativo", true)
      .order("razao_social")
      .then(({ data }) => setEmbarcadores((data as Embarcador[]) || []));
  }, []);

  const loadRegioes = async (embId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("embarcador_regioes")
      .select("*")
      .eq("embarcador_id", embId)
      .order("nome");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const list = (data as Regiao[]) || [];
    setRegioes(list);
    const atual = regiaoSel && list.find((r) => r.id === regiaoSel.id);
    setRegiaoSel(atual || list[0] || null);
  };

  useEffect(() => {
    if (!embarcadorId) { setRegioes([]); setRegiaoSel(null); return; }
    loadRegioes(embarcadorId);
  }, [embarcadorId]);

  const loadDetalhe = async (regiao: Regiao) => {
    const [c, s, o] = await Promise.all([
      supabase.from("embarcador_regiao_cidades").select("*").eq("regiao_id", regiao.id).order("uf").order("municipio"),
      supabase.from("embarcador_regiao_sla").select("*").eq("regiao_id", regiao.id).order("vigente_de", { ascending: false }),
      supabase
        .from("embarcador_regiao_cidades")
        .select("id, regiao_id, uf, municipio, embarcador_regioes!inner(embarcador_id)")
        .eq("embarcador_regioes.embarcador_id", regiao.embarcador_id)
        .neq("regiao_id", regiao.id),
    ]);
    setCidades((c.data as Cidade[]) || []);
    setSlas((s.data as Sla[]) || []);
    setOutrasCidades((o.data as unknown as Cidade[]) || []);
  };

  useEffect(() => {
    if (!regiaoSel) { setCidades([]); setSlas([]); setOutrasCidades([]); return; }
    loadDetalhe(regiaoSel);
  }, [regiaoSel?.id]);

  const conflitos = useMemo(() => {
    const set = new Set(outrasCidades.map((c) => `${c.uf.toUpperCase()}|${c.municipio.toUpperCase()}`));
    return cidades.filter((c) => set.has(`${c.uf.toUpperCase()}|${c.municipio.toUpperCase()}`));
  }, [cidades, outrasCidades]);

  const slaVigente = useMemo(() => {
    const d = hoje();
    return slas.find((s) => s.ativo && s.vigente_de <= d && (!s.vigente_ate || s.vigente_ate >= d)) || null;
  }, [slas]);

  const salvarRegiao = async () => {
    if (!embarcadorId) return toast.error("Selecione o fornecedor");
    if (!formRegiao.nome.trim()) return toast.error("Informe o nome da região");
    const payload = { embarcador_id: embarcadorId, nome: formRegiao.nome.trim() };
    const { error } = formRegiao.id
      ? await supabase.from("embarcador_regioes").update(payload).eq("id", formRegiao.id)
      : await supabase.from("embarcador_regioes").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Região salva");
    setOpenRegiao(false);
    setFormRegiao({ nome: "" });
    loadRegioes(embarcadorId);
  };

  const removerRegiao = async (r: Regiao) => {
    if (!confirm(`Excluir a região "${r.nome}" com suas cidades, SLA e tarifas?`)) return;
    const { error } = await supabase.from("embarcador_regioes").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    if (regiaoSel?.id === r.id) setRegiaoSel(null);
    loadRegioes(embarcadorId);
  };

  const adicionarCidades = async () => {
    if (!regiaoSel) return;
    const linhas = bulkCidades.split(/\r?\n/);
    const parsed = linhas.map((l) => parseLinhaCidade(l, ufPadrao)).filter(Boolean) as { uf: string; municipio: string }[];
    if (parsed.length === 0) return toast.error("Nenhuma cidade válida informada");
    const chaves = new Set<string>();
    const rows = parsed
      .filter((p) => {
        const k = `${p.uf}|${p.municipio.toUpperCase()}`;
        if (chaves.has(k)) return false;
        chaves.add(k);
        return true;
      })
      .map((p) => ({ regiao_id: regiaoSel.id, uf: p.uf, municipio: p.municipio }));
    setSalvandoCidades(true);
    const { error } = await supabase.from("embarcador_regiao_cidades").upsert(rows, {
      onConflict: "regiao_id,uf,municipio_norm",
      ignoreDuplicates: true,
    });
    setSalvandoCidades(false);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} cidade(s) processada(s)`);
    setBulkCidades("");
    loadDetalhe(regiaoSel);
  };

  const removerCidade = async (id: string) => {
    const { error } = await supabase.from("embarcador_regiao_cidades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (regiaoSel) loadDetalhe(regiaoSel);
  };

  const salvarSla = async () => {
    if (!regiaoSel) return;
    const prazo = Number(formSla.prazo_dias_uteis);
    if (!Number.isFinite(prazo) || prazo < 0) return toast.error("Prazo inválido");
    const payload = {
      regiao_id: regiaoSel.id,
      prazo_dias_uteis: Math.trunc(prazo),
      vigente_de: formSla.vigente_de || hoje(),
      vigente_ate: formSla.vigente_ate || null,
      observacao: formSla.observacao?.trim() || null,
      ativo: formSla.ativo ?? true,
    };
    const { error } = formSla.id
      ? await supabase.from("embarcador_regiao_sla").update(payload).eq("id", formSla.id)
      : await supabase.from("embarcador_regiao_sla").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Prazo (SLA) salvo");
    setOpenSla(false);
    loadDetalhe(regiaoSel);
  };

  const removerSla = async (id: string) => {
    const { error } = await supabase.from("embarcador_regiao_sla").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (regiaoSel) loadDetalhe(regiaoSel);
  };

  if (authLoading) return <div className="p-6"><Loader2 className="animate-spin" /></div>;
  if (!podeGestaoComercial) return <SemPermissao />;

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Regiões e SLA por Fornecedor</h1>
          <p className="text-sm text-muted-foreground">
            Defina as regiões de cada fornecedor, as cidades de cada região e o prazo de entrega em dias úteis.
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
          Selecione um fornecedor para começar.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Regiões */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Regiões ({regioes.length})</CardTitle>
              <Button size="sm" onClick={() => { setFormRegiao({ nome: "" }); setOpenRegiao(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Nova
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {loading && <Loader2 className="animate-spin" />}
              {!loading && regioes.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma região cadastrada.</p>
              )}
              {regioes.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setRegiaoSel(r)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${regiaoSel?.id === r.id ? "bg-muted border-primary" : "hover:bg-muted/50"}`}
                >
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium">{r.nome}</span>
                  {!r.ativo && <Badge variant="outline" className="text-xs">inativa</Badge>}
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); setFormRegiao({ id: r.id, nome: r.nome }); setOpenRegiao(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); removerRegiao(r); }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Detalhe */}
          <div className="lg:col-span-2 space-y-4">
            {!regiaoSel ? (
              <Card><CardContent className="py-10 text-center text-muted-foreground">
                Selecione uma região.
              </CardContent></Card>
            ) : (
              <>
                {/* SLA */}
                <Card>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Prazo de entrega — {regiaoSel.nome}
                    </CardTitle>
                    <Button size="sm" variant="outline"
                      onClick={() => { setFormSla({ prazo_dias_uteis: slaVigente?.prazo_dias_uteis ?? 1, vigente_de: hoje() }); setOpenSla(true); }}>
                      <Plus className="w-4 h-4 mr-1" /> Nova vigência
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm">
                      Vigente hoje:{" "}
                      {slaVigente ? (
                        <b>{slaVigente.prazo_dias_uteis} dia(s) útil(eis)</b>
                      ) : (
                        <span className="text-muted-foreground">não definido</span>
                      )}
                    </p>
                    <div className="rounded-lg border divide-y">
                      {slas.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum prazo cadastrado.</p>}
                      {slas.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <span className="font-semibold w-24">{s.prazo_dias_uteis} d.ú.</span>
                          <span className="text-muted-foreground">
                            {s.vigente_de}{s.vigente_ate ? ` → ${s.vigente_ate}` : " → sem fim"}
                          </span>
                          {!s.ativo && <Badge variant="outline">inativo</Badge>}
                          <span className="flex-1 truncate text-xs text-muted-foreground">{s.observacao || ""}</span>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setFormSla(s); setOpenSla(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removerSla(s.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Cidades */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Cidades da região ({cidades.length})</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {conflitos.length > 0 && (
                      <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                        <div>
                          <p className="font-semibold">Cidades duplicadas em outra região deste fornecedor:</p>
                          <p>{conflitos.map((c) => `${c.municipio}/${c.uf}`).join(", ")}</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        <Label className="text-xs">UF padrão</Label>
                        <Input value={ufPadrao} maxLength={2}
                          onChange={(e) => setUfPadrao(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase())} />
                      </div>
                      <div className="col-span-9">
                        <Label className="text-xs">Cidades (uma por linha; aceita "Niterói" ou "Niterói/RJ")</Label>
                        <Textarea rows={3} value={bulkCidades} onChange={(e) => setBulkCidades(e.target.value)}
                          placeholder={"Rio de Janeiro\nNiterói\nCabo Frio/RJ"} />
                      </div>
                    </div>
                    <Button size="sm" onClick={adicionarCidades} disabled={salvandoCidades}>
                      {salvandoCidades ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                      Adicionar cidades
                    </Button>

                    <div className="flex flex-wrap gap-1.5 max-h-64 overflow-auto">
                      {cidades.map((c) => (
                        <Badge key={c.id} variant="secondary" className="gap-1">
                          {c.municipio}/{c.uf}
                          <button className="ml-1 text-destructive" onClick={() => removerCidade(c.id)}>×</button>
                        </Badge>
                      ))}
                      {cidades.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma cidade nesta região.</p>}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* Dialog região */}
      <Dialog open={openRegiao} onOpenChange={setOpenRegiao}>
        <DialogContent>
          <DialogHeader><DialogTitle>{formRegiao.id ? "Editar" : "Nova"} região</DialogTitle></DialogHeader>
          <div>
            <Label>Nome da região</Label>
            <Input value={formRegiao.nome} placeholder="ex.: Capital, Baixada, Interior"
              onChange={(e) => setFormRegiao({ ...formRegiao, nome: e.target.value })} />
          </div>
          <DialogFooter><Button onClick={salvarRegiao}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog SLA */}
      <Dialog open={openSla} onOpenChange={setOpenSla}>
        <DialogContent>
          <DialogHeader><DialogTitle>{formSla.id ? "Editar" : "Novo"} prazo de entrega</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prazo (dias úteis)</Label>
              <Input type="number" min={0} value={formSla.prazo_dias_uteis ?? ""}
                onChange={(e) => setFormSla({ ...formSla, prazo_dias_uteis: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Vigente de</Label>
              <Input type="date" value={formSla.vigente_de || hoje()}
                onChange={(e) => setFormSla({ ...formSla, vigente_de: e.target.value })} />
            </div>
            <div>
              <Label>Vigente até</Label>
              <Input type="date" value={formSla.vigente_ate || ""}
                onChange={(e) => setFormSla({ ...formSla, vigente_ate: e.target.value || null })} />
            </div>
            <div className="col-span-2">
              <Label>Observação</Label>
              <Input value={formSla.observacao || ""}
                onChange={(e) => setFormSla({ ...formSla, observacao: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button onClick={salvarSla}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
