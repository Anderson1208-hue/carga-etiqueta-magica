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
import { Loader2, Search, PackageOpen, Mail, Download, Ban, Camera } from "lucide-react";
import { toast } from "sonner";
import { isEmitenteCacau } from "@/lib/embarcadores-cacau";
import {
  CABECALHO, TIPO_LABEL, MOTIVO_DEVOLUCAO_FALTA_TOTAL, dividirPacotes, linhasPlanilha, nomesFotos, semZeros,
  type DivergenciaRow, type ItemNf, type TipoDivergencia,
} from "@/lib/divergencia-recebimento";

const BUCKET = "divergencias-recebimento";

interface NfBusca {
  id: string; numero_nf: string; carga_id: string | null; cnpj_emitente: string | null; razao_social_emitente: string | null;
  status_entrega: string | null; data_emissao: string | null; dest_razao_social: string | null;
  cargas: { numero_carga: string | null; placa: string | null; data: string } | null;
  itens_nf: ItemNf[];
}
type Linha = DivergenciaRow & { carga_id: string | null };

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function DivergenciaRecebimento() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [numero, setNumero] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [opcoes, setOpcoes] = useState<NfBusca[]>([]);
  const [nf, setNf] = useState<NfBusca | null>(null);
  const [tipo, setTipo] = useState<TipoDivergencia>("falta_parcial");
  const [cprod, setCprod] = useState("");
  const [qtd, setQtd] = useState("");
  const [obs, setObs] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [cargaSel, setCargaSel] = useState<string>("");
  const [pacotes, setPacotes] = useState<{ nome: string; blob: Blob }[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [embFiltro, setEmbFiltro] = useState("TODOS");
  const [consolidado, setConsolidado] = useState<{ nome: string; blob: Blob } | null>(null);
  const [gerandoCons, setGerandoCons] = useState(false);

  async function gerarConsolidado(enviar = false) {
    setGerandoCons(true); setConsolidado(null);
    try {
      const { data, error } = await supabase.functions.invoke("divergencia-consolidado", {
        body: { acao: enviar ? "enviar" : "baixar", embarcador: enviar || embFiltro === "TODOS" ? undefined : embFiltro } });
      if (error) throw new Error((await (error as any).context?.json?.().catch(() => null))?.error ?? error.message);
      if (enviar) { toast.success("Consolidado enviado para gessica.rodrigues@tlmlogistica.com.br"); return; }
      const r = await fetch((data as any).url);
      if (!r.ok) throw new Error("Falha ao baixar o consolidado");
      setConsolidado({ nome: (data as any).nome, blob: await r.blob() });
    } catch (e: any) { toast.error(e.message ?? "Falha no consolidado"); } finally { setGerandoCons(false); }
  }

  const lista = useQuery({
    queryKey: ["divergencias-recebimento"],
    queryFn: async () => {
      const { data, error } = await supabase.from("divergencias_recebimento")
        .select("id, carga_id, numero_nf, c_prod, x_prod, tipo, quantidade, observacao, fotos, criado_em, criado_por_nome, cancelado_em")
        .is("cancelado_em", null).order("criado_em", { ascending: false }).order("id").limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Linha[];
    },
  });

  const cargaIds = useMemo(() => [...new Set((lista.data ?? []).map((d) => d.carga_id).filter(Boolean))] as string[], [lista.data]);
  const cargasInfo = useQuery({
    queryKey: ["divergencias-cargas", cargaIds],
    enabled: cargaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("cargas").select("id, numero_carga, placa, data").in("id", cargaIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((c) => [c.id, c]));
    },
  });
  const envios = useQuery({
    queryKey: ["divergencias-envios", cargaSel],
    enabled: !!cargaSel,
    queryFn: async () => {
      const { data, error } = await supabase.from("divergencias_recebimento_envios")
        .select("ocorrencias, enviado_em").eq("carga_id", cargaSel).order("enviado_em", { ascending: false }).limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const itensCarga = useMemo(() => (lista.data ?? []).filter((d) => d.carga_id === cargaSel)
    .sort((a, b) => a.numero_nf.localeCompare(b.numero_nf, "pt-BR", { numeric: true }) || String(a.c_prod).localeCompare(String(b.c_prod), "pt-BR", { numeric: true })),
  [lista.data, cargaSel]);
  const rotuloCarga = (id: string) => {
    const c = cargasInfo.data?.[id];
    return c ? `${c.numero_carga ? `Carga ${c.numero_carga}` : "Carga sem número"} — ${c.placa ?? "sem placa"} — ${new Date(`${c.data}T00:00:00`).toLocaleDateString("pt-BR")}` : id.slice(0, 8);
  };

  async function buscar() {
    const n = numero.replace(/\D/g, "");
    if (!n) return;
    setBuscando(true); setNf(null); setOpcoes([]);
    try {
      const { data, error } = await supabase.from("notas_fiscais")
        .select("id, numero_nf, carga_id, cnpj_emitente, razao_social_emitente, status_entrega, data_emissao, dest_razao_social, cargas(numero_carga, placa, data), itens_nf(c_prod, x_prod, q_com)")
        .eq("numero_nf", n).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      const cacau = ((data ?? []) as unknown as NfBusca[]).filter((x) => isEmitenteCacau(x.cnpj_emitente));
      if (!cacau.length) { toast.error(data?.length ? "Esta NF não é da IBAC/IBAE" : "NF não encontrada"); return; }
      if (cacau.length === 1) escolher(cacau[0]); else setOpcoes(cacau);
    } catch (e: any) { toast.error(e.message ?? "Falha na busca"); } finally { setBuscando(false); }
  }
  function escolher(x: NfBusca) {
    setNf(x); setOpcoes([]); setCprod(""); setQtd(""); setObs(""); setFotos([]);
    if (x.carga_id) setCargaSel(x.carga_id);
  }

  const itensAgrupados = useMemo(() => {
    const m = new Map<string, { c_prod: string; x_prod: string; caixas: number }>();
    for (const i of nf?.itens_nf ?? []) {
      const k = i.c_prod; const cur = m.get(k);
      if (cur) cur.caixas += Number(i.q_com) || 0; else m.set(k, { c_prod: i.c_prod, x_prod: i.x_prod, caixas: Number(i.q_com) || 0 });
    }
    return [...m.values()].sort((a, b) => a.c_prod.localeCompare(b.c_prod, "pt-BR", { numeric: true }));
  }, [nf]);

  async function salvar() {
    if (!nf) return;
    if (tipo !== "falta_total" && (!cprod || !(Number(qtd) > 0))) { toast.error("Informe o código e a quantidade de caixas"); return; }
    setSalvando(true);
    try {
      const caminhos: string[] = [];
      for (const f of fotos) {
        const ext = (/\.([a-z0-9]{2,5})$/i.exec(f.name)?.[1] ?? "jpg").toLowerCase();
        const path = `${nf.carga_id ?? "sem-carga"}/${nf.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined, upsert: false });
        if (error) throw new Error(`Falha ao enviar foto ${f.name}: ${error.message}`);
        caminhos.push(path);
      }
      const { data, error } = await supabase.rpc("registrar_divergencia_recebimento", {
        p_nf_id: nf.id, p_tipo: tipo, p_c_prod: tipo === "falta_total" ? "" : cprod,
        p_quantidade: tipo === "falta_total" ? 0 : Number(qtd), p_observacao: obs, p_fotos: caminhos,
      });
      if (error) throw error;
      const r = data as any;
      if (r?.duplicada) toast.info("Esta ocorrência já estava lançada; nada foi bloqueado de novo.");
      else {
        const partes = [`Lançado. ${r?.bloqueadas ?? 0} etiqueta(s) bloqueada(s).`];
        if (tipo === "falta_total") partes.push("NF marcada como cancelada.");
        toast.success(partes.join(" "));
        supabase.functions.invoke("divergencia-consolidado", { body: { acao: "enviar" } }).then(({ error: ec }) => {
          if (ec) toast.error("Lançamento salvo, mas o consolidado não foi enviado para gessica.rodrigues. Tente pelo botão Consolidado.");
          else toast.success("Consolidado atualizado enviado para gessica.rodrigues@tlmlogistica.com.br");
        });
      }
      const bip = (r?.ja_bipadas ?? []) as { c_prod: string; seq: number; total: number }[];
      if (bip.length) toast.warning(`Atenção: ${bip.length} etiqueta(s) já foram bipadas e não foram bloqueadas: ${bip.map((b) => `${semZeros(b.c_prod)} cx ${b.seq}/${b.total}`).join(", ")}`, { duration: 15000 });
      if (r?.nao_bloqueadas > 0 && !bip.length) toast.warning(`${r.nao_bloqueadas} caixa(s) não tinham etiqueta pendente para bloquear.`, { duration: 12000 });
      setCprod(""); setQtd(""); setObs(""); setFotos([]);
      if (tipo === "falta_total") setNf({ ...nf, status_entrega: "NF CANCELADA" });
      setPacotes([]);
      qc.invalidateQueries({ queryKey: ["divergencias-recebimento"] });
    } catch (e: any) { toast.error(e.message ?? "Falha ao lançar"); } finally { setSalvando(false); }
  }

  async function prepararPacote() {
    if (!cargaSel || !itensCarga.length) return;
    setPreparando(true); setPacotes([]);
    try {
      const nfsNums = [...new Set(itensCarga.map((d) => d.numero_nf))];
      const { data: nfs, error } = await supabase.from("notas_fiscais")
        .select("numero_nf, data_emissao, itens_nf(c_prod, x_prod, q_com)").eq("carga_id", cargaSel).in("numero_nf", nfsNums);
      if (error) throw error;
      const emissao: Record<string, string | null> = {}; const itensPorNf: Record<string, ItemNf[]> = {};
      for (const n of (nfs ?? []) as any[]) { emissao[n.numero_nf] = n.data_emissao; itensPorNf[n.numero_nf] = n.itens_nf ?? []; }
      const c = cargasInfo.data?.[cargaSel];
      const ws = XLSX.utils.aoa_to_sheet([CABECALHO, ...linhasPlanilha(itensCarga, { numeroCarga: c?.numero_carga ?? "", placa: c?.placa ?? "", emissaoPorNf: emissao, itensPorNf })]);
      ws["!cols"] = CABECALHO.map((h) => ({ wch: Math.max(12, Math.min(40, h.length + 4)) }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "BASE");
      const nomeBase = `DIVERGENCIA - CARGA ${c?.numero_carga || c?.placa || cargaSel.slice(0, 8)}`;
      const planilha = { nome: `${nomeBase}.xlsx`, blob: new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) };
      const arqs: { nome: string; blob: Blob; size: number }[] = [];
      for (const d of itensCarga) {
        const nomes = nomesFotos(d);
        for (let i = 0; i < d.fotos.length; i++) {
          const { data: b, error: e } = await supabase.storage.from(BUCKET).download(d.fotos[i]);
          if (e || !b) throw new Error(`Falha ao baixar foto da NF ${d.numero_nf}`);
          arqs.push({ nome: nomes[i], blob: b, size: b.size });
        }
      }
      const grupos = dividirPacotes({ ...planilha, size: planilha.blob.size }, arqs);
      const saida: { nome: string; blob: Blob }[] = [];
      for (let g = 0; g < grupos.length; g++) {
        const zip = new JSZip();
        grupos[g].forEach((f) => zip.file(f.nome, f.blob));
        const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
        saida.push({ nome: grupos.length > 1 ? `${nomeBase} - pacote ${g + 1} de ${grupos.length}.zip` : `${nomeBase}.zip`, blob });
      }
      setPacotes(saida);
      if (saida.length > 1) toast.info(`As fotos passam de 20 MB e foram divididas em ${saida.length} pacotes (um por e-mail).`);
    } catch (e: any) { toast.error(e.message ?? "Falha ao preparar pacote"); } finally { setPreparando(false); }
  }

  async function enviarResumo() {
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke("divergencia-resumo-email", { body: { carga_id: cargaSel } });
      if (error) throw new Error((await (error as any).context?.json?.().catch(() => null))?.error ?? error.message);
      toast.success(`Resumo com ${(data as any)?.ocorrencias} ocorrência(s) enviado para arquivostlm@tlmlogistica.com.br`);
      qc.invalidateQueries({ queryKey: ["divergencias-envios", cargaSel] });
    } catch (e: any) { toast.error(e.message ?? "Falha no envio"); } finally { setEnviando(false); }
  }

  async function cancelar(d: Linha) {
    const motivo = window.prompt(`Cancelar o lançamento da NF ${d.numero_nf}? As etiquetas bloqueadas por ele voltam a pendentes${d.tipo === "falta_total" ? " e a NF volta ao status anterior" : ""}. Informe o motivo:`);
    if (!motivo?.trim()) return;
    const { data, error } = await supabase.rpc("cancelar_divergencia_recebimento", { p_id: d.id, p_motivo: motivo });
    if (error) { toast.error(error.message); return; }
    toast.success(`Lançamento cancelado; ${(data as any)?.etiquetas_liberadas ?? 0} etiqueta(s) liberada(s).`);
    setPacotes([]);
    qc.invalidateQueries({ queryKey: ["divergencias-recebimento"] });
  }

  const cancelada = nf?.status_entrega === "NF CANCELADA";

  return (
    <MainLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold">Divergência de Recebimento</h1>
          <p className="text-sm text-muted-foreground">Somente IBAC e IBAE. Nada é enviado à Cacau: baixe a planilha com as fotos e envie pelo seu e-mail.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Lançar ocorrência</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 max-w-md">
              <Input placeholder="Número da NF" value={numero} inputMode="numeric" onChange={(e) => setNumero(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} />
              <Button onClick={buscar} disabled={buscando}>{buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Buscar</Button>
            </div>
            {opcoes.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm">Mais de uma NF com esse número; escolha:</p>
                {opcoes.map((o) => (
                  <Button key={o.id} variant="outline" size="sm" className="mr-2" onClick={() => escolher(o)}>
                    {o.razao_social_emitente} — {o.cargas?.placa ?? "sem carga"} — {o.data_emissao}
                  </Button>
                ))}
              </div>
            )}
            {nf && (
              <div className="space-y-4">
                <div className="rounded-md border p-3 text-sm grid gap-1 md:grid-cols-2">
                  <div><strong>NF {nf.numero_nf}</strong> — {nf.razao_social_emitente}</div>
                  <div>Destinatário: {nf.dest_razao_social ?? "—"}</div>
                  <div>Carga: {nf.cargas?.numero_carga ?? "sem número"} — Placa {nf.cargas?.placa ?? "—"}</div>
                  <div>Status: <Badge variant={cancelada ? "destructive" : "secondary"}>{nf.status_entrega ?? "—"}</Badge></div>
                </div>
                {cancelada ? <p className="text-sm text-destructive">NF cancelada por falta total ({MOTIVO_DEVOLUCAO_FALTA_TOTAL}).</p> : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Tipo</Label>
                      <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDivergencia)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="falta_parcial">Falta parcial (bloqueia as caixas do código)</SelectItem>
                          <SelectItem value="avaria">Avaria (só relatório)</SelectItem>
                          <SelectItem value="sobra">Sobra (só relatório)</SelectItem>
                          <SelectItem value="falta_total">Falta total (cancela a NF)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {tipo !== "falta_total" && (
                      <>
                        <div className="space-y-1">
                          <Label>Código do produto</Label>
                          <Select value={cprod} onValueChange={setCprod}>
                            <SelectTrigger><SelectValue placeholder="Escolha o código" /></SelectTrigger>
                            <SelectContent>
                              {itensAgrupados.map((i) => (
                                <SelectItem key={i.c_prod} value={i.c_prod}>{semZeros(i.c_prod)} — {i.x_prod} ({Math.ceil(i.caixas)} cx)</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Quantidade de caixas</Label>
                          <Input type="number" min={1} value={qtd} onChange={(e) => setQtd(e.target.value)} />
                        </div>
                      </>
                    )}
                    <div className="space-y-1 md:col-span-2">
                      <Label>Observação</Label>
                      <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="flex items-center gap-2"><Camera className="h-4 w-4" />Fotos (originais, sem alteração)</Label>
                      <Input type="file" accept="image/*" multiple onChange={(e) => setFotos(Array.from(e.target.files ?? []))} />
                      {fotos.length > 0 && <p className="text-xs text-muted-foreground">{fotos.length} foto(s) selecionada(s)</p>}
                    </div>
                    <div className="md:col-span-2">
                      <Button onClick={salvar} disabled={salvando} variant={tipo === "falta_total" ? "destructive" : "default"}>
                        {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                        {tipo === "falta_total" ? "Lançar falta total e cancelar NF" : "Lançar divergência"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Consolidado (todas as ocorrências desde o início)</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Select value={embFiltro} onValueChange={(v) => { setEmbFiltro(v); setConsolidado(null); }}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os embarcadores</SelectItem>
                <SelectItem value="IBAC">IBAC</SelectItem>
                <SelectItem value="IBAE">IBAE</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => gerarConsolidado(false)} disabled={gerandoCons}>
              {gerandoCons ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />}Gerar consolidado
            </Button>
            {consolidado && <Button onClick={() => baixar(consolidado.blob, consolidado.nome)}><Download className="h-4 w-4" />Baixar {consolidado.nome}</Button>}
            <Button variant="secondary" onClick={() => gerarConsolidado(true)} disabled={gerandoCons}><Mail className="h-4 w-4" />Reenviar para gessica.rodrigues</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Ocorrências por carreta</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xl">
              <Select value={cargaSel} onValueChange={(v) => { setCargaSel(v); setPacotes([]); }}>
                <SelectTrigger><SelectValue placeholder={lista.isLoading ? "Carregando…" : cargaIds.length ? "Escolha a carga" : "Nenhuma ocorrência lançada"} /></SelectTrigger>
                <SelectContent>{cargaIds.map((id) => <SelectItem key={id} value={id}>{rotuloCarga(id)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {cargaSel && (
              <>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button onClick={prepararPacote} disabled={preparando || !itensCarga.length} variant="outline">
                    {preparando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />}Preparar pacote (Excel + fotos)
                  </Button>
                  {pacotes.map((p) => (
                    <Button key={p.nome} onClick={() => baixar(p.blob, p.nome)}><Download className="h-4 w-4" />{p.nome.replace(/^DIVERGENCIA - /, "")}</Button>
                  ))}
                  <Button onClick={enviarResumo} disabled={enviando || !itensCarga.length} variant="secondary">
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Enviar resumo para arquivostlm
                  </Button>
                  {envios.data && <span className="text-xs text-muted-foreground">Último resumo: {new Date(envios.data.enviado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} ({envios.data.ocorrencias} ocorrências)</span>}
                </div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>NF</TableHead><TableHead>Tipo</TableHead><TableHead>Código</TableHead><TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Caixas</TableHead><TableHead>Fotos</TableHead><TableHead>Lançado por</TableHead><TableHead />
                  </TableRow></TableHeader>
                  <TableBody>
                    {itensCarga.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>{d.numero_nf}</TableCell>
                        <TableCell><Badge variant={d.tipo === "avaria" || d.tipo === "sobra" ? "secondary" : "destructive"}>{TIPO_LABEL[d.tipo]}</Badge></TableCell>
                        <TableCell>{semZeros(d.c_prod) || "—"}</TableCell>
                        <TableCell className="max-w-xs truncate">{d.x_prod ?? (d.tipo === "falta_total" ? "NF inteira" : "")}</TableCell>
                        <TableCell className="text-right">{d.tipo === "falta_total" ? "todas" : d.quantidade}</TableCell>
                        <TableCell>{d.fotos.length}</TableCell>
                        <TableCell className="text-xs">{d.criado_por_nome}<br />{new Date(d.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</TableCell>
                        <TableCell>{isAdmin && <Button size="sm" variant="ghost" onClick={() => cancelar(d)} title="Cancelar lançamento"><Ban className="h-4 w-4" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
