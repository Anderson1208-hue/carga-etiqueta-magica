import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CargaPendentePandurata } from "@/lib/pandurata-pendentes";

const fmt = (n: number | null, d = 2) => (n === null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function CargasPendentesPandurata({ onEmitir }: { onEmitir: (carga: CargaPendentePandurata) => void }) {
  const qc = useQueryClient();

  const pendentes = useQuery({
    queryKey: ["pandurata-otm-pendentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pandurata_otm_cargas")
        .select("*")
        .is("ordem_coleta_id", null)
        .order("inicio_viagem", { ascending: true })
        .order("shipment_id")
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const ultima = useQuery({
    queryKey: ["pandurata-otm-execucao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pandurata_otm_execucoes")
        .select("iniciado_em, sucesso, erro, novas, total_sem_veiculo")
        .order("iniciado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const atualizar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pandurata-otm-pendentes", { body: {} });
      if (error) {
        const det = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
        throw new Error(det?.error ? `Portal Pandurata: ${det.error}` : "Não foi possível consultar o portal Pandurata.");
      }
      return data as { gravadas: number; total_sem_veiculo: number; restantes: number };
    },
    onSuccess: (r) => {
      toast.success(
        r.gravadas
          ? `${r.gravadas} carga(s) nova(s) do portal.${r.restantes ? ` Faltam ${r.restantes}; clique novamente.` : ""}`
          : `Nenhuma carga nova. Sem veículo no portal: ${r.total_sem_veiculo}.`,
      );
      qc.invalidateQueries({ queryKey: ["pandurata-otm-pendentes"] });
      qc.invalidateQueries({ queryKey: ["pandurata-otm-execucao"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["pandurata-otm-execucao"] });
    },
  });

  const lista = pendentes.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Cargas do portal Pandurata sem veículo e motorista que ainda não estão no sistema. O portal é só consultado, nada é gravado nele.
          {ultima.data && (
            <span className="block text-xs">
              Última atualização: {dataHora(ultima.data.iniciado_em)}
              {ultima.data.sucesso === false && ultima.data.erro ? ` — falhou: ${ultima.data.erro}` : ""}
            </span>
          )}
        </p>
        <Button onClick={() => atualizar.mutate()} disabled={atualizar.isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${atualizar.isPending ? "animate-spin" : ""}`} />
          {atualizar.isPending ? "Consultando portal..." : "Atualizar do portal"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DT / remessa</TableHead>
                <TableHead>Início da viagem</TableHead>
                <TableHead>Cliente / destino</TableHead>
                <TableHead className="text-right">Pallets / caixas</TableHead>
                <TableHead className="text-right">Peso líq. / bruto (kg)</TableHead>
                <TableHead className="text-right">Vol. líq. / bruto (m³)</TableHead>
                <TableHead className="text-right">Paradas</TableHead>
                <TableHead><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendentes.isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Carregando cargas pendentes...</TableCell></TableRow>
              ) : pendentes.isError ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-destructive">Não foi possível carregar as cargas pendentes.</TableCell></TableRow>
              ) : lista.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhuma carga pendente. Clique em "Atualizar do portal" para consultar.</TableCell></TableRow>
              ) : lista.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {c.numero_dt ?? "—"}
                    <div className="text-xs font-normal text-muted-foreground">Remessa {c.remessa_id ?? c.shipment_id}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{dataHora(c.inicio_viagem)}</TableCell>
                  <TableCell className="min-w-48">
                    <div>{c.cliente ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{[c.cidade_destino, c.uf_destino].filter(Boolean).join(" / ")}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.qtd_pallets ?? "—"} / {c.qtd_caixas ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(c.peso_liquido_kg)} / {fmt(c.peso_bruto_kg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(c.volume_liquido_m3)} / {fmt(c.volume_bruto_m3)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.num_paradas ?? "—"}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => onEmitir(c)}>
                      <FileText className="mr-2 h-4 w-4" /> Emitir ordem de coleta
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
