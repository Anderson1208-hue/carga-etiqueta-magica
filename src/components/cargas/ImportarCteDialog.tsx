import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseCTeXML, CTeParsed } from "@/lib/cte-parser";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, FileCode, CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ParsedCTeFile {
  fileName: string;
  data: CTeParsed | null;
  status: "success" | "error";
  error?: string;
  nfMatches?: Array<{ id: string; numero_nf: string; chave: string; valor_nf: number | null; razao: string }>;
  nfsNaoEncontradas?: string[]; // chaves não encontradas na carga
}

interface ImportarCteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargaId: string;
  cargaPlaca: string;
  onSuccess: () => void;
}

export function ImportarCteDialog({
  open,
  onOpenChange,
  cargaId,
  cargaPlaca,
  onSuccess,
}: ImportarCteDialogProps) {
  const { toast } = useToast();
  const [parsedFiles, setParsedFiles] = useState<ParsedCTeFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  // Fetch NFs for this carga to match chave_acesso
  const [nfsMap, setNfsMap] = useState<Map<string, { id: string; numero_nf: string; razao_social_emitente: string; valor_nf: number | null }>>(new Map());
  const [nfsLoaded, setNfsLoaded] = useState(false);

  async function loadNfs() {
    if (nfsLoaded) return;
    const { data } = await supabase
      .from("notas_fiscais")
      .select("id, chave_acesso, numero_nf, razao_social_emitente, valor_nf")
      .eq("carga_id", cargaId);

    const map = new Map<string, { id: string; numero_nf: string; razao_social_emitente: string; valor_nf: number | null }>();
    (data || []).forEach((nf) => {
      map.set(nf.chave_acesso, { id: nf.id, numero_nf: nf.numero_nf, razao_social_emitente: nf.razao_social_emitente || "", valor_nf: nf.valor_nf as any });
    });
    setNfsMap(map);
    setNfsLoaded(true);
  }

  // Load NFs when dialog opens
  if (open && !nfsLoaded) {
    loadNfs();
  }

  const processFiles = useCallback(
    async (files: FileList) => {
      setIsProcessing(true);
      const newFiles: ParsedCTeFile[] = [];

      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".xml")) {
          newFiles.push({ fileName: file.name, data: null, status: "error", error: "Arquivo não é XML" });
          continue;
        }

        try {
          const content = await file.text();
          const parsed = parseCTeXML(content);

          // Check duplicate
          const alreadyAdded = parsedFiles.some(
            (pf) => pf.data?.chaveCte === parsed.chaveCte
          );
          if (alreadyAdded) {
            newFiles.push({ fileName: file.name, data: parsed, status: "error", error: "CT-e já adicionado (chave duplicada)" });
            continue;
          }

          // Match all referenced NFs in this carga
          const matches: NonNullable<ParsedCTeFile["nfMatches"]> = [];
          const naoEncontradas: string[] = [];
          for (const chave of parsed.chavesNfReferenciadas) {
            const m = nfsMap.get(chave);
            if (m) {
              matches.push({ id: m.id, numero_nf: m.numero_nf, chave, valor_nf: m.valor_nf, razao: m.razao_social_emitente });
            } else {
              naoEncontradas.push(chave);
            }
          }

          if (matches.length === 0) {
            newFiles.push({
              fileName: file.name,
              data: parsed,
              status: "error",
              error: `Nenhuma NF referenciada encontrada nesta carga (${parsed.chavesNfReferenciadas.length} NF(s) no CT-e)`,
              nfsNaoEncontradas: naoEncontradas,
            });
            continue;
          }

          newFiles.push({
            fileName: file.name,
            data: parsed,
            status: "success",
            nfMatches: matches,
            nfsNaoEncontradas: naoEncontradas,
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
    [parsedFiles, nfsMap]
  );

  function handleRemoveFile(index: number) {
    setParsedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleClose(openState: boolean) {
    if (!openState) {
      setParsedFiles([]);
      setNfsLoaded(false);
      setNfsMap(new Map());
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
      toast({ variant: "destructive", title: "Nenhum CT-e válido" });
      return;
    }

    setSaving(true);
    try {
      const inserts: any[] = [];
      let totalLinhas = 0;
      let totalCtesAgrupadores = 0;
      for (const file of successFiles) {
        const cte = file.data!;
        const matches = file.nfMatches || [];
        if (matches.length > 1) totalCtesAgrupadores++;

        // Rateio do frete: proporcional ao valor_nf; fallback igual
        const somaValores = matches.reduce((s, m) => s + (Number(m.valor_nf) || 0), 0);
        const usaProporcional = somaValores > 0;
        for (let i = 0; i < matches.length; i++) {
          const m = matches[i];
          let valorRateado: number;
          if (usaProporcional) {
            valorRateado = Number((((Number(m.valor_nf) || 0) / somaValores) * cte.valorFrete).toFixed(2));
          } else {
            valorRateado = Number((cte.valorFrete / matches.length).toFixed(2));
          }
          // Ajuste de centavos na última linha para fechar o total exato
          if (i === matches.length - 1) {
            const acumulado = inserts
              .slice(inserts.length - i)
              .reduce((s, r) => s + Number(r.valor_frete || 0), 0);
            valorRateado = Number((cte.valorFrete - acumulado).toFixed(2));
          }

          const numeroNfRef = m.chave.length === 44
            ? m.chave.substring(25, 34).replace(/^0+/, "")
            : null;

          inserts.push({
            carga_id: cargaId,
            nf_id: m.id,
            chave_cte: cte.chaveCte,
            numero_cte: cte.numeroCte,
            chave_nf_referenciada: m.chave,
            numero_nf_referenciada: numeroNfRef,
            cnpj_emitente: cte.cnpjEmitente,
            razao_social_emitente: cte.razaoSocialEmitente,
            valor_frete: valorRateado,
            tipo_documento: "CTE",
            identificador_interno: null,
            data_emissao: cte.dataEmissao,
          });
          totalLinhas++;
        }
      }

      const { error } = await supabase.from("ctes" as any).insert(inserts as any);

      if (error) {
        if (error.message?.includes("duplicate key")) {
          toast({ variant: "destructive", title: "CT-e duplicado", description: "Um ou mais vínculos CT-e+NF já foram importados anteriormente." });
        } else {
          throw error;
        }
      } else {
        // Sobrescrever volume_m3 da NF para fornecedores Pandurata e Docile
        const FORNECEDORES_VOLUME_CTE = ["PANDURATA", "DOCILE"];
        let volumesAtualizados = 0;
        for (const file of successFiles) {
          const cte = file.data!;
          if (!cte.volumeM3 || cte.volumeM3 <= 0) continue;
          for (const m of file.nfMatches || []) {
            const razao = (m.razao || "").toUpperCase();
            const isAlvo = FORNECEDORES_VOLUME_CTE.some((f) => razao.includes(f));
            if (!isAlvo) continue;
            const { error: updErr } = await supabase
              .from("notas_fiscais")
              .update({ volume_m3: cte.volumeM3 })
              .eq("id", m.id);
            if (!updErr) volumesAtualizados++;
          }
        }

        toast({
          title: "CT-es importados!",
          description:
            `${successFiles.length} CT-e(s) → ${totalLinhas} vínculo(s) NF na carga ${cargaPlaca}.` +
            (totalCtesAgrupadores > 0 ? ` ${totalCtesAgrupadores} CT-e(s) agrupador(es) com frete rateado.` : "") +
            (volumesAtualizados > 0 ? ` ${volumesAtualizados} NF(s) com m³ atualizado (Pandurata/Docile).` : ""),
        });
        handleClose(false);
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error importing CTes:", error);
      toast({ variant: "destructive", title: "Erro ao importar CT-es", description: error.message || "Tente novamente." });
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
          <DialogTitle>Importar CT-es — Carga {cargaPlaca}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dropzone */}
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
              accept=".xml"
              onChange={handleFileInput}
              className="hidden"
              id="cte-xml-input"
            />
            <label htmlFor="cte-xml-input" className="cursor-pointer">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {isProcessing ? "Processando..." : "Arraste XMLs de CT-e ou clique para selecionar"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Cada CT-e será vinculado à NF-e referenciada
                  </p>
                </div>
              </div>
            </label>
          </div>

          {/* File list */}
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
                        <FileCode className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">{file.fileName}</span>
                      </div>
                      {file.status === "success" ? (
                        <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                          <p>
                            CT-e {file.data?.numeroCte} → {(file.nfMatches?.length || 0)} NF(s): {file.nfMatches?.map((m) => m.numero_nf).join(", ")}
                            {(file.nfMatches?.length || 0) > 1 && " • frete rateado"}
                          </p>
                          <p>{file.data?.razaoSocialEmitente} • Frete total R$ {file.data?.valorFrete.toFixed(2)}</p>
                          {(file.nfsNaoEncontradas?.length || 0) > 0 && (
                            <p className="text-warning">
                              ⚠ {file.nfsNaoEncontradas!.length} NF(s) do CT-e não está(ão) nesta carga (ignorada(s))
                            </p>
                          )}
                        </div>
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
              Vincular {successFiles.length} CT-e(s)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
