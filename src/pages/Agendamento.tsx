import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  CalendarIcon,
  Clock,
  RotateCcw,
  PackageX,
  CalendarCheck,
  Loader2,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TipoCargaBadge, chocolateRowClass } from "@/components/TipoCargaBadge";

type AgendamentoStatus = "AGENDAMENTO" | "AGUARDANDO AGENDA" | "REENTREGA" | "DEVOLUCAO";

interface NfResult {
  id: string;
  numero_nf: string;
  chave_acesso: string;
  dest_razao_social: string | null;
  dest_cidade: string | null;
  dest_uf: string | null;
  cnpj_destinatario: string | null;
  status_entrega: string;
  carga_id: string;
  tipo_carga: string;
}

interface AgendamentoRecord {
  id: string;
  nf_id: string;
  status: string;
  data_agendamento: string | null;
  observacao: string | null;
  created_at: string;
  numero_nf?: string;
  dest_razao_social?: string | null;
  dest_cidade?: string | null;
  tipo_carga?: string;
}

const STATUS_OPTIONS: { value: AgendamentoStatus; label: string; icon: React.ReactNode; color: string; requiresDate: boolean }[] = [
  { value: "AGENDAMENTO", label: "Agendamento", icon: <CalendarCheck className="w-4 h-4" />, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", requiresDate: true },
  { value: "AGUARDANDO AGENDA", label: "Aguardando Agenda", icon: <Clock className="w-4 h-4" />, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", requiresDate: false },
  { value: "REENTREGA", label: "Reentrega", icon: <RotateCcw className="w-4 h-4" />, color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", requiresDate: true },
  { value: "DEVOLUCAO", label: "Devolução", icon: <PackageX className="w-4 h-4" />, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", requiresDate: false },
];

function statusBadge(status: string) {
  const opt = STATUS_OPTIONS.find(s => s.value === status);
  if (!opt) return <Badge variant="secondary">{status}</Badge>;
  return (
    <Badge className={cn("gap-1", opt.color)}>
      {opt.icon}
      {opt.label}
    </Badge>
  );
}

function statusEntregaBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    "CARGA NO DEPOSITO": { label: "Carga no Depósito", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    "NF EM ROTA": { label: "NF em Rota", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    "ENTREGUE": { label: "Entregue", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    "RECUSADO": { label: "Recusado", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  };
  const s = map[status] || { label: status, color: "" };
  return <Badge className={s.color}>{s.label}</Badge>;
}

export default function Agendamento() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [nfResults, setNfResults] = useState<NfResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [agendamentos, setAgendamentos] = useState<AgendamentoRecord[]>([]);
  const [loadingAgendamentos, setLoadingAgendamentos] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("todos");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedNf, setSelectedNf] = useState<NfResult | null>(null);
  const [agStatus, setAgStatus] = useState<AgendamentoStatus>("AGUARDANDO AGENDA");
  const [agDate, setAgDate] = useState<Date | undefined>(undefined);
  const [agObs, setAgObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAgendamentos();
  }, []);

  async function loadAgendamentos() {
    setLoadingAgendamentos(true);
    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .select("id, nf_id, status, data_agendamento, observacao, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      if (data && data.length > 0) {
        const nfIds = data.map(a => a.nf_id);
        const { data: nfsData } = await supabase
          .from("notas_fiscais")
          .select("id, numero_nf, dest_razao_social, dest_cidade, carga_id")
          .in("id", nfIds);

        const cargaIds = [...new Set((nfsData || []).map(n => n.carga_id))];
        const { data: cargasData } = await supabase
          .from("cargas")
          .select("id, tipo_carga")
          .in("id", cargaIds);

        const cargaMap = new Map((cargasData || []).map(c => [c.id, c.tipo_carga]));
        const nfMap = new Map((nfsData || []).map(n => [n.id, n]));

        const enriched: AgendamentoRecord[] = data.map(a => {
          const nf = nfMap.get(a.nf_id);
          return {
            ...a,
            numero_nf: nf?.numero_nf,
            dest_razao_social: nf?.dest_razao_social,
            dest_cidade: nf?.dest_cidade,
            tipo_carga: nf ? cargaMap.get(nf.carga_id) || "SECA" : "SECA",
          };
        });

        setAgendamentos(enriched);
      } else {
        setAgendamentos([]);
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Erro ao carregar agendamentos", variant: "destructive" });
    } finally {
      setLoadingAgendamentos(false);
    }
  }

  async function handleSearch() {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const term = search.trim();
      let query = supabase
        .from("notas_fiscais")
        .select("id, numero_nf, chave_acesso, dest_razao_social, dest_cidade, dest_uf, cnpj_destinatario, status_entrega, carga_id")
        .limit(50);

      // Search by NF number, chave, destinatário or CNPJ
      query = query.or(`numero_nf.ilike.%${term}%,chave_acesso.ilike.%${term}%,dest_razao_social.ilike.%${term}%,cnpj_destinatario.ilike.%${term}%`);

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const cargaIds = [...new Set(data.map(n => n.carga_id))];
        const { data: cargasData } = await supabase
          .from("cargas")
          .select("id, tipo_carga")
          .in("id", cargaIds);

        const cargaMap = new Map((cargasData || []).map(c => [c.id, c.tipo_carga]));

        setNfResults(data.map(n => ({
          ...n,
          tipo_carga: cargaMap.get(n.carga_id) || "SECA",
        })));
      } else {
        setNfResults([]);
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Erro ao buscar NFs", variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  function openAgendamentoDialog(nf: NfResult) {
    setSelectedNf(nf);
    setAgStatus("AGUARDANDO AGENDA");
    setAgDate(undefined);
    setAgObs("");
    setDialogOpen(true);
  }

  async function saveAgendamento() {
    if (!selectedNf || !user) return;

    const needsDate = agStatus === "AGENDAMENTO" || agStatus === "REENTREGA";
    if (needsDate && !agDate) {
      toast({ title: "Atenção", description: "Selecione a data do agendamento", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("agendamentos").insert({
        nf_id: selectedNf.id,
        status: agStatus,
        data_agendamento: agDate ? format(agDate, "yyyy-MM-dd") : null,
        observacao: agObs || null,
        created_by: user.id,
      });

      if (error) throw error;

      toast({
        title: "Agendamento salvo!",
        description: `NF ${selectedNf.numero_nf} → ${STATUS_OPTIONS.find(s => s.value === agStatus)?.label}`,
      });

      setDialogOpen(false);
      loadAgendamentos();
    } catch (err) {
      console.error(err);
      toast({ title: "Erro", description: "Erro ao salvar agendamento", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const filteredAgendamentos = filterStatus === "todos"
    ? agendamentos
    : agendamentos.filter(a => a.status === filterStatus);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agendamento de Entregas</h1>
          <p className="text-muted-foreground">Gerencie agendamentos, reentregas e devoluções de NFs</p>
        </div>

        {/* Search NF */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="w-5 h-5" />
              Buscar Nota Fiscal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Número da NF, chave de acesso, destinatário ou CNPJ..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={searching}>
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Buscar
              </Button>
            </div>

            {nfResults.length > 0 && (
              <div className="mt-4 border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NF</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>Status Entrega</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="w-[120px]">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nfResults.map(nf => (
                      <TableRow key={nf.id} className={chocolateRowClass(nf.tipo_carga)}>
                        <TableCell className="font-mono font-medium">{nf.numero_nf}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{nf.dest_razao_social || "—"}</TableCell>
                        <TableCell>{nf.dest_cidade ? `${nf.dest_cidade}/${nf.dest_uf}` : "—"}</TableCell>
                        <TableCell>{statusEntregaBadge(nf.status_entrega)}</TableCell>
                        <TableCell><TipoCargaBadge tipoCarga={nf.tipo_carga} /></TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => openAgendamentoDialog(nf)}>
                            <CalendarIcon className="w-4 h-4 mr-1" />
                            Agendar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {nfResults.length === 0 && search && !searching && (
              <p className="mt-4 text-sm text-muted-foreground text-center py-4">
                Nenhuma nota fiscal encontrada para "{search}"
              </p>
            )}
          </CardContent>
        </Card>

        {/* Agendamentos List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Agendamentos Registrados
            </CardTitle>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loadingAgendamentos ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAgendamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum agendamento registrado</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NF</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data Agenda</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Criado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAgendamentos.map(ag => (
                      <TableRow key={ag.id} className={chocolateRowClass(ag.tipo_carga)}>
                        <TableCell className="font-mono font-medium">{ag.numero_nf || "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{ag.dest_razao_social || "—"}</TableCell>
                        <TableCell>{statusBadge(ag.status)}</TableCell>
                        <TableCell>
                          {ag.data_agendamento
                            ? format(new Date(ag.data_agendamento + "T12:00:00"), "dd/MM/yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{ag.observacao || "—"}</TableCell>
                        <TableCell><TipoCargaBadge tipoCarga={ag.tipo_carga} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(ag.created_at), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>

          {selectedNf && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium">NF: <span className="font-mono">{selectedNf.numero_nf}</span></p>
                <p className="text-sm text-muted-foreground">{selectedNf.dest_razao_social}</p>
                <p className="text-sm text-muted-foreground">{selectedNf.dest_cidade}/{selectedNf.dest_uf}</p>
                <div className="flex gap-2 mt-1">
                  {statusEntregaBadge(selectedNf.status_entrega)}
                  <TipoCargaBadge tipoCarga={selectedNf.tipo_carga} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status do Agendamento</Label>
                <Select value={agStatus} onValueChange={v => setAgStatus(v as AgendamentoStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          {s.icon}
                          {s.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(agStatus === "AGENDAMENTO" || agStatus === "REENTREGA") && (
                <div className="space-y-2">
                  <Label>Data do Agendamento *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !agDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {agDate ? format(agDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={agDate}
                        onSelect={setAgDate}
                        disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea
                  placeholder="Motivo, detalhes adicionais..."
                  value={agObs}
                  onChange={e => setAgObs(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveAgendamento} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
