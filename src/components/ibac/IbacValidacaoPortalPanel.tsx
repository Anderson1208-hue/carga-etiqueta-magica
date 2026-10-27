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
import { isEmitenteCacau } from "@/lib/embarcadores-cacau";
import { correcaoPendente, confirmacaoSubstituicao } from "@/lib/ibac-correcao-ui";

type Portal = {
  chave: string;
  status_portal: string | null;
  status_validacao: string | null;
  possui_imagem: string | null;
  justificativa: string | null;
  consultado_em: string;
  nova_foto_path: string | null;
  nova_foto_enviada_em: string | null;
  nova_foto_resultado: string | null;
  correcao_estado: string | null;
};

type Linha = {
  id: string;
  numero_nf: string | null;
  chave: string | null;
  destinatario: string | null;
  placa: string | null;
  status_entrega: string | null;
  portal: Portal | null;
};

type StatusInt = "aprovado" | "recusado" | "pendente" | "sem_retorno";

const statusInt = (p: Portal | null): StatusInt => {
  if (!p) return "sem_retorno";
  if ((p.status_portal ?? "").toUpperCase().includes("APROV")) return "aprovado";
  if ((p.status_validacao ?? "").toUpperCase().includes("INVALID") || (p.status_portal ?? "").toUpperCase().includes("REPROV")) return "recusado";
  return "pendente";
};

const LABEL: Record<StatusInt, string> = {
  aprovado: "Aprovado",
  recusado: "Recusado",
  pendente: "Pendente",
  sem_retorno: "Sem retorno do portal",
};

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const hojeBR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function StatusBadge({ s }: { s: StatusInt }) {
  if (s === "aprovado") return <Badge>{LABEL[s]}</Badge>;
  if (s === "recusado") return <Badge variant="destructive">{LABEL[s]}</Badge>;
  if (s === "pendente") return <Badge variant="secondary">{LABEL[s]}</Badge>;
  return <Badge variant="outline">{LABEL[s]}</Badge>;
}

