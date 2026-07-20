import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, Layers } from "lucide-react";

type Tabela = {
  id?: string;
  embarcador_id: string;
  nome: string;
  vigente_de: string;
  vigente_ate?: string | null;
  frete_minimo?: number | null;
  observacoes?: string | null;
  ativo: boolean;
};

type Faixa = {
  id?: string;
  tabela_id: string;
  zona: string;
  tipo_carga: string;
  peso_min_kg: number;
  peso_max_kg?: number | null;
  tarifa_por_ton?: number | null;
  tarifa_fixa?: number | null;
  pedagio_por_100kg?: number | null;
  adicional_cte?: number | null;
  gris_percentual?: number | null;
  advalorem_percentual?: number | null;
};

const emptyTab: Tabela = { embarcador_id: "", nome: "", vigente_de: new Date().toISOString().slice(0,10), ativo: true };
const emptyFx: Faixa = { tabela_id: "", zona: "", tipo_carga: "01", peso_min_kg: 0 };

export default function TabelasFrete() {
  const [embarcadores, setEmbarcadores] = useState<any[]>([]);
  const [tabs, setTabs] = useState<Tabela[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTab, setOpenTab] = useState(false);
  const [formTab, setFormTab] = useState<Tabela>(emptyTab);
  const [selectedTab, setSelectedTab] = useState<Tabela | null>(null);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [openFx, setOpenFx] = useState(false);
  const [formFx, setFormFx] = useState<Faixa>(emptyFx);

  const load = async () => {
    setLoading(true);
    const [e, t] = await Promise.all([
      supabase.from("embarcadores").select("id, razao_social, nome_fantasia").eq("ativo", true).order("razao_social"),
      supabase.from("tabelas_frete").select("*").order("created_at", { ascending: false }),
    ]);
    setEmbarcadores(e.data || []);
    setTabs((t.data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadFaixas = async (tid: string) => {
    const { data } = await supabase.from("tabelas_frete_faixas").select("*").eq("tabela_id", tid).order("zona").order("peso_min_kg");
    setFaixas((data as any) || []);
  };

  const saveTab = async () => {
    if (!formTab.nome || !formTab.embarcador_id) return toast({ title: "Nome e embarcador obrigatórios", variant: "destructive" });
    const q = formTab.id
      ? supabase.from("tabelas_frete").update(formTab).eq("id", formTab.id)
      : supabase.from("tabelas_frete").insert(formTab);
    const { error } = await q;
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Tabela salva" }); setOpenTab(false); setFormTab(emptyTab); load();
  };

  const saveFx = async () => {
    if (!selectedTab?.id) return;
    const payload = { ...formFx, tabela_id: selectedTab.id };
    const q = formFx.id
      ? supabase.from("tabelas_frete_faixas").update(payload).eq("id", formFx.id)
      : supabase.from("tabelas_frete_faixas").insert(payload);
    const { error } = await q;
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Faixa salva" }); setOpenFx(false); setFormFx({ ...emptyFx, tabela_id: selectedTab.id }); loadFaixas(selectedTab.id);
  };

  const removeTab = async (id: string) => {
    if (!confirm("Excluir tabela e todas as faixas?")) return;
    await supabase.from("tabelas_frete").delete().eq("id", id);
    if (selectedTab?.id === id) { setSelectedTab(null); setFaixas([]); }
    load();
  };

  const removeFx = async (id: string) => {
    await supabase.from("tabelas_frete_faixas").delete().eq("id", id);
    if (selectedTab?.id) loadFaixas(selectedTab.id);
  };

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Tabelas de Frete</h1>
        <Dialog open={openTab} onOpenChange={setOpenTab}>
          <DialogTrigger asChild><Button onClick={() => setFormTab(emptyTab)}><Plus className="w-4 h-4 mr-2" />Nova Tabela</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{formTab.id ? "Editar" : "Nova"} Tabela</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Embarcador</Label>
                <Select value={formTab.embarcador_id} onValueChange={v => setFormTab({ ...formTab, embarcador_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{embarcadores.map(e => <SelectItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Nome da Tabela</Label><Input value={formTab.nome} onChange={e => setFormTab({ ...formTab, nome: e.target.value })} /></div>
              <div><Label>Vigente de</Label><Input type="date" value={formTab.vigente_de} onChange={e => setFormTab({ ...formTab, vigente_de: e.target.value })} /></div>
              <div><Label>Vigente até</Label><Input type="date" value={formTab.vigente_ate || ""} onChange={e => setFormTab({ ...formTab, vigente_ate: e.target.value || null })} /></div>
              <div><Label>Frete Mínimo (R$)</Label><Input type="number" step="0.01" value={formTab.frete_minimo ?? ""} onChange={e => setFormTab({ ...formTab, frete_minimo: e.target.value ? parseFloat(e.target.value) : null })} /></div>
            </div>
            <DialogFooter><Button onClick={saveTab}>Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Tabelas ({tabs.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Loader2 className="animate-spin" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Embarcador</TableHead><TableHead>Nome</TableHead><TableHead>Vigência</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {tabs.map(t => {
                    const emb = embarcadores.find(e => e.id === t.embarcador_id);
                    const sel = selectedTab?.id === t.id;
                    return (
                      <TableRow key={t.id} className={sel ? "bg-muted" : "cursor-pointer"} onClick={() => { setSelectedTab(t); loadFaixas(t.id!); }}>
                        <TableCell className="text-xs">{emb?.nome_fantasia || emb?.razao_social || "—"}</TableCell>
                        <TableCell>{t.nome}</TableCell>
                        <TableCell className="text-xs">{t.vigente_de}{t.vigente_ate && ` → ${t.vigente_ate}`}</TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => { setFormTab(t); setOpenTab(true); }}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => removeTab(t.id!)}><Trash2 className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Layers className="w-4 h-4" />Faixas {selectedTab && `— ${selectedTab.nome}`}</CardTitle>
            {selectedTab && (
              <Dialog open={openFx} onOpenChange={setOpenFx}>
                <DialogTrigger asChild><Button size="sm" onClick={() => setFormFx({ ...emptyFx, tabela_id: selectedTab.id! })}><Plus className="w-4 h-4 mr-2" />Nova Faixa</Button></DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>{formFx.id ? "Editar" : "Nova"} Faixa</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Zona</Label><Input value={formFx.zona} onChange={e => setFormFx({ ...formFx, zona: e.target.value })} placeholder="RJ, Interior, Baixada..." /></div>
                    <div><Label>Tipo Carga</Label>
                      <Select value={formFx.tipo_carga} onValueChange={v => setFormFx({ ...formFx, tipo_carga: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="01">01 - Seca</SelectItem><SelectItem value="02">02 - Climatizada/Refrigerada</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div><Label>Peso mín (kg)</Label><Input type="number" step="0.01" value={formFx.peso_min_kg} onChange={e => setFormFx({ ...formFx, peso_min_kg: parseFloat(e.target.value) || 0 })} /></div>
                    <div><Label>Peso máx (kg)</Label><Input type="number" step="0.01" value={formFx.peso_max_kg ?? ""} onChange={e => setFormFx({ ...formFx, peso_max_kg: e.target.value ? parseFloat(e.target.value) : null })} /></div>
                    <div><Label>Tarifa / ton (R$)</Label><Input type="number" step="0.0001" value={formFx.tarifa_por_ton ?? ""} onChange={e => setFormFx({ ...formFx, tarifa_por_ton: e.target.value ? parseFloat(e.target.value) : null })} /></div>
                    <div><Label>Tarifa fixa (R$)</Label><Input type="number" step="0.0001" value={formFx.tarifa_fixa ?? ""} onChange={e => setFormFx({ ...formFx, tarifa_fixa: e.target.value ? parseFloat(e.target.value) : null })} /></div>
                    <div><Label>Pedágio / 100kg</Label><Input type="number" step="0.0001" value={formFx.pedagio_por_100kg ?? ""} onChange={e => setFormFx({ ...formFx, pedagio_por_100kg: e.target.value ? parseFloat(e.target.value) : null })} /></div>
                    <div><Label>Adic. CT-e (R$)</Label><Input type="number" step="0.0001" value={formFx.adicional_cte ?? ""} onChange={e => setFormFx({ ...formFx, adicional_cte: e.target.value ? parseFloat(e.target.value) : null })} /></div>
                    <div><Label>GRIS %</Label><Input type="number" step="0.0001" value={formFx.gris_percentual ?? ""} onChange={e => setFormFx({ ...formFx, gris_percentual: e.target.value ? parseFloat(e.target.value) : null })} /></div>
                    <div><Label>Ad Valorem %</Label><Input type="number" step="0.0001" value={formFx.advalorem_percentual ?? ""} onChange={e => setFormFx({ ...formFx, advalorem_percentual: e.target.value ? parseFloat(e.target.value) : null })} /></div>
                  </div>
                  <DialogFooter><Button onClick={saveFx}>Salvar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {!selectedTab ? <p className="text-sm text-muted-foreground">Selecione uma tabela para ver as faixas</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Zona</TableHead><TableHead>Tipo</TableHead><TableHead>Peso</TableHead><TableHead>R$/ton</TableHead><TableHead>Pedágio</TableHead><TableHead>GRIS</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {faixas.map(f => (
                    <TableRow key={f.id}>
                      <TableCell>{f.zona}</TableCell>
                      <TableCell><Badge variant="outline">{f.tipo_carga}</Badge></TableCell>
                      <TableCell className="text-xs">{f.peso_min_kg}-{f.peso_max_kg ?? "∞"}</TableCell>
                      <TableCell>{f.tarifa_por_ton ?? "-"}</TableCell>
                      <TableCell>{f.pedagio_por_100kg ?? "-"}</TableCell>
                      <TableCell>{f.gris_percentual ?? "-"}%</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => { setFormFx(f); setOpenFx(true); }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => removeFx(f.id!)}><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
