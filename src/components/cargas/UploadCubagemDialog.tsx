import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Upload, FileSpreadsheet, Check, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

interface UploadCubagemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargaId: string;
  cargaPlaca: string;
}

interface CubagemRow {
  nf: string;
  volume_m3: number;
  status?: "ok" | "not_found" | "error";
  message?: string;
}

export function UploadCubagemDialog({ open, onOpenChange, cargaId, cargaPlaca }: UploadCubagemDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CubagemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

        const parsed: CubagemRow[] = [];

        for (const row of jsonData) {
          // Try to find NF column (flexible naming)
          const nfKey = Object.keys(row).find((k) =>
            /^(nf|nota|numero_nf|numero|nf_numero|nota_fiscal)$/i.test(k.trim())
          );
          // Try to find volume column
          const volKey = Object.keys(row).find((k) =>
            /^(volume|cubagem|m3|volume_m3|metragem|metros_cubicos|cubico)$/i.test(k.trim())
          );

          if (!nfKey && !volKey && parsed.length === 0) {
            // Try using first two columns as fallback
            const keys = Object.keys(row);
            if (keys.length >= 2) {
              const nfVal = String(row[keys[0]]).trim();
              const volVal = parseFloat(String(row[keys[1]]).replace(",", "."));
              if (nfVal && !isNaN(volVal)) {
                parsed.push({ nf: nfVal, volume_m3: volVal });
                continue;
              }
            }
          }

          const nfVal = nfKey ? String(row[nfKey]).trim() : "";
          const volRaw = volKey ? String(row[volKey]).replace(",", ".") : "";
          const volVal = parseFloat(volRaw);

          if (nfVal && !isNaN(volVal)) {
            parsed.push({ nf: nfVal, volume_m3: volVal });
          }
        }

        if (parsed.length === 0) {
          toast({
            variant: "destructive",
            title: "Planilha inválida",
            description: "Não foi possível encontrar colunas de NF e Volume/Cubagem. Use colunas com nomes como 'NF' e 'Volume' ou 'Cubagem'.",
          });
          return;
        }

        setRows(parsed);
        setSaved(false);
      } catch (err) {
        console.error("Error parsing Excel:", err);
        toast({ variant: "destructive", title: "Erro ao ler planilha", description: "Verifique se o arquivo é um Excel válido." });
      }
    };
    reader.readAsArrayBuffer(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Fetch NFs of this carga
      const { data: nfs, error } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf")
        .eq("carga_id", cargaId);

      if (error) throw error;

      const nfMap = new Map<string, string>();
      (nfs || []).forEach((nf) => {
        nfMap.set(nf.numero_nf.trim(), nf.id);
      });

      const updatedRows: CubagemRow[] = [];

      for (const row of rows) {
        const nfId = nfMap.get(row.nf);
        if (!nfId) {
          updatedRows.push({ ...row, status: "not_found", message: "NF não encontrada nesta carga" });
          continue;
        }

        const { error: updateError } = await supabase
          .from("notas_fiscais")
          .update({ volume_m3: row.volume_m3 })
          .eq("id", nfId);

        if (updateError) {
          updatedRows.push({ ...row, status: "error", message: updateError.message });
        } else {
          updatedRows.push({ ...row, status: "ok", message: "Atualizado" });
        }
      }

      setRows(updatedRows);
      setSaved(true);

      const okCount = updatedRows.filter((r) => r.status === "ok").length;
      const notFoundCount = updatedRows.filter((r) => r.status === "not_found").length;

      toast({
        title: "Cubagem atualizada",
        description: `${okCount} NF(s) atualizada(s)${notFoundCount > 0 ? `, ${notFoundCount} não encontrada(s)` : ""}.`,
      });
    } catch (err: any) {
      console.error("Error saving cubagem:", err);
      toast({ variant: "destructive", title: "Erro ao salvar", description: err.message });
    } finally {
      setSaving(false);
    }
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setRows([]);
      setSaved(false);
    }
    onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Importar Cubagem — {cargaPlaca}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie uma planilha Excel (.xlsx, .xls) com duas colunas: <strong>NF</strong> (número da nota fiscal) e <strong>Volume</strong> (metragem cúbica em m³).
          </p>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
              <Upload className="w-4 h-4 mr-2" />
              Selecionar Planilha
            </Button>
          </div>

          {rows.length > 0 && (
            <>
              <div className="border rounded-md max-h-60 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NF</TableHead>
                      <TableHead className="text-right">Volume (m³)</TableHead>
                      {saved && <TableHead className="text-center">Status</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono">{row.nf}</TableCell>
                        <TableCell className="text-right">{row.volume_m3.toFixed(4)}</TableCell>
                        {saved && (
                          <TableCell className="text-center">
                            {row.status === "ok" ? (
                              <Check className="w-4 h-4 text-green-600 mx-auto" />
                            ) : (
                              <span className="flex items-center justify-center gap-1 text-xs text-amber-600">
                                <AlertTriangle className="w-3 h-3" />
                                {row.message}
                              </span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <p className="text-sm text-muted-foreground">
                {rows.length} linha(s) encontrada(s) na planilha.
              </p>

              {!saved && (
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Atualizar Cubagem ({rows.length} NFs)
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
