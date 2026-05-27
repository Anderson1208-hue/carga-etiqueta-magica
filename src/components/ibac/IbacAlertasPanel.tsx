import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Bell, Save } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

interface Config {
  id: boolean;
  limite_pendentes: number;
  limite_erros_15min: number;
  cooldown_minutos: number;
  ativo: boolean;
}

interface Alerta {
  id: string;
  tipo: string;
  mensagem: string;
  valor_atual: number | null;
  limite: number | null;
  lido: boolean;
  created_at: string;
}

export function IbacAlertasPanel() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: config } = useQuery({
    queryKey: ["ibac-config-alertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ibac_config_alertas")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data as Config | null;
    },
  });

  const { data: alertas = [] } = useQuery({
    queryKey: ["ibac-alertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ibac_alertas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Alerta[];
    },
    refetchInterval: 30_000,
  });

  const [form, setForm] = useState<Config | null>(null);
  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase
        .from("ibac_config_alertas")
        .update({
          limite_pendentes: form.limite_pendentes,
          limite_erros_15min: form.limite_erros_15min,
          cooldown_minutos: form.cooldown_minutos,
          ativo: form.ativo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["ibac-config-alertas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const marcarLido = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ibac_alertas")
        .update({ lido: true, lido_por: user?.id, lido_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ibac-alertas"] }),
  });

  const naoLidos = alertas.filter((a) => !a.lido);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" /> Limites de alerta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {form && (
            <>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm({ ...form, ativo: v })}
                />
                <Label>Alertas ativos</Label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Limite de pendentes na fila</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.limite_pendentes}
                    onChange={(e) =>
                      setForm({ ...form, limite_pendentes: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Limite de erros em 15 min</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.limite_erros_15min}
                    onChange={(e) =>
                      setForm({ ...form, limite_erros_15min: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cooldown entre alertas (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.cooldown_minutos}
                    onChange={(e) =>
                      setForm({ ...form, cooldown_minutos: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Alertas recentes
            {naoLidos.length > 0 && (
              <Badge variant="destructive">{naoLidos.length} não lidos</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta registrado.</p>
          ) : (
            <div className="space-y-2">
              {alertas.map((a) => (
                <div
                  key={a.id}
                  className={`flex items-start justify-between gap-3 rounded-md border p-3 ${
                    a.lido ? "opacity-60" : "border-destructive/50 bg-destructive/5"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={a.lido ? "secondary" : "destructive"}>{a.tipo}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-sm">{a.mensagem}</p>
                  </div>
                  {!a.lido && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => marcarLido.mutate(a.id)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Marcar lido
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
