import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapPinned, Play, Search, AlertTriangle } from "lucide-react";

type ItemResult = {
  destinatario_id: string;
  razao_social: string;
  status: string;
  detalhe?: string;
  dist_deslocamento_m?: number;
  place_id?: string;
  formatted_address?: string;
};

type BackfillResult = {
  dry_run: boolean;
  processados: number;
  atualizados: number;
  sem_match: number;
  rejeitados: number;
  ok_atual: number;
  sem_endereco: number;
  erros: number;
  results: ItemResult[];
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "outline" | "secondary" | "destructive" }> = {
  atualizado: { label: "Atualizado", variant: "default" },
  ok_atual: { label: "OK (coord já bate)", variant: "secondary" },
  sem_match: { label: "Sem match", variant: "outline" },
  rejeitado_cidade: { label: "Rejeitado (cidade/UF)", variant: "destructive" },
  rejeitado_distancia: { label: "Rejeitado (>20km)", variant: "destructive" },
  sem_endereco: { label: "Sem endereço", variant: "outline" },
  erro: { label: "Erro", variant: "destructive" },
};

export function BackfillPlacesDialog() {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(50);
  const [minBaixas, setMinBaixas] = useState(1);
  const [force, setForce] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);

  const run = useMutation({
    mutationFn: async (dry_run: boolean) => {
      const { data, error } = await supabase.functions.invoke("backfill-places-nome", {
        body: { dry_run, limit, min_baixas_90d: minBaixas, force },
      });
      if (error) throw error;
      return data as BackfillResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success(
        data.dry_run
          ? `Simulação: ${data.atualizados} coord(s) seriam atualizadas`
          : `${data.atualizados} coord(s) atualizadas via Places`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MapPinned className="w-4 h-4 mr-2" /> Backfill via Google Places
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Backfill de coordenadas via Google Places</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Como funciona</AlertTitle>
            <AlertDescription className="text-xs space-y-1">
              <p>Busca cada cliente pelo <b>nome + bairro + cidade</b> no Google Places (mesma base do Waze) e atualiza a coordenada do endereço principal com o ponto do estabelecimento (ROOFTOP).</p>
              <p>Rejeita automaticamente resultados de cidade/UF diferentes ou a &gt;20km da coord atual (sanity check).</p>
              <p>Sempre rode em <b>Simular</b> primeiro para revisar antes de gravar.</p>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Limite de clientes</Label>
              <Input type="number" min={1} max={500} value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(500, parseInt(e.target.value || "50", 10))))} />
            </div>
            <div className="space-y-2">
              <Label>Mín. baixas em 90 dias</Label>
              <Input type="number" min={0} value={minBaixas}
                onChange={(e) => setMinBaixas(Math.max(0, parseInt(e.target.value || "0", 10)))} />
              <p className="text-[10px] text-muted-foreground">Prioriza clientes ativos. 0 = todos.</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Switch checked={force} onCheckedChange={setForce} />
                Forçar reprocessamento
              </Label>
              <p className="text-[10px] text-muted-foreground">Ignora "OK (coord já bate)".</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => run.mutate(true)} disabled={run.isPending}>
              <Search className="w-4 h-4 mr-2" /> Simular
            </Button>
            <Button onClick={() => run.mutate(false)} disabled={run.isPending}>
              <Play className="w-4 h-4 mr-2" /> Executar
            </Button>
          </div>

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-6 gap-2 text-center">
                <Stat label="Processados" value={result.processados} />
                <Stat label="Atualizados" value={result.atualizados} highlight />
                <Stat label="OK atual" value={result.ok_atual} />
                <Stat label="Sem match" value={result.sem_match} />
                <Stat label="Rejeitados" value={result.rejeitados} />
                <Stat label="Erros" value={result.erros} />
              </div>

              <div className="rounded-lg border max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr className="text-left">
                      <th className="px-2 py-1">Cliente</th>
                      <th className="px-2 py-1 w-40">Status</th>
                      <th className="px-2 py-1">Endereço Google</th>
                      <th className="px-2 py-1 w-20 text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => {
                      const meta = STATUS_LABEL[r.status] ?? { label: r.status, variant: "outline" as const };
                      return (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1">{r.razao_social}</td>
                          <td className="px-2 py-1">
                            <Badge variant={meta.variant} className="text-[10px]">{meta.label}</Badge>
                            {r.detalhe && <div className="text-[10px] text-muted-foreground mt-0.5">{r.detalhe}</div>}
                          </td>
                          <td className="px-2 py-1 text-muted-foreground truncate max-w-[380px]">
                            {r.formatted_address || "—"}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {r.dist_deslocamento_m != null
                              ? r.dist_deslocamento_m >= 1000
                                ? `${(r.dist_deslocamento_m / 1000).toFixed(1)}km`
                                : `${r.dist_deslocamento_m}m`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
