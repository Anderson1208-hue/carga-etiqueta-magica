import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { XMLDropzone, ParsedFile } from "@/components/XMLDropzone";
import { calculateBoxes } from "@/lib/xml-parser";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargaId: string;
  cargaPlaca: string;
  onAdded?: () => void;
}

export function AdicionarXmlDialog({
  open,
  onOpenChange,
  cargaId,
  cargaPlaca,
  onAdded,
}: Props) {
  const { toast } = useToast();
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [saving, setSaving] = useState(false);

  function handleFilesProcessed(newFiles: ParsedFile[]) {
    setFiles((prev) => [...prev, ...newFiles]);
  }

  function handleRemoveFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function reset() {
    setFiles([]);
  }

  async function handleSave() {
    const valid = files.filter((f) => f.status === "success");
    if (valid.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhum XML válido",
        description: "Adicione ao menos um XML válido para incluir na carga.",
      });
      return;
    }

    setSaving(true);
    try {
      const nfs = valid.map((f) => {
        const d = f.data;
        const etiquetas: Array<{
          c_prod: string;
          x_prod: string;
          seq: number;
          total: number;
          qr_payload: string;
        }> = [];

        // 1 unidade = 1 caixa, agrupado por cProd (mantém regra global)
        const grouped = new Map<
          string,
          { c_prod: string; x_prod: string; total: number }
        >();
        d.itens.forEach((it) => {
          const total = calculateBoxes(it.qCom);
          const existing = grouped.get(it.cProd);
          if (existing) {
            existing.total += total;
          } else {
            grouped.set(it.cProd, {
              c_prod: it.cProd,
              x_prod: it.xProd,
              total,
            });
          }
        });

        grouped.forEach((g) => {
          for (let i = 1; i <= g.total; i++) {
            etiquetas.push({
              c_prod: g.c_prod,
              x_prod: g.x_prod,
              seq: i,
              total: g.total,
              qr_payload: `{CARGA_ID}|${d.chaveAcesso}|${g.c_prod}|${i}/${g.total}`,
            });
          }
        });

        return {
          chave_acesso: d.chaveAcesso,
          numero_nf: d.numeroNf,
          cnpj_emitente: d.cnpjEmitente,
          razao_social_emitente: d.razaoSocialEmitente,
          data_emissao: d.dataEmissao,
          cnpj_destinatario: d.cnpjDestinatario,
          dest_razao_social: d.destinatario?.razaoSocial ?? null,
          dest_logradouro: d.destinatario?.logradouro ?? null,
          dest_numero: d.destinatario?.numero ?? null,
          dest_bairro: d.destinatario?.bairro ?? null,
          dest_cidade: d.destinatario?.cidade ?? null,
          dest_uf: d.destinatario?.uf ?? null,
          dest_cep: d.destinatario?.cep ?? null,
          peso_bruto: d.pesoBruto,
          peso_liquido: d.pesoLiquido,
          volume_m3: d.volumeM3,
          itens: d.itens.map((it) => ({
            c_prod: it.cProd,
            x_prod: it.xProd,
            u_com: it.uCom,
            q_com: it.qCom,
          })),
          etiquetas,
        };
      });

      const { data, error } = await supabase.rpc("adicionar_nfs_carga", {
        payload: { carga_id: cargaId, nfs },
      });

      if (error) throw error;

      const result = data as {
        status: string;
        importados?: number;
        atualizados?: number;
        ignorados_duplicidade?: number;
        message?: string;
      };

      if (result.status === "error") {
        throw new Error(result.message || "Erro ao adicionar NFs");
      }

      toast({
        title: "NFs processadas",
        description: `${result.importados ?? 0} adicionada(s), ${
          result.atualizados ?? 0
        } atualizada(s), ${result.ignorados_duplicidade ?? 0} duplicada(s).`,
      });

      reset();
      onAdded?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro ao adicionar XMLs",
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar XML — {cargaPlaca}</DialogTitle>
          <DialogDescription>
            Selecione XMLs de NF-e para incluir nesta carga existente. NFs já
            cadastradas em qualquer carga serão ignoradas (chave duplicada).
          </DialogDescription>
        </DialogHeader>

        <XMLDropzone
          processedFiles={files}
          onFilesProcessed={handleFilesProcessed}
          onRemoveFile={handleRemoveFile}
        />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              saving || files.filter((f) => f.status === "success").length === 0
            }
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Adicionar à carga
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
