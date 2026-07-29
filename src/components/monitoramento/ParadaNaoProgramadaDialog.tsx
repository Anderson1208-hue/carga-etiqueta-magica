import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MapPin } from "lucide-react";
import type { Alerta, MonitoramentoParada } from "./types";

const MOTIVOS = [
  { value: "entrega_no_local", label: "Entrega no local (endereço divergente do cadastro)" },
  { value: "posto_almoco", label: "Posto / Almoço / Necessidade fisiológica" },
  { value: "transito", label: "Trânsito parado / Congestionamento" },
  { value: "problema_veiculo", label: "Problema no veículo" },
  { value: "ocorrencia_seguranca", label: "Ocorrência de segurança" },
  { value: "outro", label: "Outro" },
];

interface Props {
  alerta: Alerta | null;
  paradas: MonitoramentoParada[];
  onClose: () => void;
  onSave: (payload: {
    alertaId: string;
    motivo: string;
    paradaId?: string;
    observacao: string;
  }) => Promise<void>;
}

export function ParadaNaoProgramadaDialog({ alerta, paradas, onClose, onSave }: Props) {
  const [motivo, setMotivo] = useState("");
  const [paradaId, setParadaId] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!alerta || !motivo) return;
    if (motivo === "entrega_no_local" && !paradaId) return;
    setSaving(true);
    try {
      await onSave({
        alertaId: alerta.id,
        motivo,
        paradaId: motivo === "entrega_no_local" ? paradaId : undefined,
        observacao: obs,
      });
      setMotivo("");
      setParadaId("");
      setObs("");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const pendentes = paradas.filter(
    (p) => !["visitada", "finalizada", "pulada", "visita_inconsistente"].includes(p.status),
  );

  return (
    <Dialog open={!!alerta} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Justificar parada não programada</DialogTitle>
          <DialogDescription>
            {alerta?.mensagem}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {alerta?.latitude && alerta?.longitude && (
            <a
              href={`https://www.google.com/maps?q=${alerta.latitude},${alerta.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <MapPin className="w-3 h-3" />
              Ver ponto no Google Maps ({Number(alerta.latitude).toFixed(5)},{" "}
              {Number(alerta.longitude).toFixed(5)})
            </a>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Motivo apurado com o motorista
            </label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {motivo === "entrega_no_local" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                A qual parada esse ponto se refere?
              </label>
              <Select value={paradaId} onValueChange={setParadaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a parada" />
                </SelectTrigger>
                <SelectContent>
                  {pendentes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      #{p.ordem} — {p.razao_social || p.cnpj_destinatario}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Ao confirmar, o sistema registra o ponto real para revisão e futura correção
                automática do cadastro.
              </p>
            </div>
          )}

          <Textarea
            placeholder="Observações (opcional)"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              !motivo || saving || (motivo === "entrega_no_local" && !paradaId)
            }
          >
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
