// Fila de recuperação de canhotos: entregas válidas cujo canhoto físico não
// voltou com o motorista. O operador anexa a foto aqui (ou a digitalização),
// o sistema gera a tira paisagem 1536x240 do recibo e enfileira a imagem à IBAC
// na hora — sem esperar um novo encerramento de prestação de contas.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, FileWarning, Loader2, RefreshCw, Upload } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { blobCanhotoRecibo, previewCanhotoOkEntrega } from "@/lib/okentrega-canhoto";
import { CANHOTO_MOTIVO_LABEL } from "@/pages/PrestacaoContas";

interface PendenteRow {
  baixa_id: string;
  nf_id: string;
  numero_nf: string | null;
  dest_razao_social: string | null;
  dest_cidade: string | null;
  veiculo_id: string | null;
  placa: string | null;
  motorista: string | null;
  data_rota: string | null;
  registrado_em: string | null;
  ocorrencia: string | null;
  motivo: string | null;
  observacao: string | null;
  marcado_em: string | null;
  marcado_por_nome: string | null;
  dias_corridos: number | null;
  prazo_vencido: boolean;
}

export default function CanhotosPendentes() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PendenteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [alvo, setAlvo] = useState<PendenteRow | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("listar_canhotos_pendentes");
      if (error) throw error;
      setRows((data ?? []) as PendenteRow[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.numero_nf, r.placa, r.motorista, r.dest_razao_social, r.dest_cidade]
        .some((v) => (v ?? "").toLowerCase().includes(t)),
    );
  }, [rows, busca]);

  const vencidas = rows.filter((r) => r.prazo_vencido).length;

  function abrirUpload(row: PendenteRow) {
    setAlvo(row);
    setArquivo(null);
    setPreview(null);
  }

  async function escolherArquivo(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setArquivo(file);
    setPreview(null);
    if (!file) return;
    try {
      const { dataUrl } = await previewCanhotoOkEntrega(file);
      setPreview(dataUrl);
    } catch (err: any) {
      toast({ title: "Não foi possível gerar a prévia", description: err?.message, variant: "destructive" });
    }
  }

  async function confirmarRecuperacao() {
    if (!alvo || !arquivo) return;
    setEnviando(true);
    try {
      const base = `${alvo.veiculo_id ?? "sem-veiculo"}/${alvo.nf_id}`;
      const stamp = Date.now();
      const fotoPath = `${base}/canhoto-recuperado-${stamp}.jpg`;
      const reciboPath = `${base}/canhoto-recuperado-${stamp}-recibo.jpg`;

      const up1 = await supabase.storage
        .from("comprovantes")
        .upload(fotoPath, arquivo, { contentType: arquivo.type || "image/jpeg", upsert: true });
      if (up1.error) throw up1.error;

      let reciboFinal: string | null = null;
      try {
        const tira = await blobCanhotoRecibo(arquivo);
        const up2 = await supabase.storage
          .from("comprovantes")
          .upload(reciboPath, tira, { contentType: "image/jpeg", upsert: true });
        if (!up2.error) reciboFinal = reciboPath;
      } catch {
        reciboFinal = null;
      }

      const { error: rpcErr } = await (supabase as any).rpc("registrar_canhoto_recuperado", {
        p_baixa_id: alvo.baixa_id,
        p_foto_path: fotoPath,
        p_foto_recibo_path: reciboFinal,
      });
      if (rpcErr) throw rpcErr;

      // Enfileira imediatamente a imagem desta baixa e dispara o sync.
      const { data: fila } = await supabase.functions.invoke("ibac-enfileirar-canhotos", {
        body: { baixa_ids: [alvo.baixa_id] },
      });
      await supabase.functions.invoke("ibac-sync");

      toast({
        title: "Canhoto recuperado",
        description: `NF ${alvo.numero_nf ?? ""} conferida. ${Number(fila?.enfileirados ?? 0)} imagem(ns) enfileirada(s) para a IBAC.`,
      });
      if (preview) URL.revokeObjectURL(preview);
      setAlvo(null);
      setArquivo(null);
      setPreview(null);
      await carregar();
    } catch (err: any) {
      toast({ title: "Erro ao registrar canhoto", description: err?.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <FileWarning className="w-7 h-7 text-amber-600" />
            <div>
              <h1 className="text-2xl font-bold">Canhotos pendentes de recuperação</h1>
              <p className="text-sm text-muted-foreground">
                Entregas encerradas cujo canhoto físico não voltou com o motorista. Prazo de recuperação: 2 dias úteis.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="NF, placa, motorista, cliente"
              className="w-64"
            />
            <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{rows.length}</p>
            <p className="text-xs text-muted-foreground">Canhotos pendentes</p>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <p className={`text-2xl font-bold ${vencidas > 0 ? "text-destructive" : ""}`}>{vencidas}</p>
            <p className="text-xs text-muted-foreground">Fora do prazo (2 dias úteis)</p>
          </CardContent></Card>
          <Card><CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{new Set(rows.map((r) => r.placa)).size}</p>
            <p className="text-xs text-muted-foreground">Placas envolvidas</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fila de cobrança ({filtradas.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="[&>*]:py-1.5 [&>*]:px-2">
                    <TableHead>NF</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Placa / Motorista</TableHead>
                    <TableHead>Rota</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Marcado por</TableHead>
                    <TableHead>Atraso</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((r) => (
                    <TableRow key={r.baixa_id} className={`[&>*]:py-1.5 [&>*]:px-2 ${r.prazo_vencido ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                      <TableCell className="font-mono whitespace-nowrap">{r.numero_nf ?? "—"}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <p className="truncate font-medium">{r.dest_razao_social ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{r.dest_cidade ?? ""}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p className="font-semibold">{r.placa ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">{r.motorista ?? ""}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.data_rota ? format(new Date(r.data_rota + "T00:00:00"), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p>{CANHOTO_MOTIVO_LABEL[r.motivo ?? ""] ?? r.motivo ?? "—"}</p>
                        {r.observacao && <p className="text-[11px] text-muted-foreground truncate">{r.observacao}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p className="truncate max-w-[140px]">{r.marcado_por_nome ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {r.marcado_em ? format(new Date(r.marcado_em), "dd/MM HH:mm") : ""}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.prazo_vencido ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" /> {r.dias_corridos ?? 0}d
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{r.dias_corridos ?? 0}d</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="outline" onClick={() => abrirUpload(r)}>
                          <Upload className="w-3.5 h-3.5 mr-1" /> Anexar canhoto
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtradas.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Nenhum canhoto pendente de recuperação.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!alvo} onOpenChange={(o) => { if (!o) { setAlvo(null); setArquivo(null); setPreview(null); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Anexar canhoto recuperado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              NF <span className="font-mono">{alvo?.numero_nf}</span> — {alvo?.dest_razao_social} · placa {alvo?.placa}
            </p>
            <Input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
            />
            {preview && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Prévia da tira que será enviada (1536×240 @150dpi):</p>
                <img src={preview} alt="Prévia do canhoto" className="w-full rounded-md border" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)}>Cancelar</Button>
            <Button onClick={confirmarRecuperacao} disabled={!arquivo || enviando}>
              {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Confirmar e enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
