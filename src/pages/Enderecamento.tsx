import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, MapPin, Plus, Search, X } from "lucide-react";
import { getMacroRegiao, getMacroRegiaoLabel } from "@/lib/macro-regioes";

interface NfRow {
  id: string;
  numero_nf: string;
  cnpj_destinatario: string | null;
  dest_razao_social: string | null;
  dest_bairro: string | null;
  dest_cidade: string | null;
  dest_uf: string | null;
  status_entrega: string;
  carga_id: string;
  data_emissao: string | null;
  posicoes: string[];
}

const PAGE_SIZE = 1000;

export default function Enderecamento() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [nfs, setNfs] = useState<NfRow[]>([]);
  const [novaPos, setNovaPos] = useState<Record<string, string>>({});
  const [savingNf, setSavingNf] = useState<string | null>(null);
  const [filtroSemEnd, setFiltroSemEnd] = useState(false);
  const [loteNfs, setLoteNfs] = useState("");
  const [lotePosicao, setLotePosicao] = useState("");
  const [salvandoLote, setSalvandoLote] = useState(false);

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    try {
      // Carrega NFs ativas (não entregues / não recusadas) em páginas de 1000
      const allNfs: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("notas_fiscais")
          .select(
            "id, numero_nf, cnpj_destinatario, dest_razao_social, dest_bairro, dest_cidade, dest_uf, status_entrega, carga_id, data_emissao"
          )
          .in("status_entrega", ["CARGA NO DEPOSITO", "NF EM ROTA"])
          .order("numero_nf", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allNfs.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      // Carrega endereçamentos das NFs em chunks
      const ids = allNfs.map((n) => n.id);
      const enderecMap = new Map<string, string[]>();
      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        let efrom = 0;
        while (true) {
          const { data: ends, error: e2 } = await supabase
            .from("nf_enderecamento")
            .select("nf_id, posicao, principal, created_at")
            .in("nf_id", slice)
            .order("principal", { ascending: false })
            .order("created_at", { ascending: true })
            .range(efrom, efrom + PAGE_SIZE - 1);
          if (e2) throw e2;
          if (!ends || ends.length === 0) break;
          for (const row of ends as any[]) {
            const arr = enderecMap.get(row.nf_id) || [];
            arr.push(row.posicao);
            enderecMap.set(row.nf_id, arr);
          }
          if (ends.length < PAGE_SIZE) break;
          efrom += PAGE_SIZE;
        }
      }

      const merged: NfRow[] = allNfs.map((n) => ({
        ...n,
        posicoes: enderecMap.get(n.id) || [],
      }));
      setNfs(merged);
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erro ao carregar NFs",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  }

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return nfs.filter((nf) => {
      if (filtroSemEnd && nf.posicoes.length > 0) return false;
      if (!termo) return true;
      return (
        nf.numero_nf.toLowerCase().includes(termo) ||
        (nf.cnpj_destinatario || "").toLowerCase().includes(termo) ||
        (nf.dest_razao_social || "").toLowerCase().includes(termo) ||
        (nf.dest_bairro || "").toLowerCase().includes(termo) ||
        nf.posicoes.some((p) => p.toLowerCase().includes(termo))
      );
    });
  }, [nfs, busca, filtroSemEnd]);

  async function adicionarPosicao(nfId: string) {
    const valor = (novaPos[nfId] || "").trim();
    if (!valor) return;
    setSavingNf(nfId);
    try {
      const { error } = await supabase.from("nf_enderecamento").insert({
        nf_id: nfId,
        posicao: valor,
      });
      if (error) {
        if (error.code === "23505") {
          toast({
            variant: "destructive",
            title: "Posição duplicada",
            description: "Esta posição já está cadastrada para esta NF.",
          });
        } else {
          throw error;
        }
      } else {
        setNfs((prev) =>
          prev.map((n) =>
            n.id === nfId ? { ...n, posicoes: [...n.posicoes, valor] } : n
          )
        );
        setNovaPos((prev) => ({ ...prev, [nfId]: "" }));
        toast({ title: "Posição adicionada" });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err.message,
      });
    } finally {
      setSavingNf(null);
    }
  }

  async function aplicarLote() {
    const posicao = lotePosicao.trim();
    if (!posicao) {
      toast({ variant: "destructive", title: "Informe a posição" });
      return;
    }
    // Extrai números de NF: aceita quebras de linha, vírgula, ponto-e-vírgula, tab e espaço
    const numeros = Array.from(
      new Set(
        loteNfs
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    if (numeros.length === 0) {
      toast({ variant: "destructive", title: "Cole ao menos uma NF" });
      return;
    }

    setSalvandoLote(true);
    try {
      // Mapeia número -> ids (pode haver múltiplas NFs com mesmo número de emitentes diferentes; pegamos todas as ativas)
      const matchedIds: string[] = [];
      const naoEncontradas: string[] = [];
      const numerosNorm = numeros.map((n) => n.replace(/^0+/, "") || n);
      for (let i = 0; i < numeros.length; i++) {
        const alvo = numerosNorm[i];
        const found = nfs.filter(
          (n) => (n.numero_nf.replace(/^0+/, "") || n.numero_nf) === alvo
        );
        if (found.length === 0) naoEncontradas.push(numeros[i]);
        else found.forEach((f) => matchedIds.push(f.id));
      }

      if (matchedIds.length === 0) {
        toast({
          variant: "destructive",
          title: "Nenhuma NF encontrada",
          description: "Verifique se as NFs estão ativas no CD/em rota.",
        });
        return;
      }

      // Insere uma posição por NF; ignora as que já têm a mesma posição (unique constraint)
      const rows = matchedIds.map((id) => ({ nf_id: id, posicao }));
      const { error } = await supabase
        .from("nf_enderecamento")
        .upsert(rows, { onConflict: "nf_id,posicao", ignoreDuplicates: true });
      if (error) throw error;

      // Atualiza estado local
      setNfs((prev) =>
        prev.map((n) =>
          matchedIds.includes(n.id) && !n.posicoes.includes(posicao)
            ? { ...n, posicoes: [...n.posicoes, posicao] }
            : n
        )
      );

      toast({
        title: `Posição "${posicao}" aplicada`,
        description:
          `${matchedIds.length} NF(s) atualizadas` +
          (naoEncontradas.length
            ? ` • ${naoEncontradas.length} não encontradas: ${naoEncontradas.slice(0, 5).join(", ")}${naoEncontradas.length > 5 ? "..." : ""}`
            : ""),
      });
      setLoteNfs("");
      setLotePosicao("");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao aplicar em lote",
        description: err.message,
      });
    } finally {
      setSalvandoLote(false);
    }
  }

  async function removerPosicao(nfId: string, posicao: string) {
    setSavingNf(nfId);
    try {
      const { error } = await supabase
        .from("nf_enderecamento")
        .delete()
        .eq("nf_id", nfId)
        .eq("posicao", posicao);
      if (error) throw error;
      setNfs((prev) =>
        prev.map((n) =>
          n.id === nfId
            ? { ...n, posicoes: n.posicoes.filter((p) => p !== posicao) }
            : n
        )
      );
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao remover",
        description: err.message,
      });
    } finally {
      setSavingNf(null);
    }
  }

  const totalComEnd = nfs.filter((n) => n.posicoes.length > 0).length;
  const totalSemEnd = nfs.length - totalComEnd;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="w-7 h-7 text-primary" /> Endereçamento de NFs no CD
          </h1>
          <p className="text-muted-foreground mt-1">
            Cadastre as posições físicas onde cada Nota Fiscal está armazenada.
            Uma NF pode ocupar múltiplas posições.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total de NFs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{nfs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Com endereço</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{totalComEnd}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Sem endereço</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{totalSemEnd}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              Atribuir mesma posição a várias NFs
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Cole os números das NFs (uma por linha, ou separadas por vírgula/espaço) e informe a posição. Útil para posições que comportam várias cargas.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_240px_auto] gap-3">
              <Textarea
                placeholder={"Ex:\n123456\n123457\n123458"}
                value={loteNfs}
                onChange={(e) => setLoteNfs(e.target.value)}
                className="min-h-[100px] font-mono text-sm"
                disabled={salvandoLote}
              />
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Posição (ex: A-01-02)"
                  value={lotePosicao}
                  onChange={(e) => setLotePosicao(e.target.value)}
                  className="font-mono"
                  disabled={salvandoLote}
                />
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const n = loteNfs.split(/[\s,;]+/).filter(Boolean).length;
                    return n > 0 ? `${n} NF(s) coladas` : "Nenhuma NF colada";
                  })()}
                </div>
              </div>
              <Button
                onClick={aplicarLote}
                disabled={salvandoLote || !lotePosicao.trim() || !loteNfs.trim()}
                className="md:self-start"
              >
                {salvandoLote ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Aplicar a todas
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por NF, CNPJ, cliente, bairro ou posição..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant={filtroSemEnd ? "default" : "outline"}
                onClick={() => setFiltroSemEnd((v) => !v)}
              >
                {filtroSemEnd ? "Mostrando: sem endereço" : "Apenas sem endereço"}
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">NF</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead className="w-[110px]">MR</TableHead>
                      <TableHead>Posições no CD</TableHead>
                      <TableHead className="w-[280px]">Adicionar posição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Nenhuma NF encontrada.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtradas.map((nf) => {
                        const mr = getMacroRegiao(nf.dest_bairro, nf.dest_cidade);
                        return (
                          <TableRow key={nf.id}>
                            <TableCell className="font-mono font-semibold">{nf.numero_nf}</TableCell>
                            <TableCell>
                              <div className="font-medium">{nf.dest_razao_social || "—"}</div>
                              <div className="text-xs text-muted-foreground">
                                {nf.dest_bairro || "—"} • {nf.dest_cidade || "—"}/{nf.dest_uf || ""}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">MR {mr}</Badge>
                              <div className="text-[10px] text-muted-foreground mt-1">
                                {getMacroRegiaoLabel(mr)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1.5">
                                {nf.posicoes.length === 0 && (
                                  <span className="text-xs text-muted-foreground italic">
                                    Sem posição cadastrada
                                  </span>
                                )}
                                {nf.posicoes.map((p) => (
                                  <Badge
                                    key={p}
                                    variant="secondary"
                                    className="gap-1 pr-1 font-mono"
                                  >
                                    {p}
                                    <button
                                      onClick={() => removerPosicao(nf.id, p)}
                                      disabled={savingNf === nf.id}
                                      className="hover:bg-destructive hover:text-destructive-foreground rounded-sm p-0.5"
                                      aria-label={`Remover ${p}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Ex: A-01-02"
                                  value={novaPos[nf.id] || ""}
                                  onChange={(e) =>
                                    setNovaPos((prev) => ({ ...prev, [nf.id]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void adicionarPosicao(nf.id);
                                    }
                                  }}
                                  className="font-mono h-9"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => adicionarPosicao(nf.id)}
                                  disabled={savingNf === nf.id || !(novaPos[nf.id] || "").trim()}
                                >
                                  {savingNf === nf.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Plus className="w-4 h-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