export function IbacValidacaoPortalPanel() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [dataConsulta, setDataConsulta] = useState(hojeBR());
  const [rodando, setRodando] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["ibac-portal-validacao", dataConsulta],
    enabled: !!dataConsulta,
    queryFn: async (): Promise<Linha[]> => {
      const { data: veiculos, error: ve } = await supabase.from("veiculos").select("id, placa").eq("data", dataConsulta);
      if (ve) throw ve;
      const vIds = (veiculos ?? []).map((v: any) => v.id);
      if (!vIds.length) return [];
      const vinc: any[] = [];
      for (let i = 0; i < vIds.length; i += 200) {
        const { data, error } = await supabase.from("veiculo_nfs").select("veiculo_id, nf_id").in("veiculo_id", vIds.slice(i, i + 200));
        if (error) throw error;
        vinc.push(...(data ?? []));
      }
      const nfIds = Array.from(new Set(vinc.map((v) => v.nf_id)));
      const notas: any[] = [];
      for (let i = 0; i < nfIds.length; i += 200) {
        const { data, error } = await supabase.from("notas_fiscais")
          .select("id, numero_nf, chave_acesso, cnpj_emitente, dest_razao_social, status_entrega")
          .in("id", nfIds.slice(i, i + 200));
        if (error) throw error;
        notas.push(...(data ?? []));
      }
      const cacau = notas.filter((n) => isEmitenteCacau(n.cnpj_emitente));
      const chaves = cacau.map((n) => n.chave_acesso).filter(Boolean);
      const portal = new Map<string, Portal>();
      for (let i = 0; i < chaves.length; i += 200) {
        const { data, error } = await (supabase as any).from("ibac_portal_validacao")
          .select("chave,status_portal,status_validacao,possui_imagem,justificativa,consultado_em,nova_foto_path,nova_foto_enviada_em,nova_foto_resultado,correcao_estado")
          .in("chave", chaves.slice(i, i + 200));
        if (error) throw error;
        for (const p of data ?? []) portal.set(p.chave, p);
      }
      const placa = new Map((veiculos ?? []).map((v: any) => [v.id, v.placa]));
      const vMap = new Map(vinc.map((v) => [v.nf_id, v.veiculo_id]));
      return cacau.map((n) => ({
        id: n.id,
        numero_nf: n.numero_nf,
        chave: n.chave_acesso,
        destinatario: n.dest_razao_social,
        placa: placa.get(vMap.get(n.id)) ?? null,
        status_entrega: n.status_entrega,
        portal: n.chave_acesso ? portal.get(n.chave_acesso) ?? null : null,
      }));
    },
  });

  const linhas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return data
      .filter((l) => status === "todos" || statusInt(l.portal) === status)
      .filter((l) => !b || [l.numero_nf, l.destinatario, l.placa].some((x) => (x ?? "").toLowerCase().includes(b)))
      .sort((a, c) => Number(a.numero_nf ?? 0) - Number(c.numero_nf ?? 0));
  }, [data, busca, status]);

  const ultima = data.reduce<string | null>((m, l) => (l.portal && (!m || l.portal.consultado_em > m) ? l.portal.consultado_em : m), null);
  const veic = new Set(data.map((l) => l.placa).filter(Boolean)).size;

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
    if (!confirm(confirmacaoSubstituicao(data.find(l => l.chave === chave)?.portal?.correcao_estado))) return;
    setOcupado(chave);
    try {
      const r = await chamar({ acao: "reenviar", chave });
      if (r?.status === "enviado") toast.success("Nova imagem enviada. A validação depende do portal.");
      else toast.warning(r?.mensagem ?? "Substituição não concluída.");
      qc.invalidateQueries({ queryKey: ["ibac-portal-validacao"] });
    } catch (e: any) { toast.error(e?.message ?? "Falha ao reenviar"); } finally { setOcupado(null); qc.invalidateQueries({ queryKey: ["ibac-portal-validacao"] }); }
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
          <CardTitle className="text-base">NFs Cacau Show por data de roteirização</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Acompanhamento desde a roteirização até o retorno do portal Cacau Show. Atualização automática às 07h em dias úteis. Última consulta: {fmt(ultima)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={atualizar} disabled={rodando}>
          {rodando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <label className="text-sm">Data da roteirização</label>
          <Input type="date" value={dataConsulta} onChange={(e) => setDataConsulta(e.target.value)} className="w-40" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="recusado">Recusado</SelectItem>
              <SelectItem value="sem_retorno">Sem retorno do portal</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Buscar NF, destinatário ou placa" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
        </div>
        <p className="text-xs text-muted-foreground">{linhas.length} de {data.length} NF(s) · {veic} veículo(s)</p>
        <div className="overflow-x-auto">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>NF</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Status da entrega</TableHead>
                <TableHead>Status da integração</TableHead>
                <TableHead>Retorno portal</TableHead>
                <TableHead>Possui imagem</TableHead>
                <TableHead className="sticky right-0 bg-background">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => {
                const s = statusInt(l.portal);
                const p = l.portal;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono">{l.numero_nf ?? "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{l.destinatario ?? "—"}</TableCell>
                    <TableCell className="font-mono">{l.placa ?? "—"}</TableCell>
                    <TableCell>{l.status_entrega ?? "—"}</TableCell>
                    <TableCell><StatusBadge s={s} /></TableCell>
                    <TableCell className="max-w-[200px]">
                      {p ? `${p.status_portal ?? "—"} · ${p.status_validacao ?? "—"}${p.justificativa ? ` · ${p.justificativa}` : ""}` : "—"}
                    </TableCell>
                    <TableCell>{p?.possui_imagem ?? "—"}</TableCell>
                    <TableCell className="sticky right-0 bg-background whitespace-nowrap">
                      {(s === "recusado" || correcaoPendente(p?.correcao_estado)) && l.chave ? (
                        <div className="flex flex-col gap-1">
                          <Button size="sm" variant="outline" disabled={ocupado === l.chave || correcaoPendente(p?.correcao_estado)} onClick={() => { setAlvo(l.chave); inputRef.current?.click(); }}>
                            <Paperclip className="w-4 h-4 mr-1" />Anexar nova foto
                          </Button>
                          <Button size="sm" disabled={ocupado === l.chave || !p?.nova_foto_path || !!p?.nova_foto_enviada_em} onClick={() => { if (l.chave) reenviar(l.chave); }}>
                            {ocupado === l.chave ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}{correcaoPendente(p?.correcao_estado) ? 'Retomar envio' : 'Reenviar nova imagem'}
                          </Button>
                          {p?.nova_foto_resultado && <span className="text-muted-foreground">{p.nova_foto_resultado}</span>}
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin inline" /></TableCell></TableRow>
              )}
              {!isLoading && linhas.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nenhuma NF Cacau Show roteirizada nesta data.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
