import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { calculateBoxes } from "@/lib/xml-parser";
import { XMLDropzone, ParsedFile } from "@/components/XMLDropzone";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImportarXmlCargaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargaId: string;
  cargaPlaca: string;
  onSuccess: () => void;
}

export function ImportarXmlCargaDialog({
  open,
  onOpenChange,
  cargaId,
  cargaPlaca,
  onSuccess,
}: ImportarXmlCargaDialogProps) {
  const { toast } = useToast();
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [saving, setSaving] = useState(false);

  function handleFilesProcessed(newFiles: ParsedFile[]) {
    setParsedFiles((prev) => [...prev, ...newFiles]);
  }

  function handleRemoveFile(index: number) {
    setParsedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleClose(openState: boolean) {
    if (!openState) {
      setParsedFiles([]);
    }
    onOpenChange(openState);
  }

  async function handleSubmit() {
    if (saving) return;

    const successFiles = parsedFiles.filter((f) => f.status === "success");
    if (successFiles.length === 0) {
      toast({ variant: "destructive", title: "Nenhum XML válido", description: "Adicione pelo menos um arquivo XML válido." });
      return;
    }

    setSaving(true);
    try {
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
          itens: nf.itens.map((item) => ({ c_prod: item.cProd, x_prod: item.xProd, u_com: item.uCom, q_com: item.qCom })),
          etiquetas,
        };
      });

      const payload = { carga_id: cargaId, nfs: nfsPayload };

      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "adicionar_nfs_carga" as any,
        { payload }
      );

      if (rpcError) throw rpcError;

      const result = rpcResult as any;

      if (result.status === "error") {
        toast({ variant: "destructive", title: "Erro", description: result.message });
      } else if (result.status === "no_valid_nfs") {
        const duplicados = result.duplicados || [];
        const nfsList = duplicados.map((d: any) => `NF ${d.numero_nf}`).join(", ");
        toast({ variant: "destructive", title: "Nenhuma NF importada", description: `Todos os XMLs já existem: ${nfsList}` });
      } else {
        let description = `${result.importados} NF(s) adicionada(s) à carga ${cargaPlaca}.`;
        if ((result.ignorados_duplicidade || 0) > 0) {
          const duplicados = result.duplicados || [];
          const nfsList = duplicados.map((d: any) => `NF ${d.numero_nf}`).join(", ");
          description += ` ${result.ignorados_duplicidade} ignorada(s) (duplicada): ${nfsList}`;
        }
        toast({ title: "XMLs importados!", description });
        handleClose(false);
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error adding NFs:", error);
      toast({ variant: "destructive", title: "Erro ao importar XMLs", description: error.message || "Tente novamente." });
    } finally {
      setSaving(false);
    }
  }

  const successCount = parsedFiles.filter((f) => f.status === "success").length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar XMLs na Carga {cargaPlaca}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <XMLDropzone
            onFilesProcessed={handleFilesProcessed}
            processedFiles={parsedFiles}
            onRemoveFile={handleRemoveFile}
          />

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving || successCount === 0}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Adicionar {successCount} NF(s)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
