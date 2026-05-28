import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BaixaRow {
  id: string;
  status: string;
  ocorrencia: string | null;
  recebedor_nome: string | null;
  registrado_em: string | null;
  foto_path: string | null;
  latitude: number | null;
  longitude: number | null;
  validacao_score: number | null;
  validacao_status: string | null;
  validacao_problemas: { lista?: string[]; observacoes?: string } | null;
  veiculo: { placa: string | null; motorista: string | null; data: string | null } | null;
  nf: {
    numero_nf: string | null;
    dest_razao_social: string | null;
    dest_cidade: string | null;
    dest_uf: string | null;
    cnpj_destinatario: string | null;
  } | null;
}

const OCORRENCIA_LABEL: Record<string, string> = {
  entregue: "Entregue",
  recusado: "Recusado",
  endereco_nao_encontrado: "Endereço não encontrado",
  ausente: "Destinatário ausente",
  reentrega: "Reentrega",
  outros: "Outros",
};

function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function RelatorioBaixas() {
  const { toast } = useToast();
  const [dataIni, setDataIni] = useState<string>(isoDay(-7));
  const [dataFim, setDataFim] = useState<string>(isoDay(0));
  const [ocorrenciaFiltro, setOcorrenciaFiltro] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [rows, setRows] = useState<BaixaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const ini = new Date(`${dataIni}T00:00:00`).toISOString();
      const fim = new Date(`${dataFim}T23:59:59`).toISOString();

      let q = supabase
        .from("baixas_entrega")
        .select(
          `id, status, ocorrencia, recebedor_nome, registrado_em, foto_path, latitude, longitude,
           validacao_score, validacao_status, validacao_problemas,
           veiculo:veiculos!baixas_entrega_veiculo_id_fkey(placa, motorista, data),
           nf:notas_fiscais!baixas_entrega_nf_id_fkey(numero_nf, dest_razao_social, dest_cidade, dest_uf, cnpj_destinatario)`
        )
        .gte("registrado_em", ini)
        .lte("registrado_em", fim)
        .order("registrado_em", { ascending: false })
        .limit(2000);

      if (ocorrenciaFiltro !== "todas") {
        q = q.eq("ocorrencia", ocorrenciaFiltro);
      }

      const { data, error } = await q;
      if (error) throw error;
      const list = (data as unknown as BaixaRow[]) || [];
      setRows(list);

      // Gera URLs assinadas para todas as fotos (em paralelo, em lotes)
      const paths = list.map((r) => r.foto_path).filter((p): p is string => !!p);
      const urls: Record<string, string> = {};
      const BATCH = 50;
      for (let i = 0; i < paths.length; i += BATCH) {
        const slice = paths.slice(i, i + BATCH);
        const results = await Promise.all(
          slice.map((p) =>
            supabase.storage.from("comprovantes").createSignedUrl(p, 3600)
          )
        );
        results.forEach((res, idx) => {
          if (res.data?.signedUrl) urls[slice[idx]] = res.data.signedUrl;
        });
      }
      setFotoUrls(urls);
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erro ao carregar",
        description: err?.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowsFiltradas = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const hay = [
        r.nf?.numero_nf,
        r.nf?.dest_razao_social,
        r.nf?.cnpj_destinatario,
        r.veiculo?.placa,
        r.veiculo?.motorista,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, busca]);

  function exportarCsv() {
    const headers = [
      "Data/Hora",
      "Placa",
      "Motorista",
      "NF",
      "Destinatário",
      "CNPJ",
      "Cidade/UF",
      "Ocorrência",
      "Recebedor",
      "Latitude",
      "Longitude",
      "Tem Foto",
      "Qualidade IA",
      "Score IA",
      "Problemas IA",
    ];
    const lines = rowsFiltradas.map((r) =>
      [
        r.registrado_em ? new Date(r.registrado_em).toLocaleString("pt-BR") : "",
        r.veiculo?.placa ?? "",
        r.veiculo?.motorista ?? "",
        r.nf?.numero_nf ?? "",
        r.nf?.dest_razao_social ?? "",
        r.nf?.cnpj_destinatario ?? "",
        [r.nf?.dest_cidade, r.nf?.dest_uf].filter(Boolean).join("/"),
        OCORRENCIA_LABEL[r.ocorrencia || ""] || r.ocorrencia || "",
        r.recebedor_nome ?? "",
        r.latitude ?? "",
        r.longitude ?? "",
        r.foto_path ? "Sim" : "Não",
        r.validacao_status ?? "",
        r.validacao_score ?? "",
        (r.validacao_problemas?.lista || []).join(" | "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";")
    );

    const csv = [headers.join(";"), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-baixas-${dataIni}_a_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function abrirFoto(path: string) {
    const { data, error } = await supabase.storage
      .from("comprovantes")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast({ title: "Erro", description: "Não foi possível abrir a foto", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Relatório de Baixas</h1>
          <Button onClick={exportarCsv} disabled={rowsFiltradas.length === 0} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <Label className="text-xs">Data inicial</Label>
                <Input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Data final</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Ocorrência</Label>
                <Select value={ocorrenciaFiltro} onValueChange={setOcorrenciaFiltro}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {Object.entries(OCORRENCIA_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-1">
                <Label className="text-xs">Buscar (NF, placa, destinatário…)</Label>
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para filtrar" />
              </div>
              <Button onClick={carregar} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : rowsFiltradas.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10">
                Nenhuma baixa encontrada no período.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  {rowsFiltradas.length} baixa(s) encontrada(s)
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Foto</TableHead>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Placa</TableHead>
                        <TableHead>NF</TableHead>
                        <TableHead>Destinatário</TableHead>
                        <TableHead>Cidade/UF</TableHead>
                        <TableHead>Ocorrência</TableHead>
                        <TableHead>Recebedor</TableHead>
                        <TableHead>Qualidade IA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rowsFiltradas.map((r) => {
                        const vStatus = r.validacao_status;
                        const vScore = r.validacao_score;
                        const vProblemas = r.validacao_problemas?.lista || [];
                        const vObs = r.validacao_problemas?.observacoes || "";
                        const tooltip = [vObs, ...vProblemas].filter(Boolean).join(" • ");
                        const vVariant =
                          vStatus === "ok"
                            ? "default"
                            : vStatus === "alerta"
                            ? "secondary"
                            : vStatus === "ruim"
                            ? "destructive"
                            : undefined;
                        const vLabel =
                          vStatus === "ok"
                            ? `OK (${vScore})`
                            : vStatus === "alerta"
                            ? `Atenção (${vScore})`
                            : vStatus === "ruim"
                            ? `Ruim (${vScore})`
                            : r.foto_path
                            ? "—"
                            : "Sem foto";
                        return (
                          <TableRow key={r.id}>
                            <TableCell>
                              {r.foto_path ? (
                                fotoUrls[r.foto_path] ? (
                                  <button
                                    type="button"
                                    onClick={() => setFotoPreview(fotoUrls[r.foto_path!])}
                                    className="block rounded overflow-hidden border border-border hover:ring-2 hover:ring-primary transition"
                                    title="Clique para ampliar"
                                  >
                                    <img
                                      src={fotoUrls[r.foto_path]}
                                      alt="Canhoto"
                                      loading="lazy"
                                      className="h-14 w-14 object-cover"
                                    />
                                  </button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => abrirFoto(r.foto_path!)}
                                  >
                                    <ImageIcon className="w-4 h-4" />
                                  </Button>
                                )
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {r.registrado_em
                                ? new Date(r.registrado_em).toLocaleString("pt-BR")
                                : "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{r.veiculo?.placa || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{r.nf?.numero_nf || "—"}</TableCell>
                            <TableCell className="text-xs max-w-[240px] truncate">
                              {r.nf?.dest_razao_social || "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {[r.nf?.dest_cidade, r.nf?.dest_uf].filter(Boolean).join("/") || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={r.ocorrencia === "entregue" ? "default" : "secondary"} className="text-xs">
                                {OCORRENCIA_LABEL[r.ocorrencia || ""] || r.ocorrencia || "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{r.recebedor_nome || "—"}</TableCell>
                            <TableCell>
                              {vVariant ? (
                                <Badge variant={vVariant} className="text-xs" title={tooltip}>
                                  {vLabel}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground" title="Aguardando análise">
                                  {vLabel}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {fotoPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setFotoPreview(null)}
        >
          <img
            src={fotoPreview}
            alt="Canhoto ampliado"
            className="max-h-full max-w-full object-contain rounded shadow-2xl"
          />
        </div>
      )}
    </MainLayout>
  );
}
