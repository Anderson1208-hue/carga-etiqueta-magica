import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react";

export interface ConciliacaoLinha {
  nf_id: string;
  numero_nf: string | null;
  dest_razao_social: string | null;
  dest_cidade: string | null;
  cnpj_destinatario: string | null;
  em_escopo_ibac: boolean;
  baixa_id: string | null;
  ocorrencia: string | null;
  status_baixa: string | null;
  tem_foto: boolean;
  conferencia_status: string | null;
  queue_status: string | null;
  queue_erro: string | null;
  enviado_em: string | null;
  classificacao: string;
  gravidade: "ok" | "atencao" | "erro";
}

const LABEL: Record<string, string> = {
  canhoto_enviado: "Canhoto enviado à IBAC",
  canhoto_na_fila: "Canhoto na fila de envio",
  canhoto_erro_envio: "Erro no envio do canhoto",
  canhoto_cancelado: "Canhoto cancelado (fora do escopo)",
  canhoto_nao_enfileirado: "Entregue, canhoto não enfileirado",
  entregue_sem_foto: "Entregue sem foto do canhoto",
  canhoto_pendente_recuperacao: "Canhoto pendente de recuperação",
  ocorrencia_valida: "Ocorrência válida (reentrega/recusa/ausente)",
  fora_escopo_ibac: "Fora do escopo IBAC",
  sem_desfecho: "Sem desfecho (nem baixa, nem ocorrência)",
};

export function ConciliacaoIbacPanel({
  veiculoId,
  placa,
  encerrado,
  onErrosChange,
}: {
  veiculoId: string;
  placa: string;
  encerrado?: boolean;
  onErrosChange?: (erros: number) => void;
}) {
  const [linhas, setLinhas] = useState<ConciliacaoLinha[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await (supabase as any).rpc("conciliar_veiculo_ibac", {
        p_veiculo_id: veiculoId,
      });
      if (error) throw error;
      // Antes de encerrar a prestação, o canhoto ainda não foi enfileirado por
      // definição — isso só é erro depois do encerramento.
      const rows = ((data ?? []) as ConciliacaoLinha[]).map((l) =>
        !encerrado && l.classificacao === "canhoto_nao_enfileirado"
          ? { ...l, gravidade: "atencao" as const }
          : l,
      );
      setLinhas(rows);
    } catch (e: any) {
      setErro(e?.message ?? "Falha na conciliação");
    } finally {
      setLoading(false);
    }
  }, [veiculoId, encerrado]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const resumo = useMemo(() => {
    const total = linhas.length;
    const erros = linhas.filter((l) => l.gravidade === "erro").length;
    const atencao = linhas.filter((l) => l.gravidade === "atencao").length;
    const enviados = linhas.filter((l) => l.classificacao === "canhoto_enviado").length;
    const ocorrencias = linhas.filter((l) => l.classificacao === "ocorrencia_valida").length;
    return { total, erros, atencao, enviados, ocorrencias };
  }, [linhas]);

  useEffect(() => {
    onErrosChange?.(resumo.erros);
  }, [resumo.erros, onErrosChange]);

  const gravidadeBadge = (l: ConciliacaoLinha) => {
    if (l.gravidade === "erro")
      return (
        <Badge variant="destructive" className="gap-1 whitespace-nowrap">
          <AlertTriangle className="w-3 h-3" /> Erro
        </Badge>
      );
    if (l.gravidade === "atencao")
      return (
        <Badge variant="secondary" className="gap-1 whitespace-nowrap">
          <Clock className="w-3 h-3" /> Aguardando
        </Badge>
      );
    return (
      <Badge className="gap-1 whitespace-nowrap bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="w-3 h-3" /> OK
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Conciliação IBAC — {placa}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Confronto entre as NFs roteirizadas na placa e os canhotos efetivamente enviados.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={carregar} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
          <Box label="NFs roteirizadas" value={resumo.total} />
          <Box label="Canhotos enviados" value={resumo.enviados} tone="good" />
          <Box label="Ocorrências" value={resumo.ocorrencias} />
          <Box label="Aguardando" value={resumo.atencao} tone={resumo.atencao > 0 ? "warn" : undefined} />
          <Box label="Erros" value={resumo.erros} tone={resumo.erros > 0 ? "bad" : undefined} />
        </div>

        {resumo.erros === 0 && !loading ? (
          <p className="text-sm text-emerald-600 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Conta fechada: nenhuma NF roteirizada ficou sem desfecho ou sem canhoto.
          </p>
        ) : (
          resumo.erros > 0 && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {resumo.erros} NF(s) exigem tratamento: reentrega, nova foto ou reenvio.
            </p>
          )
        )}

        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="[&>*]:py-1.5 [&>*]:px-2">
                <TableHead>NF</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Ocorrência</TableHead>
                <TableHead>Fila</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.nf_id} className="[&>*]:py-1.5 [&>*]:px-2">
                  <TableCell className="font-mono">{l.numero_nf ?? "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {l.dest_razao_social ?? "—"}
                    {l.dest_cidade ? ` · ${l.dest_cidade}` : ""}
                  </TableCell>
                  <TableCell>{LABEL[l.classificacao] ?? l.classificacao}</TableCell>
                  <TableCell>{l.ocorrencia ?? "—"}</TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {l.queue_status ?? "—"}
                    {l.queue_erro ? ` · ${l.queue_erro}` : ""}
                  </TableCell>
                  <TableCell>{gravidadeBadge(l)}</TableCell>
                </TableRow>
              ))}
              {linhas.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Nenhuma NF roteirizada nesta placa.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Box({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  const cls =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-destructive"
          : "";
  return (
    <div className="rounded-md border p-2">
      <div className={`text-lg font-bold ${cls}`}>{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}
