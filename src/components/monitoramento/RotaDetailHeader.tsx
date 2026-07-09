import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, CheckCircle2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { MonitoramentoRota } from "./types";

interface RotaDetailHeaderProps {
  rota: MonitoramentoRota;
  formatDateTime: (iso: string | null) => string;
  onFinalizada?: () => void;
}

export function RotaDetailHeader({ rota, formatDateTime, onFinalizada }: RotaDetailHeaderProps) {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finalizando, setFinalizando] = useState(false);

  const progress = rota.total_paradas
    ? (rota.paradas_concluidas / rota.total_paradas) * 100
    : 0;

  const isAtiva = rota.status === "ativa";

  async function handleFinalizar() {
    setFinalizando(true);
    try {
      const { error } = await supabase
        .from("monitoramento_rotas")
        .update({ status: "finalizada" })
        .eq("id", rota.id);
      if (error) throw error;
      toast({ title: "Rota finalizada", description: `${rota.placa} — GPS será encerrado no próximo ping do APK.` });
      setConfirmOpen(false);
      onFinalizada?.();
    } catch (e: any) {
      toast({ title: "Erro ao finalizar", description: e.message, variant: "destructive" });
    } finally {
      setFinalizando(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate">{rota.placa}</h2>
              <p className="text-sm text-muted-foreground truncate">{rota.motorista || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <p className="font-medium">
                {rota.paradas_concluidas}/{rota.total_paradas} entregas
              </p>
              <p className="text-muted-foreground">
                {rota.ultima_atualizacao
                  ? `GPS: ${formatDateTime(rota.ultima_atualizacao)}`
                  : "Sem posição GPS"}
              </p>
            </div>
            {isAtiva && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                className="shrink-0"
              >
                <CheckCircle2 className="w-4 h-4 mr-1" /> Finalizar rota
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 bg-muted rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar rota da placa {rota.placa}?</AlertDialogTitle>
            <AlertDialogDescription>
              A rota deixará de aparecer como ativa na torre. O GPS do APK do motorista só para de
              enviar quando o app for fechado — mas os novos pings serão ignorados.
              {rota.paradas_concluidas < rota.total_paradas && (
                <span className="block mt-2 text-destructive">
                  Atenção: ainda há {rota.total_paradas - rota.paradas_concluidas} entrega(s) sem baixa.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finalizando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleFinalizar} disabled={finalizando}>
              {finalizando ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Finalizando…</> : "Finalizar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
