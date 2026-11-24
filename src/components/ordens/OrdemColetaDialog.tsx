import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatarCpfColeta,
  formatarNumeroColeta,
  normalizarCpfColeta,
  normalizarPlacaColeta,
  STATUS_ORDEM_COLETA,
  type OrdemColetaForm,
  type StatusOrdemColeta,
} from "@/lib/ordem-coleta";

type Embarcador = Pick<Tables<"embarcadores">, "id" | "razao_social" | "nome_fantasia" | "ativo">;

type Props = {
  form: OrdemColetaForm | null;
  embarcadores: Embarcador[];
  salvando: boolean;
  onChange: (form: OrdemColetaForm | null) => void;
  onSave: (form: OrdemColetaForm) => void;
};

export function OrdemColetaDialog({ form, embarcadores, salvando, onChange, onSave }: Props) {
  if (!form) return null;

  const update = (patch: Partial<OrdemColetaForm>) => onChange({ ...form, ...patch });
  const selecionarEmbarcador = (id: string) => {
    const embarcador = embarcadores.find((item) => item.id === id);
    update({
      embarcador_id: id,
      embarcador_nome: embarcador?.nome_fantasia || embarcador?.razao_social || "",
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !salvando && onChange(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {form.id ? `Editar ${formatarNumeroColeta(form.numero ?? 0)}` : "Nova Ordem de Coleta"}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados da coleta. Embarcador, data e endereço são obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-ordem-coleta"
          className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(form);
          }}
        >
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="coleta-embarcador">Embarcador *</Label>
            <Select value={form.embarcador_id} onValueChange={selecionarEmbarcador} required>
              <SelectTrigger id="coleta-embarcador" aria-label="Embarcador">
                <SelectValue placeholder="Selecione o embarcador" />
              </SelectTrigger>
              <SelectContent>
                {embarcadores.map((embarcador) => (
                  <SelectItem key={embarcador.id} value={embarcador.id}>
                    {embarcador.nome_fantasia || embarcador.razao_social}
                    {!embarcador.ativo ? " (inativo)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coleta-status">Status</Label>
            <Select
              value={form.status}
              onValueChange={(status) => update({ status: status as StatusOrdemColeta })}
            >
              <SelectTrigger id="coleta-status" aria-label="Status da coleta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDEM_COLETA.map((status) => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coleta-data">Data da coleta *</Label>
            <Input
              id="coleta-data"
              type="date"
              required
              value={form.data_coleta}
              onChange={(event) => update({ data_coleta: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-hora">Horário previsto</Label>
            <Input
              id="coleta-hora"
              type="time"
              value={form.hora_prevista}
              onChange={(event) => update({ hora_prevista: event.target.value })}
            />
          </div>
          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <Label className="text-sm font-medium">Placas do veículo</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="coleta-placa" className="text-xs text-muted-foreground">Placa do cavalo</Label>
                <Input
                  id="coleta-placa"
                  value={form.placa}
                  maxLength={7}
                  placeholder="ABC1D23"
                  className="h-11 text-base tracking-wider"
                  onChange={(event) => update({ placa: normalizarPlacaColeta(event.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coleta-placa-carreta" className="text-xs text-muted-foreground">Placa da carreta</Label>
                <Input
                  id="coleta-placa-carreta"
                  value={form.placa_carreta}
                  maxLength={7}
                  placeholder="ABC1D23"
                  className="h-11 text-base tracking-wider"
                  onChange={(event) => update({ placa_carreta: normalizarPlacaColeta(event.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coleta-placa-carreta-2" className="text-xs text-muted-foreground">Placa da carreta (rodotrem)</Label>
                <Input
                  id="coleta-placa-carreta-2"
                  value={form.placa_carreta_2}
                  maxLength={7}
                  placeholder="ABC1D23"
                  className="h-11 text-base tracking-wider"
                  onChange={(event) => update({ placa_carreta_2: normalizarPlacaColeta(event.target.value) })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Use este campo apenas em cargas rodotrem, com dois semirreboques.
            </p>
          </div>

          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <Label htmlFor="coleta-endereco">Endereço da coleta *</Label>
            <Input
              id="coleta-endereco"
              required
              value={form.endereco}
              placeholder="Rua, número, bairro e complemento"
              onChange={(event) => update({ endereco: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coleta-cidade">Cidade</Label>
            <Input
              id="coleta-cidade"
              value={form.cidade}
              onChange={(event) => update({ cidade: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-uf">UF</Label>
            <Input
              id="coleta-uf"
              value={form.uf}
              maxLength={2}
              placeholder="RJ"
              onChange={(event) => update({ uf: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-motorista">Motorista</Label>
            <Input
              id="coleta-motorista"
              value={form.motorista}
              onChange={(event) => update({ motorista: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-cpf-motorista">CPF do motorista</Label>
            <Input
              id="coleta-cpf-motorista"
              inputMode="numeric"
              maxLength={14}
              placeholder="000.000.000-00"
              value={formatarCpfColeta(form.cpf_motorista)}
              onChange={(event) => update({ cpf_motorista: normalizarCpfColeta(event.target.value) })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coleta-contato">Contato no local</Label>
            <Input
              id="coleta-contato"
              value={form.contato}
              onChange={(event) => update({ contato: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-telefone">Telefone</Label>
            <Input
              id="coleta-telefone"
              type="tel"
              value={form.telefone}
              onChange={(event) => update({ telefone: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-notas">Notas fiscais</Label>
            <Input
              id="coleta-notas"
              value={form.notas_fiscais}
              placeholder="Ex.: 12345, 12346"
              onChange={(event) => update({ notas_fiscais: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-codigo-otm">Código do OTM</Label>
            <Input
              id="coleta-codigo-otm"
              value={form.codigo_otm}
              maxLength={60}
              onChange={(event) => update({ codigo_otm: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-numero-roteiro">Número do roteiro</Label>
            <Input
              id="coleta-numero-roteiro"
              value={form.numero_roteiro}
              maxLength={60}
              onChange={(event) => update({ numero_roteiro: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coleta-volumes">Volumes</Label>
            <Input
              id="coleta-volumes"
              type="number"
              min="0"
              step="1"
              required
              value={form.volumes}
              onChange={(event) => update({ volumes: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-peso">Peso (kg)</Label>
            <Input
              id="coleta-peso"
              type="number"
              min="0"
              step="0.001"
              required
              value={form.peso_kg}
              onChange={(event) => update({ peso_kg: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-cubagem">Volume bruto / cubagem (m³)</Label>
            <Input
              id="coleta-cubagem"
              type="number"
              min="0"
              step="0.001"
              placeholder="0,000"
              value={form.cubagem_m3}
              onChange={(event) => update({ cubagem_m3: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coleta-volume-liquido">Volume líquido (m³)</Label>
            <Input
              id="coleta-volume-liquido"
              type="number"
              min="0"
              step="0.001"
              placeholder="0,000"
              value={form.volume_liquido_m3}
              onChange={(event) => update({ volume_liquido_m3: event.target.value })}
            />
          </div>
          <div className="space-y-2 md:col-span-2 lg:col-span-3">
            <Label htmlFor="coleta-observacoes">Observações</Label>
            <Textarea
              id="coleta-observacoes"
              rows={2}
              value={form.observacoes}
              onChange={(event) => update({ observacoes: event.target.value })}
            />
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={salvando} onClick={() => onChange(null)}>
            Cancelar
          </Button>
          <Button type="submit" form="form-ordem-coleta" disabled={salvando}>
            {salvando ? "Salvando..." : form.id ? "Salvar alterações" : "Criar ordem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
