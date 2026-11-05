import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Ban } from "lucide-react";

interface Props {
  veiculo: { id: string; placa: string; motorista: string | null; data: string } | null;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}

export function CancelarRoteirizacaoDialog({ veiculo, onOpenChange, onCancelled }: Props) {
  const { toast } = useToast();
  const [motivo, setMotivo] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() { setMotivo(""); setSenha(""); setConfirmado(false); }

  async function handleConfirm() {
    if (!veiculo) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email;
      if (!email) throw new Error("Sessão expirada. Entre novamente.");
      const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (authErr || auth.user?.id !== u.user?.id) throw new Error("Senha incorreta.");

      const { data, error } = await supabase.rpc("cancelar_roteirizacao", {
        _veiculo_id: veiculo.id, _motivo: motivo.trim(),
      });
      if (error) throw error;
      const r = data as { nfs_liberadas: number };
      toast({
        title: "Roteirização cancelada",
        description: `${veiculo.placa}: ${r.nfs_liberadas} nota(s) voltaram para a Preparação.`,
      });
      reset();
      onCancelled();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Não foi possível cancelar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const podeConfirmar = motivo.trim().length >= 5 && senha.length > 0 && confirmado && !saving;

  return (
    <Dialog open={!!veiculo} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Ban className="w-5 h-5 text-destructive" />Cancelar roteirização</DialogTitle>
          <DialogDescription>
            Veículo <strong>{veiculo?.placa}</strong>{veiculo?.motorista ? ` — ${veiculo.motorista}` : ""}. As notas voltam para a
            Preparação. Conferências, CT-e, MDF-e e SM já emitidos são mantidos. Veículo em trânsito não pode ser cancelado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="motivo-cancel">Motivo *</Label>
            <Textarea id="motivo-cancel" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: problema mecânico, veículo não carregou" />
          </div>
          <div>
            <Label htmlFor="senha-cancel">Sua senha *</Label>
            <Input id="senha-cancel" type="password" autoComplete="current-password" value={senha}
              onChange={(e) => setSenha(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={confirmado} onCheckedChange={(c) => setConfirmado(!!c)} />
            Confirmo o cancelamento da roteirização deste veículo.
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Voltar</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!podeConfirmar}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Cancelar roteirização
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
