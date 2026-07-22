import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Undo2, Search, Loader2, ArrowLeft, Lock, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const OCORRENCIA_LABEL: Record<string, string> = {
  entregue: "Entregue",
  recusado: "Recusado",
  endereco_nao_encontrado: "End. não encontrado",
  ausente: "Ausente",
  reentrega: "Reentrega",
  outros: "Outros",
};

interface Resultado {
  id: string;
  nf_id: string;
  ocorrencia: string | null;
  recebedor_nome: string | null;
  foto_path: string | null;
  registrado_em: string | null;
  conferido_em: string | null;
  nf: {
    numero_nf: string | null;
    dest_razao_social: string | null;
    dest_cidade: string | null;
    dest_uf: string | null;
    carga_id: string | null;
  } | null;
  veiculo: {
    id: string;
    placa: string;
    motorista: string | null;
    data: string;
    prestacao_contas_em: string | null;
  } | null;
}

export default function DesfazerBaixa() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, profile } = useAuth();
  const autorizado = isAdmin || (profile?.ativo === true && profile?.role === "operador");


  const [numeroNf, setNumeroNf] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [processando, setProcessando] = useState<string | null>(null);
  const [reabrir, setReabrir] = useState(true);

  async function buscar() {
    const termo = numeroNf.trim().replace(/^0+/, "");
    if (!termo) {
      toast({ title: "Informe o número da NF", variant: "destructive" });
      return;
    }
    setBuscando(true);
    setResultados([]);
    try {
      // Busca NFs por número (com ou sem zeros à esquerda)
      const { data: nfs, error: nfErr } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, dest_razao_social, dest_cidade, dest_uf, carga_id")
        .or(`numero_nf.eq.${termo},numero_nf.eq.${termo.padStart(9, "0")}`)
        .limit(50);
      if (nfErr) throw nfErr;
      if (!nfs || nfs.length === 0) {
        toast({ title: "NF não encontrada" });
        return;
      }
      const nfIds = nfs.map((n) => n.id);
      const { data: baixas, error: baErr } = await supabase
        .from("baixas_entrega")
        .select(
          "id, nf_id, veiculo_id, ocorrencia, recebedor_nome, foto_path, registrado_em, conferido_em"
        )
        .in("nf_id", nfIds)
        .order("registrado_em", { ascending: false });
      if (baErr) throw baErr;

      if (!baixas || baixas.length === 0) {
        toast({ title: "Sem baixas registradas para esta NF" });
        return;
      }

      const veicIds = Array.from(new Set(baixas.map((b: any) => b.veiculo_id).filter(Boolean)));
      const { data: veiculos } = await supabase
        .from("veiculos")
        .select("id, placa, motorista, data, prestacao_contas_em")
        .in("id", veicIds as string[]);

      const nfMap = new Map(nfs.map((n) => [n.id, n]));
      const vMap = new Map((veiculos || []).map((v: any) => [v.id, v]));

      const out: Resultado[] = baixas.map((b: any) => ({
        id: b.id,
        nf_id: b.nf_id,
        ocorrencia: b.ocorrencia,
        recebedor_nome: b.recebedor_nome,
        foto_path: b.foto_path,
        registrado_em: b.registrado_em,
        conferido_em: b.conferido_em,
        nf: nfMap.get(b.nf_id) as any,
        veiculo: vMap.get(b.veiculo_id) as any,
      }));
      setResultados(out);
    } catch (err: any) {
      toast({ title: "Erro na busca", description: err?.message, variant: "destructive" });
    } finally {
      setBuscando(false);
    }
  }

  async function desfazer(r: Resultado) {
    const encerrado = !!r.veiculo?.prestacao_contas_em;
    const msg =
      `Desfazer a baixa da NF ${r.nf?.numero_nf || ""}?\n\n` +
      `Ocorrência atual: ${r.ocorrencia ? (OCORRENCIA_LABEL[r.ocorrencia] || r.ocorrencia) : "—"}\n` +
      `Veículo: ${r.veiculo?.placa || "—"}${encerrado ? " (PRESTAÇÃO ENCERRADA)" : ""}\n\n` +
      (encerrado && reabrir
        ? "A prestação de contas do veículo será REABERTA para permitir nova conferência.\n\n"
        : "") +
      "A NF voltará para o app do motorista como pendente.";
    if (!window.confirm(msg)) return;

    setProcessando(r.id);
    try {
      if (r.foto_path) {
        await supabase.storage.from("comprovantes").remove([r.foto_path]);
      }
      const { error: delErr, count } = await supabase
        .from("baixas_entrega")
        .delete({ count: "exact" })
        .eq("id", r.id);
      if (delErr) throw delErr;
      if (!count) throw new Error("Sem permissão para desfazer a baixa.");

      const { data: outras } = await supabase
        .from("baixas_entrega")
        .select("id")
        .eq("nf_id", r.nf_id)
        .limit(1);

      if (!outras || outras.length === 0) {
        await supabase
          .from("notas_fiscais")
          .update({ status_entrega: "NF EM ROTA" })
          .eq("id", r.nf_id);

        if (r.veiculo?.id && r.nf?.carga_id) {
          await supabase
            .from("veiculo_nfs")
            .upsert(
              [{ veiculo_id: r.veiculo.id, nf_id: r.nf_id, carga_origem_id: r.nf.carga_id }],
              { onConflict: "nf_id", ignoreDuplicates: true }
            );
        }
      }

      if (encerrado && reabrir && r.veiculo?.id) {
        await supabase
          .from("veiculos")
          .update({
            prestacao_contas_em: null,
            prestacao_contas_por: null,
            prestacao_contas_obs: null,
          })
          .eq("id", r.veiculo.id);
      }

      toast({
        title: "Baixa desfeita",
        description: encerrado && reabrir ? "Prestação de contas reaberta." : "NF voltou para o motorista.",
      });
      await buscar();
    } catch (err: any) {
      toast({ title: "Erro ao desfazer", description: err?.message, variant: "destructive" });
    } finally {
      setProcessando(null);
    }
  }

  if (!autorizado) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto p-6">
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <ShieldAlert className="w-10 h-10 mx-auto text-destructive" />
              <p className="font-medium">Acesso restrito</p>
              <p className="text-sm text-muted-foreground">
                Esta função está disponível apenas para administradores e operadores autorizados.
              </p>
              <Button variant="outline" onClick={() => navigate("/prestacao-contas")}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Undo2 className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Desfazer Baixa</h1>
              <p className="text-xs text-muted-foreground">
                Correção de baixas erradas — funciona inclusive em veículos já encerrados.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/prestacao-contas")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Prestação de Contas
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Buscar NF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="nf">Número da NF</Label>
                <Input
                  id="nf"
                  value={numeroNf}
                  onChange={(e) => setNumeroNf(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && buscar()}
                  placeholder="Ex: 749344"
                  autoFocus
                />
              </div>
              <Button onClick={buscar} disabled={buscando}>
                {buscando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
                Buscar
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="reabrir"
                checked={reabrir}
                onCheckedChange={(c) => setReabrir(!!c)}
              />
              <Label htmlFor="reabrir" className="text-sm font-normal cursor-pointer">
                Reabrir prestação de contas do veículo se estiver encerrada
              </Label>
            </div>
          </CardContent>
        </Card>

        {resultados.length > 0 && (
          <div className="space-y-3">
            {resultados.map((r) => {
              const encerrado = !!r.veiculo?.prestacao_contas_em;
              return (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-lg">NF {r.nf?.numero_nf}</span>
                          <Badge variant="outline">{r.veiculo?.placa || "—"}</Badge>
                          {encerrado && (
                            <Badge className="gap-1">
                              <Lock className="w-3 h-3" />
                              Encerrado em {format(new Date(r.veiculo!.prestacao_contas_em!), "dd/MM HH:mm")}
                            </Badge>
                          )}
                          {r.conferido_em && (
                            <Badge variant="secondary">Conferida</Badge>
                          )}
                        </div>
                        <p className="text-sm">
                          {r.nf?.dest_razao_social} — {r.nf?.dest_cidade}/{r.nf?.dest_uf}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Motorista: {r.veiculo?.motorista || "—"} · Data:{" "}
                          {r.veiculo?.data ? format(new Date(r.veiculo.data + "T00:00:00"), "dd/MM/yyyy") : "—"}
                        </p>
                        <p className="text-xs">
                          Ocorrência: <strong>{r.ocorrencia ? (OCORRENCIA_LABEL[r.ocorrencia] || r.ocorrencia) : "—"}</strong>
                          {r.recebedor_nome && ` · Recebedor: ${r.recebedor_nome}`}
                        </p>
                        {r.registrado_em && (
                          <p className="text-xs text-muted-foreground">
                            Baixa em {format(new Date(r.registrado_em), "dd/MM/yyyy HH:mm")}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => desfazer(r)}
                        disabled={processando === r.id}
                      >
                        {processando === r.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Undo2 className="w-4 h-4 mr-1" />
                        )}
                        Desfazer baixa
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
