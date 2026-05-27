import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Save, RotateCcw } from "lucide-react";

export function IbacRetryPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    max_tentativas: 5,
    backoff_base_segundos: 60,
    backoff_max_segundos: 3600,
    ativo: true,
  });
  const [diasReprocesso, setDiasReprocesso] = useState(7);

  const { data: cfg } = useQuery({
    queryKey: ["ibac-config-retry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ibac_config_retry")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (cfg) {
      setForm({
        max_tentativas: cfg.max_tentativas,
        backoff_base_segundos: cfg.backoff_base_segundos,
        backoff_max_segundos: cfg.backoff_max_segundos,
        ativo: cfg.ativo,
      });
    }
  }, [cfg]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ibac_config_retry")
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Política de retry atualizada");
      qc.invalidateQueries({ queryKey: ["ibac-config-retry"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const reprocessar = useMutation({
    mutationFn: async () => {
      const corte = new Date(Date.now() - diasReprocesso * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("ibac_eventos_queue")
        .update({ status: "pendente", tentativas: 0, erro_mensagem: null, ultima_tentativa_em: null })
        .eq("status", "erro")
        .gte("created_at", corte)
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`${count} evento(s) reenfileirado(s) para nova tentativa`);
      qc.invalidateQueries({ queryKey: ["ibac-fila"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  // Pré-visualização do backoff
  const exemplos = Array.from({ length: form.max_tentativas }, (_, i) => {
    if (i === 0) return { tent: 1, espera: "imediato" };
    const s = Math.min(form.backoff_base_segundos * Math.pow(2, i - 1), form.backoff_max_segundos);
    return { tent: i + 1, espera: s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${(s / 3600).toFixed(1)}h` };
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Política de Retry</CardTitle>
          <p className="text-sm text-muted-foreground">
            Backoff exponencial: <code>base × 2^(tentativa-1)</code>, com teto máximo.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Backoff ativo</Label>
            <Switch
              checked={form.ativo}
              onCheckedChange={(v) => setForm({ ...form, ativo: v })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Máximo de tentativas (1-20)</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={form.max_tentativas}
              onChange={(e) => setForm({ ...form, max_tentativas: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Intervalo base (segundos, mín. 10)</Label>
            <Input
              type="number"
              min={10}
              value={form.backoff_base_segundos}
              onChange={(e) => setForm({ ...form, backoff_base_segundos: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Teto do intervalo (segundos, mín. 60)</Label>
            <Input
              type="number"
              min={60}
              value={form.backoff_max_segundos}
              onChange={(e) => setForm({ ...form, backoff_max_segundos: Number(e.target.value) })}
            />
          </div>

          <Separator />

          <div>
            <div className="text-xs font-medium mb-2">Pré-visualização das esperas</div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {exemplos.map((e) => (
                <div key={e.tent} className="flex justify-between rounded bg-muted px-2 py-1">
                  <span className="text-muted-foreground">Tent. {e.tent}</span>
                  <span className="font-mono">{e.espera}</span>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            Salvar política
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reprocessar erros recentes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Reenfileira em massa todos os eventos em <strong>erro</strong> dentro da janela escolhida (tentativas zeradas).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Janela (últimos N dias)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={diasReprocesso}
              onChange={(e) => setDiasReprocesso(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Corte: {new Date(Date.now() - diasReprocesso * 24 * 60 * 60 * 1000).toLocaleString("pt-BR")}
            </p>
          </div>

          <Button
            variant="outline"
            onClick={() => reprocessar.mutate()}
            disabled={reprocessar.isPending}
            className="w-full"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reenfileirar erros desta janela
          </Button>

          <p className="text-xs text-muted-foreground">
            Diferente do botão "Reenviar erros" no topo (que abrange todos), aqui você escolhe a janela.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
