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
  amostrasArquivo: string[];
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

function getDocileReportText(content: string) {
  const text = normalizeTextForSearch(content);
  const pages = text.split(/\f/g);
  const reportPages = pages.filter((page) =>
    /(?:NR|NRO|NUMERO|N[ºO])\s*\.?\s*NOTA|\bNOTA\s+FISCAL\b|\bNF\b|RES\s+PEDIDO\s+DESTINO/i.test(page)
  );

  return reportPages.length > 0 ? reportPages.join("\n") : text;
}

function findHeaderIndex(line: string, pattern: RegExp) {
  const match = pattern.exec(line);
  return match?.index ?? -1;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickNearbyVolume(text: string, nfStart: number, nfEnd: number) {
  const after = text.slice(nfEnd, nfEnd + 140);
  const before = text.slice(Math.max(0, nfStart - 80), nfStart);
  const labelled = after.match(/(?:CUBAGEM|CUB\.?|M\s*[³3]|VOLUME|METRAGEM|ENTREG)[^0-9]{0,40}(\d{1,6}[,.]\d{1,4})/i);
  const labelledValue = parseVolumeNumber(labelled?.[1]);
  if (labelledValue > 0 && labelledValue <= 1000) return labelled?.[1] ?? null;

  const afterDecimals = [...after.matchAll(/\b\d{1,6}[,.]\d{1,4}\b/g)]
    .map((match) => match[0])
    .filter((value) => {
      const volume = parseVolumeNumber(value);
      return volume > 0 && volume <= 1000;
    });
  if (afterDecimals[0]) return afterDecimals[0];

  const beforeDecimals = [...before.matchAll(/\b\d{1,6}[,.]\d{1,4}\b/g)]
    .map((match) => match[0])
    .filter((value) => {
      const volume = parseVolumeNumber(value);
      return volume > 0 && volume <= 1000;
    });
  return beforeDecimals.at(-1) ?? null;
}

function parseDocileTxtRows(content: string, nfsDaCarga?: Iterable<string>): DocileTxtRow[] {
  const rows = new Map<string, number>();
  const knownNfSet = new Set(
    Array.from(nfsDaCarga ?? [])
      .map((nf) => normalizeNfNumber(nf))
      .filter((nf) => nf !== "0")
  );
  const allText = normalizeTextForSearch(content);
  const text = getDocileReportText(content);
  const addRow = (nfValue: string, volumeValue: string) => {
    const numeroNf = normalizeNfNumber(nfValue);
    const volumeM3 = parseVolumeNumber(volumeValue);
    if (numeroNf !== "0" && volumeM3 > 0) rows.set(numeroNf, volumeM3);
  };

  if (knownNfSet.size > 0) {
    const digitsText = allText.replace(/\D/g, "");
    if (!digitsText.includes(Array.from(knownNfSet)[0])) {
      const onlyDigits = allText.replace(/\D/g, " ").split(/\s+/).filter(Boolean);
      for (const nf of knownNfSet) {
        const nfIndex = onlyDigits.findIndex((token) => normalizeNfNumber(token) === nf);
        if (nfIndex >= 0) {
          const nearToken = onlyDigits.slice(nfIndex + 1, nfIndex + 8).find((token) => token.length >= 2 && token.length <= 6);
          if (nearToken) addRow(nf, `${nearToken.slice(0, -2) || "0"},${nearToken.slice(-2)}`);
        }
      }
    }

    for (const nf of knownNfSet) {
      const nfPattern = new RegExp(`0*${escapeRegExp(nf)}\\b`, "g");
      let nfMatch: RegExpExecArray | null;
      while ((nfMatch = nfPattern.exec(allText)) !== null) {
        const volumeValue = pickNearbyVolume(allText, nfMatch.index, nfPattern.lastIndex);
        if (volumeValue) addRow(nf, volumeValue);
      }
    }
  }

  const nfHeaderPattern = /(?:NR|NRO|NUMERO|N[ºO])\s*\.?\s*NOTA|NOTA\s+FISCAL|\bNF\b/i;
  const cubagemHeaderPattern = /CUBAGEM|CUB\.?|M\s*[³3]|VOLUME|METRAGEM/i;

  let activeColumns: { nfStart: number; cubagemStart: number; misses: number } | null = null;
  for (const rawLine of allText.split(/\r\n|\n|\r|\f/)) {
    const line = rawLine.replace(/\t/g, " ").replace(/\s+$/g, "");
    const compact = line.replace(/\s+/g, " ").trim();
    if (!compact) continue;

    const nfHeaderIndex = findHeaderIndex(line, nfHeaderPattern);
    const cubagemHeaderIndex = findHeaderIndex(line, cubagemHeaderPattern);
    if (nfHeaderIndex >= 0 && cubagemHeaderIndex >= 0) {
      activeColumns = { nfStart: nfHeaderIndex, cubagemStart: cubagemHeaderIndex, misses: 0 };
      continue;
    }

    if (activeColumns) {
      const nfWindow = line.slice(Math.max(0, activeColumns.nfStart - 6), Math.min(line.length, activeColumns.cubagemStart));
      const volumeWindow = line.slice(Math.max(0, activeColumns.cubagemStart - 8), Math.min(line.length, activeColumns.cubagemStart + 28));
      const nfMatch = nfWindow.match(/\b0*\d{3,10}\b/);
      const volumeMatch = volumeWindow.match(/\b\d{1,6}[,.]\d{1,4}\b/);

      if (nfMatch && volumeMatch) {
        addRow(nfMatch[0], volumeMatch[0]);
        activeColumns.misses = 0;
      } else {
        activeColumns.misses++;
        if (activeColumns.misses > 20) activeColumns = null;
      }
    }
  }

  const exactDocilePattern = /(?:NR|NRO|NUMERO|N[ºO])\s*\.?\s*NOTA\s*[:.-]?\s*0*(\d{3,10})[\s\S]{0,180}?(?:CUBAGEM|CUB\.?)\s*[:.-]?\s*([0-9]{1,6}(?:[.,][0-9]{1,4}))/gi;
  let exactMatch: RegExpExecArray | null;
  while ((exactMatch = exactDocilePattern.exec(allText)) !== null) {
    addRow(exactMatch[1], exactMatch[2]);
  }

  const genericNfVolumePattern = /\b0{2,}(\d{3,10})\b[\s\S]{0,220}?\b([0-9]{1,6}[,.][0-9]{1,4})\b/g;
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericNfVolumePattern.exec(allText)) !== null) {
    addRow(genericMatch[1], genericMatch[2]);
  }

  for (const rawLine of allText.split(/\r\n|\n|\r|\f/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const nfCandidates = line.match(/\b0{2,}\d{3,10}\b/g) || [];
    const volumeCandidates = line.match(/\b\d{1,6}[,.]\d{1,4}\b/g) || [];
    if (nfCandidates.length > 0 && volumeCandidates.length > 0) {
      addRow(nfCandidates[nfCandidates.length - 1], volumeCandidates[volumeCandidates.length - 1]);
    }
  }

  const cubagemPattern = /CUBAGEM\s*[:.-]\s*([0-9]{1,6}(?:[.,][0-9]{1,4}))/gi;
  let cubagemMatch: RegExpExecArray | null;
  while ((cubagemMatch = cubagemPattern.exec(text)) !== null) {
    const before = text.slice(Math.max(0, cubagemMatch.index - 120), cubagemMatch.index);
    const nfCandidates = [...before.matchAll(/0*(\d{3,10})\b/g)];
    const nfValue = nfCandidates.at(-1)?.[1];
    if (nfValue) addRow(nfValue, cubagemMatch[1]);
  }

  const reportText = text.replace(/\s+/g, " ");
  const pairPatterns = [
    /(?:NR|NRO|NUMERO|N[ºO])\s+NOTA\s*[:.-]?\s*0*(\d{3,10})\b[\s\S]{0,160}?(?:CUBAGEM|CUB\.?)\s*[:.-]?\s*([0-9]{1,6}(?:[.,][0-9]{1,4}))/gi,
    /(?:NOTA\s+FISCAL|\bNOTA\b|\bNF\b)\s*[:.-]?\s*0*(\d{3,10})\b[\s\S]{0,160}?(?:CUBAGEM|CUB\.?|M\s*[³3]|VOLUME|METRAGEM)\s*[:.-]?\s*([0-9]{1,6}(?:[.,][0-9]{1,4}))/gi,
  ];

  for (const pattern of pairPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(reportText)) !== null) {
      addRow(match[1], match[2]);
    }
  }

  let pendingNf: string | null = null;
  for (const rawLine of text.split(/\r\n|\n|\r|\f/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    const nfMatch = line.match(/(?:NR|NRO|NUMERO|N[ºO])\s+NOTA\s*[:.-]?\s*0*(\d{3,10})\b/i)
      || line.match(/(?:NOTA\s+FISCAL|\bNOTA\b|\bNF\b)\s*[:.-]?\s*0*(\d{3,10})\b/i);
    const volumeMatch = line.match(/(?:CUBAGEM|CUB\.?|M\s*[³3]|VOLUME|METRAGEM)\s*[:.-]?\s*([0-9]{1,6}(?:[.,][0-9]{1,4}))/i);

    if (nfMatch && volumeMatch) {
      addRow(nfMatch[1], volumeMatch[1]);
      pendingNf = null;
    } else if (nfMatch) {
      pendingNf = nfMatch[1];
    } else if (pendingNf && volumeMatch) {
      addRow(pendingNf, volumeMatch[1]);
      pendingNf = null;
    }
  }

  return Array.from(rows, ([numeroNf, volumeM3]) => ({ numeroNf, volumeM3 }));
}

