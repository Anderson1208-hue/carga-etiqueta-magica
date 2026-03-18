import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { MonitoramentoParada } from "./types";
import { JUSTIFICATIVA_TIPOS } from "./types";

interface JustificativaDialogProps {
  parada: MonitoramentoParada | null;
  onClose: () => void;
  onSave: (paradaId: string, tipo: string, texto: string) => Promise<void>;
}

export function JustificativaDialog({ parada, onClose, onSave }: JustificativaDialogProps) {
  const [tipo, setTipo] = useState("");
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!parada || !tipo) return;
    setSaving(true);
    try {
      await onSave(parada.id, tipo, texto);
      setTipo("");
      setTexto("");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!parada} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Justificativa Operacional</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-1">Parada #{parada?.ordem}</p>
            <p className="text-sm text-muted-foreground">
              {parada?.razao_social || parada?.cnpj_destinatario}
            </p>
          </div>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o motivo" />
            </SelectTrigger>
            <SelectContent>
              {JUSTIFICATIVA_TIPOS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tipo === "Outros" && (
            <Textarea
              placeholder="Descreva o motivo..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!tipo || saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
