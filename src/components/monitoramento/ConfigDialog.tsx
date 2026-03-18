import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { MonitoramentoConfig } from "./types";

interface ConfigDialogProps {
  open: boolean;
  onClose: () => void;
  config: MonitoramentoConfig;
  onConfigChange: (config: MonitoramentoConfig) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

const CONFIG_FIELDS: { key: keyof MonitoramentoConfig; label: string }[] = [
  { key: "raio_padrao_metros", label: "Raio padrão de geofence (metros)" },
  { key: "tempo_minimo_atendimento_min", label: "Tempo mínimo para atendimento (minutos)" },
  { key: "tempo_maximo_cliente_min", label: "Tempo máximo por cliente (minutos)" },
  { key: "tolerancia_gps_metros", label: "Tolerância de GPS (metros)" },
  { key: "tempo_max_sem_atualizacao_min", label: "Tempo máximo sem atualização (minutos)" },
];

export function ConfigDialog({ open, onClose, config, onConfigChange, onSave, saving }: ConfigDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurações do Monitoramento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {CONFIG_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="text-sm font-medium">{label}</label>
              <Input
                type="number"
                value={config[key]}
                onChange={(e) => onConfigChange({ ...config, [key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
