import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { generateNotaDeCargaPDF, printBlob } from "@/lib/pdf-generator";
import { getMacroRegiao } from "@/lib/macro-regioes";
import { calculateBoxes } from "@/lib/xml-parser";
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
import { TipoCargaBadge, chocolateRowClass } from "@/components/TipoCargaBadge";

import { Plus, Truck, Loader2, FileText, Eye, Trash2, UserCheck, Printer, Package, AlertTriangle, FileUp, Box } from "lucide-react";
import { UploadCubagemDialog } from "@/components/cargas/UploadCubagemDialog";
import { AtualizarM3XmlDialog } from "@/components/cargas/AtualizarM3XmlDialog";
import { ImportarCteDialog } from "@/components/cargas/ImportarCteDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";

interface Carga {
  id: string;
  data: string;
  placa: string;
  motorista: string;
  observacao: string | null;
  status: "aberta" | "fechada" | "em_rota" | "entregue";
  operador_responsavel: string | null;
  tipo_carga?: string;
  created_at: string;
  _count?: {
    nfs: number;
    itens: number;
  };
  operadores_atribuidos?: string[];
}

interface Operador {
  id: string;
  full_name: string | null;
  email: string;
}

export default function Cargas() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTipoCarga, setDialogTipoCarga] = useState<"SECA" | "CHOCOLATE">("SECA");
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cargaToDelete, setCargaToDelete] = useState<Carga | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [printingCargaId, setPrintingCargaId] = useState<string | null>(null);
  const [cubagemCarga, setCubagemCarga] = useState<Carga | null>(null);
  const [m3XmlCarga, setM3XmlCarga] = useState<Carga | null>(null);
  const [cteCarga, setCteCarga] = useState<Carga | null>(null);
  const [filtroTipoCarga, setFiltroTipoCarga] = useState<string>("todos");

  async function handlePrintNotaCarga(carga: Carga) {
    setPrintingCargaId(carga.id);
    try {
      const { data: nfsData } = await supabase
        .from("notas_fiscais")
        .select(`
          id, numero_nf, razao_social_emitente, cnpj_emitente,
          cnpj_destinatario, dest_bairro, data_emissao,
          itens_nf(c_prod, x_prod, q_com)
        `)
        .eq("carga_id", carga.id)
        .order("numero_nf", { ascending: true });

      if (!nfsData || nfsData.length === 0) {
        toast({ title: "Sem NFs", description: "Nenhuma NF encontrada nesta carga.", variant: "destructive" });
        return;
      }

      const notasFiscaisPDF = nfsData.map((nf) => ({
        numeroNf: nf.numero_nf,
        razaoSocialEmitente: nf.razao_social_emitente,
        cnpjEmitente: nf.cnpj_emitente,
        cnpjDestinatario: nf.cnpj_destinatario || "",
        destBairro: nf.dest_bairro || undefined,
        macroRegiao: getMacroRegiao(nf.dest_bairro),
        dataEmissao: nf.data_emissao,
        itens: (nf.itens_nf || []).map((item: any) => ({
          cProd: item.c_prod,
          xProd: item.x_prod,
          qtdCaixas: calculateBoxes(Number(item.q_com)),
        })),
      }));

      notasFiscaisPDF.sort((a, b) => {
        const numA = parseInt(a.numeroNf.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.numeroNf.replace(/\D/g, '')) || 0;
        return numA - numB;
      });

      const blob = await generateNotaDeCargaPDF(
        { data: carga.data, placa: carga.placa, motorista: carga.motorista },
        notasFiscaisPDF
      );
      printBlob(blob);
    } catch (error) {
      console.error("Error printing nota de carga:", error);
      toast({ title: "Erro", description: "Erro ao gerar PDF da Nota de Carga.", variant: "destructive" });
    } finally {
      setPrintingCargaId(null);
    }
  }

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

  useEffect(() => {
    if (isAdmin) loadOperadores();
  }, [isAdmin]);

  async function loadOperadores() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name");
    setOperadores(data || []);
  }

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

      const cargaIds = (data || []).map((c) => c.id);
      let operadoresMap = new Map<string, string[]>();
      if (cargaIds.length > 0) {
        const { data: assignments } = await supabase
          .from("carga_operadores")
          .select("carga_id, operador_id")
          .in("carga_id", cargaIds);
        
        (assignments || []).forEach((a) => {
          const list = operadoresMap.get(a.carga_id) || [];
          list.push(a.operador_id);
          operadoresMap.set(a.carga_id, list);
        });
      }

      const cargasWithCounts = (data || []).map((carga) => ({
        ...carga,
        operadores_atribuidos: operadoresMap.get(carga.id) || [],
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

  function validatePlaca(placa: string): boolean {
    const cleanPlaca = placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return /^[A-Z]{3}[0-9]{4}$/.test(cleanPlaca) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(cleanPlaca);
  }

  function validateChaveAcesso(chave: string): boolean {
    const cleanChave = chave.replace(/\D/g, "");
    return cleanChave.length === 44;
  }

  function validateCNPJ(cnpj: string): boolean {
    if (!cnpj) return true;
    const cleanCnpj = cnpj.replace(/\D/g, "");
    return cleanCnpj.length === 14;
  }

  function sanitizeText(text: string, maxLength: number): string {
    return text.trim().slice(0, maxLength);
  }

  function openImportDialog(tipo: "SECA" | "CHOCOLATE") {
    setDialogTipoCarga(tipo);
    setFormData({
      data: format(new Date(), "yyyy-MM-dd"),
      placa: "",
      motorista: "",
      observacao: "",
    });
    setParsedFiles([]);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const successFiles = parsedFiles.filter((f) => f.status === "success");
    if (successFiles.length === 0) {
      toast({ variant: "destructive", title: "Nenhum XML válido", description: "Adicione pelo menos um arquivo XML válido." });
      return;
    }

    if (!validatePlaca(formData.placa)) {
      toast({ variant: "destructive", title: "Placa inválida", description: "Formato de placa inválido. Use ABC1234 ou ABC1D23." });
      return;
    }

    if (!formData.motorista.trim() || formData.motorista.length > 100) {
      toast({ variant: "destructive", title: "Nome do motorista inválido", description: "O nome do motorista é obrigatório e deve ter no máximo 100 caracteres." });
      return;
    }

    const invalidXmls = successFiles.filter((f) => !validateChaveAcesso(f.data.chaveAcesso));
    if (invalidXmls.length > 0) {
      toast({ variant: "destructive", title: "Chave de acesso inválida", description: `${invalidXmls.length} XML(s) com chave de acesso inválida (deve ter 44 dígitos).` });
      return;
    }

    const invalidCnpjs = successFiles.filter(
      (f) => !validateCNPJ(f.data.cnpjEmitente) || !validateCNPJ(f.data.cnpjDestinatario || "")
    );
    if (invalidCnpjs.length > 0) {
      toast({ variant: "destructive", title: "CNPJ inválido", description: `${invalidCnpjs.length} XML(s) com CNPJ inválido (deve ter 14 dígitos).` });
      return;
    }

    setSaving(true);
    try {
      const chavesAcesso = successFiles.map((f) => f.data.chaveAcesso).sort();
      const batchSource = `${chavesAcesso.join("|")}|${formData.data}|${Date.now()}`;
      const importBatchId = await generateHash(batchSource);

      const nfsPayload = successFiles.map((file) => {
        const nf = file.data;
        const groupedItems: Record<string, { xProd: string; qCom: number }> = {};
        nf.itens.forEach((item) => {
          if (groupedItems[item.cProd]) {
            groupedItems[item.cProd].qCom += item.qCom;
          } else {
            groupedItems[item.cProd] = { xProd: item.xProd, qCom: item.qCom };
          }
        });

        const etiquetas: { c_prod: string; x_prod: string; seq: number; total: number; qr_payload: string }[] = [];
        Object.entries(groupedItems).forEach(([cProd, { xProd, qCom }]) => {
          const totalCaixas = calculateBoxes(qCom);
          for (let seq = 1; seq <= totalCaixas; seq++) {
            const qrPayload = `{CARGA_ID};${nf.numeroNf};${cProd};${seq};${totalCaixas};${nf.chaveAcesso}`;
            etiquetas.push({ c_prod: cProd, x_prod: xProd, seq, total: totalCaixas, qr_payload: qrPayload });
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
          volume_m3: nf.volumeM3 || 0,
          itens: nf.itens.map((item) => ({ c_prod: item.cProd, x_prod: item.xProd, u_com: item.uCom, q_com: item.qCom })),
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
          tipo_carga: dialogTipoCarga,
        },
        nfs: nfsPayload,
      };

      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "importar_carga_xml_lote",
        { payload }
      );

      if (rpcError) throw rpcError;

      const result = rpcResult as {
        status: string;
        carga_id?: string;
        total_enviados?: number;
        importados?: number;
        ignorados_duplicidade?: number;
        duplicados?: { numero_nf: string; chave_acesso: string }[];
      };

      if (result.status === "already_processed") {
        toast({ title: "Importação já processada", description: "Esta mesma combinação de XMLs já foi importada anteriormente." });
      } else if (result.status === "no_valid_nfs") {
        const duplicados = result.duplicados || [];
        const nfsList = duplicados.map((d) => `NF ${d.numero_nf}`).join(", ");
        toast({ variant: "destructive", title: "Nenhuma NF importada", description: `Todos os XMLs já foram importados anteriormente: ${nfsList}` });
      } else {
        let description = `${result.importados} NF(s) importada(s).`;
        if ((result.ignorados_duplicidade || 0) > 0) {
          const duplicados = result.duplicados || [];
          const nfsList = duplicados.map((d) => `NF ${d.numero_nf}`).join(", ");
          description += ` ${result.ignorados_duplicidade} XML(s) ignorado(s) (já importados): ${nfsList}`;
        }
        if (dialogTipoCarga === "CHOCOLATE") {
          description += " [CHOCOLATE – TERMO SENSÍVEL]";
        }
        toast({ title: "Carga criada com sucesso!", description });
      }

      setFormData({ data: format(new Date(), "yyyy-MM-dd"), placa: "", motorista: "", observacao: "" });
      setParsedFiles([]);
      setDialogOpen(false);
      loadCargas();
    } catch (error: any) {
      console.error("Error creating carga:", error);
      toast({ variant: "destructive", title: "Erro ao criar carga", description: error.message || "Tente novamente." });
    } finally {
      setSaving(false);
    }
  }

  async function generateHash(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function handleStatusChange(cargaId: string, newStatus: "aberta" | "fechada" | "em_rota" | "entregue") {
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
      toast({ variant: "destructive", title: "Erro ao atualizar status" });
    }
  }

  async function handleToggleOperador(cargaId: string, operadorId: string) {
    const carga = cargas.find((c) => c.id === cargaId);
    const currentOps = carga?.operadores_atribuidos || [];
    const isAssigned = currentOps.includes(operadorId);

    try {
      if (isAssigned) {
        const { error } = await supabase
          .from("carga_operadores")
          .delete()
          .eq("carga_id", cargaId)
          .eq("operador_id", operadorId);
        if (error) throw error;

        setCargas((prev) =>
          prev.map((c) =>
            c.id === cargaId
              ? { ...c, operadores_atribuidos: currentOps.filter((id) => id !== operadorId) }
              : c
          )
        );
        const op = operadores.find((o) => o.id === operadorId);
        toast({ title: "Operador removido", description: `${op?.full_name || op?.email} removido da carga.` });
      } else {
        const { error } = await supabase
          .from("carga_operadores")
          .insert({ carga_id: cargaId, operador_id: operadorId });
        if (error) throw error;

        setCargas((prev) =>
          prev.map((c) =>
            c.id === cargaId
              ? { ...c, operadores_atribuidos: [...currentOps, operadorId] }
              : c
          )
        );
        const op = operadores.find((o) => o.id === operadorId);
        toast({ title: "Operador atribuído", description: `${op?.full_name || op?.email} atribuído à carga.` });
      }
    } catch (error) {
      console.error("Error toggling operador:", error);
      toast({ variant: "destructive", title: "Erro ao atribuir operador" });
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
      toast({ variant: "destructive", title: "Erro ao excluir carga", description: error.message || "Tente novamente." });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setCargaToDelete(null);
    }
  }

  const filteredCargas = cargas.filter((c) => {
    if (filtroTipoCarga === "todos") return true;
    return (c.tipo_carga || "SECA") === filtroTipoCarga;
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Cargas</h1>
            <p className="text-muted-foreground">
              Gerencie as cargas e importe XMLs de NF-e
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => openImportDialog("SECA")}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Carga (Seca)
            </Button>
            <Button
              variant="destructive"
              onClick={() => openImportDialog("CHOCOLATE")}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Nova Carga (Chocolate)
            </Button>
          </div>
        </div>

        {/* Filtro tipo carga */}
        <div className="flex items-center gap-3">
          <Label className="text-sm">Tipo de Carga:</Label>
          <Select value={filtroTipoCarga} onValueChange={setFiltroTipoCarga}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="SECA">Apenas Seca</SelectItem>
              <SelectItem value="CHOCOLATE">Apenas Chocolate</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Import Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {dialogTipoCarga === "CHOCOLATE" ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span>Nova Carga – CHOCOLATE (Termo Sensível)</span>
                  </>
                ) : (
                  <span>Nova Carga (Seca)</span>
                )}
              </DialogTitle>
            </DialogHeader>

            {dialogTipoCarga === "CHOCOLATE" && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm dark:bg-red-950/30 dark:border-red-800 dark:text-red-300">
                <strong>⚠ ATENÇÃO:</strong> Todos os XMLs importados por este fluxo serão marcados como <strong>CHOCOLATE – TERMO SENSÍVEL</strong> e destacados em vermelho em todas as telas do sistema.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="data">Data</Label>
                  <Input
                    id="data"
                    type="date"
                    value={formData.data}
                    onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="placa">Placa</Label>
                  <Input
                    id="placa"
                    placeholder="ABC-1234"
                    value={formData.placa}
                    onChange={(e) => setFormData({ ...formData, placa: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, motorista: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacao">Observação (opcional)</Label>
                <Textarea
                  id="observacao"
                  placeholder="Observações sobre a carga..."
                  value={formData.observacao}
                  onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Arquivos XML (NF-e)</Label>
                <XMLDropzone
                  onFilesProcessed={handleFilesProcessed}
                  processedFiles={parsedFiles}
                  onRemoveFile={handleRemoveFile}
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant={dialogTipoCarga === "CHOCOLATE" ? "destructive" : "default"}
                  disabled={saving || parsedFiles.filter((f) => f.status === "success").length === 0}
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {dialogTipoCarga === "CHOCOLATE" ? "Criar Carga (Chocolate)" : "Criar Carga"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Table */}
        <div className="wms-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">NFs</TableHead>
                <TableHead className="text-center">Itens</TableHead>
                {isAdmin && <TableHead>Operador</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredCargas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Truck className="w-10 h-10 text-muted-foreground/50" />
                      <p className="text-muted-foreground">
                        Nenhuma carga cadastrada
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCargas.map((carga) => (
                  <TableRow key={carga.id} className={`wms-table-row ${chocolateRowClass(carga.tipo_carga)}`}>
                    <TableCell className="font-medium">
                      {format(new Date(carga.data), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-mono">{carga.placa}</TableCell>
                    <TableCell>{carga.motorista}</TableCell>
                    <TableCell>
                      <TipoCargaBadge tipoCarga={carga.tipo_carga} size="md" />
                      {(!carga.tipo_carga || carga.tipo_carga === "SECA") && (
                        <span className="text-xs text-muted-foreground">Seca</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{carga._count?.nfs || 0}</TableCell>
                    <TableCell className="text-center">{carga._count?.itens || 0}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="w-40 justify-start text-xs">
                              <UserCheck className="w-3 h-3 mr-1 shrink-0" />
                              {(carga.operadores_atribuidos || []).length > 0
                                ? `${(carga.operadores_atribuidos || []).length} operador(es)`
                                : <span className="text-muted-foreground">Sem operador</span>
                              }
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" align="start">
                            <div className="space-y-1 max-h-48 overflow-auto">
                              {operadores.map((op) => {
                                const isChecked = (carga.operadores_atribuidos || []).includes(op.id);
                                return (
                                  <label
                                    key={op.id}
                                    className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                                  >
                                    <Checkbox
                                      checked={isChecked}
                                      onCheckedChange={() => handleToggleOperador(carga.id, op.id)}
                                    />
                                    <span className="truncate">{op.full_name || op.email}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    )}
                    <TableCell>
                      <Select
                        value={carga.status}
                        onValueChange={(value: "aberta" | "fechada" | "em_rota" | "entregue") =>
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
                        <Button variant="ghost" size="sm" onClick={() => handlePrintNotaCarga(carga)} disabled={printingCargaId === carga.id} title="Imprimir Nota de Carga">
                          {printingCargaId === carga.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCteCarga(carga)} title="Importar CT-es">
                          <FileUp className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCubagemCarga(carga)} title="Importar Cubagem (Excel)">
                          <Package className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setM3XmlCarga(carga)} title="Atualizar m³ via XML">
                          <Box className="w-4 h-4" />
                        </Button>
                        <Link to={`/romaneio?carga=${carga.id}`}>
                          <Button variant="ghost" size="sm"><FileText className="w-4 h-4" /></Button>
                        </Link>
                        <Link to={`/etiquetas?carga=${carga.id}`}>
                          <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
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
                      format(new Date(cargaToDelete.data), "dd/MM/yyyy", { locale: ptBR })}
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

        {/* Upload Cubagem Dialog */}
        {cubagemCarga && (
          <UploadCubagemDialog
            open={!!cubagemCarga}
            onOpenChange={(open) => !open && setCubagemCarga(null)}
            cargaId={cubagemCarga.id}
            cargaPlaca={cubagemCarga.placa}
          />
        )}
        {/* Atualizar m³ via XML Dialog */}
        {m3XmlCarga && (
          <AtualizarM3XmlDialog
            open={!!m3XmlCarga}
            onOpenChange={(open) => !open && setM3XmlCarga(null)}
            cargaId={m3XmlCarga.id}
            cargaPlaca={m3XmlCarga.placa}
            onUpdated={loadCargas}
          />
        )}
        {/* Import CT-e Dialog */}
        {cteCarga && (
          <ImportarCteDialog
            open={!!cteCarga}
            onOpenChange={(open) => !open && setCteCarga(null)}
            cargaId={cteCarga.id}
            cargaPlaca={cteCarga.placa}
            onSuccess={loadCargas}
          />
        )}
      </div>
    </MainLayout>
  );
}
