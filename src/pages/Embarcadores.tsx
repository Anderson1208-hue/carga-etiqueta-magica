import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type Embarcador = {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  contato_nome: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  sla_padrao_horas: number | null;
  centro_custo: string | null;
  observacao_operacional: string | null;
  ativo: boolean;
  rascunho: boolean;
};

const empty: Partial<Embarcador> = {
  cnpj: "",
  razao_social: "",
  nome_fantasia: "",
  contato_nome: "",
  contato_email: "",
  contato_telefone: "",
  sla_padrao_horas: 48,
  centro_custo: "",
  observacao_operacional: "",
  ativo: true,
  rascunho: false,
};

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export default function Embarcadores() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Partial<Embarcador> | null>(null);

  const { data: embarcadores = [], isLoading } = useQuery({
    queryKey: ["embarcadores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("embarcadores")
        .select("*")
        .order("razao_social");
      if (error) throw error;
      return data as Embarcador[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (e: Partial<Embarcador>) => {
      const payload = {
        cnpj: (e.cnpj || "").replace(/\D/g, ""),
        razao_social: e.razao_social,
        nome_fantasia: e.nome_fantasia || null,
        contato_nome: e.contato_nome || null,
        contato_email: e.contato_email || null,
        contato_telefone: e.contato_telefone || null,
        sla_padrao_horas: e.sla_padrao_horas ?? 48,
        centro_custo: e.centro_custo || null,
        observacao_operacional: e.observacao_operacional || null,
        ativo: e.ativo ?? true,
        rascunho: false,
      };
      if (!payload.cnpj || payload.cnpj.length < 11) throw new Error("CNPJ inválido");
      if (!payload.razao_social) throw new Error("Razão social obrigatória");

      if (e.id) {
        const { error } = await supabase
          .from("embarcadores")
          .update(payload)
          .eq("id", e.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("embarcadores").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Embarcador salvo");
      qc.invalidateQueries({ queryKey: ["embarcadores"] });
      setEditing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = embarcadores.filter((e) => {
    if (!showInactive && !e.ativo) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.razao_social?.toLowerCase().includes(q) ||
      e.cnpj?.includes(q.replace(/\D/g, "")) ||
      e.nome_fantasia?.toLowerCase().includes(q)
    );
  });

  const rascunhos = embarcadores.filter((e) => e.rascunho && e.ativo).length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-7 h-7" /> Embarcadores
            </h1>
            <p className="text-sm text-muted-foreground">
              Clientes que enviam carga (origem das NFs).
              {rascunhos > 0 && (
                <span className="ml-2 text-amber-600">
                  {rascunhos} rascunho(s) aguardando revisão
                </span>
              )}
            </p>
          </div>
          <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(empty)}>
                <Plus className="w-4 h-4 mr-2" /> Novo Embarcador
              </Button>
            </DialogTrigger>
            <EmbarcadorDialog
              editing={editing}
              setEditing={setEditing}
              onSave={(e) => saveMutation.mutate(e)}
              saving={saveMutation.isPending}
            />
          </Dialog>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por razão social, CNPJ ou fantasia..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Mostrar inativos
          </label>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CNPJ</TableHead>
                <TableHead>Razão Social</TableHead>
                <TableHead>Fantasia</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead className="text-center">SLA (h)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum embarcador encontrado</TableCell></TableRow>
              ) : filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{formatCnpj(e.cnpj)}</TableCell>
                  <TableCell className="font-medium">{e.razao_social}</TableCell>
                  <TableCell className="text-muted-foreground">{e.nome_fantasia || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.contato_nome || e.contato_email || "—"}
                  </TableCell>
                  <TableCell className="text-center">{e.sla_padrao_horas || "—"}</TableCell>
                  <TableCell>
                    {e.rascunho ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-600">Rascunho</Badge>
                    ) : e.ativo ? (
                      <Badge variant="default">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(e)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </MainLayout>
  );
}

function EmbarcadorDialog({
  editing, setEditing, onSave, saving,
}: {
  editing: Partial<Embarcador> | null;
  setEditing: (e: Partial<Embarcador> | null) => void;
  onSave: (e: Partial<Embarcador>) => void;
  saving: boolean;
}) {
  if (!editing) return null;
  const update = (patch: Partial<Embarcador>) => setEditing({ ...editing, ...patch });
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing.id ? "Editar Embarcador" : "Novo Embarcador"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4 py-2">
        <div className="space-y-2">
          <Label>CNPJ *</Label>
          <Input value={formatCnpj(editing.cnpj || "")} onChange={(e) => update({ cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
        </div>
        <div className="space-y-2">
          <Label>Centro de Custo</Label>
          <Input value={editing.centro_custo || ""} onChange={(e) => update({ centro_custo: e.target.value })} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Razão Social *</Label>
          <Input value={editing.razao_social || ""} onChange={(e) => update({ razao_social: e.target.value })} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Nome Fantasia</Label>
          <Input value={editing.nome_fantasia || ""} onChange={(e) => update({ nome_fantasia: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Contato (nome)</Label>
          <Input value={editing.contato_nome || ""} onChange={(e) => update({ contato_nome: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>SLA padrão (horas)</Label>
          <Input type="number" value={editing.sla_padrao_horas ?? ""} onChange={(e) => update({ sla_padrao_horas: parseInt(e.target.value) || 0 })} />
        </div>
        <div className="space-y-2">
          <Label>E-mail</Label>
          <Input type="email" value={editing.contato_email || ""} onChange={(e) => update({ contato_email: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Telefone</Label>
          <Input value={editing.contato_telefone || ""} onChange={(e) => update({ contato_telefone: e.target.value })} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Observação operacional</Label>
          <Textarea rows={3} value={editing.observacao_operacional || ""} onChange={(e) => update({ observacao_operacional: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 col-span-2 text-sm">
          <Switch checked={editing.ativo ?? true} onCheckedChange={(v) => update({ ativo: v })} />
          Ativo
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
        <Button onClick={() => onSave(editing)} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
