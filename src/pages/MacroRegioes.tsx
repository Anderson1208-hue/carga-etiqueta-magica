import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { carregarMacroRegioesCadastro, getMacroRegiao, normalizeBairro } from "@/lib/macro-regioes";

type MR = { numero: number; nome: string; ativa: boolean };
type Termo = { id: string; termo: string; termo_norm: string; tipo: string; macro_numero: number };

const db = supabase as any;

export default function MacroRegioes() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<number | null>(null);
  const [novoNum, setNovoNum] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoTermo, setNovoTermo] = useState("");
  const [novoTipo, setNovoTipo] = useState<"bairro" | "cidade">("bairro");

  const { data: mrs = [] } = useQuery({
    queryKey: ["mr-lista"],
    queryFn: async () => {
      const { data, error } = await db.from("macro_regioes").select("numero, nome, ativa").order("numero");
      if (error) throw error;
      return data as MR[];
    },
  });
  const { data: termos = [] } = useQuery({
    queryKey: ["mr-termos"],
    queryFn: async () => {
      const { data, error } = await db.from("macro_regiao_termos").select("id, termo, termo_norm, tipo, macro_numero").order("termo").limit(10000);
      if (error) throw error;
      return data as Termo[];
    },
  });
  const { data: naoMapeados = [], isLoading: loadingNM } = useQuery({
    queryKey: ["mr-nao-mapeados", termos.length],
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await db
        .from("notas_fiscais")
        .select("dest_bairro, dest_cidade")
        .gte("created_at", desde)
        .limit(10000);
      if (error) throw error;
      const cont = new Map<string, { bairro: string; cidade: string; qtd: number }>();
      for (const n of data || []) {
        if (getMacroRegiao(n.dest_bairro, n.dest_cidade) !== 99) continue;
        const k = `${n.dest_bairro || ""}|${n.dest_cidade || ""}`;
        const c = cont.get(k) || { bairro: n.dest_bairro || "", cidade: n.dest_cidade || "", qtd: 0 };
        c.qtd++;
        cont.set(k, c);
      }
      return [...cont.values()].sort((a, b) => b.qtd - a.qtd);
    },
  });

  const atualizar = async () => {
    await carregarMacroRegioesCadastro();
    qc.invalidateQueries({ queryKey: ["mr-lista"] });
    qc.invalidateQueries({ queryKey: ["mr-termos"] });
  };

  const contagem = useMemo(() => {
    const m: Record<number, number> = {};
    for (const t of termos) m[t.macro_numero] = (m[t.macro_numero] || 0) + 1;
    return m;
  }, [termos]);

  async function criarMR() {
    const numero = parseInt(novoNum, 10);
    if (!numero || numero === 99 || numero < 1) return toast.error("Número inválido (99 é reservado).");
    if (mrs.some((m) => m.numero === numero)) return toast.error(`MR ${numero} já existe.`);
    if (!novoNome.trim()) return toast.error("Informe o nome.");
    const nome = novoNome.trim().toUpperCase().startsWith("MR ") ? novoNome.trim() : `MR ${numero} – ${novoNome.trim()}`;
    const { error } = await db.from("macro_regioes").insert({ numero, nome });
    if (error) return toast.error(error.message);
    toast.success("Macro Região criada");
    setNovoNum(""); setNovoNome(""); setSel(numero);
    atualizar();
  }

  async function toggleAtiva(m: MR) {
    const { error } = await db.from("macro_regioes").update({ ativa: !m.ativa }).eq("numero", m.numero);
    if (error) return toast.error(error.message);
    atualizar();
  }

  async function salvarNome(m: MR, nome: string) {
    if (!nome.trim() || nome === m.nome) return;
    const { error } = await db.from("macro_regioes").update({ nome: nome.trim() }).eq("numero", m.numero);
    if (error) return toast.error(error.message);
    toast.success("Nome atualizado");
    atualizar();
  }

  async function adicionarTermo(termo: string, tipo: "bairro" | "cidade", numero: number) {
    const t = termo.trim().toUpperCase();
    if (!t) return;
    const norm = normalizeBairro(t);
    const existente = termos.find((x) => x.termo_norm === norm);
    if (existente) {
      if (existente.macro_numero === numero) return toast.info("Já está nesta MR.");
      if (!window.confirm(`${t} já está na MR ${existente.macro_numero}. Mover para a MR ${numero}?`)) return;
      const { error } = await db.from("macro_regiao_termos").update({ macro_numero: numero, tipo }).eq("id", existente.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await db.from("macro_regiao_termos").insert({ termo: t, termo_norm: norm, tipo, macro_numero: numero });
      if (error) return toast.error(error.message);
    }
    toast.success(`${t} → MR ${numero}`);
    setNovoTermo("");
    atualizar();
  }

  async function removerTermo(t: Termo) {
    if (!window.confirm(`Remover ${t.termo} da MR ${t.macro_numero}? Ele passará a cair na MR 99.`)) return;
    const { error } = await db.from("macro_regiao_termos").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    atualizar();
  }

  const mrSel = mrs.find((m) => m.numero === sel) || null;
  const termosSel = termos.filter((t) => t.macro_numero === sel);

  return (
    <MainLayout>
      <div className="space-y-4 p-4">
        <div>
          <h1 className="text-2xl font-bold">Macro Regiões</h1>
          <p className="text-sm text-muted-foreground">
            No Rio de Janeiro a MR é definida pelo bairro; fora do Rio, pela cidade. Alterações valem para o que for aberto depois — o que já foi roteirizado ou impresso não muda.
          </p>
        </div>
        <Tabs defaultValue="mrs">
          <TabsList>
            <TabsTrigger value="mrs">Macro Regiões</TabsTrigger>
            <TabsTrigger value="nm">Não mapeados (MR 99){naoMapeados.length ? ` · ${naoMapeados.length}` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="mrs" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <Card>
              <CardHeader><CardTitle className="text-base">Lista</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input className="w-20" placeholder="Nº" value={novoNum} onChange={(e) => setNovoNum(e.target.value.replace(/\D/g, ""))} />
                  <Input placeholder="Nome (ex.: Maricá / Itaipuaçu)" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
                  <Button onClick={criarMR}><Plus className="w-4 h-4 mr-1" />Nova</Button>
                </div>
                <div className="divide-y rounded border">
                  {mrs.map((m) => (
                    <button key={m.numero} onClick={() => setSel(m.numero)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${sel === m.numero ? "bg-muted" : ""}`}>
                      <span className={m.ativa ? "" : "text-muted-foreground line-through"}>{m.nome}</span>
                      <Badge variant="outline">{contagem[m.numero] || 0}</Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{mrSel ? `MR ${mrSel.numero}` : "Selecione uma MR"}</CardTitle></CardHeader>
              {mrSel && (
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input key={mrSel.numero + mrSel.nome} defaultValue={mrSel.nome} onBlur={(e) => salvarNome(mrSel, e.target.value)} />
                    <span className="text-sm">Ativa</span>
                    <Switch checked={mrSel.ativa} onCheckedChange={() => toggleAtiva(mrSel)} />
                  </div>
                  <div className="flex gap-2">
                    <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as any)}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bairro">Bairro</SelectItem>
                        <SelectItem value="cidade">Cidade</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Nome do bairro ou cidade" value={novoTermo} onChange={(e) => setNovoTermo(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && adicionarTermo(novoTermo, novoTipo, mrSel.numero)} />
                    <Button onClick={() => adicionarTermo(novoTermo, novoTipo, mrSel.numero)}><Plus className="w-4 h-4" /></Button>
                  </div>
                  {(["bairro", "cidade"] as const).map((tp) => {
                    const lista = termosSel.filter((t) => t.tipo === tp);
                    if (!lista.length) return null;
                    return (
                      <div key={tp}>
                        <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{tp === "bairro" ? "Bairros" : "Cidades"} ({lista.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {lista.map((t) => (
                            <Badge key={t.id} variant="secondary" className="gap-1">
                              {t.termo}
                              <button onClick={() => removerTermo(t)} aria-label={`Remover ${t.termo}`}><Trash2 className="w-3 h-3" /></button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="nm">
            <Card>
              <CardHeader><CardTitle className="text-base">Bairros/cidades das notas dos últimos 30 dias que caíram na MR 99</CardTitle></CardHeader>
              <CardContent>
                {loadingNM ? <Loader2 className="w-5 h-5 animate-spin" /> : naoMapeados.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum.</p>
                ) : (
                  <div className="divide-y rounded border text-sm">
                    {naoMapeados.map((n) => {
                      const isRio = !n.cidade || normalizeBairro(n.cidade) === "RIO DE JANEIRO";
                      const termo = isRio ? n.bairro : n.cidade;
                      return (
                        <div key={n.bairro + n.cidade} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span>
                            <b>{termo || "(vazio)"}</b>{" "}
                            <span className="text-muted-foreground">{isRio ? `bairro · ${n.cidade || "RJ"}` : `cidade · bairro ${n.bairro || "—"}`}</span>
                            <Badge variant="outline" className="ml-2">{n.qtd} NF</Badge>
                          </span>
                          {termo && (
                            <Select onValueChange={(v) => adicionarTermo(termo, isRio ? "bairro" : "cidade", Number(v))}>
                              <SelectTrigger className="w-56"><SelectValue placeholder="Enviar para MR..." /></SelectTrigger>
                              <SelectContent>
                                {mrs.filter((m) => m.ativa).map((m) => <SelectItem key={m.numero} value={String(m.numero)}>{m.nome}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