function getDocileTxtSamples(content: string) {
  const text = getDocileReportText(content);
  const lines = text
    .split(/\r\n|\n|\r|\f/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const relevant = lines.filter((line) => /NOTA|NF|CUBAGEM|CUB\.?|M\s*[³3]/i.test(line));
  return (relevant.length > 0 ? relevant : lines).slice(0, 6);
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
      amostrasArquivo: [],
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
        const linhas = parseDocileTxtRows(content, mapaNfs.keys());
        r.linhasLidas += linhas.length;

        if (linhas.length === 0) {
          r.arquivosSemLeitura.push(file.name);
          if (r.amostrasArquivo.length === 0) {
            r.amostrasArquivo = getDocileTxtSamples(content);
          }
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
    } else if (r.linhasLidas === 0) {
      toast({
        variant: "destructive",
        title: "TXT Docile não reconhecido",
        description: "Nenhuma linha de NF/cubagem foi encontrada no arquivo selecionado.",
      });
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
              {resultado.arquivosSemLeitura.length > 0 && (
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <span>
                    Arquivo sem linhas reconhecidas: {resultado.arquivosSemLeitura.join(", ")}
                  </span>
                </div>
              )}
              {resultado.amostrasArquivo.length > 0 && (
                <div className="rounded border bg-muted/40 p-2 text-xs text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">Amostra lida do arquivo:</div>
                  <pre className="whitespace-pre-wrap break-words font-mono">
                    {resultado.amostrasArquivo.join("\n")}
                  </pre>
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
