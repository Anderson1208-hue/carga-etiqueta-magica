import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, PackageOpen, Mail, Download, Ban, Camera, Save } from "lucide-react";
import { toast } from "sonner";
import {
  CABECALHO_PROTOCOLO, EMBARCADORES_CLIENTES, RETORNO_CD, STATUS_CLIENTE, embarcadorCliente, linhasProtocolo, type EmbarcadorCliente,
} from "@/lib/divergencia-clientes";

const BUCKET = "divergencias-recebimento";
const semZeros = (c: string | null | undefined) => String(c ?? "").replace(/^0+(?=\d)/, "");
type Carga = { id: string; numero_carga: string | null; placa: string | null; data: string; motorista: string | null; lacre: string | null };
interface NfBusca { id: string; numero_nf: string; carga_id: string | null; cnpj_emitente: string | null; razao_social_emitente: string | null; itens_nf: { c_prod: string; x_prod: string; q_com: number }[] }
interface Linha { id: string; carga_id: string; numero_nf: string; embarcador: EmbarcadorCliente; c_prod: string; x_prod: string; status: string; retorno_cd: string | null;
  qtd_nf: number | null; qtd_recebida: number | null; quantidade: number; observacao: string | null; fotos: string[]; criado_em: string; criado_por_nome: string | null }

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
const rotulo = (c?: Carga) => c ? `${c.numero_carga ? `Carga ${c.numero_carga}` : "Carga sem número"} — ${c.placa ?? "sem placa"} — ${new Date(`${c.data}T00:00:00`).toLocaleDateString("pt-BR")}` : "";

