import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

type Convenio = {
  id?: string;
  nome: string;
  descricao?: string | null;
  uf_origem?: string | null;
  uf_destino?: string | null;
  cnpj_root_embarcador?: string | null;
  cfop_forcado?: string | null;
  cst_icms?: string | null;
  aliquota_icms?: number | null;
  reducao_base?: number | null;
  texto_infadfisco?: string | null;
  texto_infcpl?: string | null;
  base_legal?: string | null;
  ativo: boolean;
};

const empty: Convenio = { nome: "", ativo: true };

export default function ConveniosFiscais() {
  const [rows, setRows] = useState<Convenio[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Convenio>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("convenios_fiscais").select("*").order("nome");
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setRows((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.nome) return toast({ title: "Nome obrigatório", variant: "destructive" });
    setSaving(true);
    const q = form.id
      ? supabase.from("convenios_fiscais").update(form).eq("id", form.id)
      : supabase.from("convenios_fiscais").insert(form);
    const { error } = await q;
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Convênio salvo" }); setOpen(false); setForm(empty); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir convênio?")) return;
    const { error } = await supabase.from("convenios_fiscais").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Excluído" }); load(); }
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Convênios Fiscais</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={() => setForm(empty)}><Plus className="w-4 h-4 mr-2" />Novo</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{form.id ? "Editar" : "Novo"} Convênio</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="col-span-2"><Label>Descrição</Label><Textarea rows={2} value={form.descricao || ""} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
              <div><Label>UF Origem</Label><Input maxLength={2} value={form.uf_origem || ""} onChange={e => setForm({ ...form, uf_origem: e.target.value.toUpperCase() })} /></div>
              <div><Label>UF Destino</Label><Input maxLength={2} value={form.uf_destino || ""} onChange={e => setForm({ ...form, uf_destino: e.target.value.toUpperCase() })} /></div>
              <div><Label>CNPJ raiz embarcador (8 dig)</Label><Input maxLength={8} value={form.cnpj_root_embarcador || ""} onChange={e => setForm({ ...form, cnpj_root_embarcador: e.target.value })} /></div>
              <div><Label>Base Legal</Label><Input value={form.base_legal || ""} onChange={e => setForm({ ...form, base_legal: e.target.value })} /></div>
              <div><Label>CFOP forçado</Label><Input value={form.cfop_forcado || ""} onChange={e => setForm({ ...form, cfop_forcado: e.target.value })} /></div>
              <div><Label>CST ICMS</Label><Input value={form.cst_icms || ""} onChange={e => setForm({ ...form, cst_icms: e.target.value })} /></div>
              <div><Label>Alíquota ICMS %</Label><Input type="number" step="0.01" value={form.aliquota_icms ?? ""} onChange={e => setForm({ ...form, aliquota_icms: e.target.value ? parseFloat(e.target.value) : null })} /></div>
              <div><Label>Redução Base %</Label><Input type="number" step="0.01" value={form.reducao_base ?? ""} onChange={e => setForm({ ...form, reducao_base: e.target.value ? parseFloat(e.target.value) : null })} /></div>
              <div className="col-span-2"><Label>Texto infAdFisco (fiscal)</Label><Textarea rows={2} value={form.texto_infadfisco || ""} onChange={e => setForm({ ...form, texto_infadfisco: e.target.value })} /></div>
              <div className="col-span-2"><Label>Texto infCpl (complemento)</Label><Textarea rows={2} value={form.texto_infcpl || ""} onChange={e => setForm({ ...form, texto_infcpl: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div>
            </div>
            <DialogFooter><Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Convênios ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="animate-spin" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Rota</TableHead><TableHead>CFOP/CST</TableHead><TableHead>Alíq.</TableHead><TableHead>Base Legal</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell>{r.uf_origem}→{r.uf_destino}</TableCell>
                    <TableCell>{r.cfop_forcado}/{r.cst_icms}</TableCell>
                    <TableCell>{r.aliquota_icms ?? "-"}%</TableCell>
                    <TableCell className="text-xs">{r.base_legal}</TableCell>
                    <TableCell>{r.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setForm(r); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(r.id!)}><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
