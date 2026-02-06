import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { XMLDropzone, ParsedFile } from "@/components/XMLDropzone";
import { calculateBoxes } from "@/lib/xml-parser";
import { Plus, Truck, Loader2, FileText, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
  observacao: string | null;
  status: "aberta" | "fechada";
  created_at: string;
  _count?: {
    nfs: number;
    itens: number;
  };
}

export default function Cargas() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cargaToDelete, setCargaToDelete] = useState<Carga | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    data: format(new Date(), "yyyy-MM-dd"),
    placa: "",
    motorista: "",
    observacao: "",
  });
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);

  useEffect(() => {
    loadCargas();
  }, []);

  async function loadCargas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cargas")
        .select(`
          *,
          notas_fiscais(
            id,
            itens_nf(id)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const cargasWithCounts = (data || []).map((carga) => ({
        ...carga,
        _count: {
          nfs: carga.notas_fiscais?.length || 0,
          itens: carga.notas_fiscais?.reduce(
            (acc: number, nf: any) => acc + (nf.itens_nf?.length || 0),
            0
          ) || 0,
        },
      }));

      setCargas(cargasWithCounts);
    } catch (error) {
      console.error("Error loading cargas:", error);
      toast({
        variant: "destructive",
        title: "Erro ao carregar cargas",
        description: "Tente novamente mais tarde.",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleFilesProcessed(newFiles: ParsedFile[]) {
    setParsedFiles((prev) => [...prev, ...newFiles]);
  }

  function handleRemoveFile(index: number) {
    setParsedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Input validation helpers
  function validatePlaca(placa: string): boolean {
    const cleanPlaca = placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
    // Brazilian plates: ABC1234 (old) or ABC1D23 (Mercosul)
    return /^[A-Z]{3}[0-9]{4}$/.test(cleanPlaca) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(cleanPlaca);
  }

  function validateChaveAcesso(chave: string): boolean {
    const cleanChave = chave.replace(/\D/g, "");
    return cleanChave.length === 44;
  }

  function validateCNPJ(cnpj: string): boolean {
    if (!cnpj) return true; // Optional field
    const cleanCnpj = cnpj.replace(/\D/g, "");
    return cleanCnpj.length === 14;
  }

  function sanitizeText(text: string, maxLength: number): string {
    return text.trim().slice(0, maxLength);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Prevent double clicks - button already disabled, but extra safety
    if (saving) return;

    const successFiles = parsedFiles.filter((f) => f.status === "success");
    if (successFiles.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhum XML válido",
        description: "Adicione pelo menos um arquivo XML válido.",
      });
      return;
    }

    // Validate placa format
    if (!validatePlaca(formData.placa)) {
      toast({
        variant: "destructive",
        title: "Placa inválida",
        description: "Formato de placa inválido. Use ABC1234 ou ABC1D23.",
      });
      return;
    }

    // Validate motorista (required, max 100 chars)
    if (!formData.motorista.trim() || formData.motorista.length > 100) {
      toast({
        variant: "destructive",
        title: "Nome do motorista inválido",
        description: "O nome do motorista é obrigatório e deve ter no máximo 100 caracteres.",
      });
      return;
    }

    // Validate all XMLs have proper chave_acesso
    const invalidXmls = successFiles.filter((f) => !validateChaveAcesso(f.data.chaveAcesso));
    if (invalidXmls.length > 0) {
      toast({
        variant: "destructive",
        title: "Chave de acesso inválida",
        description: `${invalidXmls.length} XML(s) com chave de acesso inválida (deve ter 44 dígitos).`,
      });
      return;
    }

    // Validate CNPJs in XMLs
    const invalidCnpjs = successFiles.filter(
      (f) => !validateCNPJ(f.data.cnpjEmitente) || !validateCNPJ(f.data.cnpjDestinatario || "")
    );
    if (invalidCnpjs.length > 0) {
      toast({
        variant: "destructive",
        title: "CNPJ inválido",
        description: `${invalidCnpjs.length} XML(s) com CNPJ inválido (deve ter 14 dígitos).`,
      });
      return;
    }

    setSaving(true);
    try {
      // Generate a unique batch id based on chave_acesso set + timestamp
      const chavesAcesso = successFiles.map((f) => f.data.chaveAcesso).sort();
      const batchSource = `${chavesAcesso.join("|")}|${formData.data}|${Date.now()}`;
      const importBatchId = await generateHash(batchSource);

      // Build the payload for the RPC
      const nfsPayload = successFiles.map((file) => {
        const nf = file.data;
        
        // Group items by cProd to avoid duplicate etiquetas
        // If same cProd appears multiple times, sum quantities
        const groupedItems: Record<string, { xProd: string; qCom: number }> = {};
        nf.itens.forEach((item) => {
          if (groupedItems[item.cProd]) {
            groupedItems[item.cProd].qCom += item.qCom;
          } else {
            groupedItems[item.cProd] = { xProd: item.xProd, qCom: item.qCom };
          }
        });

        // Build etiquetas array from grouped items
        const etiquetas: { c_prod: string; x_prod: string; seq: number; total: number; qr_payload: string }[] = [];
        Object.entries(groupedItems).forEach(([cProd, { xProd, qCom }]) => {
          const totalCaixas = calculateBoxes(qCom);
          for (let seq = 1; seq <= totalCaixas; seq++) {
            const qrPayload = `{CARGA_ID};${nf.numeroNf};${cProd};${seq};${totalCaixas};${nf.chaveAcesso}`;
            etiquetas.push({
              c_prod: cProd,
              x_prod: xProd,
              seq,
              total: totalCaixas,
              qr_payload: qrPayload,
            });
          }
        });

        return {
          chave_acesso: nf.chaveAcesso,
          numero_nf: nf.numeroNf,
          cnpj_emitente: nf.cnpjEmitente,
          razao_social_emitente: nf.razaoSocialEmitente,
          data_emissao: nf.dataEmissao || null,
          cnpj_destinatario: nf.cnpjDestinatario || null,
          dest_razao_social: nf.destinatario?.razaoSocial || null,
          dest_logradouro: nf.destinatario?.logradouro || null,
          dest_numero: nf.destinatario?.numero || null,
          dest_bairro: nf.destinatario?.bairro || null,
          dest_cidade: nf.destinatario?.cidade || null,
          dest_uf: nf.destinatario?.uf || null,
          dest_cep: nf.destinatario?.cep || null,
          peso_bruto: nf.pesoBruto || 0,
          peso_liquido: nf.pesoLiquido || 0,
          itens: nf.itens.map((item) => ({
            c_prod: item.cProd,
            x_prod: item.xProd,
            u_com: item.uCom,
            q_com: item.qCom,
          })),
          etiquetas,
        };
      });

      const payload = {
        carga: {
          motorista: sanitizeText(formData.motorista, 100),
          placa: formData.placa.toUpperCase().replace(/[^A-Z0-9]/g, ""),
          observacao: formData.observacao ? sanitizeText(formData.observacao, 500) : null,
          data: formData.data,
          import_batch_id: importBatchId,
        },
        nfs: nfsPayload,
      };

      // Call the atomic RPC
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "importar_carga_xml_lote",
        { payload }
      );

      if (rpcError) throw rpcError;

      // Type the result
      const result = rpcResult as {
        status: string;
        carga_id?: string;
        total_enviados?: number;
        importados?: number;
        ignorados_duplicidade?: number;
        duplicados?: { numero_nf: string; chave_acesso: string }[];
      };

      // Handle response
      if (result.status === "already_processed") {
        toast({
          title: "Importação já processada",
          description: "Esta mesma combinação de XMLs já foi importada anteriormente.",
        });
      } else if (result.status === "no_valid_nfs") {
        // Build list of duplicates
        const duplicados = result.duplicados || [];
        const nfsList = duplicados.map((d) => `NF ${d.numero_nf}`).join(", ");
        
        toast({
          variant: "destructive",
          title: "Nenhuma NF importada",
          description: `Todos os XMLs já foram importados anteriormente: ${nfsList}`,
        });
      } else {
        // Success - build summary message
        let description = `${result.importados} NF(s) importada(s).`;
        if ((result.ignorados_duplicidade || 0) > 0) {
          const duplicados = result.duplicados || [];
          const nfsList = duplicados.map((d) => `NF ${d.numero_nf}`).join(", ");
          description += ` ${result.ignorados_duplicidade} XML(s) ignorado(s) (já importados): ${nfsList}`;
        }

        toast({
          title: "Carga criada com sucesso!",
          description,
        });
      }

      // Reset form (even for already_processed to allow new attempt)
      setFormData({
        data: format(new Date(), "yyyy-MM-dd"),
        placa: "",
        motorista: "",
        observacao: "",
      });
      setParsedFiles([]);
      setDialogOpen(false);
      loadCargas();
    } catch (error: any) {
      console.error("Error creating carga:", error);
      toast({
        variant: "destructive",
        title: "Erro ao criar carga",
        description: error.message || "Tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  }

  // Simple hash function for batch id
  async function generateHash(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function handleStatusChange(cargaId: string, newStatus: "aberta" | "fechada") {
    try {
      const { error } = await supabase
        .from("cargas")
        .update({ status: newStatus })
        .eq("id", cargaId);

      if (error) throw error;

      setCargas((prev) =>
        prev.map((c) => (c.id === cargaId ? { ...c, status: newStatus } : c))
      );

      toast({
        title: "Status atualizado",
        description: `Carga ${newStatus === "fechada" ? "fechada" : "reaberta"} com sucesso.`,
      });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        variant: "destructive",
        title: "Erro ao atualizar status",
      });
    }
  }

  function handleDeleteClick(carga: Carga) {
    setCargaToDelete(carga);
    setDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!cargaToDelete) return;

    setDeleting(true);
    try {
      // CASCADE delete will automatically remove:
      // - notas_fiscais (and their itens_nf via cascade)
      // - etiquetas
      const { error } = await supabase
        .from("cargas")
        .delete()
        .eq("id", cargaToDelete.id);

      if (error) throw error;

      setCargas((prev) => prev.filter((c) => c.id !== cargaToDelete.id));

      toast({
        title: "Carga excluída",
        description: "A carga e todos os dados vinculados foram removidos com sucesso.",
      });
    } catch (error: any) {
      console.error("Error deleting carga:", error);
      toast({
        variant: "destructive",
        title: "Erro ao excluir carga",
        description: error.message || "Tente novamente.",
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setCargaToDelete(null);
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cargas</h1>
            <p className="text-muted-foreground">
              Gerencie as cargas e importe XMLs de NF-e
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Nova Carga
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nova Carga</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Carga info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="data">Data</Label>
                    <Input
                      id="data"
                      type="date"
                      value={formData.data}
                      onChange={(e) =>
                        setFormData({ ...formData, data: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="placa">Placa</Label>
                    <Input
                      id="placa"
                      placeholder="ABC-1234"
                      value={formData.placa}
                      onChange={(e) =>
                        setFormData({ ...formData, placa: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="motorista">Motorista</Label>
                  <Input
                    id="motorista"
                    placeholder="Nome do motorista"
                    value={formData.motorista}
                    onChange={(e) =>
                      setFormData({ ...formData, motorista: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacao">Observação (opcional)</Label>
                  <Textarea
                    id="observacao"
                    placeholder="Observações sobre a carga..."
                    value={formData.observacao}
                    onChange={(e) =>
                      setFormData({ ...formData, observacao: e.target.value })
                    }
                    rows={2}
                  />
                </div>

                {/* XML Upload */}
                <div className="space-y-2">
                  <Label>Arquivos XML (NF-e)</Label>
                  <XMLDropzone
                    onFilesProcessed={handleFilesProcessed}
                    processedFiles={parsedFiles}
                    onRemoveFile={handleRemoveFile}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      saving ||
                      parsedFiles.filter((f) => f.status === "success").length ===
                        0
                    }
                  >
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Criar Carga
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Table */}
        <div className="wms-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead className="text-center">NFs</TableHead>
                <TableHead className="text-center">Itens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : cargas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Truck className="w-10 h-10 text-muted-foreground/50" />
                      <p className="text-muted-foreground">
                        Nenhuma carga cadastrada
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                cargas.map((carga) => (
                  <TableRow key={carga.id} className="wms-table-row">
                    <TableCell className="font-medium">
                      {format(new Date(carga.data), "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="font-mono">{carga.placa}</TableCell>
                    <TableCell>{carga.motorista}</TableCell>
                    <TableCell className="text-center">
                      {carga._count?.nfs || 0}
                    </TableCell>
                    <TableCell className="text-center">
                      {carga._count?.itens || 0}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={carga.status}
                        onValueChange={(value: "aberta" | "fechada") =>
                          handleStatusChange(carga.id, value)
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aberta">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-primary" />
                              Aberta
                            </span>
                          </SelectItem>
                          <SelectItem value="fechada">
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                              Fechada
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/romaneio?carga=${carga.id}`}>
                          <Button variant="ghost" size="sm">
                            <FileText className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Link to={`/etiquetas?carga=${carga.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteClick(carga)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Tem certeza que deseja excluir a carga{" "}
                  <strong>{cargaToDelete?.placa}</strong> de{" "}
                  <strong>
                    {cargaToDelete &&
                      format(new Date(cargaToDelete.data), "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                  </strong>
                  ?
                </p>
                <p className="text-destructive font-medium">
                  Esta ação irá excluir permanentemente:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                  <li>A carga e suas informações</li>
                  <li>Todas as NFs vinculadas ({cargaToDelete?._count?.nfs || 0})</li>
                  <li>Todos os itens das NFs ({cargaToDelete?._count?.itens || 0})</li>
                  <li>Todas as etiquetas geradas</li>
                </ul>
                <p className="text-muted-foreground text-sm mt-2">
                  Esta ação não pode ser desfeita.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Excluir Carga
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
