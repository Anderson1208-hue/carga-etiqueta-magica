import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Loader2, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";

type Linha = {
  chave: string;
  numero_nf: string | null;
  status_portal: string | null;
  status_validacao: string | null;
  possui_imagem: string | null;
  justificativa: string | null;
  recebedor: string | null;
  data_entrega: string | null;
  consultado_em: string;
  nova_foto_path: string | null;
  nova_foto_enviada_em: string | null;
  nova_foto_resultado: string | null;
};

const reprovado = (l: Linha) =>
  (l.status_validacao ?? "").toUpperCase().includes("INVALID") || (l.status_portal ?? "").toUpperCase().includes("REPROV");

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export function IbacValidacaoPortalPanel() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [rodando, setRodando] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["ibac-portal-validacao"],
    queryFn: async () => {
      const all: Linha[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await (supabase as any)
          .from("ibac_portal_validacao")
          .select("chave,numero_nf,status_portal,status_validacao,possui_imagem,justificativa,recebedor,data_entrega,consultado_em,nova_foto_path,nova_foto_enviada_em,nova_foto_resultado")
          .order("chave")
          .range(from, from + 999);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return all;
    },
  });

  const linhas = useMemo(() => {
    const b = busca.trim();
    return data
      .filter((l) => status === "todos" || l.status_portal === status)
      .filter((l) => !b || (l.numero_nf ?? "").includes(b) || (l.recebedor ?? "").toLowerCase().includes(b.toLowerCase()))
      .sort((a, b2) => Number(a.numero_nf ?? 0) - Number(b2.numero_nf ?? 0));
  }, [data, busca, status]);

  const ultima = data.reduce<string | null>((m, l) => (!m || l.consultado_em > m ? l.consultado_em : m), null);
  const cont = (s: string) => data.filter((l) => l.status_portal === s).length;

  const inputRef = useRef<HTMLInputElement>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const chamar = async (body: Record<string, unknown>) => {
    const { data: r, error } = await supabase.functions.invoke("ibac-corrigir-foto", { body });
    if (error) {
      let m = "Não foi possível concluir.";
      try { m = (await (error as any).context?.json())?.mensagem ?? m; } catch { /* sem corpo */ }
      throw new Error(m);
    }
    return r;
  };

  const anexar = async (chave: string, arquivo: File) => {
    setOcupado(chave);
    try {
      if (!["image/jpeg", "image/png"].includes(arquivo.type)) throw new Error("Selecione uma foto JPEG ou PNG.");
      const path = `ibac-correcoes/${chave}/${crypto.randomUUID()}.${arquivo.type === "image/png" ? "png" : "jpg"}`;
      const { error } = await supabase.storage.from("comprovantes").upload(path, arquivo, { contentType: arquivo.type, upsert: false });
      if (error) throw error;
      await chamar({ acao: "anexar", chave, nova_foto_path: path });
      toast.success("Nova foto anexada; ainda não enviada.");
      qc.invalidateQueries({ queryKey: ["ibac-portal-validacao"] });
    } catch (e: any) { toast.error(e?.message ?? "Falha ao anexar"); } finally { setOcupado(null); }
  };

  const reenviar = async (chave: string) => {
    if (!confirm("Reenviar a nova imagem para a Cacau Show?")) return;
    setOcupado(chave);
    try {
      const r = await chamar({ acao: "reenviar", chave });
      if (r?.status === "enviado") toast.success("Nova imagem enviada. A validação depende do portal.");
      else toast.warning(`Reenvio na fila: ${r?.mensagem ?? "pendente"}`);
      qc.invalidateQueries({ queryKey: ["ibac-portal-validacao"] });
    } catch (e: any) { toast.error(e?.message ?? "Falha ao reenviar"); } finally { setOcupado(null); }
  };

  const atualizar = async () => {
    setRodando(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("ibac-portal-consultar", { body: {} });
      if (error) throw error;
      toast.success(`Portal consultado: ${r?.gravadas ?? 0} notas em ${Math.round((r?.duracao_ms ?? 0) / 1000)}s`);
      qc.invalidateQueries({ queryKey: ["ibac-portal-validacao"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao consultar o portal");
    } finally {
      setRodando(false);
    }
  };

  return (
    <Card>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (f && alvo) anexar(alvo, f);
      }} />
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle className="text-base">Validação no portal Cacau Show</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Retorno do portal (somente leitura). Atualização automática às 07h em dias úteis. Última consulta: {fmt(ultima)}
          </p>
        </div>
        <Button size="sm" onClick={atualizar} disabled={rodando}>
          {rodando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Atualizar agora
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap text-xs">
          <Badge>Aprovado: {cont("APROVADO")}</Badge>
          <Badge variant="secondary">Pendente: {cont("PENDENTE")}</Badge>
          <Badge variant="outline">Total: {data.length}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="NF ou recebedor" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="APROVADO">Aprovado</SelectItem>
              <SelectItem value="PENDENTE">Pendente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>NF</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Status validação</TableHead>
                <TableHead>Possui imagem</TableHead>
                <TableHead>Justificativa</TableHead>
                <TableHead>Recebedor</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead className="sticky right-0 bg-background">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.chave}>
                  <TableCell className="font-mono">{l.numero_nf ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={l.status_portal === "APROVADO" ? "default" : "secondary"}>{l.status_portal ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className={l.status_validacao === "INVALIDO" ? "text-destructive font-medium" : ""}>
                    {l.status_validacao ?? "—"}
                  </TableCell>
                  <TableCell>{l.possui_imagem ?? "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{l.justificativa ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{l.recebedor ?? "—"}</TableCell>
                  <TableCell>{fmt(l.data_entrega)}</TableCell>
                  <TableCell className="sticky right-0 bg-background whitespace-nowrap">
                    {reprovado(l) ? (
                      <div className="flex gap-1 items-center">
                        <Button size="sm" variant="outline" disabled={ocupado === l.chave} onClick={() => { setAlvo(l.chave); inputRef.current?.click(); }}>
                          <Paperclip className="w-4 h-4 mr-1" />Anexar nova foto
                        </Button>
                        <Button size="sm" disabled={ocupado === l.chave || !l.nova_foto_path || !!l.nova_foto_enviada_em} onClick={() => reenviar(l.chave)}>
                          {ocupado === l.chave ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}Reenviar nova imagem
                        </Button>
                        {l.nova_foto_resultado && <span className="text-muted-foreground">{l.nova_foto_resultado}</span>}
                      </div>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && linhas.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nenhuma nota.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
