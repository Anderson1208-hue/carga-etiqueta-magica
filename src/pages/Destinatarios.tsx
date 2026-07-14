import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Plus, Pencil, Search, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BackfillPlacesDialog } from "@/components/destinatarios/BackfillPlacesDialog";

type Destinatario = {
  id: string;
  cnpj_cpf: string;
  razao_social: string;
  nome_fantasia: string | null;
  observacao: string | null;
  ativo: boolean;
  rascunho: boolean;
  raio_geofence_metros: number | null;
};

type Endereco = {
  id?: string;
  destinatario_id?: string;
  apelido: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  principal: boolean;
};

type Restricao = {
  destinatario_id?: string;
  dias_semana: number[];
  hora_inicio: string | null;
  hora_fim: string | null;
  altura_max_veiculo_m: number | null;
  agendamento_obrigatorio: boolean;
  exige_escolta: boolean;
  documentos_canhoto: string[];
  observacao: string | null;
};

const DIAS = [
  { v: 0, l: "Dom" }, { v: 1, l: "Seg" }, { v: 2, l: "Ter" },
  { v: 3, l: "Qua" }, { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" },
];

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export default function Destinatarios() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const { data: destinatarios = [], isLoading } = useQuery({
    queryKey: ["destinatarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("destinatarios")
        .select("*")
        .order("razao_social");
      if (error) throw error;
      return data as Destinatario[];
    },
  });

  const filtered = destinatarios.filter((d) => {
    if (!showInactive && !d.ativo) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.razao_social?.toLowerCase().includes(q) ||
      d.cnpj_cpf?.includes(q.replace(/\D/g, "")) ||
      d.nome_fantasia?.toLowerCase().includes(q)
    );
  });

  const rascunhos = destinatarios.filter((d) => d.rascunho && d.ativo).length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-7 h-7" /> Destinatários
            </h1>
            <p className="text-sm text-muted-foreground">
              Clientes que recebem entrega (endereços, janela e restrições).
              {rascunhos > 0 && (
                <span className="ml-2 text-amber-600">
                  {rascunhos} rascunho(s) aguardando revisão
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <BackfillPlacesDialog />
            <Button onClick={() => setEditingId("new")}>
              <Plus className="w-4 h-4 mr-2" /> Novo Destinatário
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por razão social, CNPJ/CPF ou fantasia..."
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
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Razão Social</TableHead>
                <TableHead>Fantasia</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum destinatário encontrado</TableCell></TableRow>
              ) : filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{formatCnpj(d.cnpj_cpf)}</TableCell>
                  <TableCell className="font-medium">{d.razao_social}</TableCell>
                  <TableCell className="text-muted-foreground">{d.nome_fantasia || "—"}</TableCell>
                  <TableCell>
                    {d.rascunho ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-600">Rascunho</Badge>
                    ) : d.ativo ? (
                      <Badge variant="default">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(d.id)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {editingId && (
          <DestinatarioDialog
            destinatarioId={editingId === "new" ? null : editingId}
            onClose={() => {
              setEditingId(null);
              qc.invalidateQueries({ queryKey: ["destinatarios"] });
            }}
          />
        )}
      </div>
    </MainLayout>
  );
}

