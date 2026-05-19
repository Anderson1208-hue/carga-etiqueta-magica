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
  linhasLidas: number;
}

// "Nr Nota: 0051505   Cubagem: 5,18"
const LINE_REGEX = /Nr\s*Nota:\s*0*(\d+).*?Cubagem:\s*([\d.,]+)/i;

function stripLeadingZeros(s: string) {
  return s.replace(/^0+/, "") || "0";
}

export function AtualizarM3TxtDocileDialog({
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
      linhasLidas: 0,
    };

    const { data: nfsCarga, error: errCarga } = await supabase
      .from("notas_fiscais")
      .select("id, numero_nf")
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

    // mapa: numero_nf normalizado (sem zeros à esquerda) -> id
    const mapaNfs = new Map<string, string>();
    for (const n of nfsCarga || []) {
      mapaNfs.set(stripLeadingZeros(String(n.numero_nf)), n.id);
    }

    // Evita duplicar update da mesma NF entre arquivos
    const jaAtualizadas = new Set<string>();

    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".txt")) continue;

      try {
        const content = await file.text();
        const linhas = content.split(/\r?\n/);

        for (const linha of linhas) {
          const m = linha.match(LINE_REGEX);
          if (!m) continue;
          r.linhasLidas++;

          const numeroNf = stripLeadingZeros(m[1]);
          const cubagemStr = m[2].replace(/\./g, "").replace(",", ".");
          const volumeM3 = parseFloat(cubagemStr);

          if (!volumeM3 || volumeM3 <= 0) {
            r.semM3++;
            continue;
          }

          const nfId = mapaNfs.get(numeroNf);
          if (!nfId) {
            r.naoEncontradas++;
            if (r.detalhesNaoEncontradas.length < 5) {
              r.detalhesNaoEncontradas.push(`NF ${numeroNf}`);
            }
            continue;
          }

          if (jaAtualizadas.has(nfId)) continue;

          const { error: errUpd } = await supabase
            .from("notas_fiscais")
            .update({ volume_m3: volumeM3 })
            .eq("id", nfId);

          if (errUpd) {
            r.erros++;
          } else {
            r.atualizadas++;
            jaAtualizadas.add(nfId);
          }
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
          <DialogTitle>Atualizar m³ via TXT Docile — {cargaPlaca}</DialogTitle>
          <DialogDescription>
            Selecione o(s) arquivo(s) TXT do embarcador Docile (Resumo de
            Pré-Faturamento). Apenas o m³ das NFs já existentes nesta carga
            será atualizado. Nenhuma NF será criada ou duplicada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label
            htmlFor="m3-txt-docile-input"
            className="wms-dropzone cursor-pointer block"
          >
            <input
              id="m3-txt-docile-input"
              type="file"
              multiple
              accept=".txt"
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
                  ? "Processando TXT..."
                  : "Clique ou arraste TXTs Docile"}
              </p>
              <p className="text-xs text-muted-foreground">
                Formato esperado: "Nr Nota: NNNNNNN   Cubagem: X,XX"
              </p>
            </div>
          </label>

          {resultado && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>
                  <strong>{resultado.atualizadas}</strong> NF(s)
                  atualizada(s) com m³ ({resultado.linhasLidas} linha(s) lida(s))
                </span>
              </div>
              {resultado.semM3 > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertCircle className="w-4 h-4" />
                  <span>{resultado.semM3} linha(s) sem cubagem válida</span>
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
