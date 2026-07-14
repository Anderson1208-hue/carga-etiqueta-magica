import { useState } from "react";
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
import { MapPinned, Play, Search, AlertTriangle, Loader2 } from "lucide-react";

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

const BATCH_SIZE = 10;
const EMPTY_RESULT = (dry_run: boolean): BackfillResult => ({
  dry_run,
  processados: 0,
  atualizados: 0,
  sem_match: 0,
  rejeitados: 0,
  ok_atual: 0,
  sem_endereco: 0,
  erros: 0,
  results: [],
});

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
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; dryRun: boolean } | null>(null);

  const invokeBatch = async (dry_run: boolean, batchLimit: number, offset: number) => {
      const { data, error } = await supabase.functions.invoke("backfill-places-nome", {
        body: { dry_run, limit: batchLimit, offset, min_baixas_90d: minBaixas, force },
      });
      if (error) {
        const maybeContext = error as Error & { context?: Response };
        const details = maybeContext.context ? await maybeContext.context.text().catch(() => "") : "";
        throw new Error(details || error.message);
      }
      return data as BackfillResult;
  };

  const runBatched = async (dry_run: boolean) => {
    const total = Math.max(1, Math.min(500, limit));
    let acc = EMPTY_RESULT(dry_run);
    setRunning(true);
    setResult(acc);
    setProgress({ done: 0, total, dryRun: dry_run });

    try {
      for (let offset = 0; offset < total; offset += BATCH_SIZE) {
        const batchLimit = Math.min(BATCH_SIZE, total - offset);
        const data = await invokeBatch(dry_run, batchLimit, offset);
        acc = {
          dry_run,
          processados: acc.processados + data.processados,
          atualizados: acc.atualizados + data.atualizados,
          sem_match: acc.sem_match + data.sem_match,
          rejeitados: acc.rejeitados + data.rejeitados,
          ok_atual: acc.ok_atual + data.ok_atual,
          sem_endereco: acc.sem_endereco + data.sem_endereco,
          erros: acc.erros + data.erros,
          results: [...acc.results, ...data.results],
        };
        setResult(acc);
        setProgress({ done: Math.min(offset + data.processados, total), total, dryRun: dry_run });
        if (data.processados < batchLimit) break;
      }
      toast.success(
        dry_run
          ? `Simulação: ${acc.atualizados} coord(s) seriam atualizadas`
          : `${acc.atualizados} coord(s) atualizadas via Places`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

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
            <Button variant="outline" onClick={() => runBatched(true)} disabled={running}>
              {running && progress?.dryRun ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Simular
            </Button>
            <Button onClick={() => runBatched(false)} disabled={running}>
              {running && !progress?.dryRun ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Executar
            </Button>
          </div>

          {progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{progress.dryRun ? "Simulando" : "Executando"} em lotes de {BATCH_SIZE}</span>
                <span>{progress.done}/{progress.total}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.max(4, Math.round((progress.done / progress.total) * 100))}%` }}
                />
              </div>
            </div>
          )}

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
                    {result.results.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                          {running ? "Buscando clientes..." : "Nenhum resultado retornado."}
                        </td>
                      </tr>
                    )}
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
