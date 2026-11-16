import { useEffect, useState } from "react";
import { Pencil, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { statusDoCliente, type EmbarcadorCliente } from "@/lib/divergencia-clientes";
import { validarEdicao } from "@/lib/divergencia-edicao";

type Linha = { id: string; carga_id: string | null; nf_id: string | null; numero_nf: string; c_prod: string | null; x_prod: string | null; quantidade: number; observacao: string | null; fotos: string[]; tipo?: string; status?: string; embarcador?: string | null; qtd_recebida?: number | null; retorno_cd?: string | null };
export function EditarDivergenciaDialog({ linha, origem, onSaved }: { linha: Linha; origem: "cacau" | "clientes"; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tipo, setTipo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [obs, setObs] = useState("");
  const [motivo, setMotivo] = useState("");
  const [retorno, setRetorno] = useState("nenhum");
  const [recebida, setRecebida] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [itens, setItens] = useState<{ c_prod: string; x_prod: string }[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTipo(linha.tipo ?? linha.status ?? ""); setCodigo(linha.c_prod ?? ""); setDescricao(linha.x_prod ?? "");
    setQuantidade(String(linha.quantidade)); setObs(linha.observacao ?? ""); setMotivo(""); setFotos([]);
    setRetorno(linha.retorno_cd || "nenhum"); setRecebida(linha.qtd_recebida == null ? "" : String(linha.qtd_recebida)); setItens([]); setLoading(false);
    if (!linha.nf_id) return;
    let active = true;
    setLoading(true);
    supabase.from("itens_nf").select("c_prod,x_prod").eq("nf_id", linha.nf_id).order("c_prod").order("id").limit(1000).then(({ data, error }) => {
      if (!active) return;
      if (error) toast.error("Não foi possível carregar os produtos da NF");
      else setItens([...new Map((data ?? []).map(i => [i.c_prod, i])).values()].sort((a, b) => a.c_prod.localeCompare(b.c_prod, "pt-BR", { numeric: true })));
      setLoading(false);
    });
    return () => { active = false; };
  }, [open, linha]);
  const total = tipo === "falta_total";
  const tipos = origem === "cacau" ? (linha.nf_id ? ["falta_parcial", "avaria", "falta_total", "sobra"] : ["sobra"]) : (linha.nf_id ? statusDoCliente(linha.embarcador as EmbarcadorCliente) : ["SOBRA"]);
  const nomes: Record<string, string> = { falta_parcial: "Falta parcial", falta_total: "Falta total", avaria: "Avaria", sobra: "Sobra" };
  async function salvar() {
    const erro = validarEdicao(quantidade, motivo, origem === "cacau", total || recebida !== "");
    if (erro) { toast.error(erro); return; }
    if (!total && !codigo.trim()) { toast.error("Informe o produto"); return; }
    if (!linha.carga_id) { toast.error("Carga não encontrada"); return; }
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const foto of fotos) {
        const ext = /\.([a-z0-9]{2,5})$/i.exec(foto.name)?.[1] ?? "jpg";
        const path = `${linha.carga_id}/edicao/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("divergencias-recebimento").upload(path, foto, { upsert: false, contentType: foto.type });
        if (error) throw error;
        paths.push(path);
      }
      const { data, error } = await supabase.rpc("editar_divergencia", { p_origem: origem, p_id: linha.id, p_tipo: tipo, p_c_prod: total ? "" : codigo, p_quantidade: total ? 0 : Number(quantidade), p_observacao: obs, p_motivo: motivo, p_x_prod: descricao, p_qtd_recebida: recebida === "" ? undefined : Number(recebida), p_retorno_cd: retorno === "nenhum" ? "" : retorno, p_fotos: paths });
      if (error) throw error;
      const resultado = data as { nao_bloqueadas?: number; ja_bipadas?: unknown[] } | null;
      toast.success("Divergência atualizada; histórico e fotos preservados");
      if (resultado?.nao_bloqueadas || resultado?.ja_bipadas?.length) toast.warning("Há caixas sem bloqueio: etiquetas já conferidas foram preservadas.", { duration: 12000 });
      onSaved(); setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Falha ao editar divergência"); }
    finally { setBusy(false); }
  }
  return <>
    <Button size="sm" variant="ghost" title="Editar divergência" aria-label={`Editar divergência ${linha.numero_nf || "sem NF"}`} onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar divergência — {linha.numero_nf ? `NF ${linha.numero_nf}` : "sem NF"}</DialogTitle><DialogDescription>{linha.fotos.length} foto(s) original(is) preservada(s)</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>Tipo</Label><Select value={tipo} onValueChange={setTipo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{tipos.map(t => <SelectItem key={t} value={t}>{nomes[t] ?? t}</SelectItem>)}</SelectContent></Select></div>
          {!total && <>
            <div className="space-y-1"><Label htmlFor={`qtd-${linha.id}`}>Quantidade da divergência</Label><Input id={`qtd-${linha.id}`} type="number" min="1" value={quantidade} onChange={e => setQuantidade(e.target.value)} disabled={recebida !== ""} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Produto</Label>{linha.nf_id ? <Select value={codigo} onValueChange={setCodigo} disabled={loading}><SelectTrigger><SelectValue placeholder="Escolha o produto" /></SelectTrigger><SelectContent>{itens.map(i => <SelectItem key={i.c_prod} value={i.c_prod}>{i.c_prod.replace(/^0+(?=\d)/, "")} — {i.x_prod}</SelectItem>)}</SelectContent></Select> : <Input aria-label="Código do produto" value={codigo} onChange={e => setCodigo(e.target.value)} />}</div>
            {!linha.nf_id && <div className="space-y-1 sm:col-span-2"><Label htmlFor={`desc-${linha.id}`}>Descrição</Label><Input id={`desc-${linha.id}`} value={descricao} onChange={e => setDescricao(e.target.value)} /></div>}
          </>}
          {origem === "clientes" && <>
            {linha.nf_id && <div className="space-y-1"><Label htmlFor={`recebida-${linha.id}`}>Quantidade recebida (opcional)</Label><Input id={`recebida-${linha.id}`} type="number" min="0" value={recebida} onChange={e => setRecebida(e.target.value)} /></div>}
            <div className="space-y-1"><Label>Retorno CD</Label><Select value={retorno} onValueChange={setRetorno}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["nenhum", "PROCEDE DO CD", "NÃO PROCEDE DO CD"].map(t => <SelectItem key={t} value={t}>{t === "nenhum" ? "Não informado" : t}</SelectItem>)}</SelectContent></Select></div>
          </>}
          <div className="space-y-1 sm:col-span-2"><Label htmlFor={`obs-${linha.id}`}>Observação</Label><Textarea id={`obs-${linha.id}`} value={obs} onChange={e => setObs(e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor={`motivo-${linha.id}`}>Motivo da alteração</Label><Textarea id={`motivo-${linha.id}`} value={motivo} onChange={e => setMotivo(e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor={`fotos-${linha.id}`}>Adicionar fotos</Label><Input id={`fotos-${linha.id}`} type="file" accept="image/*" multiple onChange={e => setFotos(Array.from(e.target.files ?? []))} /></div>
        </div>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={busy || loading} onClick={salvar}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar alteração</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}