import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAcessoOkEntrega } from "@/hooks/useAcessoOkEntrega";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";

/** Colunas exatas da planilha de tracking da Pandurata (FIORD). */
const COLUNAS = [
  "Viagem",
  "Tipo de Viagem",
  "DT",
  "NF",
  "Status Atual",
  "Próximo Status",
  "Entrega Efetiva",
  "Solicitação de Agendamento",
  "Confirmação da Agenda",
  "Previsão de entrega",
  "Chegada ao Cliente",
  "Previsão de chegada na filial",
  "Chegada na filial",
  "Saída na filial",
] as const;

const EM_TRANSITO = "Em trânsito para filial da transportadora";
const NA_FILIAL = "Na filial da transportadora";

/** Status atual conforme a fase da carga no nosso sistema. */
function statusPandurata(statusCarga: string | null | undefined) {
  // Carga apenas cadastrada (fechada) = mercadoria ainda vindo para a filial.
  if (!statusCarga || statusCarga === "fechada") {
    return { atual: EM_TRANSITO, proximo: NA_FILIAL };
  }
  // Carga aberta ou adiante = mercadoria já na filial da transportadora.
  return { atual: NA_FILIAL, proximo: "" };
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function diasAtrasISO(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

type Linha = {
  id: string;
  numero_nf: string;
  dest: string;
  cidade: string;
  entrada: string;
  statusCarga: string | null;
  atual: string;
  proximo: string;
};

export default function TrackingPandurata() {
  const { podeVerOkEntrega, isLoading: carregandoAcesso } = useAcessoOkEntrega();
  const [de, setDe] = useState(diasAtrasISO(7));
  const [ate, setAte] = useState(hojeISO());

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["tracking-pandurata", de, ate],
    enabled: podeVerOkEntrega,
    queryFn: async (): Promise<Linha[]> => {
      const linhas: Linha[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: nfs, error } = await supabase
          .from("notas_fiscais")
          .select("id, numero_nf, dest_razao_social, dest_cidade, created_at, carga_id, cargas(status)")
          .like("cnpj_emitente", "70940994%")
          .gte("created_at", `${de}T00:00:00`)
          .lte("created_at", `${ate}T23:59:59`)
          .order("created_at", { ascending: true })
          .order("numero_nf", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const lote = nfs ?? [];
        for (const nf of lote) {
          const statusCarga =
            (nf as unknown as { cargas?: { status?: string } | null }).cargas?.status ?? null;
          const { atual, proximo } = statusPandurata(statusCarga);
          linhas.push({
            id: nf.id,
            numero_nf: nf.numero_nf,
            dest: nf.dest_razao_social ?? "—",
            cidade: nf.dest_cidade ?? "—",
            entrada: nf.created_at,
            statusCarga,
            atual,
            proximo,
          });
        }
        if (lote.length < PAGE) break;
      }
      return linhas;
    },
  });

  const linhas = data ?? [];

  const resumo = useMemo(() => {
    const emTransito = linhas.filter((l) => l.atual === EM_TRANSITO).length;
    return { total: linhas.length, emTransito, naFilial: linhas.length - emTransito };
  }, [linhas]);

  function exportar() {
    if (!linhas.length) {
      toast.error("Nada para exportar no período selecionado");
      return;
    }
    const dados = linhas.map((l) => ({
      Viagem: "",
      "Tipo de Viagem": "",
      DT: "",
      NF: Number(l.numero_nf) || l.numero_nf,
      "Status Atual": l.atual,
      "Próximo Status": l.proximo,
      "Entrega Efetiva": "",
      "Solicitação de Agendamento": "",
      "Confirmação da Agenda": "",
      "Previsão de entrega": "",
      "Chegada ao Cliente": "",
      "Previsão de chegada na filial": "",
      "Chegada na filial": "",
      "Saída na filial": "",
    }));
    const ws = XLSX.utils.json_to_sheet(dados, { header: [...COLUNAS] });
    ws["!cols"] = COLUNAS.map((c) => ({ wch: Math.max(12, c.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "sheet");
    XLSX.writeFile(wb, `status-entregas-pandurata-${de}_a_${ate}.xlsx`);
    toast.success(`${dados.length} nota(s) exportada(s)`);
  }

  if (carregandoAcesso) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </MainLayout>
    );
  }
  if (!podeVerOkEntrega) return <Navigate to="/" replace />;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Tracking Pandurata (FIORD)</h1>
            <p className="text-sm text-muted-foreground">
              Planilha de status por nota fiscal. Viagem, Tipo de Viagem e DT ficam em branco — o
              portal preenche sozinho ao informar o número da nota.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Período de entrada da carga no sistema</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>De</Label>
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label>Até</Label>
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-40" />
            </div>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Atualizar
            </Button>
            <Button onClick={exportar} disabled={isFetching || !linhas.length}>
              <Download className="w-4 h-4 mr-2" /> Exportar planilha
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Notas no período</p>
              <p className="text-2xl font-bold">{resumo.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Em trânsito para filial</p>
              <p className="text-2xl font-bold">{resumo.emTransito}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Na filial da transportadora</p>
              <p className="text-2xl font-bold">{resumo.naFilial}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prévia</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NF</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Status Atual</TableHead>
                    <TableHead>Próximo Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isFetching && !linhas.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Carregando…
                      </TableCell>
                    </TableRow>
                  )}
                  {!isFetching && !linhas.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma nota da Pandurata no período.
                      </TableCell>
                    </TableRow>
                  )}
                  {linhas.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.numero_nf}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{l.dest}</TableCell>
                      <TableCell>{l.cidade}</TableCell>
                      <TableCell>
                        <Badge variant={l.atual === EM_TRANSITO ? "secondary" : "default"}>{l.atual}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.proximo || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
