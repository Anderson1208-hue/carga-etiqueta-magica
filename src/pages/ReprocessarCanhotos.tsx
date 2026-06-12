import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Play, RefreshCw, ImageIcon } from "lucide-react";

type Status = "ok" | "alerta" | "ruim";
const STATUSES: Status[] = ["ok", "alerta", "ruim"];

function statusColor(s: string | null | undefined) {
  if (s === "ok") return "bg-green-100 text-green-800 border-green-300";
  if (s === "alerta") return "bg-amber-100 text-amber-800 border-amber-300";
  if (s === "ruim") return "bg-red-100 text-red-800 border-red-300";
  return "bg-muted text-muted-foreground";
}

export default function ReprocessarCanhotos() {
  const qc = useQueryClient();
  const [rodando, setRodando] = useState(false);
  const [processadasNaSessao, setProcessadasNaSessao] = useState(0);

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["reprocessar-canhotos-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listar_audit_log" as any, {}).select; // placeholder; vamos usar SQL
      // Não temos RPC; usamos múltiplas queries
      const total = await supabase.from("baixas_entrega").select("id", { count: "exact", head: true })
        .not("foto_path", "is", null).not("validacao_em_v1", "is", null);
      const reproc = await supabase.from("baixas_entrega").select("id", { count: "exact", head: true })
        .not("foto_path", "is", null).not("validacao_em_v1", "is", null)
        .filter("validacao_em", "gt", "validacao_em_v1" as any);
      return {
        total: total.count ?? 0,
        reprocessadas: reproc.count ?? 0,
      };
    },
    refetchInterval: rodando ? 3000 : false,
  });

  const { data: matriz } = useQuery({
    queryKey: ["reprocessar-canhotos-matriz"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baixas_entrega")
        .select("validacao_status, validacao_status_v1")
        .not("validacao_status_v1", "is", null)
        .not("validacao_status", "is", null);
      if (error) throw error;
      const m: Record<string, Record<string, number>> = {};
      for (const s of STATUSES) {
        m[s] = { ok: 0, alerta: 0, ruim: 0 };
      }
      for (const r of data ?? []) {
        const v1 = r.validacao_status_v1 as Status;
        const v2 = r.validacao_status as Status;
        if (m[v1] && m[v1][v2] != null) m[v1][v2]++;
      }
      return m;
    },
    refetchInterval: rodando ? 5000 : false,
  });

  const { data: mudancas } = useQuery({
    queryKey: ["reprocessar-canhotos-mudancas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baixas_entrega")
        .select("id, foto_path, registrado_em, validacao_status, validacao_score, validacao_status_v1, validacao_score_v1, validacao_problemas, nf_id, notas_fiscais:nf_id(numero_nf)")
        .not("validacao_status_v1", "is", null)
        .not("validacao_status", "is", null)
        .filter("validacao_status", "neq", "validacao_status_v1" as any)
        .order("registrado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: rodando ? 5000 : false,
  });

  const dispararLote = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("reprocessar-canhotos", {
        body: { limit: 25, delay_ms: 1100 },
      });
      if (error) throw error;
      return data;
    },
  });

  async function rodarTudo() {
    if (rodando) return;
    setRodando(true);
    setProcessadasNaSessao(0);
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const r: any = await dispararLote.mutateAsync();
        setProcessadasNaSessao((p) => p + (r?.ok ?? 0));
        await refetchStats();
        qc.invalidateQueries({ queryKey: ["reprocessar-canhotos-matriz"] });
        qc.invalidateQueries({ queryKey: ["reprocessar-canhotos-mudancas"] });
        if (!r || (r.restantes ?? 0) === 0 || (r.processadas ?? 0) === 0) break;
      }
      toast.success("Reprocessamento concluído");
    } catch (e: any) {
      toast.error(`Erro: ${e.message ?? e}`);
    } finally {
      setRodando(false);
    }
  }

  async function rodarLoteUnico() {
    if (rodando) return;
    setRodando(true);
    try {
      const r: any = await dispararLote.mutateAsync();
      toast.success(`Lote: ${r?.ok ?? 0} ok, ${r?.falhas ?? 0} falhas, ${r?.restantes ?? 0} restantes`);
      await refetchStats();
      qc.invalidateQueries({ queryKey: ["reprocessar-canhotos-matriz"] });
      qc.invalidateQueries({ queryKey: ["reprocessar-canhotos-mudancas"] });
    } catch (e: any) {
      toast.error(`Erro: ${e.message ?? e}`);
    } finally {
      setRodando(false);
    }
  }

  const totalSnapshot = stats?.total ?? 0;
  const reprocessadas = stats?.reprocessadas ?? 0;
  const restantes = Math.max(0, totalSnapshot - reprocessadas);
  const pct = totalSnapshot > 0 ? Math.round((reprocessadas / totalSnapshot) * 100) : 0;

  // Totais por linha/coluna
  const totaisAntes = matriz
    ? Object.fromEntries(STATUSES.map((s) => [s, STATUSES.reduce((a, c) => a + (matriz[s]?.[c] ?? 0), 0)]))
    : { ok: 0, alerta: 0, ruim: 0 };
  const totaisDepois = matriz
    ? Object.fromEntries(STATUSES.map((c) => [c, STATUSES.reduce((a, s) => a + (matriz[s]?.[c] ?? 0), 0)]))
    : { ok: 0, alerta: 0, ruim: 0 };

  return (
    <MainLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Reprocessar canhotos — critério novo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reavalia todos os canhotos com a regra atualizada (sem NF / sem data / sem assinatura / nitidez &lt; 50% / cortado → reprovado).
            A nota antiga fica preservada nas colunas <code>*_v1</code> para comparação.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Progresso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>{reprocessadas} de {totalSnapshot} reavaliadas ({pct}%)</span>
              <span className="text-muted-foreground">{restantes} restantes</span>
            </div>
            <Progress value={pct} />
            <div className="flex gap-2">
              <Button onClick={rodarTudo} disabled={rodando || restantes === 0}>
                {rodando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                {rodando ? `Processando… (${processadasNaSessao} nesta sessão)` : "Rodar tudo"}
              </Button>
              <Button variant="outline" onClick={rodarLoteUnico} disabled={rodando || restantes === 0}>
                <Play className="w-4 h-4 mr-2" /> Rodar 1 lote (25)
              </Button>
              <Button variant="ghost" onClick={() => { refetchStats(); qc.invalidateQueries({ queryKey: ["reprocessar-canhotos-matriz"] }); }}>
                <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ~1 canhoto/s para respeitar rate limit do Gemini. Custo estimado: ~0,001 crédito por canhoto.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Matriz: antes (linhas) × depois (colunas)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Antes ↓ / Depois →</TableHead>
                  {STATUSES.map((s) => (
                    <TableHead key={s} className="text-center capitalize">{s}</TableHead>
                  ))}
                  <TableHead className="text-center font-semibold">Total antes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STATUSES.map((sAntes) => (
                  <TableRow key={sAntes}>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(sAntes)}>{sAntes}</Badge>
                    </TableCell>
                    {STATUSES.map((sDepois) => {
                      const v = matriz?.[sAntes]?.[sDepois] ?? 0;
                      const igual = sAntes === sDepois;
                      return (
                        <TableCell key={sDepois} className={`text-center ${igual ? "bg-muted/40 font-medium" : ""}`}>
                          {v}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center font-semibold">{totaisAntes[sAntes] ?? 0}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">Total depois</TableCell>
                  {STATUSES.map((s) => (
                    <TableCell key={s} className="text-center font-semibold">{totaisDepois[s] ?? 0}</TableCell>
                  ))}
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              Diagonal = mesma classificação. Fora da diagonal = mudou. Coluna "ruim" depois costuma crescer porque o critério novo reprova foto cortada / sem NF / sem data / sem assinatura.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Últimas 100 mudanças de status</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NF</TableHead>
                  <TableHead>Foto</TableHead>
                  <TableHead className="text-center">Antes</TableHead>
                  <TableHead className="text-center">Depois</TableHead>
                  <TableHead>Motivos (novo)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mudancas ?? []).map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.notas_fiscais?.numero_nf ?? "—"}</TableCell>
                    <TableCell>
                      {b.foto_path ? (
                        <FotoLink path={b.foto_path} />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={statusColor(b.validacao_status_v1)}>
                        {b.validacao_status_v1} {b.validacao_score_v1 != null ? `(${b.validacao_score_v1})` : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={statusColor(b.validacao_status)}>
                        {b.validacao_status} {b.validacao_score != null ? `(${b.validacao_score})` : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {(b.validacao_problemas?.lista ?? []).slice(0, 3).join(" · ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {(!mudancas || mudancas.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Nenhuma mudança ainda — rode o reprocessamento para começar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

function FotoLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  async function abrir() {
    if (url) {
      window.open(url, "_blank");
      return;
    }
    const { data } = await supabase.storage.from("comprovantes").createSignedUrl(path, 300);
    if (data?.signedUrl) {
      setUrl(data.signedUrl);
      window.open(data.signedUrl, "_blank");
    }
  }
  return (
    <Button variant="ghost" size="sm" onClick={abrir}>
      <ImageIcon className="w-4 h-4" />
    </Button>
  );
}
