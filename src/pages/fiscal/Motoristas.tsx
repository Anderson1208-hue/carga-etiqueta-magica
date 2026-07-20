import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

type Motorista = {
  id?: string;
  nome: string;
  cpf: string;
  cnh_numero?: string | null;
  cnh_categoria?: string | null;
  cnh_validade?: string | null;
  telefone?: string | null;
  email?: string | null;
  eh_tac: boolean;
  rntrc?: string | null;
  pix_chave?: string | null;
  pix_tipo?: string | null;
  ativo: boolean;
};

const empty: Motorista = { nome: "", cpf: "", eh_tac: false, ativo: true };

export default function MotoristasFiscal() {
  const [rows, setRows] = useState<Motorista[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Motorista>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("motoristas").select("*").order("nome");
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setRows((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.nome || !form.cpf) { toast({ title: "Nome e CPF obrigatórios", variant: "destructive" }); return; }
    setSaving(true);
    const payload = { ...form, cpf: form.cpf.replace(/\D/g, "") };
    const q = form.id
      ? supabase.from("motoristas").update(payload).eq("id", form.id)
      : supabase.from("motoristas").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Motorista salvo" });
    setOpen(false); setForm(empty); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir motorista?")) return;
    const { error } = await supabase.from("motoristas").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Excluído" }); load(); }
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Motoristas (Fiscal)</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm(empty)}><Plus className="w-4 h-4 mr-2" />Novo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{form.id ? "Editar" : "Novo"} Motorista</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
              <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={form.telefone || ""} onChange={e => setForm({ ...form, telefone: e.target.value })} /></div>
              <div><Label>CNH Nº</Label><Input value={form.cnh_numero || ""} onChange={e => setForm({ ...form, cnh_numero: e.target.value })} /></div>
              <div><Label>CNH Categoria</Label>
                <Select value={form.cnh_categoria || ""} onValueChange={v => setForm({ ...form, cnh_categoria: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{["A","B","C","D","E","AB","AC","AD","AE"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Validade CNH</Label><Input type="date" value={form.cnh_validade || ""} onChange={e => setForm({ ...form, cnh_validade: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>RNTRC (se TAC)</Label><Input value={form.rntrc || ""} onChange={e => setForm({ ...form, rntrc: e.target.value })} /></div>
              <div><Label>Chave PIX</Label><Input value={form.pix_chave || ""} onChange={e => setForm({ ...form, pix_chave: e.target.value })} /></div>
              <div><Label>Tipo PIX</Label>
                <Select value={form.pix_tipo || ""} onValueChange={v => setForm({ ...form, pix_tipo: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{["cpf","email","telefone","aleatoria"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2"><Switch checked={form.eh_tac} onCheckedChange={v => setForm({ ...form, eh_tac: v })} /><Label>TAC (autônomo, exige CIOT)</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div>
            </div>
            <DialogFooter><Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Cadastrados ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="animate-spin" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CPF</TableHead><TableHead>CNH</TableHead><TableHead>TAC</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.nome}</TableCell>
                    <TableCell>{r.cpf}</TableCell>
                    <TableCell>{r.cnh_numero} {r.cnh_categoria && `(${r.cnh_categoria})`}</TableCell>
                    <TableCell>{r.eh_tac ? <Badge>TAC</Badge> : <Badge variant="secondary">CLT</Badge>}</TableCell>
                    <TableCell>{r.ativo ? <Badge>Ativo</Badge> : <Badge variant="destructive">Inativo</Badge>}</TableCell>
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