export default function DivergenciaClientes() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [cargaId, setCargaId] = useState("");
  const [lacre, setLacre] = useState("");
  const [numero, setNumero] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [nf, setNf] = useState<NfBusca | null>(null);
  const [semNf, setSemNf] = useState(false);
  const [emb, setEmb] = useState<EmbarcadorCliente>("PANDURATA");
  const [status, setStatus] = useState<string>("FALTA");
  const [retorno, setRetorno] = useState<string>("");
  const [cprod, setCprod] = useState(""); const [desc, setDesc] = useState("");
  const [recebida, setRecebida] = useState(""); const [qtd, setQtd] = useState("");
  const [obs, setObs] = useState(""); const [fotos, setFotos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [pacotes, setPacotes] = useState<{ nome: string; blob: Blob }[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargas = useQuery({
    queryKey: ["div-clientes-cargas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cargas").select("id, numero_carga, placa, data, motorista, lacre")
        .order("data", { ascending: false }).order("id").limit(80);
      if (error) throw error; return (data ?? []) as Carga[];
    },
  });
  const carga = cargas.data?.find((c) => c.id === cargaId);
  const lista = useQuery({
    queryKey: ["div-clientes", cargaId], enabled: !!cargaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("divergencias_recebimento_clientes")
        .select("id, carga_id, numero_nf, embarcador, c_prod, x_prod, status, retorno_cd, qtd_nf, qtd_recebida, quantidade, observacao, fotos, criado_em, criado_por_nome")
        .eq("carga_id", cargaId).is("cancelado_em", null).order("criado_em").order("id").limit(1000);
      if (error) throw error; return (data ?? []) as Linha[];
    },
  });
  const itens = useMemo(() => [...(lista.data ?? [])].sort((a, b) => a.embarcador.localeCompare(b.embarcador)
    || a.numero_nf.localeCompare(b.numero_nf, "pt-BR", { numeric: true }) || a.c_prod.localeCompare(b.c_prod, "pt-BR", { numeric: true })), [lista.data]);

  function escolherCarga(id: string) {
    setCargaId(id); setPacotes([]); setNf(null);
    setLacre(cargas.data?.find((c) => c.id === id)?.lacre ?? "");
  }
  async function salvarLacre() {
    const { error } = await supabase.rpc("definir_lacre_carga", { p_carga_id: cargaId, p_lacre: lacre });
    if (error) { toast.error(error.message); return; }
    toast.success("Lacre salvo"); qc.invalidateQueries({ queryKey: ["div-clientes-cargas"] });
  }
  async function buscar() {
    const n = numero.replace(/\D/g, ""); if (!n) return;
    setBuscando(true); setNf(null);
    try {
      const { data, error } = await supabase.from("notas_fiscais").select("id, numero_nf, carga_id, cnpj_emitente, razao_social_emitente, itens_nf(c_prod, x_prod, q_com)")
        .eq("numero_nf", n).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      const ok = ((data ?? []) as unknown as NfBusca[]).filter((x) => embarcadorCliente(x.cnpj_emitente));
      const daCarga = ok.find((x) => x.carga_id === cargaId) ?? ok[0];
      if (!daCarga) { toast.error(data?.length ? "Esta NF não é de Arcor/Bagley, Masterfoods ou Pandurata" : "NF não encontrada"); return; }
      if (daCarga.carga_id && daCarga.carga_id !== cargaId) toast.warning("Esta NF está em outra carga; o lançamento irá para a carga da NF.");
      setNf(daCarga); setCprod("");
    } catch (e: any) { toast.error(e.message ?? "Falha na busca"); } finally { setBuscando(false); }
  }
  const itensNf = useMemo(() => {
    const m = new Map<string, { c_prod: string; x_prod: string; q: number }>();
    for (const i of nf?.itens_nf ?? []) { const c = m.get(i.c_prod); if (c) c.q += Number(i.q_com) || 0; else m.set(i.c_prod, { c_prod: i.c_prod, x_prod: i.x_prod, q: Number(i.q_com) || 0 }); }
    return [...m.values()].sort((a, b) => a.c_prod.localeCompare(b.c_prod, "pt-BR", { numeric: true }));
  }, [nf]);

  async function salvar() {
    if (!cargaId) { toast.error("Escolha a carreta"); return; }
    if (!semNf && !nf) { toast.error("Busque a NF ou marque sobra sem NF"); return; }
    if (!cprod.trim()) { toast.error("Informe o código"); return; }
    if (semNf && !desc.trim()) { toast.error("Informe a descrição"); return; }
    if (recebida === "" && !(Number(qtd) > 0)) { toast.error("Informe a quantidade recebida ou a divergência"); return; }
    setSalvando(true);
    try {
      const caminhos: string[] = [];
      for (const f of fotos) {
        const ext = (/\.([a-z0-9]{2,5})$/i.exec(f.name)?.[1] ?? "jpg").toLowerCase();
        const path = `${cargaId}/clientes/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
        if (error) throw new Error(`Falha ao enviar foto ${f.name}: ${error.message}`);
        caminhos.push(path);
      }
      const { error } = await supabase.rpc("registrar_divergencia_cliente", {
        p_carga_id: cargaId, p_nf_id: semNf ? null : nf!.id, p_embarcador: emb, p_status: semNf ? "SOBRA" : status,
        p_c_prod: cprod.trim(), p_x_prod: desc.trim(), p_qtd_recebida: (recebida === "" || semNf ? null : Number(recebida)) as any,
        p_quantidade: (Number(qtd) || null) as any, p_retorno_cd: retorno, p_observacao: obs, p_fotos: caminhos,
      } as any);
      if (error) throw error;
      toast.success("Divergência lançada (só relatório, nada bloqueado).");
      setCprod(""); setDesc(""); setRecebida(""); setQtd(""); setObs(""); setFotos([]); setPacotes([]);
      qc.invalidateQueries({ queryKey: ["div-clientes", cargaId] });
    } catch (e: any) { toast.error(e.message ?? "Falha ao lançar"); } finally { setSalvando(false); }
  }

  async function prepararPacotes() {
    if (!carga || !itens.length) return;
    setPreparando(true); setPacotes([]);
    try {
      const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const saida: { nome: string; blob: Blob }[] = [];
      for (const e of EMBARCADORES_CLIENTES) {
        const doEmb = itens.filter((d) => d.embarcador === e); if (!doEmb.length) continue;
        const rows = linhasProtocolo(doEmb, { dt: carga.numero_carga ?? "", lacre: carga.lacre ?? "", motorista: carga.motorista ?? "" });
        const ws = XLSX.utils.aoa_to_sheet([[`PROTOCOLO DE DIVERGÊNCIAS - ${hoje}`], CABECALHO_PROTOCOLO, ...rows]);
        ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: CABECALHO_PROTOCOLO.length - 1 } }];
        ws["!cols"] = CABECALHO_PROTOCOLO.map((h, i) => ({ wch: i === 3 ? 45 : Math.max(12, h.length + 4) }));
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "PROTOCOLO");
        const base = `DIVERGENCIA ${e.replace("/", "-")} - CARGA ${carga.numero_carga || carga.placa || carga.id.slice(0, 8)}`;
        const zip = new JSZip();
        zip.file(`${base}.xlsx`, XLSX.write(wb, { type: "array", bookType: "xlsx" }));
        for (const d of doEmb) for (let i = 0; i < d.fotos.length; i++) {
          const { data: b, error } = await supabase.storage.from(BUCKET).download(d.fotos[i]);
          if (error || !b) throw new Error(`Falha ao baixar foto da NF ${d.numero_nf || "sem NF"}`);
          const ext = /\.([a-z0-9]{2,5})$/i.exec(d.fotos[i])?.[1] ?? "jpg";
          zip.file(`${d.numero_nf ? `NF${d.numero_nf}` : "SEM-NF"}_cProd${semZeros(d.c_prod)}_${d.status.replace("/", "-")}_${i + 1}.${ext}`, b);
        }
        saida.push({ nome: `${base}.zip`, blob: await zip.generateAsync({ type: "blob", compression: "STORE" }) });
      }
      setPacotes(saida);
    } catch (e: any) { toast.error(e.message ?? "Falha ao preparar"); } finally { setPreparando(false); }
  }
  async function enviarResumo() {
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("divergencia-resumo-email", { body: { carga_id: cargaId, origem: "clientes" } });
      if (error) throw new Error((await (error as any).context?.json?.().catch(() => null))?.error ?? error.message);
      toast.success(`Resumo com ${(data as any)?.ocorrencias} ocorrência(s) enviado para arquivostlm@tlmlogistica.com.br`);
    } catch (e: any) { toast.error(e.message ?? "Falha no envio"); } finally { setEnviando(false); }
  }
  async function cancelar(d: Linha) {
    const motivo = window.prompt("Cancelar este lançamento? Informe o motivo:"); if (!motivo?.trim()) return;
    const { error } = await supabase.rpc("cancelar_divergencia_cliente", { p_id: d.id, p_motivo: motivo });
    if (error) { toast.error(error.message); return; }
    toast.success("Lançamento cancelado"); setPacotes([]); qc.invalidateQueries({ queryKey: ["div-clientes", cargaId] });
  }

  return (
    <MainLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold">Divergência — Arcor/Bagley, Masterfoods e Pandurata</h1>
          <p className="text-sm text-muted-foreground">Só relatório: nada é bloqueado. Gere o protocolo de cada cliente e envie pelo seu e-mail. Cacau continua na tela própria.</p>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-lg">Carreta</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Select value={cargaId} onValueChange={escolherCarga}>
              <SelectTrigger><SelectValue placeholder={cargas.isLoading ? "Carregando…" : "Escolha a carga"} /></SelectTrigger>
              <SelectContent>{(cargas.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{rotulo(c)}</SelectItem>)}</SelectContent>
            </Select>
            {cargaId && (
              <div className="flex gap-2 items-end">
                <div className="space-y-1"><Label>Lacre</Label><Input value={lacre} onChange={(e) => setLacre(e.target.value)} placeholder="Ex.: 426018" /></div>
                <Button variant="outline" onClick={salvarLacre}><Save className="h-4 w-4" />Salvar</Button>
              </div>
            )}
            {carga && <p className="text-sm text-muted-foreground md:col-span-2">DT {carga.numero_carga ?? "— (preencha o número da carga)"} · Motorista {carga.motorista ?? "—"}</p>}
          </CardContent>
        </Card>

        {cargaId && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Lançar ocorrência</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={semNf} onChange={(e) => { setSemNf(e.target.checked); setNf(null); setCprod(""); }} />Sobra sem NF (produto que não está em nenhuma nota)</label>
              {semNf ? (
                <div className="max-w-xs space-y-1">
                  <Label>Cliente</Label>
                  <Select value={emb} onValueChange={(v) => setEmb(v as EmbarcadorCliente)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EMBARCADORES_CLIENTES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex gap-2 max-w-md">
                  <Input placeholder="Número da NF" value={numero} inputMode="numeric" onChange={(e) => setNumero(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
                  <Button onClick={buscar} disabled={buscando}>{buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Buscar</Button>
                </div>
              )}
              {nf && !semNf && <p className="text-sm"><strong>NF {nf.numero_nf}</strong> — {nf.razao_social_emitente} <Badge variant="secondary">{embarcadorCliente(nf.cnpj_emitente)}</Badge></p>}
              {(semNf || nf) && (
                <div className="grid gap-3 md:grid-cols-2">
                  {!semNf && (
                    <div className="space-y-1"><Label>Status</Label>
                      <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUS_CLIENTE.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                    </div>
                  )}
                  <div className="space-y-1"><Label>Retorno CD</Label>
                    <Select value={retorno} onValueChange={setRetorno}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                      <SelectContent>{RETORNO_CD.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
                  </div>
                  {semNf ? (
                    <>
                      <div className="space-y-1"><Label>Código do produto</Label><Input value={cprod} onChange={(e) => setCprod(e.target.value)} /></div>
                      <div className="space-y-1"><Label>Descrição</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
                      <div className="space-y-1"><Label>Quantidade</Label><Input type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} /></div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1 md:col-span-2"><Label>Código do produto</Label>
                        <Select value={cprod} onValueChange={setCprod}><SelectTrigger><SelectValue placeholder="Escolha o código" /></SelectTrigger>
                          <SelectContent>{itensNf.map((i) => <SelectItem key={i.c_prod} value={i.c_prod}>{semZeros(i.c_prod)} — {i.x_prod} (NF: {i.q})</SelectItem>)}</SelectContent></Select>
                      </div>
                      <div className="space-y-1"><Label>Quantidade recebida</Label><Input type="number" min={0} value={recebida} onChange={(e) => setRecebida(e.target.value)} placeholder="Calcula a diferença" /></div>
                      <div className="space-y-1"><Label>Ou quantidade da divergência</Label><Input type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} disabled={recebida !== ""} /></div>
                    </>
                  )}
                  <div className="space-y-1 md:col-span-2"><Label>Observação</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
                  <div className="space-y-1 md:col-span-2"><Label className="flex items-center gap-2"><Camera className="h-4 w-4" />Fotos (originais)</Label>
                    <Input type="file" accept="image/*" multiple onChange={(e) => setFotos(Array.from(e.target.files ?? []))} /></div>
                  <div className="md:col-span-2"><Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="h-4 w-4 animate-spin" />}Lançar divergência</Button></div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {cargaId && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Ocorrências da carreta</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <Button variant="outline" onClick={prepararPacotes} disabled={preparando || !itens.length}>
                  {preparando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />}Gerar protocolo por cliente (Excel + fotos)
                </Button>
                {pacotes.map((p) => <Button key={p.nome} onClick={() => baixar(p.blob, p.nome)}><Download className="h-4 w-4" />{p.nome.replace(/^DIVERGENCIA /, "")}</Button>)}
                <Button variant="secondary" onClick={enviarResumo} disabled={enviando || !itens.length}>
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Enviar resumo para arquivostlm
                </Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Cliente</TableHead><TableHead>NF</TableHead><TableHead>Código</TableHead><TableHead>Descrição</TableHead>
                  <TableHead className="text-right">NF</TableHead><TableHead className="text-right">Recebida</TableHead><TableHead className="text-right">Diver.</TableHead>
                  <TableHead>Status</TableHead><TableHead>Retorno CD</TableHead><TableHead>Fotos</TableHead><TableHead>Lançado por</TableHead><TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {itens.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.embarcador}</TableCell><TableCell>{d.numero_nf || "sem NF"}</TableCell><TableCell>{semZeros(d.c_prod)}</TableCell>
                      <TableCell className="max-w-xs truncate">{d.x_prod}</TableCell>
                      <TableCell className="text-right">{d.qtd_nf ?? "—"}</TableCell><TableCell className="text-right">{d.qtd_recebida ?? "—"}</TableCell>
                      <TableCell className="text-right">{d.quantidade}</TableCell>
                      <TableCell><Badge variant={d.status === "SOBRA" || d.status === "AVARIA" ? "secondary" : "destructive"}>{d.status}</Badge></TableCell>
                      <TableCell className="text-xs">{d.retorno_cd ?? "—"}</TableCell><TableCell>{d.fotos.length}</TableCell>
                      <TableCell className="text-xs">{d.criado_por_nome}<br />{new Date(d.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</TableCell>
                      <TableCell>{isAdmin && <Button size="sm" variant="ghost" onClick={() => cancelar(d)} title="Cancelar lançamento"><Ban className="h-4 w-4" /></Button>}</TableCell>
                    </TableRow>
                  ))}
                  {!itens.length && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground">Nenhuma ocorrência nesta carreta</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
