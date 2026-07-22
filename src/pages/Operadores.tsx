import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Shield, Users, UserCheck, UserX, Clock, ShieldPlus } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function Operadores() {
  const { isAdmin, profile, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [promoverAlvo, setPromoverAlvo] = useState<{ id: string; nome: string } | null>(null);
  const [diasPromocao, setDiasPromocao] = useState(4);

  const { data: operators = [], isLoading } = useQuery({
    queryKey: ["operators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, ativo, created_at, role_anterior, role_expira_em")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { ativo }) => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast.success(ativo ? "Operador ativado" : "Operador desativado");
    },
    onError: () => toast.error("Erro ao atualizar operador"),
  });
  const promoverMutation = useMutation({
    mutationFn: async ({ id, dias }: { id: string; dias: number }) => {
      const { error } = await supabase.rpc("promover_admin_temporario", {
        _user_id: id,
        _dias: dias,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast.success("Operador promovido a Administrador temporário");
      setPromoverAlvo(null);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao promover"),
  });

  const revogarMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("revogar_admin_temporario", { _user_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operators"] });
      toast.success("Permissão temporária revogada");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao revogar"),
  });

  
  if (authLoading || !profile) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const activeCount = operators.filter((o) => o.ativo).length;
  const pendingCount = operators.filter((o) => !o.ativo).length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Operadores</h1>
          <p className="text-muted-foreground">Ative ou desative o acesso dos operadores ao sistema.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{operators.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ativos</CardTitle>
              <UserCheck className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
              <UserX className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : operators.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhum operador encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  operators.map((op: any) => {
                    const isTempAdmin = !!op.role_expira_em && !!op.role_anterior;
                    const expiraEm = op.role_expira_em ? new Date(op.role_expira_em) : null;
                    return (
                    <TableRow key={op.id}>
                      <TableCell className="font-medium">{op.full_name || "—"}</TableCell>
                      <TableCell>{op.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={op.role === "admin" ? "default" : "secondary"} className="gap-1 w-fit">
                            {op.role === "admin" && <Shield className="w-3 h-3" />}
                            {op.role === "admin" ? "Admin" : "Operador"}
                            {isTempAdmin && " (temp)"}
                          </Badge>
                          {isTempAdmin && expiraEm && (
                            <span className="text-xs text-amber-600 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              até {expiraEm.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={op.ativo ? "default" : "outline"} className={op.ativo ? "bg-emerald-600" : "text-amber-600 border-amber-400"}>
                          {op.ativo ? "Ativo" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {op.role !== "admin" && (
                            <>
                              <Switch
                                checked={op.ativo}
                                onCheckedChange={(checked) =>
                                  toggleMutation.mutate({ id: op.id, ativo: checked })
                                }
                              />
                              {op.ativo && op.id !== profile.id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() => {
                                    setDiasPromocao(4);
                                    setPromoverAlvo({ id: op.id, nome: op.full_name || op.email });
                                  }}
                                >
                                  <ShieldPlus className="w-3.5 h-3.5" />
                                  Promover
                                </Button>
                              )}
                            </>
                          )}
                          {isTempAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => revogarMutation.mutate(op.id)}
                            >
                              Revogar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!promoverAlvo} onOpenChange={(o) => !o && setPromoverAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promover a Administrador temporário</DialogTitle>
            <DialogDescription>
              <strong>{promoverAlvo?.nome}</strong> receberá acesso de administrador pelo prazo escolhido.
              Ao expirar, o sistema volta automaticamente ao cargo de Operador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dias">Dias de acesso (1 a 30)</Label>
            <Input
              id="dias"
              type="number"
              min={1}
              max={30}
              value={diasPromocao}
              onChange={(e) => setDiasPromocao(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            />
            <p className="text-xs text-muted-foreground">
              Expira em:{" "}
              <strong>
                {new Date(Date.now() + diasPromocao * 86400000).toLocaleString("pt-BR", {
                  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </strong>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoverAlvo(null)}>Cancelar</Button>
            <Button
              onClick={() => promoverAlvo && promoverMutation.mutate({ id: promoverAlvo.id, dias: diasPromocao })}
              disabled={promoverMutation.isPending}
            >
              Confirmar promoção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
