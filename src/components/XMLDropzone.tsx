import { useCallback, useState } from "react";
import { Upload, FileCode, AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseNFeXML, NFeParsed } from "@/lib/xml-parser";
import { Button } from "@/components/ui/button";

interface ParsedFile {
  fileName: string;
  data: NFeParsed;
  status: "success" | "error";
  error?: string;
}

interface XMLDropzoneProps {
  onFilesProcessed: (files: ParsedFile[]) => void;
  processedFiles: ParsedFile[];
  onRemoveFile: (index: number) => void;
}

export function XMLDropzone({
  onFilesProcessed,
  processedFiles,
  onRemoveFile,
}: XMLDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const processFiles = useCallback(
    async (files: FileList) => {
      setIsProcessing(true);
      const newParsedFiles: ParsedFile[] = [];

      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".xml")) {
          newParsedFiles.push({
            fileName: file.name,
            data: null as unknown as NFeParsed,
            status: "error",
            error: "Arquivo não é XML",
          });
          continue;
        }

        try {
          const content = await file.text();
          const parsed = parseNFeXML(content);

          // Check if this NF was already added
          const alreadyExists = processedFiles.some(
            (pf) => pf.data?.chaveAcesso === parsed.chaveAcesso
          );

          if (alreadyExists) {
            newParsedFiles.push({
              fileName: file.name,
              data: parsed,
              status: "error",
              error: "NF já adicionada (chave duplicada)",
            });
          } else {
            newParsedFiles.push({
              fileName: file.name,
              data: parsed,
              status: "success",
            });
          }
        } catch (error) {
          newParsedFiles.push({
            fileName: file.name,
            data: null as unknown as NFeParsed,
            status: "error",
            error: error instanceof Error ? error.message : "Erro ao processar",
          });
        }
      }

      onFilesProcessed(newParsedFiles);
      setIsProcessing(false);
    },
    [onFilesProcessed, processedFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);

      if (e.dataTransfer.files?.length) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        processFiles(e.target.files);
      }
    },
    [processFiles]
  );

  const successFiles = processedFiles.filter((f) => f.status === "success");
  const errorFiles = processedFiles.filter((f) => f.status === "error");

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
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
          id="xml-input"
        />
        <label htmlFor="xml-input" className="cursor-pointer">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                {isProcessing
                  ? "Processando..."
                  : "Arraste arquivos XML ou clique para selecionar"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Suporta múltiplos arquivos NF-e
              </p>
            </div>
          </div>
        </label>
      </div>

      {/* Processed files list */}
      {processedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">
              Arquivos processados ({successFiles.length} sucesso
              {errorFiles.length > 0 && `, ${errorFiles.length} erro(s)`})
            </h4>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {processedFiles.map((file, index) => (
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
                    <span className="text-sm font-medium truncate">
                      {file.fileName}
                    </span>
                  </div>
                  {file.status === "success" ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      NF {file.data.numeroNf} • {file.data.razaoSocialEmitente}{" "}
                      • {file.data.itens.length} itens
                    </p>
                  ) : (
                    <p className="text-xs text-destructive mt-0.5">
                      {file.error}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onRemoveFile(index)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export type { ParsedFile };
