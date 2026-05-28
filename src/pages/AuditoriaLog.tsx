import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, RotateCw, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AuditRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: any;
  metadata: any;
  created_at: string;
}

const PAGE_SIZE = 50;

const ENTITY_LABELS: Record<string, string> = {
  carga: "Carga",
  nf: "NF",
  agendamento: "Agendamento",
  etiqueta: "Etiqueta",
  baixa: "Baixa Entrega",
  profile: "Usuário",
  veiculo: "Veículo",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Criação",
  update: "Alteração",
  delete: "Exclusão",
  status_change: "Mudança Status",
  divergencia: "Divergência",
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-800 border-green-200",
  update: "bg-blue-100 text-blue-800 border-blue-200",
  delete: "bg-red-100 text-red-800 border-red-200",
  status_change: "bg-amber-100 text-amber-800 border-amber-200",
  divergencia: "bg-purple-100 text-purple-800 border-purple-200",
};

export default function AuditoriaLog() {
  const { isAdmin, profile, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [detailRow, setDetailRow] = useState<AuditRow | null>(null);

  // filtros
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterEmail, setFilterEmail] = useState<string>("");
  const [filterStart, setFilterStart] = useState<string>("");
  const [filterEnd, setFilterEnd] = useState<string>("");

  async function load(pageOverride?: number) {
    setLoading(true);
    try {
      const currentPage = pageOverride ?? page;

      // resolve user_id por email se preenchido
      let userId: string | null = null;
      if (filterEmail.trim()) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .ilike("email", `%${filterEmail.trim()}%`)
          .limit(1)
          .maybeSingle();
        userId = prof?.id ?? null;
        if (!userId) {
          setRows([]);
          setTotal(0);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await supabase.rpc("listar_audit_log", {
        p_limit: PAGE_SIZE,
        p_offset: currentPage * PAGE_SIZE,
        p_user_id: userId,
        p_entity_type: filterEntity === "all" ? null : filterEntity,
        p_entity_id: null,
        p_action: filterAction === "all" ? null : filterAction,
        p_data_inicio: filterStart ? `${filterStart}T00:00:00` : null,
        p_data_fim: filterEnd ? `${filterEnd}T23:59:59` : null,
      });

      if (error) throw error;
      const result = data as unknown as { total: number; rows: AuditRow[] };
      setRows(result.rows ?? []);
      setTotal(result.total ?? 0);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar logs",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  function handleSearch() {
    setPage(0);
    load(0);
  }

  function handleReset() {
    setFilterEntity("all");
    setFilterAction("all");
    setFilterEmail("");
    setFilterStart("");
    setFilterEnd("");
    setPage(0);
    setTimeout(() => load(0), 0);
  }

  function nextPage() {
    if ((page + 1) * PAGE_SIZE < total) {
      const np = page + 1;
      setPage(np);
      load(np);
    }
  }

  function prevPage() {
    if (page > 0) {
      const np = page - 1;
      setPage(np);
      load(np);
    }
  }

  if (authLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </MainLayout>
    );
  }

  if (authLoading || !profile) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </MainLayout>
    );
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Auditoria — Log de Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Rastreabilidade de ações críticas no sistema. Visível apenas para administradores.
          </p>
        </div>

        {/* Filtros */}
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Entidade</Label>
              <Select value={filterEntity} onValueChange={setFilterEntity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ação</Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">E-mail do usuário</Label>
              <Input
                placeholder="contém..."
                value={filterEmail}
                onChange={(e) => setFilterEmail(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Data início</Label>
              <Input
                type="date"
                value={filterStart}
                onChange={(e) => setFilterStart(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Data fim</Label>
              <Input
                type="date"
                value={filterEnd}
                onChange={(e) => setFilterEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSearch} disabled={loading} size="sm">
              <Search className="w-4 h-4 mr-2" />
              Buscar
            </Button>
            <Button onClick={handleReset} variant="outline" size="sm">
              <RotateCw className="w-4 h-4 mr-2" />
              Limpar
            </Button>
            <div className="ml-auto text-sm text-muted-foreground self-center">
              {total > 0
                ? `${page * PAGE_SIZE + 1}-${Math.min(
                    (page + 1) * PAGE_SIZE,
                    total
                  )} de ${total}`
                : loading
                ? "Carregando..."
                : "Nenhum registro"}
            </div>
          </div>
        </Card>

        {/* Tabela */}
        <Card className="p-4">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum registro de log encontrado.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Entidade</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead className="w-[80px]">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.user_email || (
                            <span className="text-muted-foreground italic">sistema</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={ACTION_COLORS[r.action] || ""}
                          >
                            {ACTION_LABELS[r.action] || r.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {ENTITY_LABELS[r.entity_type] || r.entity_type}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {r.entity_id ? r.entity_id.slice(0, 8) : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetailRow(r)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevPage}
                  disabled={page === 0 || loading}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page + 1} de {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextPage}
                  disabled={(page + 1) * PAGE_SIZE >= total || loading}
                >
                  Próxima
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* Dialog de detalhes */}
        <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Detalhes do registro</DialogTitle>
            </DialogHeader>
            {detailRow && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-muted-foreground">Data/Hora:</span>
                    <p className="font-mono text-xs">
                      {new Date(detailRow.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Usuário:</span>
                    <p>{detailRow.user_email || "sistema"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ação:</span>
                    <p>{ACTION_LABELS[detailRow.action] || detailRow.action}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Entidade:</span>
                    <p>{ENTITY_LABELS[detailRow.entity_type] || detailRow.entity_type}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">ID da entidade:</span>
                    <p className="font-mono text-xs break-all">
                      {detailRow.entity_id || "—"}
                    </p>
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground">Alterações:</span>
                  <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-auto max-h-96">
                    {JSON.stringify(detailRow.changes, null, 2)}
                  </pre>
                </div>

                {detailRow.metadata && (
                  <div>
                    <span className="text-muted-foreground">Metadados:</span>
                    <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-auto max-h-48">
                      {JSON.stringify(detailRow.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
