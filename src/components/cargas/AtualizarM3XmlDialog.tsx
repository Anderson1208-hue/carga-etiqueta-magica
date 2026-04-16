import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { parseNFeVolumeXML } from "@/lib/xml-volume-parser";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargaId: string;
  cargaPlaca: string;
  onUpdated?: () => void;
}

interface Resultado {
  atualizadas: number;
  semM3: number;
  naoEncontradas: number;
  erros: number;
  detalhesNaoEncontradas: string[];
}

function normalizeAccessKey(value: string) {
  return value.replace(/\D/g, "");
}

export function AtualizarM3XmlDialog({
  open,
  onOpenChange,
  cargaId,
  cargaPlaca,
  onUpdated,
}: Props) {
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function handleFiles(files: FileList) {
    setProcessing(true);
    setResultado(null);

    const r: Resultado = {
      atualizadas: 0,
      semM3: 0,
      naoEncontradas: 0,
      erros: 0,
      detalhesNaoEncontradas: [],
    };

    // Carrega chaves da carga atual para validar pertencimento
    const { data: nfsCarga, error: errCarga } = await supabase
      .from("notas_fiscais")
      .select("id, chave_acesso, numero_nf")
      .eq("carga_id", cargaId);

    if (errCarga) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar NFs da carga",
        description: errCarga.message,
      });
      setProcessing(false);
      return;
    }

    const chavesValidas = new Map(
      (nfsCarga || []).map((n) => [normalizeAccessKey(n.chave_acesso), n])
    );

    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".xml")) continue;

      try {
        const content = await file.text();
        const parsed = parseNFeVolumeXML(content);
        const chaveNormalizada = normalizeAccessKey(parsed.chaveAcesso);

        // Debug: ajuda a entender por que algumas NFs ficam sem m³
        console.log("[AtualizarM3] XML:", {
          arquivo: file.name,
          numeroNf: parsed.numeroNf,
          chaveAcesso: parsed.chaveAcesso,
          emitente: parsed.fornecedor,
          volumeM3: parsed.volumeM3,
          chaveBate: chavesValidas.has(chaveNormalizada),
        });

        if (!parsed.volumeM3 || parsed.volumeM3 <= 0) {
          r.semM3++;
          continue;
        }

        const nfRef = chavesValidas.get(chaveNormalizada);
        if (!nfRef) {
          r.naoEncontradas++;
          if (r.detalhesNaoEncontradas.length < 5) {
            r.detalhesNaoEncontradas.push(`NF ${parsed.numeroNf}`);
          }
          continue;
        }

        const { error: errUpd } = await supabase
          .from("notas_fiscais")
          .update({ volume_m3: parsed.volumeM3 })
          .eq("id", nfRef.id);

        if (errUpd) {
          r.erros++;
        } else {
          r.atualizadas++;
        }
      } catch {
        r.erros++;
      }
    }

    setResultado(r);
    setProcessing(false);

    if (r.atualizadas > 0) {
      toast({
        title: "m³ atualizado",
        description: `${r.atualizadas} NF(s) atualizada(s) com sucesso.`,
      });
      onUpdated?.();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atualizar m³ via XML — {cargaPlaca}</DialogTitle>
          <DialogDescription>
            Selecione os arquivos XML originais. O sistema vai apenas
            atualizar a metragem cúbica das NFs já existentes desta carga.
            Nenhuma NF será duplicada ou criada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label
            htmlFor="m3-xml-input"
            className="wms-dropzone cursor-pointer block"
          >
            <input
              id="m3-xml-input"
              type="file"
              multiple
              accept=".xml"
              className="hidden"
              disabled={processing}
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex flex-col items-center gap-2 py-4">
              {processing ? (
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-primary" />
              )}
              <p className="font-medium">
                {processing
                  ? "Processando XMLs..."
                  : "Clique ou arraste XMLs"}
              </p>
              <p className="text-xs text-muted-foreground">
                Apenas o m³ será atualizado nas NFs desta carga
              </p>
            </div>
          </label>

          {resultado && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>
                  <strong>{resultado.atualizadas}</strong> NF(s)
                  atualizada(s) com m³
                </span>
              </div>
              {resultado.semM3 > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  <span>
                    {resultado.semM3} XML(s) sem informação de m³
                  </span>
                </div>
              )}
              {resultado.naoEncontradas > 0 && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <span>
                    {resultado.naoEncontradas} NF(s) não pertencem a esta
                    carga
                    {resultado.detalhesNaoEncontradas.length > 0 &&
                      ` (${resultado.detalhesNaoEncontradas.join(", ")}${
                        resultado.naoEncontradas >
                        resultado.detalhesNaoEncontradas.length
                          ? "..."
                          : ""
                      })`}
                  </span>
                </div>
              )}
              {resultado.erros > 0 && (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  <span>{resultado.erros} erro(s) ao processar</span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={processing}
            >
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
