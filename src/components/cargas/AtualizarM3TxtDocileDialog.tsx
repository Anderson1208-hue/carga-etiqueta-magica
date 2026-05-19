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
  arquivosSemLeitura: string[];
}

interface DocileTxtRow {
  numeroNf: string;
  volumeM3: number;
}

function normalizeNfNumber(value: string | number | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.replace(/^0+/, "") || "0";
}

function parseVolumeNumber(value: string | null | undefined) {
  if (!value) return 0;
  const raw = value.trim().replace(/\s+/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeTextForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ");
}

function parseDocileTxtRows(content: string): DocileTxtRow[] {
  const rows = new Map<string, number>();
  const text = normalizeTextForSearch(content);

  const labelledPattern =
    /(?:N\s*(?:R|RO|º|°)?[\s.:-]*NOTA|NOTA\s*(?:FISCAL)?|NF)\s*[:.-]?\s*0*(\d{3,10})\b[^\n\r]{0,160}?(?:CUBAGEM|M\s*[³3]|METRAGEM|METR(?:O|OS)\s*CUBIC(?:O|OS))\s*[:.-]?\s*([0-9]{1,6}(?:[.,][0-9]{1,4})?)/gi;

  for (const match of text.matchAll(labelledPattern)) {
    const numeroNf = normalizeNfNumber(match[1]);
    const volumeM3 = parseVolumeNumber(match[2]);
    if (numeroNf !== "0" && volumeM3 > 0) rows.set(numeroNf, volumeM3);
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (
      !line ||
      !/CUBAGEM|M\s*[³3]|METRAGEM|METR(?:O|OS)\s*CUBIC(?:O|OS)/i.test(line) ||
      !/(?:N\s*(?:R|RO|º|°)?[\s.:-]*NOTA|NOTA\s*(?:FISCAL)?|NF)/i.test(line) ||
      /EMBARQUE|TOTAL|RESUMO|PRE[- ]?FATURAMENTO|CUBAGEM\s*$/i.test(line)
    ) {
      continue;
    }

    const nfMatch = line.match(
      /(?:N\s*(?:R|RO|º|°)?[\s.:-]*NOTA|NOTA\s*(?:FISCAL)?|NF)\s*[:.-]?\s*0*(\d{3,10})\b/i
    );
    const volumeMatch = line.match(
      /(?:CUBAGEM|M\s*[³3]|METRAGEM|METR(?:O|OS)\s*CUBIC(?:O|OS))\s*[:.-]?\s*([0-9]{1,6}(?:[.,][0-9]{1,4})?)/i
    );
    if (!nfMatch || !volumeMatch) continue;

    const numeroNf = normalizeNfNumber(nfMatch[1]);
    const volumeM3 = parseVolumeNumber(volumeMatch[1]);

    if (numeroNf !== "0" && volumeM3 > 0) rows.set(numeroNf, volumeM3);
  }

  return Array.from(rows, ([numeroNf, volumeM3]) => ({ numeroNf, volumeM3 }));
}

async function readTxtFile(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: false }).decode(buffer);
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be", { fatal: false }).decode(buffer);
  }

  const sample = bytes.slice(0, Math.min(bytes.length, 4000));
  const oddNulls = sample.filter((byte, index) => index % 2 === 1 && byte === 0).length;
  const evenNulls = sample.filter((byte, index) => index % 2 === 0 && byte === 0).length;

  if (sample.length > 20 && oddNulls > sample.length * 0.2) {
    return new TextDecoder("utf-16le", { fatal: false }).decode(buffer);
  }

  if (sample.length > 20 && evenNulls > sample.length * 0.2) {
    return new TextDecoder("utf-16be", { fatal: false }).decode(buffer);
  }

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const invalidChars = (utf8.match(/�/g) || []).length;

  if (invalidChars > 0) {
    try {
      return new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
    } catch {
      return utf8;
    }
  }

  return utf8;
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
      arquivosSemLeitura: [],
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

    // mapa: numero_nf normalizado (somente dígitos, sem zeros à esquerda) -> id
    const mapaNfs = new Map<string, string>();
    for (const n of nfsCarga || []) {
      mapaNfs.set(normalizeNfNumber(n.numero_nf), n.id);
    }

    // Evita duplicar update da mesma NF entre arquivos
    const jaAtualizadas = new Set<string>();

    for (const file of Array.from(files)) {
      try {
        const content = await readTxtFile(file);
        const linhas = parseDocileTxtRows(content);
        r.linhasLidas += linhas.length;

        if (linhas.length === 0) {
          r.arquivosSemLeitura.push(file.name);
        }

        for (const linha of linhas) {
          if (!linha.volumeM3 || linha.volumeM3 <= 0) {
            r.semM3++;
            continue;
          }

          const nfId = mapaNfs.get(linha.numeroNf);
          if (!nfId) {
            r.naoEncontradas++;
            if (r.detalhesNaoEncontradas.length < 5) {
              r.detalhesNaoEncontradas.push(`NF ${linha.numeroNf}`);
            }
            continue;
          }

          if (jaAtualizadas.has(nfId)) continue;

          const { error: errUpd } = await supabase
            .from("notas_fiscais")
            .update({ volume_m3: linha.volumeM3 })
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
                Lê as linhas "Nr Nota: NNNNNNN   Cubagem: X,XX" do Resumo
                Pré-Faturamento Docile.
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
