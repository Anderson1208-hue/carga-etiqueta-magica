import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send, Plus, Trash2, ImageIcon, CheckCircle2, AlertCircle } from "lucide-react";

export function IbacCanhotosPanel() {
  const qc = useQueryClient();
  const [novoCnpj, setNovoCnpj] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");

  const { data: cnpjs = [], refetch: refetchCnpjs } = useQuery({
    queryKey: ["ibac-canhoto-cnpjs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cnpj_envio_canhoto_auto")
        .select("*")
        .order("descricao");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["ibac-canhoto-stats"],
    queryFn: async () => {
      const sete = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const [pend, env, falha] = await Promise.all([
        supabase.from("baixas_entrega").select("id", { count: "exact", head: true })
          .not("foto_path", "is", null).is("imagem_ibac_enviada_em", null),
        supabase.from("baixas_entrega").select("id", { count: "exact", head: true })
          .gte("imagem_ibac_enviada_em", sete),
        supabase.from("baixas_entrega").select("id", { count: "exact", head: true })
          .not("imagem_ibac_ultimo_erro", "is", null).is("imagem_ibac_enviada_em", null),
      ]);
      return {
        pendentes: pend.count ?? 0,
        enviados_7d: env.count ?? 0,
        com_erro: falha.count ?? 0,
      };
    },
    refetchInterval: 30_000,
  });

  const disparar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("ibac-enfileirar-canhotos");
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Enfileirados: ${d?.enfileirados ?? 0} de ${d?.candidatos ?? 0} candidatos`);
      qc.invalidateQueries({ queryKey: ["ibac-canhoto-stats"] });
      qc.invalidateQueries({ queryKey: ["ibac-fila"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const addCnpj = useMutation({
    mutationFn: async () => {
      const cnpj = novoCnpj.replace(/\D/g, "");
      if (cnpj.length < 8) throw new Error("Informe ao menos 8 dígitos (CNPJ raiz)");
      const { error } = await supabase.from("cnpj_envio_canhoto_auto").insert({
        cnpj, descricao: novaDescricao || null, ativo: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("CNPJ cadastrado");
      setNovoCnpj(""); setNovaDescricao(""); refetchCnpjs();
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ cnpj, ativo }: { cnpj: string; ativo: boolean }) => {
      const { error } = await supabase.from("cnpj_envio_canhoto_auto")
        .update({ ativo }).eq("cnpj", cnpj);
      if (error) throw error;
    },
    onSuccess: () => refetchCnpjs(),
  });

  const removerCnpj = useMutation({
    mutationFn: async (cnpj: string) => {
      const { error } = await supabase.from("cnpj_envio_canhoto_auto").delete().eq("cnpj", cnpj);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido"); refetchCnpjs(); },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Pendentes de envio</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats?.pendentes ?? "—"}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> Enviados (7d)</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-green-600">{stats?.enviados_7d ?? "—"}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><AlertCircle className="w-4 h-4 text-destructive" /> Com erro</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-destructive">{stats?.com_erro ?? "—"}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Envio automático de canhotos</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Roda diariamente às 23h (BRT). Enfileira na fila IBAC as fotos de canhoto de baixas cujo CNPJ destinatário esteja na lista abaixo.
              O envio real respeita o cron do <code>ibac-sync</code>.
            </p>
          </div>
          <Button onClick={() => disparar.mutate()} disabled={disparar.isPending}>
            <Send className="w-4 h-4 mr-2" />
            Disparar agora
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CNPJs autorizados</CardTitle>
          <p className="text-sm text-muted-foreground">
            CNPJ raiz (8 dígitos) ou completo. O match é por prefixo, então <code>51825331</code> casa todas as filiais Cacau Show.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 items-end p-3 border rounded-md bg-muted/30">
            <div className="space-y-1">
              <Label className="text-xs">CNPJ (só dígitos)</Label>
              <Input value={novoCnpj} onChange={(e) => setNovoCnpj(e.target.value)} placeholder="51825331" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} placeholder="ex: Cacau Show" />
            </div>
            <Button onClick={() => addCnpj.mutate()} disabled={addCnpj.isPending || !novoCnpj.trim()}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CNPJ</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cnpjs.map((c) => (
                <TableRow key={c.cnpj}>
                  <TableCell className="font-mono">{c.cnpj}</TableCell>
                  <TableCell>{c.descricao ?? "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={c.ativo}
                      onCheckedChange={(v) => toggleAtivo.mutate({ cnpj: c.cnpj, ativo: v })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => removerCnpj.mutate(c.cnpj)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {cnpjs.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum CNPJ cadastrado — o cron não enfileira nada.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Badge variant="outline">Lembrete</Badge>
            O evento <code>envio_canhoto</code> precisa de <code>codigo_ibac</code> preenchido na aba <strong>De-Para de Eventos</strong> para o <code>ibac-sync</code> de fato postar à IBAC.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
