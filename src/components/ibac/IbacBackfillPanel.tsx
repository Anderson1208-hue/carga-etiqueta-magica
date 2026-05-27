import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { History, Play, Search, AlertTriangle } from "lucide-react";

export function IbacBackfillPanel() {
  const hoje = new Date().toISOString().slice(0, 10);
  const trintaDiasAtras = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [dataInicio, setDataInicio] = useState(trintaDiasAtras);
  const [dataFim, setDataFim] = useState(hoje);
  const [incluirBaixas, setIncluirBaixas] = useState(true);
  const [incluirAgendamentos, setIncluirAgendamentos] = useState(true);
  const [ultimoResultado, setUltimoResultado] = useState<{
    dry_run: boolean;
    baixas_enfileiradas: number;
    agendamentos_enfileirados: number;
    total: number;
  } | null>(null);

  const executar = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const body = {
        data_inicio: `${dataInicio}T00:00:00`,
        data_fim: `${dataFim}T23:59:59`,
        incluir_baixas: incluirBaixas,
        incluir_agendamentos: incluirAgendamentos,
        dry_run: dryRun,
      };
      const { data, error } = await supabase.functions.invoke("ibac-backfill", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setUltimoResultado(data);
      toast.success(
        data.dry_run
          ? `Simulação: ${data.total} evento(s) seriam enfileirados`
          : `${data.total} evento(s) enfileirados com sucesso`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Sobre o backfill histórico</AlertTitle>
        <AlertDescription>
          Enfileira eventos de baixas e agendamentos já existentes para envio à IBAC.
          Sempre execute primeiro em modo "Simular" para validar a quantidade antes de inserir na fila real.
          Eventos já enfileirados (mesma baixa/agendamento) são automaticamente ignorados.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Backfill por período
          </CardTitle>
          <CardDescription>
            Selecione o intervalo de datas e quais tipos de eventos enfileirar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data-inicio">Data início</Label>
              <Input
                id="data-inicio"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data-fim">Data fim</Label>
              <Input
                id="data-fim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="incluir-baixas" className="font-medium">Incluir baixas de entrega</Label>
              <p className="text-xs text-muted-foreground">
                Entregas, reentregas, avarias, recusas e devoluções
              </p>
            </div>
            <Switch
              id="incluir-baixas"
              checked={incluirBaixas}
              onCheckedChange={setIncluirBaixas}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="incluir-ag" className="font-medium">Incluir agendamentos</Label>
              <p className="text-xs text-muted-foreground">
                Agendamentos com data confirmada (AGENDAMENTO ou REENTREGA)
              </p>
            </div>
            <Switch
              id="incluir-ag"
              checked={incluirAgendamentos}
              onCheckedChange={setIncluirAgendamentos}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => executar.mutate(true)}
              disabled={executar.isPending || (!incluirBaixas && !incluirAgendamentos)}
            >
              <Search className="w-4 h-4 mr-2" />
              Simular (dry-run)
            </Button>
            <Button
              onClick={() => executar.mutate(false)}
              disabled={executar.isPending || (!incluirBaixas && !incluirAgendamentos)}
            >
              <Play className="w-4 h-4 mr-2" />
              Executar backfill
            </Button>
          </div>
        </CardContent>
      </Card>

      {ultimoResultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {ultimoResultado.dry_run ? "Resultado da simulação" : "Último backfill executado"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Baixas</div>
                <div className="text-2xl font-bold">{ultimoResultado.baixas_enfileiradas}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Agendamentos</div>
                <div className="text-2xl font-bold">{ultimoResultado.agendamentos_enfileirados}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-2xl font-bold text-primary">{ultimoResultado.total}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
