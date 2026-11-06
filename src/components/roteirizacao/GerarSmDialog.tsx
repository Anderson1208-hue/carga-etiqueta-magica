import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { placaRastreada, normalizarPlaca } from "@/lib/overhaul-rastreados";

type Estado = { status: "aguardando" | "gerando" | "gerada" | "falha"; sm?: string; erro?: string };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dataLabel: string;
  veiculos: any[];
  obterCnpjsOrdenados: (veiculoId: string) => Promise<string[]>;
}

export function GerarSmDialog({ open, onOpenChange, dataLabel, veiculos, obterCnpjsOrdenados }: Props) {
  const [marcados, setMarcados] = useState<string[]>([]);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [forcar, setForcar] = useState(false);
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMarcados([]);
    setForcar(false);
    const ids = veiculos.map((v) => v.id);
    supabase.from("overhaul_sm").select("veiculo_id, status, sm_numero, erro, created_at")
      .in("veiculo_id", ids).order("created_at", { ascending: false })
      .then(({ data }) => {
        const e: Record<string, Estado> = {};
        for (const r of data || []) {
          if (e[r.veiculo_id]) continue;
          e[r.veiculo_id] = { status: r.status as Estado["status"], sm: r.sm_numero ?? undefined, erro: r.erro ?? undefined };
        }
        setEstados(e);
      });
  }, [open, veiculos]);

  const elegiveis = veiculos.filter((v) => placaRastreada(v.placa) && v.status !== "cancelado");

  async function gerar() {
    setRodando(true);
    for (const id of marcados) {
      setEstados((s) => ({ ...s, [id]: { status: "gerando" } }));
      try {
        const cnpjs = await obterCnpjsOrdenados(id);
        const { data, error } = await supabase.functions.invoke("overhaul-gerar-sm", {
          body: { veiculo_id: id, cnpjs_ordenados: cnpjs, forcar },
        });
        if (error) {
          let msg = error.message;
          try { msg = (await (error as any).context?.json())?.mensagem || msg; } catch { /* keep */ }
          throw new Error(msg);
        }
        setEstados((s) => ({ ...s, [id]: data.status === "gerada" ? { status: "gerada", sm: data.sm_numero } : { status: "falha", erro: data.erro } }));
      } catch (e: any) {
        setEstados((s) => ({ ...s, [id]: { status: "falha", erro: e?.message || "Erro" } }));
      }
    }
    setMarcados([]);
    setRodando(false);
  }

  const badge = (e?: Estado) => {
    if (!e) return null;
    if (e.status === "gerando") return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Gerando</Badge>;
    if (e.status === "gerada") return <Badge>SM {e.sm}</Badge>;
    if (e.status === "falha") return <Badge variant="destructive" title={e.erro}>Falha</Badge>;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !rodando && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Gerar SM Overhaul — {dataLabel}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Só placas rastreadas podem ser marcadas. A rota vai da origem até a última entrega, com as demais entregas como paradas, na ordem da roteirização.
        </p>
        <div className="max-h-[50vh] overflow-y-auto space-y-1">
          {veiculos.map((v) => {
            const ok = elegiveis.includes(v);
            const e = estados[v.id];
            return (
              <div key={v.id} className="flex items-start gap-3 p-2 rounded border">
                <Checkbox
                  disabled={!ok || rodando}
                  checked={marcados.includes(v.id)}
                  onCheckedChange={(c) => setMarcados((m) => (c ? [...m, v.id] : m.filter((x) => x !== v.id)))}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{normalizarPlaca(v.placa)}</span>
                    <span className="text-sm text-muted-foreground truncate">{v.motorista}</span>
                    <span className="ml-auto">{ok ? badge(e) : <span className="text-xs text-muted-foreground">não rastreado</span>}</span>
                  </div>
                  {e?.status === "falha" && e.erro && <p className="text-xs text-destructive mt-1">{e.erro}</p>}
                </div>
              </div>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={forcar} onCheckedChange={(c) => setForcar(!!c)} disabled={rodando} />
          Gerar mesmo se já existir SM no portal para a placa neste dia
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => setMarcados(elegiveis.map((v) => v.id))} disabled={rodando}>Marcar todas</Button>
          <Button onClick={gerar} disabled={rodando || marcados.length === 0}>
            {rodando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Gerar SM ({marcados.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
