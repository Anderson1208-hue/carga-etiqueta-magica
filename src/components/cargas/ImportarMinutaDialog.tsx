import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MinutaParsed {
  numeroMinuta: string;
  chaveCte: string;
  numeroNfReferenciada: string;
  chaveNfReferenciada: string;
  cnpjEmitente: string;
  razaoSocialEmitente: string;
  valorFrete: number;
}

interface ParsedMinutaFile {
  fileName: string;
  data: MinutaParsed | null;
  status: "success" | "error" | "warning";
  error?: string;
  nfNumero?: string;
  nfId?: string;
}

interface ImportarMinutaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargaId: string;
  cargaPlaca: string;
  onSuccess: () => void;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Normaliza um número (NF ou minuta) removendo zeros à esquerda e não-dígitos
function normalizaNumero(s: string | undefined | null): string {
  return String(s || "").replace(/\D/g, "").replace(/^0+/, "");
}

// Gera um identificador único para a minuta quando não há chave de CT-e real (44 dígitos).
// Formato: MIN-{cnpj}-{numero} (cabe em chave_cte text + UNIQUE).
function buildMinutaId(parsed: MinutaParsed): string {
  if (parsed.chaveCte && parsed.chaveCte.length === 44) return parsed.chaveCte;
  const cnpj = parsed.cnpjEmitente || "SEMCNPJ";
  return `MIN-${cnpj}-${parsed.numeroMinuta}`;
}

