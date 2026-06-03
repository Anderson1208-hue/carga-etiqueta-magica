import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, FileSpreadsheet, Upload, CheckCircle2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseOcoren, type OcorenRecord } from "@/lib/ocoren-parser";

interface PendenteRow {
  nf_id: string;
  numero_nf: string;
  razao_social_emitente: string | null;
  cnpj_emitente: string | null;
  dest_razao_social: string | null;
  dest_cidade: string | null;
  dest_uf: string | null;
  status_entrega: string | null;
  placa: string | null;
  motorista: string | null;
  data_carga: string | null;
  dias_aberto: number;
}

function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function RelatorioPendentesBaixa() {
  const { toast } = useToast();
  const [dataIni, setDataIni] = useState<string>(isoDay(-30));
  const [dataFim, setDataFim] = useState<string>(isoDay(0));
  const [busca, setBusca] = useState("");
  const [rows, setRows] = useState<PendenteRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      // 1. Veículos no período (carga.data dentro do intervalo)
      const { data: veiculos, error: vErr } = await supabase
        .from("veiculos")
        .select("id, placa, motorista, data")
        .gte("data", dataIni)
        .lte("data", dataFim)
        .order("data", { ascending: false })
        .limit(2000);
      if (vErr) throw vErr;
      if (!veiculos || veiculos.length === 0) {
        setRows([]);
        return;
      }

      const veiculoById = new Map(veiculos.map((v) => [v.id, v]));
      const veiculoIds = veiculos.map((v) => v.id);

      // 2. veiculo_nfs desses veículos (em lotes)
      const vnfs: { nf_id: string; veiculo_id: string }[] = [];
      const STEP = 200;
      for (let i = 0; i < veiculoIds.length; i += STEP) {
        const slice = veiculoIds.slice(i, i + STEP);
        const { data, error } = await supabase
          .from("veiculo_nfs")
          .select("nf_id, veiculo_id")
          .in("veiculo_id", slice);
        if (error) throw error;
        vnfs.push(...(data || []));
      }
      if (vnfs.length === 0) {
        setRows([]);
        return;
      }

      const nfIds = Array.from(new Set(vnfs.map((v) => v.nf_id)));

      // 3. Baixas existentes para esses nf_ids
      const baixasSet = new Set<string>();
      for (let i = 0; i < nfIds.length; i += 300) {
        const slice = nfIds.slice(i, i + 300);
        const { data, error } = await supabase
          .from("baixas_entrega")
          .select("nf_id")
          .in("nf_id", slice);
        if (error) throw error;
        for (const b of data || []) baixasSet.add(b.nf_id);
      }

      const pendentesNfIds = nfIds.filter((id) => !baixasSet.has(id));
      if (pendentesNfIds.length === 0) {
        setRows([]);
        return;
      }

      // 4. Dados das NFs pendentes (em lotes)
      const nfs: any[] = [];
      for (let i = 0; i < pendentesNfIds.length; i += 200) {
        const slice = pendentesNfIds.slice(i, i + 200);
        const { data, error } = await supabase
          .from("notas_fiscais")
          .select(
            "id, numero_nf, razao_social_emitente, cnpj_emitente, dest_razao_social, dest_cidade, dest_uf, status_entrega"
          )
          .in("id", slice);
        if (error) throw error;
        nfs.push(...(data || []));
      }

      // 5. Monta linhas
      const vnfByNf = new Map(vnfs.map((v) => [v.nf_id, v.veiculo_id]));
      const today = new Date();
      const result: PendenteRow[] = nfs.map((nf) => {
        const vid = vnfByNf.get(nf.id);
        const v = vid ? veiculoById.get(vid) : undefined;
        const dataCarga = v?.data || null;
        let dias = 0;
        if (dataCarga) {
          const d = new Date(`${dataCarga}T00:00:00`);
          dias = Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86400000));
        }
        return {
          nf_id: nf.id,
          numero_nf: nf.numero_nf,
          razao_social_emitente: nf.razao_social_emitente,
          cnpj_emitente: nf.cnpj_emitente,
          dest_razao_social: nf.dest_razao_social,
          dest_cidade: nf.dest_cidade,
          dest_uf: nf.dest_uf,
          status_entrega: nf.status_entrega,
          placa: v?.placa ?? null,
          motorista: v?.motorista ?? null,
          data_carga: dataCarga,
          dias_aberto: dias,
        };
      });

      // Ordena por dias_aberto desc
      result.sort((a, b) => b.dias_aberto - a.dias_aberto);
      setRows(result);
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
        r.numero_nf,
        r.razao_social_emitente,
        r.cnpj_emitente,
        r.dest_razao_social,
        r.placa,
        r.motorista,
        r.dest_cidade,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, busca]);

  function exportarCsv() {
    const headers = [
      "NF",
      "Emitente",
      "CNPJ Emitente",
      "Destinatário",
      "Cidade/UF",
      "Placa",
      "Motorista",
      "Data Carga",
      "Dias em Aberto",
      "Status Entrega",
    ];
    const lines = rowsFiltradas.map((r) =>
      [
        r.numero_nf,
        r.razao_social_emitente ?? "",
        r.cnpj_emitente ?? "",
        r.dest_razao_social ?? "",
        [r.dest_cidade, r.dest_uf].filter(Boolean).join("/"),
        r.placa ?? "",
        r.motorista ?? "",
        r.data_carga ?? "",
        r.dias_aberto,
        r.status_entrega ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";")
    );
    const csv = [headers.join(";"), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nfs-pendentes-baixa-${dataIni}_a_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">NFs Expedidas Pendentes de Baixa</h1>
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
                <Label className="text-xs">Data carga (de)</Label>
                <Input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Data carga (até)</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Buscar (NF, emitente, placa, destinatário…)</Label>
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
                Nenhuma NF pendente de baixa no período.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-2">
                  {rowsFiltradas.length} NF(s) pendente(s)
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>NF</TableHead>
                        <TableHead>Emitente</TableHead>
                        <TableHead>Destinatário</TableHead>
                        <TableHead>Cidade/UF</TableHead>
                        <TableHead>Placa</TableHead>
                        <TableHead>Data Carga</TableHead>
                        <TableHead>Dias Aberto</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rowsFiltradas.slice(0, 2000).map((r) => (
                        <TableRow key={r.nf_id}>
                          <TableCell className="font-mono text-xs">{r.numero_nf}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">
                            {r.razao_social_emitente || "—"}
                          </TableCell>
                          <TableCell className="text-xs max-w-[220px] truncate">
                            {r.dest_razao_social || "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {[r.dest_cidade, r.dest_uf].filter(Boolean).join("/") || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.placa || "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {r.data_carga
                              ? new Date(`${r.data_carga}T00:00:00`).toLocaleDateString("pt-BR")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                r.dias_aberto >= 5
                                  ? "destructive"
                                  : r.dias_aberto >= 2
                                  ? "secondary"
                                  : "outline"
                              }
                              className="text-xs"
                            >
                              {r.dias_aberto}d
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{r.status_entrega || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rowsFiltradas.length > 2000 && (
                    <p className="text-xs text-muted-foreground p-2">
                      Exibindo primeiras 2000 linhas. Total: {rowsFiltradas.length}.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
