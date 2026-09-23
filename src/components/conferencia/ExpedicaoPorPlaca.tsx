import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Truck, CheckCircle2, AlertTriangle, RefreshCw, ChevronLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface VeiculoExpedicao {
  id: string;
  placa: string;
  motorista: string | null;
  data: string;
}

export interface NfExpedicao {
  cargaId: string;
  numeroNf: string;
  total: number;
  conferidas: number;
  emEscopo: boolean;
}

interface StatusVeiculo {
  placa: string;
  fechada_em: string | null;
  com_pendencia: boolean;
  pendencia_motivo: string | null;
  total_nfs: number;
  total_escopo: number;
  fora_escopo: number;
  conferidas_escopo: number;
  faltando_escopo: number;
  nfs_escopo: string[];
}

interface Props {
  veiculo: VeiculoExpedicao | null;
  onSelectVeiculo: (v: VeiculoExpedicao | null) => void;
  onAbrirNf: (v: VeiculoExpedicao, nf: NfExpedicao) => void;
  isAdmin: boolean;
}

function hojeISO(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export function ExpedicaoPorPlaca({ veiculo, onSelectVeiculo, onAbrirNf, isAdmin }: Props) {
  // Expedição acontece na véspera (à noite) para a rota do dia seguinte
  const [data, setData] = useState(hojeISO(1));
  const [veiculos, setVeiculos] = useState<VeiculoExpedicao[]>([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [filtro, setFiltro] = useState("");

  const [status, setStatus] = useState<StatusVeiculo | null>(null);
  const [nfs, setNfs] = useState<NfExpedicao[]>([]);
  const [loadingVeiculo, setLoadingVeiculo] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [mostrarForcar, setMostrarForcar] = useState(false);

  const carregarLista = useCallback(async () => {
    setLoadingLista(true);
    try {
      const { data: rows, error } = await supabase
        .from("veiculos")
        .select("id, placa, motorista, data, veiculo_nfs!inner(id)")
        .eq("data", data)
        .order("placa");
      if (error) throw error;
      const unicos = new Map<string, VeiculoExpedicao>();
      (rows ?? []).forEach((r: any) =>
        unicos.set(r.id, { id: r.id, placa: r.placa, motorista: r.motorista, data: r.data }),
      );
      setVeiculos([...unicos.values()]);
    } catch (e) {
      console.error(e);
      toast({ title: "Erro ao carregar veículos", variant: "destructive" });
    } finally {
      setLoadingLista(false);
    }
  }, [data]);

  const carregarVeiculo = useCallback(async (v: VeiculoExpedicao) => {
    setLoadingVeiculo(true);
    try {
      const [{ data: st, error: e1 }, { data: vns, error: e2 }] = await Promise.all([
        supabase.rpc("conferencia_interna_status_veiculo" as any, { p_veiculo_id: v.id }),
        supabase
          .from("veiculo_nfs")
          .select("carga_origem_id, notas_fiscais!inner(numero_nf)")
          .eq("veiculo_id", v.id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const s = st as unknown as StatusVeiculo;
      setStatus(s);
      const escopo = new Set((s?.nfs_escopo ?? []).map(String));

      const lista: NfExpedicao[] = [];
      const porCarga = new Map<string, string[]>();
      (vns ?? []).forEach((r: any) => {
        const nf = String(r.notas_fiscais?.numero_nf ?? "");
        if (!nf) return;
        const arr = porCarga.get(r.carga_origem_id) ?? [];
        arr.push(nf);
        porCarga.set(r.carga_origem_id, arr);
      });
      for (const [cargaId, numeros] of porCarga) {
        const { data: ets, error } = await supabase
          .from("etiquetas")
          .select("numero_nf, status")
          .eq("carga_id", cargaId)
          .in("numero_nf", numeros)
          .neq("status", "divergencia");
        if (error) throw error;
        const agg = new Map<string, { t: number; c: number }>();
        (ets ?? []).forEach((e: any) => {
          const a = agg.get(e.numero_nf) ?? { t: 0, c: 0 };
          a.t += 1;
          if (e.status === "conferido") a.c += 1;
          agg.set(e.numero_nf, a);
        });
        numeros.forEach((n) => {
          const a = agg.get(n) ?? { t: 0, c: 0 };
          lista.push({ cargaId, numeroNf: n, total: a.t, conferidas: a.c, emEscopo: escopo.has(n) });
        });
      }
      lista.sort((a, b) => {
        const fa = a.total === 0 || a.conferidas < a.total;
        const fb = b.total === 0 || b.conferidas < b.total;
        if (a.emEscopo !== b.emEscopo) return a.emEscopo ? -1 : 1;
        if (fa !== fb) return fa ? -1 : 1;
        return a.numeroNf.localeCompare(b.numeroNf, "pt-BR", { numeric: true });
      });
      setNfs(lista);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Erro ao carregar placa", description: e?.message, variant: "destructive" });
    } finally {
      setLoadingVeiculo(false);
    }
  }, []);

  useEffect(() => {
    if (!veiculo) void carregarLista();
  }, [veiculo, carregarLista]);

  useEffect(() => {
    if (veiculo) {
      setMostrarForcar(false);
      setMotivo("");
      void carregarVeiculo(veiculo);
    }
  }, [veiculo, carregarVeiculo]);

  async function fechar(forcar: boolean) {
    if (!veiculo) return;
    setFechando(true);
    try {
      const { error } = await supabase.rpc("fechar_conferencia_interna_veiculo" as any, {
        p_veiculo_id: veiculo.id,
        p_forcar: forcar,
        p_motivo: forcar ? motivo : null,
      });
      if (error) throw error;
      toast({ title: `Veículo ${veiculo.placa} liberado para saída` });
      await carregarVeiculo(veiculo);
    } catch (e: any) {
      toast({ title: "Não foi possível liberar", description: e?.message, variant: "destructive" });
    } finally {
      setFechando(false);
    }
  }

  // ---- Lista de placas ----
  if (!veiculo) {
    const vis = veiculos.filter((v) =>
      !filtro.trim() ||
      v.placa.toUpperCase().includes(filtro.trim().toUpperCase()) ||
      (v.motorista ?? "").toUpperCase().includes(filtro.trim().toUpperCase()),
    );
    return (
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Etapa 2 • Expedição por placa</span>
          </div>
          <div className="flex gap-2">
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-40" />
            <Input placeholder="Placa ou motorista" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <Button variant="outline" size="icon" onClick={() => void carregarLista()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          {loadingLista ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : vis.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">Nenhum veículo roteirizado nesta data.</p>
          ) : (
            <div className="space-y-1">
              {vis.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onSelectVeiculo(v)}
                  className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="font-mono font-bold">{v.placa}</span>
                  <span className="text-xs text-muted-foreground truncate ml-2">{v.motorista ?? ""}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- Painel da placa ----
  const fechado = !!status?.fechada_em;
  const faltando = status?.faltando_escopo ?? 0;
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => onSelectVeiculo(null)} className="gap-1 px-2">
            <ChevronLeft className="w-4 h-4" /> Placas
          </Button>
          <Button variant="outline" size="icon" onClick={() => void carregarVeiculo(veiculo)}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <div>
          <div className="font-mono text-xl font-bold">{veiculo.placa}</div>
          <div className="text-xs text-muted-foreground">{veiculo.motorista ?? ""}</div>
        </div>

        {loadingVeiculo || !status ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <>
            <div className="rounded-md bg-muted p-3 text-sm">
              <strong>{status.total_escopo}</strong> notas IBAC/IBAE no escopo ·{" "}
              <strong>{status.conferidas_escopo}</strong> conferidas ·{" "}
              <strong className={faltando > 0 ? "text-destructive" : ""}>{faltando}</strong> faltando
              {status.fora_escopo > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {status.fora_escopo} nota(s) de outros embarcadores não travam a saída.
                </div>
              )}
            </div>

            {fechado ? (
              <div className="flex items-start gap-2 rounded-md border p-3">
                {status.com_pendencia ? (
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                )}
                <div className="text-sm">
                  <div className="font-semibold">
                    {status.com_pendencia ? "Liberado com pendência" : "Expedido"} em{" "}
                    {new Date(status.fechada_em!).toLocaleString("pt-BR")}
                  </div>
                  {status.pendencia_motivo && (
                    <div className="text-xs text-muted-foreground">Motivo: {status.pendencia_motivo}</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Button className="w-full" disabled={faltando > 0 || fechando} onClick={() => void fechar(false)}>
                  {fechando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {faltando > 0 ? `Faltam ${faltando} nota(s) para liberar` : "Liberar veículo para saída"}
                </Button>
                {faltando > 0 && isAdmin && (
                  !mostrarForcar ? (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setMostrarForcar(true)}>
                      Liberar com pendência (admin)
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Motivo (nota retirada, avaria, outro veículo...)"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        disabled={motivo.trim().length < 5 || fechando}
                        onClick={() => void fechar(true)}
                      >
                        Confirmar liberação com pendência
                      </Button>
                    </div>
                  )
                )}
              </div>
            )}

            <div className="space-y-1">
              {nfs.map((n) => {
                const ok = n.total > 0 && n.conferidas >= n.total;
                return (
                  <button
                    key={`${n.cargaId}-${n.numeroNf}`}
                    onClick={() => onAbrirNf(veiculo, n)}
                    disabled={n.total === 0}
                    className="w-full flex items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted disabled:opacity-60"
                  >
                    <span className="font-mono">NF {n.numeroNf}</span>
                    <span className="flex items-center gap-2">
                      {!n.emEscopo && <Badge variant="outline" className="text-[10px]">fora do escopo</Badge>}
                      <span className={`text-xs ${ok ? "text-primary" : "text-muted-foreground"}`}>
                        {n.total === 0 ? "sem etiqueta" : `${n.conferidas}/${n.total}`}
                      </span>
                      {ok && <CheckCircle2 className="w-4 h-4 text-primary" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