export function ImportarMinutaDialog({
  open,
  onOpenChange,
  cargaId,
  cargaPlaca,
  onSuccess,
}: ImportarMinutaDialogProps) {
  const { toast } = useToast();
  const [parsedFiles, setParsedFiles] = useState<ParsedMinutaFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  // Mapeia número de NF normalizado -> {id, numero_nf}
  const [nfsByNumero, setNfsByNumero] = useState<Map<string, { id: string; numero_nf: string }>>(new Map());
  // Mapeia chave de acesso -> {id, numero_nf} (fallback)
  const [nfsByChave, setNfsByChave] = useState<Map<string, { id: string; numero_nf: string }>>(new Map());
  const [nfsLoaded, setNfsLoaded] = useState(false);

  async function loadNfs() {
    if (nfsLoaded) return;
    const { data } = await supabase
      .from("notas_fiscais")
      .select("id, chave_acesso, numero_nf")
      .eq("carga_id", cargaId);
    const byNumero = new Map<string, { id: string; numero_nf: string }>();
    const byChave = new Map<string, { id: string; numero_nf: string }>();
    (data || []).forEach((nf) => {
      byChave.set(nf.chave_acesso, { id: nf.id, numero_nf: nf.numero_nf });
      const numNorm = normalizaNumero(nf.numero_nf);
      if (numNorm) byNumero.set(numNorm, { id: nf.id, numero_nf: nf.numero_nf });
    });
    setNfsByNumero(byNumero);
    setNfsByChave(byChave);
    setNfsLoaded(true);
  }

  if (open && !nfsLoaded) loadNfs();

  const processFiles = useCallback(
    async (files: FileList) => {
      setIsProcessing(true);
      const newFiles: ParsedMinutaFile[] = [];

      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".pdf")) {
          newFiles.push({ fileName: file.name, data: null, status: "error", error: "Arquivo não é PDF" });
          continue;
        }
        if (file.size > 8 * 1024 * 1024) {
          newFiles.push({ fileName: file.name, data: null, status: "error", error: "Arquivo > 8MB" });
          continue;
        }

        try {
          const base64 = await fileToBase64(file);
          const { data: resp, error } = await supabase.functions.invoke("parse-minuta-pdf", {
            body: { pdfBase64: base64, fileName: file.name },
          });
          if (error) throw error;
          if (resp?.error) throw new Error(resp.error);

          const parsed: MinutaParsed = resp.data;
          const warnings: string[] = resp.warnings || [];

          if (warnings.length > 0) {
            newFiles.push({
              fileName: file.name,
              data: parsed,
              status: "error",
              error: "Dados incompletos: " + warnings.join("; "),
            });
            continue;
          }

          // Duplicate check no buffer atual (mesma minuta no mesmo upload)
          const minutaId = buildMinutaId(parsed);
          if (parsedFiles.some((pf) => pf.data && buildMinutaId(pf.data) === minutaId)) {
            newFiles.push({ fileName: file.name, data: parsed, status: "error", error: "Minuta já adicionada na lista" });
            continue;
          }

          // Casa NF: primeiro tenta por chave (se houver), depois por número
          let nfMatch = parsed.chaveNfReferenciada
            ? nfsByChave.get(parsed.chaveNfReferenciada)
            : undefined;
          if (!nfMatch) {
            nfMatch = nfsByNumero.get(normalizaNumero(parsed.numeroNfReferenciada));
          }

          if (!nfMatch) {
            newFiles.push({
              fileName: file.name,
              data: parsed,
              status: "error",
              error: `NF ${parsed.numeroNfReferenciada} não encontrada nesta carga`,
            });
            continue;
          }

          newFiles.push({
            fileName: file.name,
            data: parsed,
            status: "success",
            nfNumero: nfMatch.numero_nf,
            nfId: nfMatch.id,
          });
        } catch (error) {
          newFiles.push({
            fileName: file.name,
            data: null,
            status: "error",
            error: error instanceof Error ? error.message : "Erro ao processar",
          });
        }
      }

      setParsedFiles((prev) => [...prev, ...newFiles]);
      setIsProcessing(false);
    },
    [parsedFiles, nfsByNumero, nfsByChave]
  );

  function handleRemoveFile(index: number) {
    setParsedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleClose(openState: boolean) {
    if (!openState) {
      setParsedFiles([]);
      setNfsLoaded(false);
      setNfsByNumero(new Map());
      setNfsByChave(new Map());
    }
    onOpenChange(openState);
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) processFiles(e.target.files);
    },
    [processFiles]
  );

  async function handleSubmit() {
    if (saving) return;
    const successFiles = parsedFiles.filter((f) => f.status === "success");
    if (successFiles.length === 0) {
      toast({ variant: "destructive", title: "Nenhuma minuta válida" });
      return;
    }

    setSaving(true);
    try {
      const inserts = successFiles.map((file) => {
        const m = file.data!;
        return {
          carga_id: cargaId,
          nf_id: file.nfId || null,
          chave_cte: buildMinutaId(m),
          numero_cte: m.numeroMinuta,
          chave_nf_referenciada: m.chaveNfReferenciada || null,
          cnpj_emitente: m.cnpjEmitente,
          razao_social_emitente: m.razaoSocialEmitente,
          valor_frete: m.valorFrete,
        };
      });

      const { error } = await supabase.from("ctes" as any).insert(inserts as any);

      if (error) {
        if (error.message?.includes("duplicate key")) {
          toast({ variant: "destructive", title: "Minuta duplicada", description: "Uma ou mais minutas já foram importadas." });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Minutas importadas!",
          description: `${successFiles.length} minuta(s) vinculada(s) à carga ${cargaPlaca}.`,
        });
        handleClose(false);
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error importing minutas:", error);
      toast({ variant: "destructive", title: "Erro ao importar minutas", description: error.message || "Tente novamente." });
    } finally {
      setSaving(false);
    }
  }

  const successFiles = parsedFiles.filter((f) => f.status === "success");
  const errorFiles = parsedFiles.filter((f) => f.status === "error");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Minutas (PDF) — Carga {cargaPlaca}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 border rounded-lg p-3 text-xs text-muted-foreground">
            Os dados de cada minuta são extraídos automaticamente do PDF (número da minuta, transportadora, valor do frete e NF referenciada). A minuta é vinculada à NF correspondente nesta carga pelo <strong>número da NF</strong>.
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragActive(false); }}
            className={cn(
              "wms-dropzone",
              isDragActive && "wms-dropzone-active",
              isProcessing && "opacity-50 pointer-events-none"
            )}
          >
            <input
              type="file"
              multiple
              accept=".pdf,application/pdf"
              onChange={handleFileInput}
              className="hidden"
              id="minuta-pdf-input"
              disabled={isProcessing}
            />
            <label htmlFor="minuta-pdf-input" className="cursor-pointer">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  {isProcessing ? (
                    <Loader2 className="w-7 h-7 text-primary animate-spin" />
                  ) : (
                    <Upload className="w-7 h-7 text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {isProcessing ? "Extraindo dados via IA..." : "Arraste PDFs de Minuta ou clique para selecionar"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Suporta múltiplos arquivos • Máx. 8MB por arquivo
                  </p>
                </div>
              </div>
            </label>
          </div>

          {parsedFiles.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm">
                Processados ({successFiles.length} sucesso
                {errorFiles.length > 0 && `, ${errorFiles.length} erro(s)`})
              </h4>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {parsedFiles.map((file, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border",
                      file.status === "success"
                        ? "bg-success/5 border-success/20"
                        : "bg-destructive/5 border-destructive/20"
                    )}
                  >
                    {file.status === "success" ? (
                      <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">{file.fileName}</span>
                      </div>
                      {file.status === "success" ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Minuta {file.data?.numeroMinuta} → NF {file.nfNumero} • {file.data?.razaoSocialEmitente} • R$ {file.data?.valorFrete.toFixed(2)}
                        </p>
                      ) : (
                        <p className="text-xs text-destructive mt-0.5">{file.error}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => handleRemoveFile(index)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving || successFiles.length === 0}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Vincular {successFiles.length} Minuta(s)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