function DestinatarioDialog({
  destinatarioId,
  onClose,
}: {
  destinatarioId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isNew = !destinatarioId;

  const { data: destinatario } = useQuery({
    queryKey: ["destinatario", destinatarioId],
    queryFn: async () => {
      if (!destinatarioId) return null;
      const { data, error } = await supabase
        .from("destinatarios")
        .select("*")
        .eq("id", destinatarioId)
        .single();
      if (error) throw error;
      return data as Destinatario;
    },
    enabled: !!destinatarioId,
  });

  const { data: enderecos = [] } = useQuery({
    queryKey: ["destinatario-enderecos", destinatarioId],
    queryFn: async () => {
      if (!destinatarioId) return [];
      const { data, error } = await supabase
        .from("destinatario_enderecos")
        .select("*")
        .eq("destinatario_id", destinatarioId)
        .order("principal", { ascending: false });
      if (error) throw error;
      return data as Endereco[];
    },
    enabled: !!destinatarioId,
  });

  const { data: restricao } = useQuery({
    queryKey: ["destinatario-restricao", destinatarioId],
    queryFn: async () => {
      if (!destinatarioId) return null;
      const { data } = await supabase
        .from("destinatario_restricoes")
        .select("*")
        .eq("destinatario_id", destinatarioId)
        .maybeSingle();
      return data as Restricao | null;
    },
    enabled: !!destinatarioId,
  });

  const [form, setForm] = useState<Partial<Destinatario>>({
    cnpj_cpf: "", razao_social: "", nome_fantasia: "", observacao: "", ativo: true, raio_geofence_metros: null,
  });
  const [endForm, setEndForm] = useState<Endereco | null>(null);
  const [restrForm, setRestrForm] = useState<Restricao>({
    dias_semana: [1, 2, 3, 4, 5],
    hora_inicio: null, hora_fim: null,
    altura_max_veiculo_m: null,
    agendamento_obrigatorio: false, exige_escolta: false,
    documentos_canhoto: [], observacao: null,
  });

  useEffect(() => {
    if (destinatario) setForm(destinatario);
  }, [destinatario]);
  useEffect(() => {
    if (restricao) setRestrForm(restricao);
  }, [restricao]);

  const saveBasic = useMutation({
    mutationFn: async () => {
      const cnpj = (form.cnpj_cpf || "").replace(/\D/g, "");
      if (cnpj.length < 11) throw new Error("CNPJ/CPF inválido");
      if (!form.razao_social) throw new Error("Razão social obrigatória");
      const payload = {
        cnpj_cpf: cnpj,
        razao_social: form.razao_social,
        nome_fantasia: form.nome_fantasia || null,
        observacao: form.observacao || null,
        ativo: form.ativo ?? true,
        rascunho: false,
        raio_geofence_metros: form.raio_geofence_metros ?? null,
      };
      if (destinatarioId) {
        const { error } = await supabase.from("destinatarios").update(payload).eq("id", destinatarioId);
        if (error) throw error;
        return destinatarioId;
      } else {
        const { data, error } = await supabase.from("destinatarios").insert(payload).select("id").single();
        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: () => {
      toast.success("Destinatário salvo");
      qc.invalidateQueries({ queryKey: ["destinatarios"] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveEndereco = useMutation({
    mutationFn: async (e: Endereco) => {
      if (!destinatarioId) throw new Error("Salve o destinatário primeiro");
      const payload = {
        destinatario_id: destinatarioId,
        apelido: e.apelido || null,
        logradouro: e.logradouro || null,
        numero: e.numero || null,
        complemento: e.complemento || null,
        bairro: e.bairro || null,
        cidade: e.cidade || null,
        uf: e.uf || null,
        cep: (e.cep || "").replace(/\D/g, "") || null,
        principal: e.principal,
      };
      let enderecoId = e.id;
      if (e.id) {
        const { error } = await supabase.from("destinatario_enderecos").update(payload).eq("id", e.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("destinatario_enderecos")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        enderecoId = data.id;
      }
      // se marcou como principal, desmarca os outros
      if (e.principal) {
        await supabase.from("destinatario_enderecos")
          .update({ principal: false })
          .eq("destinatario_id", destinatarioId)
          .neq("id", enderecoId || "00000000-0000-0000-0000-000000000000");
      }

      // geocodifica via Google (não bloqueia se falhar)
      try {
        const { data: geo, error: geoErr } = await supabase.functions.invoke("geocodificar-endereco", {
          body: {
            logradouro: payload.logradouro,
            numero: payload.numero,
            bairro: payload.bairro,
            cidade: payload.cidade,
            uf: payload.uf,
            cep: payload.cep,
            endereco_id: enderecoId,
          },
        });
        if (geoErr) {
          console.warn("Geocoding falhou:", geoErr);
          return { geoStatus: "fail" as const };
        }
        return { geoStatus: "ok" as const, geo };
      } catch (err) {
        console.warn("Geocoding erro:", err);
        return { geoStatus: "fail" as const };
      }
    },
    onSuccess: (res) => {
      if (res?.geoStatus === "ok") {
        const lt = (res.geo as { location_type?: string } | undefined)?.location_type;
        toast.success(`Endereço salvo${lt ? ` · GPS ${lt}` : ""}`);
      } else {
        toast.success("Endereço salvo");
        if (res?.geoStatus === "fail") {
          toast.warning("Não foi possível geocodificar automaticamente");
        }
      }
      qc.invalidateQueries({ queryKey: ["destinatario-enderecos", destinatarioId] });
      setEndForm(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });


  const delEndereco = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("destinatario_enderecos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["destinatario-enderecos", destinatarioId] }),
  });

  const saveRestricao = useMutation({
    mutationFn: async () => {
      if (!destinatarioId) throw new Error("Salve o destinatário primeiro");
      const payload = {
        destinatario_id: destinatarioId,
        dias_semana: restrForm.dias_semana,
        hora_inicio: restrForm.hora_inicio || null,
        hora_fim: restrForm.hora_fim || null,
        altura_max_veiculo_m: restrForm.altura_max_veiculo_m || null,
        agendamento_obrigatorio: restrForm.agendamento_obrigatorio,
        exige_escolta: restrForm.exige_escolta,
        documentos_canhoto: restrForm.documentos_canhoto,
        observacao: restrForm.observacao || null,
      };
      if (restricao) {
        const { error } = await supabase.from("destinatario_restricoes").update(payload).eq("destinatario_id", destinatarioId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("destinatario_restricoes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Restrições salvas");
      qc.invalidateQueries({ queryKey: ["destinatario-restricao", destinatarioId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleDia = (v: number) => {
    setRestrForm({
      ...restrForm,
      dias_semana: restrForm.dias_semana.includes(v)
        ? restrForm.dias_semana.filter((d) => d !== v)
        : [...restrForm.dias_semana, v].sort(),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Novo Destinatário" : form.razao_social || "Destinatário"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="dados">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="enderecos" disabled={isNew}>Endereços</TabsTrigger>
            <TabsTrigger value="restricoes" disabled={isNew}>Janela & Restrições</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CNPJ/CPF *</Label>
                <Input value={formatCnpj(form.cnpj_cpf || "")} onChange={(e) => setForm({ ...form, cnpj_cpf: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Nome Fantasia</Label>
                <Input value={form.nome_fantasia || ""} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Razão Social *</Label>
                <Input value={form.razao_social || ""} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Observação</Label>
                <Textarea rows={3} value={form.observacao || ""} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Raio de geofence customizado (metros)</Label>
                <Input
                  type="number"
                  min={30}
                  max={2000}
                  step={10}
                  placeholder="Vazio = usa raio padrão global da Torre"
                  value={form.raio_geofence_metros ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setForm({ ...form, raio_geofence_metros: v === "" ? null : parseInt(v, 10) });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Sobrescreve o raio padrão apenas para este cliente. Útil para grandes centros de distribuição (atacadistas) onde o motorista descarrega em docas distantes do ponto de referência. Aplica-se apenas a rotas criadas depois da edição.
                </p>
              </div>
              <label className="flex items-center gap-2 col-span-2 text-sm">
                <Switch checked={form.ativo ?? true} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
                Ativo
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => saveBasic.mutate()} disabled={saveBasic.isPending}>
                {saveBasic.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="enderecos" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{enderecos.length} endereço(s) cadastrado(s)</p>
              <Button size="sm" onClick={() => setEndForm({
                apelido: "", logradouro: "", numero: "", complemento: "",
                bairro: "", cidade: "", uf: "", cep: "", principal: enderecos.length === 0,
              })}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar
              </Button>
            </div>

            <div className="space-y-2">
              {enderecos.map((e) => (
                <div key={e.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{e.apelido || "Endereço"}</span>
                      {e.principal && <Badge variant="default" className="text-xs">Principal</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {[e.logradouro, e.numero, e.complemento, e.bairro].filter(Boolean).join(", ")}
                      {e.cidade && ` — ${e.cidade}/${e.uf}`}
                      {e.cep && ` • CEP ${e.cep}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEndForm(e)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => e.id && delEndereco.mutate(e.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {enderecos.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">Nenhum endereço cadastrado</p>
              )}
            </div>

            {endForm && (
              <Dialog open onOpenChange={(o) => !o && setEndForm(null)}>
                <DialogContent>
                  <DialogHeader><DialogTitle>{endForm.id ? "Editar Endereço" : "Novo Endereço"}</DialogTitle></DialogHeader>
                  <div className="grid grid-cols-2 gap-3 py-2">
                    <div className="col-span-2 space-y-2">
                      <Label>Apelido</Label>
                      <Input placeholder="Ex: Loja Centro, Matriz..." value={endForm.apelido || ""} onChange={(e) => setEndForm({ ...endForm, apelido: e.target.value })} />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Logradouro</Label>
                      <Input value={endForm.logradouro || ""} onChange={(e) => setEndForm({ ...endForm, logradouro: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Número</Label>
                      <Input value={endForm.numero || ""} onChange={(e) => setEndForm({ ...endForm, numero: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Complemento</Label>
                      <Input value={endForm.complemento || ""} onChange={(e) => setEndForm({ ...endForm, complemento: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Bairro</Label>
                      <Input value={endForm.bairro || ""} onChange={(e) => setEndForm({ ...endForm, bairro: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>CEP</Label>
                      <Input value={endForm.cep || ""} onChange={(e) => setEndForm({ ...endForm, cep: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Cidade</Label>
                      <Input value={endForm.cidade || ""} onChange={(e) => setEndForm({ ...endForm, cidade: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>UF</Label>
                      <Input maxLength={2} value={endForm.uf || ""} onChange={(e) => setEndForm({ ...endForm, uf: e.target.value.toUpperCase() })} />
                    </div>
                    <label className="flex items-center gap-2 col-span-2 text-sm">
                      <Switch checked={endForm.principal} onCheckedChange={(v) => setEndForm({ ...endForm, principal: v })} />
                      Endereço principal
                    </label>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEndForm(null)}>Cancelar</Button>
                    <Button onClick={() => saveEndereco.mutate(endForm)} disabled={saveEndereco.isPending}>Salvar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </TabsContent>

          <TabsContent value="restricoes" className="space-y-4 mt-4">
            <div>
              <Label className="text-sm mb-2 block">Dias da semana</Label>
              <div className="flex gap-2 flex-wrap">
                {DIAS.map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => toggleDia(d.v)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      restrForm.dias_semana.includes(d.v)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-accent"
                    }`}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hora início</Label>
                <Input type="time" value={restrForm.hora_inicio || ""} onChange={(e) => setRestrForm({ ...restrForm, hora_inicio: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Hora fim</Label>
                <Input type="time" value={restrForm.hora_fim || ""} onChange={(e) => setRestrForm({ ...restrForm, hora_fim: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Altura máx. veículo (m)</Label>
                <Input type="number" step="0.1" value={restrForm.altura_max_veiculo_m || ""} onChange={(e) => setRestrForm({ ...restrForm, altura_max_veiculo_m: parseFloat(e.target.value) || null })} />
              </div>
              <div className="space-y-2">
                <Label>Documentos exigidos no canhoto (separar por vírgula)</Label>
                <Input
                  value={restrForm.documentos_canhoto.join(", ")}
                  onChange={(e) => setRestrForm({ ...restrForm, documentos_canhoto: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="Carimbo, Assinatura, RG"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={restrForm.agendamento_obrigatorio} onCheckedChange={(v) => setRestrForm({ ...restrForm, agendamento_obrigatorio: v })} />
                Agendamento obrigatório
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={restrForm.exige_escolta} onCheckedChange={(v) => setRestrForm({ ...restrForm, exige_escolta: v })} />
                Exige escolta
              </label>
            </div>

            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea rows={3} value={restrForm.observacao || ""} onChange={(e) => setRestrForm({ ...restrForm, observacao: e.target.value })} />
            </div>

            <DialogFooter>
              <Button onClick={() => saveRestricao.mutate()} disabled={saveRestricao.isPending}>
                {saveRestricao.isPending ? "Salvando..." : "Salvar restrições"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
