import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CodigoIbac {
  codigo: string;
  descricao: string;
}

interface DeParaItem {
  id: string;
  evento_interno: string;
  descricao_interna: string;
  codigo_ibac: string | null;
  descricao_ibac: string | null;
}

interface Props {
  itens: DeParaItem[];
  onImported: () => void;
}

// Palavras-chave para sugerir match automático evento_interno -> descrição da planilha
const KEYWORDS: Record<string, string[]> = {
  carga_aceita: ["aceito", "aceita", "transportadora"],
  inicio_rota: ["saiu", "entrega", "saida"],
  chegada_cliente: ["chegada", "cliente"],
  entrega_realizada: ["entrega realizada", "normalmente"],
  recusa_entrega: ["recusa"],
  avaria: ["avaria"],
  devolucao: ["devolu"],
  reentrega: ["reentrega"],
  agendamento: ["programada", "agend"],
};

function sugerirCodigo(eventoInterno: string, opcoes: CodigoIbac[]): string | null {
  const kws = KEYWORDS[eventoInterno] ?? [];
  for (const kw of kws) {
    const match = opcoes.find((o) => o.descricao.toLowerCase().includes(kw));
    if (match) return match.codigo;
  }
  return null;
}

export function ImportarDeParaDialog({ itens, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [codigos, setCodigos] = useState<CodigoIbac[]>([]);
  const [selecoes, setSelecoes] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const resetar = () => {
    setCodigos([]);
    setSelecoes({});
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1, defval: "" });

      // Detecta colunas de código e descrição (procura primeira coluna numérica e textual)
      const parsed: CodigoIbac[] = [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        let codigo = "";
        let descricao = "";
        for (const cell of row) {
          const s = String(cell ?? "").trim();
          if (!s) continue;
          if (!codigo && /^\d{1,4}$/.test(s)) {
            codigo = s;
          } else if (!descricao && /[a-zA-Z]/.test(s) && s.length > 3) {
            descricao = s;
          }
        }
        if (codigo && descricao) parsed.push({ codigo, descricao });
      }

      if (parsed.length === 0) {
        toast.error("Não encontrei códigos na planilha. Esperado: coluna com número e coluna com descrição.");
        return;
      }

      setCodigos(parsed);

      // Aplica sugestões automáticas
      const novas: Record<string, string> = {};
      for (const item of itens) {
        const sug = sugerirCodigo(item.evento_interno, parsed);
        if (sug) novas[item.id] = sug;
      }
      setSelecoes(novas);
      toast.success(`${parsed.length} códigos carregados • ${Object.keys(novas).length} sugestões automáticas`);
    } catch (err: any) {
      toast.error(`Erro ao ler planilha: ${err.message}`);
    }
  };

  const mapaCodigo = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of codigos) m.set(c.codigo, c.descricao);
    return m;
  }, [codigos]);

  const salvarTudo = async () => {
    const updates = itens
      .filter((it) => selecoes[it.id])
      .map((it) => ({
        id: it.id,
        codigo_ibac: selecoes[it.id],
        descricao_ibac: mapaCodigo.get(selecoes[it.id]) ?? null,
      }));

    if (updates.length === 0) {
      toast.error("Selecione ao menos um código antes de salvar");
      return;
    }

    setSalvando(true);
    try {
      for (const u of updates) {
        const { error } = await supabase
          .from("ibac_de_para_eventos")
          .update({ codigo_ibac: u.codigo_ibac, descricao_ibac: u.descricao_ibac, ativo: true })
          .eq("id", u.id);
        if (error) throw error;
      }
      toast.success(`${updates.length} mapeamento(s) salvos`);
      onImported();
      setOpen(false);
      resetar();
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetar(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="w-4 h-4 mr-2" />
          Importar planilha de códigos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar códigos IBAC via planilha</DialogTitle>
          <DialogDescription>
            Envie a planilha enviada pela IBAC. O sistema sugere automaticamente o código de cada evento — confirme e salve.
          </DialogDescription>
        </DialogHeader>

        {codigos.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Selecione um arquivo .xlsx, .xls ou .csv contendo os códigos e descrições
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="hidden"
              id="ibac-de-para-file"
            />
            <label htmlFor="ibac-de-para-file">
              <Button asChild>
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  Selecionar planilha
                </span>
              </Button>
            </label>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {codigos.length} códigos disponíveis na planilha
              </span>
              <Button variant="ghost" size="sm" onClick={resetar}>Trocar arquivo</Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento interno</TableHead>
                  <TableHead>Atual</TableHead>
                  <TableHead>Novo código IBAC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((item) => {
                  const escolhido = selecoes[item.id];
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-mono text-xs">{item.evento_interno}</div>
                        <div className="text-xs text-muted-foreground">{item.descricao_interna}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.codigo_ibac ? (
                          <span className="font-mono">{item.codigo_ibac}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Select
                            value={escolhido ?? ""}
                            onValueChange={(v) => setSelecoes((s) => ({ ...s, [item.id]: v }))}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Selecionar código..." />
                            </SelectTrigger>
                            <SelectContent>
                              {codigos.map((c) => (
                                <SelectItem key={c.codigo} value={c.codigo}>
                                  <span className="font-mono mr-2">{c.codigo}</span>
                                  {c.descricao}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {escolhido && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={salvarTudo}
            disabled={codigos.length === 0 || salvando || Object.keys(selecoes).length === 0}
          >
            {salvando ? "Salvando..." : `Salvar ${Object.keys(selecoes).length} mapeamento(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
