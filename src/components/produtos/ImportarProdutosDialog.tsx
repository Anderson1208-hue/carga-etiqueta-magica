import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload } from "lucide-react";
import { toast } from "sonner";

type Embarcador = { id: string; cnpj: string; razao_social: string };

function norm(s: string) {
  return s
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const MAP: Record<string, string> = {
  produto: "codigo",
  codigo: "codigo",
  sku: "codigo",
  cprod: "codigo",
  descricao: "descricao",
  unidade: "unidade",
  marca: "marca",
  segmento: "segmento",
  eantdu: "ean_tdu",
  eanmcu: "ean_mcu",
  eanrsu: "ean_rsu",
  mcutdu: "qtd_mcu_por_tdu",
  rsutdu: "qtd_rsu_por_tdu",
  pesobrutocxkg: "peso_bruto_cx_kg",
  pesoliqcxkg: "peso_liquido_cx_kg",
  pesoliquidocxkg: "peso_liquido_cx_kg",
  lmm: "largura_mm",
  cmm: "comprimento_mm",
  amm: "altura_mm",
  volumem3: "volume_m3",
  atrisk: "shelf_life_min_recebimento_dias",
  aged: "shelf_life_min_expedicao_dias",
  validade: "shelf_life_dias",
  lastro: "lastro",
  alturalay: "camadas",
  cdapalletplb: "caixas_por_pallet",
  ncm: "ncm",
  hierarquiadeproduto: "hierarquia_produto",
  status: "status_comercial",
  zreptdu: "codigo_alternativo",
};

const NUMERIC = new Set([
  "qtd_mcu_por_tdu", "qtd_rsu_por_tdu", "peso_bruto_cx_kg", "peso_liquido_cx_kg",
  "largura_mm", "comprimento_mm", "altura_mm", "volume_m3",
  "lastro", "camadas", "caixas_por_pallet",
  "shelf_life_dias", "shelf_life_min_recebimento_dias", "shelf_life_min_expedicao_dias",
]);

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function ImportarProdutosDialog({
  open, onOpenChange, embarcadores, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  embarcadores: Embarcador[];
  onDone: () => void;
}) {
  const [embarcadorId, setEmbarcadorId] = useState<string>("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      const parsed = raw
        .map((r) => {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(r)) {
            const key = MAP[norm(k)];
            if (!key || v === null || v === "") continue;
            if (out[key] !== undefined) continue;
            out[key] = NUMERIC.has(key) ? toNum(v) : String(v).trim();
          }
          return out;
        })
        .filter((r) => r.codigo && r.descricao);
      if (!parsed.length) {
        toast.error("Nenhuma linha válida encontrada (precisa de código e descrição)");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      toast.success(`${parsed.length} produto(s) lidos da planilha`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function importar() {
    if (!embarcadorId) return toast.error("Selecione o embarcador");
    const emb = embarcadores.find((e) => e.id === embarcadorId);
    setBusy(true);
    try {
      let inseridos = 0;
      let atualizados = 0;
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const lote = rows.slice(i, i + CHUNK).map((r) => ({
          ...r,
          cnpj_embarcador: emb?.cnpj ?? null,
        }));
        const { data, error } = await supabase.rpc("importar_produtos_lote", {
          payload: { produtos: lote } as never,
        });
        if (error) throw error;
        const res = data as unknown as { inseridos: number; atualizados: number };
        inseridos += res?.inseridos ?? 0;
        atualizados += res?.atualizados ?? 0;
      }
      toast.success(`Importação concluída: ${inseridos} novos, ${atualizados} atualizados`);
      setRows([]);
      setFileName("");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar cadastro de produtos (Excel)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Embarcador *</Label>
            <Select value={embarcadorId} onValueChange={setEmbarcadorId}>
              <SelectTrigger><SelectValue placeholder="Selecione o embarcador dono do cadastro" /></SelectTrigger>
              <SelectContent>
                {embarcadores.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Planilha (.xlsx)</Label>
            <Input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <p className="text-xs text-muted-foreground">
              Reconhece automaticamente o layout Masterdata (Produto, Descrição, EAN TDU/MCU/RSU,
              Peso Bruto/Líq. CX, L/C/A em mm, Volume m³, Lastro, Altura (LAY), CDA/Pallet, NCM,
              Validade, At Risk, Aged).
            </p>
          </div>
          {rows.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{fileName}</p>
              <p className="text-muted-foreground">{rows.length} produto(s) prontos para importar</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={importar} disabled={busy || !rows.length}>
            <Upload className="w-4 h-4 mr-2" />
            {busy ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
