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
import { Shield, Users, UserCheck, UserX } from "lucide-react";
import { Navigate } from "react-router-dom";

export default function Operadores() {
  const { isAdmin, profile, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const { data: operators = [], isLoading } = useQuery({
    queryKey: ["operators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, ativo, created_at")
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
                  operators.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell className="font-medium">{op.full_name || "—"}</TableCell>
                      <TableCell>{op.email}</TableCell>
                      <TableCell>
                        <Badge variant={op.role === "admin" ? "default" : "secondary"} className="gap-1">
                          {op.role === "admin" && <Shield className="w-3 h-3" />}
                          {op.role === "admin" ? "Admin" : "Operador"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={op.ativo ? "default" : "outline"} className={op.ativo ? "bg-emerald-600" : "text-amber-600 border-amber-400"}>
                          {op.ativo ? "Ativo" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {op.role !== "admin" && (
                          <Switch
                            checked={op.ativo}
                            onCheckedChange={(checked) =>
                              toggleMutation.mutate({ id: op.id, ativo: checked })
                            }
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
