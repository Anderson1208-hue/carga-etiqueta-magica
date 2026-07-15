import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Tag, Trash2, Plus, Info } from "lucide-react";

type Apelido = {
  id: string;
  cnpj_raiz: string;
  nome_busca: string;
  observacao: string | null;
};

export function ApelidosBuscaDialog() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Apelido[]>([]);
  const [loading, setLoading] = useState(false);
  const [cnpjRaiz, setCnpjRaiz] = useState("");
  const [nomeBusca, setNomeBusca] = useState("");
  const [observacao, setObservacao] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("destinatario_apelidos_busca")
      .select("id, cnpj_raiz, nome_busca, observacao")
      .order("nome_busca");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Apelido[]);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const add = async () => {
    const raiz = cnpjRaiz.replace(/\D/g, "").slice(0, 8);
    if (raiz.length !== 8) { toast.error("CNPJ raiz deve ter 8 dígitos"); return; }
    if (!nomeBusca.trim()) { toast.error("Informe o nome de busca"); return; }
    const { error } = await supabase.from("destinatario_apelidos_busca").insert({
      cnpj_raiz: raiz,
      nome_busca: nomeBusca.trim(),
      observacao: observacao.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Apelido cadastrado");
    setCnpjRaiz(""); setNomeBusca(""); setObservacao("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("destinatario_apelidos_busca").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Apelido removido");
    load();
  };

  const fmtCnpj = (r: string) => `${r.slice(0, 2)}.${r.slice(2, 5)}.${r.slice(5, 8)}/****-**`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Tag className="w-4 h-4 mr-2" /> Apelidos de Busca
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apelidos de busca (Google Places)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Para que serve</AlertTitle>
            <AlertDescription className="text-xs space-y-1">
              <p>Quando a <b>razão social</b> não é o nome pelo qual o cliente é conhecido (ex.: <i>ASSB COMERCIO</i> = lojas <b>Cacau Show</b>), o Google Places não encontra o estabelecimento.</p>
              <p>Cadastre aqui o <b>CNPJ raiz</b> (primeiros 8 dígitos, comum a todas as filiais da rede) e o <b>nome fantasia</b> que o backfill deve usar na busca.</p>
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-3 space-y-1">
                <Label className="text-xs">CNPJ raiz (8 dígitos)</Label>
                <Input value={cnpjRaiz} maxLength={10}
                  placeholder="12345678"
                  onChange={(e) => setCnpjRaiz(e.target.value.replace(/\D/g, "").slice(0, 8))} />
              </div>
              <div className="col-span-4 space-y-1">
                <Label className="text-xs">Nome de busca</Label>
                <Input value={nomeBusca} placeholder="Cacau Show"
                  onChange={(e) => setNomeBusca(e.target.value)} />
              </div>
              <div className="col-span-4 space-y-1">
                <Label className="text-xs">Observação (opcional)</Label>
                <Input value={observacao} placeholder="ex.: rede de lojas próprias"
                  onChange={(e) => setObservacao(e.target.value)} />
              </div>
              <div className="col-span-1 flex items-end">
                <Button size="sm" onClick={add} className="w-full">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr className="text-left">
                  <th className="px-2 py-1 w-44">CNPJ raiz</th>
                  <th className="px-2 py-1">Nome de busca</th>
                  <th className="px-2 py-1">Observação</th>
                  <th className="px-2 py-1 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">Carregando…</td></tr>
                )}
                {!loading && items.length === 0 && (
                  <tr><td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">Nenhum apelido cadastrado.</td></tr>
                )}
                {items.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="px-2 py-1 font-mono">{fmtCnpj(it.cnpj_raiz)}</td>
                    <td className="px-2 py-1 font-medium">{it.nome_busca}</td>
                    <td className="px-2 py-1 text-muted-foreground">{it.observacao || "—"}</td>
                    <td className="px-2 py-1 text-right">
                      <Button size="icon" variant="ghost" onClick={() => remove(it.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
