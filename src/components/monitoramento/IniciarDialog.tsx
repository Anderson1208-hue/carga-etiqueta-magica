import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Truck } from "lucide-react";

interface Veiculo {
  id: string;
  placa: string;
  motorista: string | null;
  data: string;
  status: string;
}

interface IniciarDialogProps {
  open: boolean;
  onClose: () => void;
  veiculos: Veiculo[];
  loading: boolean;
  iniciando: boolean;
  onIniciar: (veiculo: Veiculo) => void;
}

export function IniciarDialog({ open, onClose, veiculos, loading, iniciando, onIniciar }: IniciarDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Iniciar Monitoramento</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : veiculos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Truck className="w-10 h-10 mb-3 opacity-20" />
              <p className="text-sm">Nenhum veículo disponível para monitoramento.</p>
            </div>
          ) : (
            veiculos.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="font-semibold text-sm">{v.placa}</p>
                  <p className="text-xs text-muted-foreground">{v.motorista || "Sem motorista"}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => onIniciar(v)}
                  disabled={iniciando}
                >
                  {iniciando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Iniciar"}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
