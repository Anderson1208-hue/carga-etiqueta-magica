import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarDays, Plus, Trash2, Search, Info } from "lucide-react";
import { toast } from "sonner";

type Agenda = {
  id: string;
  cnpj: string;
  emitente: string | null;
  embarcador_id: string | null;
  status: string;
  created_at: string;
};

type Embarcador = {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
};

const STATUS_OPCOES = [
  { value: "AGENDAMENTO", label: "Agendado (Agendamento)" },
  { value: "AGUARDANDO AGENDA", label: "Aguardando Agenda" },
  { value: "AGUARDANDO REAGENDA", label: "Aguardando Reagenda" },
];

function formatCnpj(v: string) {
  const d = (v || "").replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export default function CadastroAgendas() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [embarcadorId, setEmbarcadorId] = useState<string>("");
  const [cnpj, setCnpj] = useState("");
  const [status, setStatus] = useState("AGUARDANDO AGENDA");

  const { data: embarcadores = [] } = useQuery({
    queryKey: ["embarcadores-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("embarcadores")
        .select("id, cnpj, razao_social, nome_fantasia")
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return data as Embarcador[];
    },
  });

  const { data: agendas = [], isLoading } = useQuery({
    queryKey: ["cnpj-agenda-automatica"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cnpj_agenda_automatica")
        .select("id, cnpj, emitente, embarcador_id, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Agenda[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const digits = cnpj.replace(/\D/g, "");
      if (digits.length !== 14) throw new Error("Informe o CNPJ do destinatário com 14 dígitos");
      if (!embarcadorId) throw new Error("Escolha o embarcador");
      const emb = embarcadores.find((e) => e.id === embarcadorId);
      const { error } = await supabase.from("cnpj_agenda_automatica").insert({
        cnpj: digits,
        embarcador_id: embarcadorId,
        emitente: emb?.razao_social ?? null,
        status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agenda automática cadastrada");
      setCnpj("");
      qc.invalidateQueries({ queryKey: ["cnpj-agenda-automatica"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cnpj_agenda_automatica").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cadastro removido");
      qc.invalidateQueries({ queryKey: ["cnpj-agenda-automatica"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nomeEmbarcador = (a: Agenda) => {
    const emb = embarcadores.find((e) => e.id === a.embarcador_id);
    return emb?.nome_fantasia || emb?.razao_social || a.emitente || "Todos os embarcadores";
  };

  const filtradas = agendas.filter((a) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      a.cnpj.includes(q.replace(/\D/g, "")) ||
      nomeEmbarcador(a).toLowerCase().includes(q) ||
      (a.emitente || "").toLowerCase().includes(q)
    );
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Cadastro de Agendas</h1>
            <p className="text-sm text-muted-foreground">
              CNPJs que já entram no sistema com status de agendamento definido.
            </p>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Como funciona</AlertTitle>
          <AlertDescription className="text-xs">
            Ao importar uma carga, toda nota do CNPJ cadastrado (para o embarcador escolhido)
            recebe automaticamente o status selecionado. Para "Agendado", a data inicial é o dia
            da entrada da nota e pode ser ajustada na tela de Agendamento.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo cadastro</CardTitle>
            <CardDescription>Embarcador, CNPJ do destinatário e status.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4 items-end">
              <div className="space-y-2">
                <Label>Embarcador</Label>
                <Select value={embarcadorId} onValueChange={setEmbarcadorId}>
                  <SelectTrigger><SelectValue placeholder="Escolha o embarcador" /></SelectTrigger>
                  <SelectContent>
                    {embarcadores.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome_fantasia || e.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>CNPJ do destinatário</Label>
                <Input
                  value={formatCnpj(cnpj)}
                  placeholder="00.000.000/0000-00"
                  onChange={(e) => setCnpj(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Status do agendamento</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPCOES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                <Plus className="w-4 h-4 mr-2" />
                {salvar.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Buscar por CNPJ ou embarcador..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CNPJ destinatário</TableHead>
                <TableHead>Embarcador</TableHead>
                <TableHead>Status aplicado</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtradas.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum CNPJ cadastrado</TableCell></TableRow>
              ) : filtradas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{formatCnpj(a.cnpj)}</TableCell>
                  <TableCell>{nomeEmbarcador(a)}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === "AGENDAMENTO" ? "default" : "outline"}>
                      {STATUS_OPCOES.find((s) => s.value === a.status)?.label || a.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => remover.mutate(a.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
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
