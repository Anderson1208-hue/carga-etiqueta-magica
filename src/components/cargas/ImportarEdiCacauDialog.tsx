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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  FATOR_CUBAGEM_IBAC,
  isNotfisCacauContent,
  normalizeNfNumber,
  parseNotfisCubagem,
  readNotfisFile,
  type NotfisCubagemRow,
} from "@/lib/notfis-cubagem-parser";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargaId: string;
  cargaPlaca: string;
  onUpdated?: () => void;
}

interface Preview extends NotfisCubagemRow {
  naCarga: boolean;
}

export function ImportarEdiCacauDialog({
  open,
  onOpenChange,
  cargaId,
  cargaPlaca,
  onUpdated,
}: Props) {
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Preview[]>([]);
  const [saved, setSaved] = useState(false);

  async function handleFiles(files: File[]) {
    setProcessing(true);
    setSaved(false);
    setRows([]);

    try {
      const { data: nfsCarga, error } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf")
        .eq("carga_id", cargaId);

      if (error) throw error;

      const mapaNfs = new Map<string, string>();
      for (const n of nfsCarga || []) mapaNfs.set(normalizeNfNumber(n.numero_nf), n.id);

      const acumulado = new Map<string, NotfisCubagemRow>();
      let arquivosInvalidos = 0;

      for (const file of files) {
        const content = await readNotfisFile(file);
        if (!isNotfisCacauContent(content)) {
          arquivosInvalidos++;
          continue;
        }
        for (const row of parseNotfisCubagem(content)) acumulado.set(row.numeroNf, row);
      }

      if (acumulado.size === 0) {
        toast({
          variant: "destructive",
          title: "Arquivo EDI não reconhecido",
          description:
            arquivosInvalidos > 0
              ? "O arquivo não parece ser um NOTFIS (registros 000/313)."
              : "Nenhum registro 313 com NF foi encontrado.",
        });
        return;
      }

      const preview: Preview[] = Array.from(acumulado.values())
        .map((row) => ({ ...row, naCarga: mapaNfs.has(row.numeroNf) }))
        .sort((a, b) => Number(b.naCarga) - Number(a.naCarga) || a.numeroNf.localeCompare(b.numeroNf, undefined, { numeric: true }));

      setRows(preview);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao ler o arquivo.";
      toast({ variant: "destructive", title: "Erro ao processar EDI", description: message });
    } finally {
      setProcessing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: nfsCarga, error } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf")
        .eq("carga_id", cargaId);

      if (error) throw error;

      const mapaNfs = new Map<string, string>();
      for (const n of nfsCarga || []) mapaNfs.set(normalizeNfNumber(n.numero_nf), n.id);

      let atualizadas = 0;
      let erros = 0;

      for (const row of rows) {
        const nfId = mapaNfs.get(row.numeroNf);
        if (!nfId || row.volumeM3 <= 0) continue;

        const { error: errUpd } = await supabase
          .from("notas_fiscais")
          .update({ volume_m3: row.volumeM3 })
          .eq("id", nfId);

        if (errUpd) erros++;
        else atualizadas++;
      }

      setSaved(true);
      toast({
        title: "m³ atualizado pelo EDI Cacau",
        description: `${atualizadas} NF(s) atualizada(s)${erros > 0 ? `, ${erros} erro(s)` : ""}.`,
      });
      if (atualizadas > 0) onUpdated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao salvar.";
      toast({ variant: "destructive", title: "Erro ao salvar", description: message });
    } finally {
      setSaving(false);
    }
  }

  const naCarga = rows.filter((r) => r.naCarga && r.volumeM3 > 0);
  const foraCarga = rows.filter((r) => !r.naCarga);
  const semCubagem = rows.filter((r) => r.naCarga && r.volumeM3 <= 0);
  const totalM3 = naCarga.reduce((acc, r) => acc + r.volumeM3, 0);
  const totalPeso = naCarga.reduce((acc, r) => acc + r.pesoBruto, 0);

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setRows([]);
      setSaved(false);
    }
    onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar EDI Cacau — {cargaPlaca}</DialogTitle>
          <DialogDescription>
            Selecione o(s) arquivo(s) NOTFIS (.txt) enviados pela IBAC/Cacau Show. O m³ de cada NF é
            calculado pelo peso cubado do registro 313 dividido por {FATOR_CUBAGEM_IBAC} kg/m³.
            Somente NFs já existentes nesta carga são atualizadas — nenhuma NF é criada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label htmlFor="edi-cacau-input" className="wms-dropzone cursor-pointer block">
            <input
              id="edi-cacau-input"
              type="file"
              multiple
              accept=".txt,.edi,.not"
              className="hidden"
              disabled={processing}
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                if (selected.length) handleFiles(selected);
                e.currentTarget.value = "";
              }}
            />
            <div className="flex flex-col items-center gap-2 py-4">
              {processing ? (
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-primary" />
              )}
              <p className="font-medium">
                {processing ? "Lendo EDI..." : "Clique ou arraste os arquivos NOTFIS"}
              </p>
              <p className="text-xs text-muted-foreground">
                m³ = peso cubado ÷ {FATOR_CUBAGEM_IBAC}
              </p>
            </div>
          </label>

          {rows.length > 0 && (
            <>
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span>
                    <strong>{naCarga.length}</strong> NF(s) desta carga com cubagem —{" "}
                    <strong>{totalM3.toFixed(2)} m³</strong> / {totalPeso.toFixed(1)} kg
                  </span>
                </div>
                {semCubagem.length > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <AlertCircle className="w-4 h-4" />
                    <span>{semCubagem.length} NF(s) da carga sem peso cubado no arquivo</span>
                  </div>
                )}
                {foraCarga.length > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <AlertCircle className="w-4 h-4" />
                    <span>{foraCarga.length} NF(s) do arquivo não pertencem a esta carga (ignoradas)</span>
                  </div>
                )}
              </div>

              <div className="border rounded-md max-h-72 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NF</TableHead>
                      <TableHead className="text-right">Cx</TableHead>
                      <TableHead className="text-right">Peso (kg)</TableHead>
                      <TableHead className="text-right">Cubado (kg)</TableHead>
                      <TableHead className="text-right">m³</TableHead>
                      <TableHead className="text-center">Carga</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.numeroNf} className={row.naCarga ? "" : "opacity-50"}>
                        <TableCell className="font-mono">{row.numeroNf}</TableCell>
                        <TableCell className="text-right">{row.caixas.toFixed(0)}</TableCell>
                        <TableCell className="text-right">{row.pesoBruto.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{row.pesoCubado.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">{row.volumeM3.toFixed(4)}</TableCell>
                        <TableCell className="text-center text-xs">
                          {row.naCarga ? "sim" : "não"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {!saved && (
                <Button onClick={handleSave} disabled={saving || naCarga.length === 0} className="w-full">
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Aplicar m³ ({naCarga.length} NFs)
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
