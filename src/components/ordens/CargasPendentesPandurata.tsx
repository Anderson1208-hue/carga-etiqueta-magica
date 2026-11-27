import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useState } from "react";
import { Download, FileText, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CargaPendentePandurata } from "@/lib/pandurata-pendentes";
import { gerarPdfPendentesPandurata } from "@/lib/pandurata-pendentes-pdf";

const fmt = (n: number | null, d = 2) => (n === null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d }));
const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function CargasPendentesPandurata({ onEmitir }: { onEmitir: (carga: CargaPendentePandurata) => void }) {
  const qc = useQueryClient();
  const [pesquisa, setPesquisa] = useState("");
  const [termo, setTermo] = useState("");
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [gerandoCanceladas, setGerandoCanceladas] = useState(false);

  const gerarCanceladas = async () => {
    setGerandoCanceladas(true);
    try {
      const cargas: CargaPendentePandurata[] = [];
      let cursor: string | null = null;
      while (true) {
        let consulta = supabase.from("pandurata_otm_cargas").select("*")
          .not("excluida_em", "is", null).order("id").limit(300);
        if (cursor) consulta = consulta.gt("id", cursor);
        const { data, error } = await consulta;
        if (error) throw error;
        const pagina = data ?? [];
        cargas.push(...pagina);
        if (pagina.length < 300) break;
        const ultimaCarga = pagina[pagina.length - 1];
        if (!ultimaCarga) break;
        cursor = ultimaCarga.id;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!cargas.length) {
        toast.info("Nenhuma carga cancelada registrada.");
        return;
      }
      cargas.sort((a, b) => (b.excluida_em ?? "").localeCompare(a.excluida_em ?? "") || a.id.localeCompare(b.id));
      await gerarPdfPendentesPandurata(cargas, "", true);
    } catch {
      toast.error("Não foi possível gerar o PDF de cargas canceladas.");
    } finally {
      setGerandoCanceladas(false);
    }
  };

  const pendentes = useQuery({
    queryKey: ["pandurata-otm-pendentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pandurata_otm_cargas")
        .select("*")
        .is("ordem_coleta_id", null)
        .is("excluida_em", null)
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
      return data as { gravadas: number; total_sem_veiculo: number; restantes: number; total_portal?: number; lidas?: number };
    },
    onSuccess: (r) => {
      toast.success(
        r.gravadas
          ? `${r.gravadas} carga(s) nova(s) do portal.${r.restantes ? ` Faltam ${r.restantes}; clique novamente.` : ""}`
          : `Nenhuma carga nova. Sem veículo no portal: ${r.total_sem_veiculo}.`,
      );
      if (r.total_portal && r.lidas != null && r.lidas < r.total_portal) {
        toast.warning(`Atenção: o portal tem ${r.total_portal} cargas, mas só ${r.lidas} foram lidas. Pode haver cargas sem veículo fora da leitura.`);
      }
      qc.invalidateQueries({ queryKey: ["pandurata-otm-pendentes"] });
      qc.invalidateQueries({ queryKey: ["pandurata-otm-execucao"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["pandurata-otm-execucao"] });
    },
  });

  const excluir = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc("excluir_carga_pendente_pandurata", { _id: id, _motivo: motivo });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Carga retirada da lista de pendentes.");
      qc.invalidateQueries({ queryKey: ["pandurata-otm-pendentes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pedirExclusao = (c: CargaPendentePandurata) => {
    const motivo = window.prompt(`Retirar a DT ${c.numero_dt ?? c.shipment_id} da lista? Informe o motivo (ex.: cancelada no portal):`, "Cancelada no portal");
    if (motivo && motivo.trim().length >= 3) excluir.mutate({ id: c.id, motivo: motivo.trim() });
  };

  const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  const lista = (pendentes.data ?? []).filter((c) =>
    normalizar([c.numero_dt, c.remessa_id, c.shipment_id, c.cliente, c.cidade_destino, c.uf_destino].filter(Boolean).join(" ")).includes(normalizar(termo)),
  );

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
        <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button variant="outline" disabled={gerandoCanceladas || excluir.isPending} onClick={gerarCanceladas}>
          <Download className="mr-2 h-4 w-4" />{gerandoCanceladas ? "Gerando canceladas..." : "PDF de cargas canceladas"}
        </Button>
        <Button variant="outline" disabled={gerandoPdf || pendentes.isFetching || pendentes.isError || lista.length === 0} onClick={async () => {
          setGerandoPdf(true);
          try {
            await gerarPdfPendentesPandurata(lista, termo);
          } catch {
            toast.error("Não foi possível gerar o PDF.");
          } finally {
            setGerandoPdf(false);
          }
        }}>
          <Download className="mr-2 h-4 w-4" />{gerandoPdf ? "Gerando PDF..." : "Gerar PDF"}
        </Button>
        <Button onClick={() => atualizar.mutate()} disabled={atualizar.isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${atualizar.isPending ? "animate-spin" : ""}`} />
          {atualizar.isPending ? "Consultando portal..." : "Atualizar do portal"}
        </Button>
        </div>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => { event.preventDefault(); setTermo(pesquisa.trim()); }}
      >
        <Input
          aria-label="Pesquisar cargas pendentes"
          placeholder="DT, remessa, cliente ou destino"
          className="w-full sm:max-w-sm"
          value={pesquisa}
          onChange={(event) => setPesquisa(event.target.value)}
        />
        <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Pesquisar</Button>
        {(pesquisa || termo) && (
          <Button type="button" variant="ghost" size="icon" aria-label="Limpar pesquisa" title="Limpar pesquisa" onClick={() => { setPesquisa(""); setTermo(""); }}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </form>

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
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{termo ? "Nenhuma carga encontrada para esta pesquisa." : 'Nenhuma carga pendente. Clique em "Atualizar do portal" para consultar.'}</TableCell></TableRow>
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
                    <Button size="sm" variant="ghost" className="ml-1 text-destructive" title="Carga cancelada: retirar da lista" aria-label="Excluir carga cancelada" disabled={excluir.isPending} onClick={() => pedirExclusao(c)}>
                      <Trash2 className="h-4 w-4" />
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
