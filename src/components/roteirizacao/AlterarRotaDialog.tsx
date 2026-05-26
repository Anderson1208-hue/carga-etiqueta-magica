import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck,
  Loader2,
  Trash2,
  Plus,
  Save,
  FileText,
  Search,
  User,
} from "lucide-react";

interface AlterarRotaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  veiculo: {
    id: string;
    placa: string;
    motorista: string | null;
    data: string;
    status: string;
  } | null;
  onUpdated: () => void;
}

interface VeiculoNf {
  id: string;
  nf_id: string;
  notas_fiscais: {
    numero_nf: string;
    dest_razao_social: string | null;
    dest_bairro: string | null;
    peso_bruto: number | null;
    volume_m3: number | null;
    cnpj_destinatario: string | null;
  };
}

interface NfDisponivel {
  id: string;
  numero_nf: string;
  dest_razao_social: string | null;
  dest_bairro: string | null;
  peso_bruto: number | null;
  volume_m3: number | null;
  carga_id: string;
}

export function AlterarRotaDialog({
  open,
  onOpenChange,
  veiculo,
  onUpdated,
}: AlterarRotaDialogProps) {
  const { toast } = useToast();

  const [placa, setPlaca] = useState("");
  const [motorista, setMotorista] = useState("");
  const [saving, setSaving] = useState(false);

  // NFs vinculadas
  const [nfsVinculadas, setNfsVinculadas] = useState<VeiculoNf[]>([]);
  const [nfsToRemove, setNfsToRemove] = useState<Set<string>>(new Set());
  const [loadingNfs, setLoadingNfs] = useState(false);

  // NFs disponíveis para adicionar
  const [nfsDisponiveis, setNfsDisponiveis] = useState<NfDisponivel[]>([]);
  const [nfsToAdd, setNfsToAdd] = useState<Set<string>>(new Set());
  const [loadingDisponiveis, setLoadingDisponiveis] = useState(false);
  const [searchNf, setSearchNf] = useState("");

  useEffect(() => {
    if (open && veiculo) {
      setPlaca(veiculo.placa);
      setMotorista(veiculo.motorista || "");
      setNfsToRemove(new Set());
      setNfsToAdd(new Set());
      setSearchNf("");
      loadNfsVinculadas(veiculo.id);
      loadNfsDisponiveis(veiculo.id);
    }
  }, [open, veiculo?.id]);

  async function loadNfsVinculadas(veiculoId: string) {
    setLoadingNfs(true);
    try {
      const { data } = await supabase
        .from("veiculo_nfs")
        .select(`
          id, nf_id,
          notas_fiscais!inner(numero_nf, dest_razao_social, dest_bairro, peso_bruto, volume_m3, cnpj_destinatario)
        `)
        .eq("veiculo_id", veiculoId);
      setNfsVinculadas((data as any) || []);
    } catch (err) {
      console.error("Error loading vehicle NFs:", err);
    } finally {
      setLoadingNfs(false);
    }
  }

  async function loadNfsDisponiveis(veiculoId: string) {
    setLoadingDisponiveis(true);
    try {
      // Get NFs already linked to ANY vehicle (paginated)
      const allLinked = await fetchAllPages<{ nf_id: string }>((from, to) =>
        supabase.from("veiculo_nfs").select("nf_id").order("nf_id").range(from, to)
      );
      const linkedSet = new Set(allLinked.map((l) => l.nf_id));

      // Get NFs not delivered (paginated, all pages)
      const nfs = await fetchAllPages<NfDisponivel>((from, to) =>
        supabase
          .from("notas_fiscais")
          .select("id, numero_nf, dest_razao_social, dest_bairro, peso_bruto, volume_m3, carga_id")
          .neq("status_entrega", "ENTREGUE")
          .neq("status_entrega", "RECUSADO")
          .order("numero_nf")
          .range(from, to)
      );

      const disponiveis = nfs.filter((nf) => !linkedSet.has(nf.id));
      setNfsDisponiveis(disponiveis);
    } catch (err) {
      console.error("Error loading available NFs:", err);
    } finally {
      setLoadingDisponiveis(false);
    }
  }

  function toggleRemoveNf(vnfId: string) {
    setNfsToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(vnfId)) next.delete(vnfId);
      else next.add(vnfId);
      return next;
    });
  }

  function toggleAddNf(nfId: string) {
    setNfsToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(nfId)) next.delete(nfId);
      else next.add(nfId);
      return next;
    });
  }

  async function handleSave() {
    if (!veiculo) return;
    setSaving(true);
    try {
      // 1. Update placa/motorista
      const { error: updateErr } = await supabase
        .from("veiculos")
        .update({
          placa: placa.trim().toUpperCase(),
          motorista: motorista.trim(),
        })
        .eq("id", veiculo.id);
      if (updateErr) throw updateErr;

      // 2. Remove selected NFs
      if (nfsToRemove.size > 0) {
        const removeIds = Array.from(nfsToRemove);
        // Buscar nf_ids antes de deletar para resetar status_entrega
        const { data: vinculosRemover } = await supabase
          .from("veiculo_nfs")
          .select("nf_id")
          .in("id", removeIds);
        const nfIdsRemover = (vinculosRemover || []).map((v) => v.nf_id);

        const { error: delErr } = await supabase
          .from("veiculo_nfs")
          .delete()
          .in("id", removeIds);
        if (delErr) throw delErr;

        // Reseta status_entrega para a NF reaparecer na Preparação
        if (nfIdsRemover.length > 0) {
          await supabase
            .from("notas_fiscais")
            .update({ status_entrega: "CARGA NO DEPOSITO" })
            .in("id", nfIdsRemover)
            .in("status_entrega", ["NF EM ROTA", "ENTREGUE", "RECUSADO"]);
        }
      }

      // 2.1 Se todas as NFs foram removidas e nenhuma será adicionada,
      // remove o veículo da programação.
      const totalRestante =
        nfsVinculadas.length - nfsToRemove.size + nfsToAdd.size;
      if (totalRestante <= 0) {
        const { error: delVeicErr } = await supabase
          .from("veiculos")
          .delete()
          .eq("id", veiculo.id);
        if (delVeicErr) throw delVeicErr;

        toast({
          title: "Veículo removido",
          description: `Veículo ${placa.toUpperCase()} foi removido da programação (sem NFs vinculadas).`,
        });
        onUpdated();
        onOpenChange(false);
        return;
      }

      // 3. Add selected NFs
      if (nfsToAdd.size > 0) {
        const nfsToInsert = Array.from(nfsToAdd).map((nfId) => {
          const nf = nfsDisponiveis.find((n) => n.id === nfId);
          return {
            veiculo_id: veiculo.id,
            nf_id: nfId,
            carga_origem_id: nf?.carga_id || "",
          };
        });
        const { error: addErr } = await supabase
          .from("veiculo_nfs")
          .insert(nfsToInsert);
        if (addErr) throw addErr;
      }

      toast({
        title: "Rota atualizada!",
        description: `Veículo ${placa.toUpperCase()} atualizado com sucesso`,
      });
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      console.error("Error updating route:", err);
      toast({
        title: "Erro",
        description: "Erro ao atualizar a rota do veículo",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const filteredDisponiveis = nfsDisponiveis.filter((nf) => {
    if (!searchNf) return true;
    const term = searchNf.toLowerCase();
    return (
      nf.numero_nf.toLowerCase().includes(term) ||
      (nf.dest_razao_social || "").toLowerCase().includes(term)
    );
  });

  const hasChanges =
    placa.trim().toUpperCase() !== veiculo?.placa ||
    motorista.trim() !== (veiculo?.motorista || "") ||
    nfsToRemove.size > 0 ||
    nfsToAdd.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Alterar Rota – {veiculo?.placa}
          </DialogTitle>
          <DialogDescription>
            Edite placa, motorista, remova ou adicione NFs ao veículo.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="dados" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="remover">
              Remover NFs
              {nfsToRemove.size > 0 && (
                <Badge variant="destructive" className="ml-1.5 text-xs px-1.5 py-0">
                  {nfsToRemove.size}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="adicionar">
              Adicionar NFs
              {nfsToAdd.size > 0 && (
                <Badge className="ml-1.5 text-xs px-1.5 py-0">
                  {nfsToAdd.size}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Dados Tab */}
          <TabsContent value="dados" className="space-y-4 mt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Placa</Label>
                <Input
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  placeholder="ABC1D23"
                  maxLength={7}
                />
              </div>
              <div>
                <Label>Motorista</Label>
                <Input
                  value={motorista}
                  onChange={(e) => setMotorista(e.target.value)}
                  placeholder="Nome do motorista"
                />
              </div>
            </div>
          </TabsContent>

          {/* Remover NFs Tab */}
          <TabsContent value="remover" className="mt-4">
            {loadingNfs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : nfsVinculadas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma NF vinculada a este veículo.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground mb-3">
                  Selecione as NFs que deseja remover deste veículo.
                </p>
                {nfsVinculadas.map((vnf) => {
                  const nf = vnf.notas_fiscais;
                  const isSelected = nfsToRemove.has(vnf.id);
                  return (
                    <label
                      key={vnf.id}
                      className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-destructive/10 border border-destructive/30"
                          : "bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRemoveNf(vnf.id)}
                      />
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">NF {nf.numero_nf}</span>
                        <span className="text-xs text-muted-foreground ml-2 truncate">
                          {nf.dest_razao_social}
                        </span>
                      </div>
                      <div className="flex gap-2 text-xs text-muted-foreground shrink-0">
                        {nf.dest_bairro && <span>{nf.dest_bairro}</span>}
                        <span>{Number(nf.peso_bruto || 0).toFixed(1)} kg</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Adicionar NFs Tab */}
          <TabsContent value="adicionar" className="mt-4">
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                value={searchNf}
                onChange={(e) => setSearchNf(e.target.value)}
                placeholder="Buscar por número NF ou razão social..."
                className="pl-9"
              />
            </div>
            {loadingDisponiveis ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDisponiveis.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {searchNf
                  ? "Nenhuma NF encontrada com esse filtro."
                  : "Não há NFs disponíveis para adicionar."}
              </p>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                <p className="text-xs text-muted-foreground mb-2">
                  {filteredDisponiveis.length} NF(s) disponíveis
                </p>
                {filteredDisponiveis.slice(0, 100).map((nf) => {
                  const isSelected = nfsToAdd.has(nf.id);
                  return (
                    <label
                      key={nf.id}
                      className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/10 border border-primary/30"
                          : "bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleAddNf(nf.id)}
                      />
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">NF {nf.numero_nf}</span>
                        <span className="text-xs text-muted-foreground ml-2 truncate">
                          {nf.dest_razao_social}
                        </span>
                      </div>
                      <div className="flex gap-2 text-xs text-muted-foreground shrink-0">
                        {nf.dest_bairro && <span>{nf.dest_bairro}</span>}
                        <span>{Number(nf.peso_bruto || 0).toFixed(1)} kg</span>
                      </div>
                    </label>
                  );
                })}
                {filteredDisponiveis.length > 100 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Mostrando 100 de {filteredDisponiveis.length}. Use o filtro para refinar.
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Summary & Save */}
        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <div className="flex gap-3 text-xs text-muted-foreground">
            {nfsToRemove.size > 0 && (
              <span className="text-destructive font-medium">
                <Trash2 className="w-3 h-3 inline mr-1" />
                {nfsToRemove.size} a remover
              </span>
            )}
            {nfsToAdd.size > 0 && (
              <span className="text-primary font-medium">
                <Plus className="w-3 h-3 inline mr-1" />
                {nfsToAdd.size} a adicionar
              </span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
