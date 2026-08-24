import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Loader2,
  RotateCw,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";

export interface CanhotoItem {
  id: string;
  numero_nf: string | null;
  destinatario: string | null;
  foto_path: string | null;
  foto_recibo_path: string | null;
  conferencia_status: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itens: CanhotoItem[];
  bloqueado?: boolean;
  onConferir: (id: string) => Promise<void> | void;
  onPendencia: (id: string) => void;
  onNovaFoto: (id: string) => void;
}

const EXPIRA_SEG = 3600;

/**
 * Conferência de canhotos em massa.
 *
 * Três decisões que resolvem a lentidão de abrir 50+ fotos:
 * 1. Um único `createSignedUrls` para todas as fotos do veículo (antes: 1 chamada
 *    por clique na lupa).
 * 2. A grade mostra a TIRA do recibo (`foto_recibo_path`, dezenas de KB) quando
 *    existe; a foto original (MB) só é baixada quando o operador amplia.
 * 3. Pré-carregamento das próximas imagens enquanto o operador olha a atual.
 */
export function CanhotoViewer({
  open,
  onOpenChange,
  itens,
  bloqueado,
  onConferir,
  onPendencia,
  onNovaFoto,
}: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indice, setIndice] = useState<number | null>(null);
  const [rotacao, setRotacao] = useState(0);
  const [fotoInteira, setFotoInteira] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const prefetchados = useRef<Set<string>>(new Set());

  const paths = useMemo(() => {
    const lista: string[] = [];
    for (const i of itens) {
      if (i.foto_recibo_path) lista.push(i.foto_recibo_path);
      if (i.foto_path) lista.push(i.foto_path);
    }
    return lista;
  }, [itens]);

  // Assina TODAS as fotos do veículo de uma vez só.
  useEffect(() => {
    if (!open || paths.length === 0) return;
    let cancelado = false;
    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const mapa: Record<string, string> = {};
        // O endpoint aceita lotes generosos; 200 por chamada cobre veículos grandes.
        for (let i = 0; i < paths.length; i += 200) {
          const fatia = paths.slice(i, i + 200);
          const { data, error } = await supabase.storage
            .from("comprovantes")
            .createSignedUrls(fatia, EXPIRA_SEG);
          if (error) throw error;
          for (const r of data ?? []) {
            if (r.path && r.signedUrl) mapa[r.path] = r.signedUrl;
          }
        }
        if (!cancelado) setUrls(mapa);
      } catch (e: any) {
        if (!cancelado) setErro(e?.message ?? "Falha ao carregar as imagens");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open, paths]);

  // Pré-carrega as próximas imagens da fila (grade e ampliação).
  useEffect(() => {
    if (!open) return;
    const inicio = indice ?? 0;
    for (let k = inicio; k < Math.min(inicio + 8, itens.length); k++) {
      const item = itens[k];
      const path = item?.foto_recibo_path ?? item?.foto_path;
      const url = path ? urls[path] : null;
      if (url && !prefetchados.current.has(url)) {
        prefetchados.current.add(url);
        const img = new Image();
        img.src = url;
      }
    }
  }, [open, indice, itens, urls]);

  const atual = indice != null ? itens[indice] : null;

  const urlDe = useCallback(
    (item: CanhotoItem | null, preferirOriginal: boolean) => {
      if (!item) return null;
      const path = preferirOriginal
        ? item.foto_path ?? item.foto_recibo_path
        : item.foto_recibo_path ?? item.foto_path;
      return path ? urls[path] ?? null : null;
    },
    [urls],
  );

  const irPara = useCallback(
    (i: number) => {
      if (itens.length === 0) return;
      const proximo = (i + itens.length) % itens.length;
      setIndice(proximo);
      setRotacao(0);
      setFotoInteira(false);
    },
    [itens.length],
  );

  const proximoNaoConferido = useCallback(
    (desde: number) => {
      for (let k = desde + 1; k < itens.length; k++) {
        if (!itens[k].conferencia_status) return k;
      }
      return null;
    },
    [itens],
  );

  async function conferirEAvancar() {
    if (!atual || indice == null) return;
    setSalvando(true);
    try {
      await onConferir(atual.id);
      const prox = proximoNaoConferido(indice);
      if (prox != null) irPara(prox);
      else setIndice(null);
    } finally {
      setSalvando(false);
    }
  }

  // Teclado: setas navegam, Enter confere, Esc fecha a ampliação.
  useEffect(() => {
    if (!open || indice == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") irPara(indice + 1);
      else if (e.key === "ArrowLeft") irPara(indice - 1);
      else if (e.key === "Escape") setIndice(null);
      else if (e.key === "Enter" && !bloqueado) void conferirEAvancar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, indice, irPara, bloqueado]);

  const totalConferidos = itens.filter((i) => i.conferencia_status).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] p-0 flex flex-col gap-0">
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">Conferência de canhotos</h2>
            <Badge variant="secondary">
              {totalConferidos} / {itens.length} conferidos
            </Badge>
            {carregando && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> preparando imagens...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {indice != null && (
              <Button variant="outline" size="sm" onClick={() => setIndice(null)}>
                Voltar à grade
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {erro && <div className="px-4 py-2 text-sm text-destructive">{erro}</div>}

        {/* ---------- Modo grade (folha de contatos) ---------- */}
        {indice == null && (
          <div className="flex-1 overflow-auto p-4">
            {itens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma foto de canhoto neste veículo.</p>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {itens.map((item, i) => {
                  const url = urlDe(item, false);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => irPara(i)}
                      className="text-left rounded-md border overflow-hidden hover:border-primary transition-colors bg-card"
                    >
                      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b bg-muted/40">
                        <span className="text-xs font-mono font-semibold">
                          NF {item.numero_nf ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[55%]">
                          {item.destinatario ?? ""}
                        </span>
                        {item.conferencia_status === "ok" ? (
                          <Badge className="bg-green-600 shrink-0">OK</Badge>
                        ) : item.conferencia_status === "pendencia" ? (
                          <Badge variant="destructive" className="shrink-0">Pend.</Badge>
                        ) : (
                          <Badge variant="outline" className="shrink-0">A conferir</Badge>
                        )}
                      </div>
                      <div className="bg-muted/20 flex items-center justify-center h-24">
                        {url ? (
                          <img
                            src={url}
                            alt={`Canhoto NF ${item.numero_nf ?? ""}`}
                            loading="lazy"
                            decoding="async"
                            className="max-h-24 w-full object-contain"
                          />
                        ) : (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---------- Modo ampliado com navegação ---------- */}
        {indice != null && atual && (
          <>
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => irPara(indice - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm tabular-nums">
                  {indice + 1} / {itens.length}
                </span>
                <Button variant="outline" size="icon" onClick={() => irPara(indice + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <span className="ml-2 text-sm font-mono font-semibold">NF {atual.numero_nf ?? "—"}</span>
                <span className="text-sm text-muted-foreground truncate max-w-[28vw]">
                  {atual.destinatario ?? ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setRotacao((r) => (r + 90) % 360)}>
                  <RotateCw className="w-4 h-4 mr-1" /> Girar
                </Button>
                <Button variant="outline" size="sm" onClick={() => setFotoInteira((v) => !v)}>
                  {fotoInteira ? <Minimize2 className="w-4 h-4 mr-1" /> : <Maximize2 className="w-4 h-4 mr-1" />}
                  {fotoInteira ? "Ver tira" : "Ver foto inteira"}
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center p-4">
              {(() => {
                const url = urlDe(atual, fotoInteira);
                if (!url) return <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />;
                return (
                  <img
                    src={url}
                    alt={`Canhoto NF ${atual.numero_nf ?? ""}`}
                    decoding="async"
                    style={{ transform: `rotate(${rotacao}deg)` }}
                    className="max-h-full max-w-full object-contain transition-transform"
                  />
                );
              })()}
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Setas ← → navegam · Enter confere e avança · Esc volta à grade
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bloqueado}
                  onClick={() => onNovaFoto(atual.id)}
                >
                  <Camera className="w-4 h-4 mr-1" /> Nova foto
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={bloqueado}
                  onClick={() => onPendencia(atual.id)}
                >
                  <AlertTriangle className="w-4 h-4 mr-1" /> Pendência
                </Button>
                <Button size="sm" disabled={bloqueado || salvando} onClick={conferirEAvancar}>
                  {salvando ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                  )}
                  Conferir e avançar
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
