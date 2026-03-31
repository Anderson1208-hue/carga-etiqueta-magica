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

const CONFIG_SECTIONS = [
  {
    title: "Geofence & Atendimento",
    fields: [
      { key: "raio_padrao_metros" as keyof MonitoramentoConfig, label: "Raio padrão de geofence (metros)", type: "number" as const },
      { key: "tempo_minimo_atendimento_min" as keyof MonitoramentoConfig, label: "Tempo mínimo para atendimento (min)", type: "number" as const },
      { key: "tempo_maximo_cliente_min" as keyof MonitoramentoConfig, label: "Tempo máximo por cliente (min)", type: "number" as const },
      { key: "tolerancia_gps_metros" as keyof MonitoramentoConfig, label: "Tolerância de GPS (metros)", type: "number" as const },
      { key: "tempo_max_sem_atualizacao_min" as keyof MonitoramentoConfig, label: "Tempo máx. sem atualização (min)", type: "number" as const },
      { key: "geofence_ativo" as keyof MonitoramentoConfig, label: "Geofence ativo", type: "boolean" as const },
    ],
  },
  {
    title: "GPS & Intervalo",
    fields: [
      { key: "intervalo_padrao_segundos" as keyof MonitoramentoConfig, label: "Intervalo padrão de envio (segundos)", type: "number" as const },
      { key: "intervalo_critico_segundos" as keyof MonitoramentoConfig, label: "Intervalo modo crítico (segundos)", type: "number" as const },
      { key: "distance_filter_metros" as keyof MonitoramentoConfig, label: "Filtro de distância mínima (metros)", type: "number" as const },
      { key: "raio_aproximacao_metros" as keyof MonitoramentoConfig, label: "Raio de aproximação p/ modo crítico (metros)", type: "number" as const },
    ],
  },
  {
    title: "Sincronização em Lote",
    fields: [
      { key: "batch_sync_ativo" as keyof MonitoramentoConfig, label: "Envio em lote ativo", type: "boolean" as const },
      { key: "batch_max_posicoes" as keyof MonitoramentoConfig, label: "Máx. posições por lote", type: "number" as const },
    ],
  },
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
