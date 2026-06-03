import { useMemo, useRef, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, FileCheck2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { parseOcoren, summarizeAllCodes, type OcorenRecord } from "@/lib/ocoren-parser";

type Status = "importavel" | "ja_baixada" | "sem_veiculo" | "nao_encontrada";

interface PreviewRow {
  cnpj: string;
  numeroNf: string;
  dataIso: string;
  status: Status;
  nf_id?: string;
  veiculo_id?: string;
  destinatario?: string | null;
  emitente?: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
  importavel: "Importável",
  ja_baixada: "Já com baixa",
  sem_veiculo: "Sem veículo vinculado",
  nao_encontrada: "NF não encontrada",
};

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  importavel: "default",
  ja_baixada: "secondary",
  sem_veiculo: "destructive",
  nao_encontrada: "outline",
};

function normalizeCnpj(v: string | null | undefined): string {
  return (v || "").replace(/\D/g, "");
}

async function chunkedIn<T>(values: string[], size: number, fn: (slice: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += size) {
    const slice = values.slice(i, i + size);
    const res = await fn(slice);
    out.push(...res);
  }
  return out;
}

export default function ImportarOcoren() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [codeBreakdown, setCodeBreakdown] = useState<Record<string, number>>({});
  const [records, setRecords] = useState<OcorenRecord[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  // Apenas administradores acessam.
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const counts = useMemo(() => {
    const c = { importavel: 0, ja_baixada: 0, sem_veiculo: 0, nao_encontrada: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  async function handleFile(file: File) {
    setImportedCount(null);
    setRows([]);
    setRecords([]);
    setFileName(file.name);
    const content = await file.text();
    const codes = summarizeAllCodes(content);
    setCodeBreakdown(codes);
    const parsed = parseOcoren(content, "01");
    setRecords(parsed);
    if (parsed.length === 0) {
      toast({
        title: "Nenhum registro código 01 encontrado",
        description: "O arquivo não contém ocorrências de entrega realizada.",
        variant: "destructive",
      });
      return;
    }
    await analyze(parsed);
  }

  async function analyze(parsed: OcorenRecord[]) {
    setAnalyzing(true);
    try {
      // Busca todas as NFs candidatas por numero_nf em lotes (filtra CNPJ no client).
      const nfNumeros = Array.from(new Set(parsed.map((p) => p.numeroNf)));
      const nfHits = await chunkedIn(nfNumeros, 200, async (slice) => {
        const { data, error } = await supabase
          .from("notas_fiscais")
          .select("id, numero_nf, cnpj_emitente, razao_social_emitente, dest_razao_social")
          .in("numero_nf", slice);
        if (error) throw error;
        return data || [];
      });

      // Indexa por (cnpj14|numero_nf)
      const nfByKey = new Map<string, typeof nfHits[number]>();
      for (const nf of nfHits) {
        const key = `${normalizeCnpj(nf.cnpj_emitente)}|${nf.numero_nf}`;
        nfByKey.set(key, nf);
      }

      const foundNfIds = Array.from(
        new Set(
          parsed
            .map((p) => nfByKey.get(`${p.cnpj}|${p.numeroNf}`)?.id)
            .filter((v): v is string => !!v)
        )
      );

      // Baixas existentes
      const baixasIds = new Set<string>();
      await chunkedIn(foundNfIds, 300, async (slice) => {
        const { data, error } = await supabase
          .from("baixas_entrega")
          .select("nf_id")
          .in("nf_id", slice);
        if (error) throw error;
        for (const b of data || []) baixasIds.add(b.nf_id);
        return [];
      });

      // Veículos vinculados
      const veiculoByNf = new Map<string, string>();
      await chunkedIn(foundNfIds, 300, async (slice) => {
        const { data, error } = await supabase
          .from("veiculo_nfs")
          .select("nf_id, veiculo_id")
          .in("nf_id", slice);
        if (error) throw error;
        for (const v of data || []) veiculoByNf.set(v.nf_id, v.veiculo_id);
        return [];
      });

      const previewRows: PreviewRow[] = parsed.map((p) => {
        const nf = nfByKey.get(`${p.cnpj}|${p.numeroNf}`);
        if (!nf) {
          return { ...p, status: "nao_encontrada" };
        }
        if (baixasIds.has(nf.id)) {
          return {
            ...p,
            status: "ja_baixada",
            nf_id: nf.id,
            destinatario: nf.dest_razao_social,
            emitente: nf.razao_social_emitente,
          };
        }
        const veiculoId = veiculoByNf.get(nf.id);
        if (!veiculoId) {
          return {
            ...p,
            status: "sem_veiculo",
            nf_id: nf.id,
            destinatario: nf.dest_razao_social,
            emitente: nf.razao_social_emitente,
          };
        }
        return {
          ...p,
          status: "importavel",
          nf_id: nf.id,
          veiculo_id: veiculoId,
          destinatario: nf.dest_razao_social,
          emitente: nf.razao_social_emitente,
        };
      });

      setRows(previewRows);
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erro ao analisar arquivo",
        description: err?.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleImportar() {
    const importaveis = rows.filter((r) => r.status === "importavel");
    if (importaveis.length === 0) return;

    const ok = window.confirm(
      `Importar ${importaveis.length} baixa(s) como ENTREGUE?\n\nEsta ação registra baixas no sistema com origem OCOREN/Praxio.`
    );
    if (!ok) return;

    setImporting(true);
    setImportedCount(null);
    let inserted = 0;
    try {
      const BATCH = 200;
      for (let i = 0; i < importaveis.length; i += BATCH) {
        const slice = importaveis.slice(i, i + BATCH);
        const payload = slice.map((r) => ({
          veiculo_id: r.veiculo_id!,
          nf_id: r.nf_id!,
          status: "entregue",
          ocorrencia: "entregue",
          registrado_em: r.dataIso,
          recebedor_nome: "OCOREN Praxio",
          observacao: "Baixa importada do arquivo OCOREN (Praxio) — código 01",
        }));
        const { error } = await supabase.from("baixas_entrega").insert(payload);
        if (error) throw error;
        inserted += slice.length;
      }
      setImportedCount(inserted);
      toast({ title: "Importação concluída", description: `${inserted} baixa(s) registrada(s).` });
      // Reanaliza para refletir estado novo
      if (records.length) await analyze(records);
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erro na importação",
        description: `${err?.message || "Erro"}. Importadas até o erro: ${inserted}.`,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Importar OCOREN (Praxio)</h1>
          <p className="text-sm text-muted-foreground">
            Importa ocorrências de entrega do arquivo padrão PROCEDA OCOREN 3.1. Apenas registros com código <strong>01 (Entrega realizada normalmente)</strong> geram baixa automática.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Arquivo OCOREN</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Input
                ref={fileRef}
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                disabled={analyzing || importing}
                className="max-w-md"
              />
              {fileName && (
                <span className="text-xs text-muted-foreground">
                  <FileCheck2 className="w-3 h-3 inline mr-1" />
                  {fileName}
                </span>
              )}
            </div>

            {Object.keys(codeBreakdown).length > 0 && (
              <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                <span>Ocorrências no arquivo:</span>
                {Object.entries(codeBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cod, qtd]) => (
                    <Badge key={cod} variant={cod === "01" ? "default" : "outline"} className="text-xs">
                      {cod}: {qtd}
                    </Badge>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {analyzing && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              Analisando registros e cruzando com o banco...
            </CardContent>
          </Card>
        )}

        {!analyzing && rows.length > 0 && (
          <>
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Importáveis</p>
                    <p className="text-2xl font-bold text-primary">{counts.importavel}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Já com baixa</p>
                    <p className="text-2xl font-bold">{counts.ja_baixada}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Sem veículo</p>
                    <p className="text-2xl font-bold text-destructive">{counts.sem_veiculo}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">NF não encontrada</p>
                    <p className="text-2xl font-bold text-muted-foreground">{counts.nao_encontrada}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Apenas as linhas "Importáveis" serão gravadas. Demais são apenas exibidas para conferência.
                  </p>
                  <Button onClick={handleImportar} disabled={importing || counts.importavel === 0}>
                    {importing ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    Importar {counts.importavel} baixa(s)
                  </Button>
                </div>

                {importedCount !== null && (
                  <p className="mt-2 text-sm text-primary">
                    ✓ {importedCount} baixa(s) registrada(s) com sucesso.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>NF</TableHead>
                        <TableHead>CNPJ Emitente</TableHead>
                        <TableHead>Emitente</TableHead>
                        <TableHead>Destinatário</TableHead>
                        <TableHead>Data Entrega</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 2000).map((r, idx) => (
                        <TableRow key={`${r.cnpj}-${r.numeroNf}-${idx}`}>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[r.status]} className="text-xs">
                              {STATUS_LABEL[r.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.numeroNf}</TableCell>
                          <TableCell className="font-mono text-xs">{r.cnpj}</TableCell>
                          <TableCell className="text-xs max-w-[220px] truncate">{r.emitente || "—"}</TableCell>
                          <TableCell className="text-xs max-w-[220px] truncate">{r.destinatario || "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(r.dataIso).toLocaleString("pt-BR")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rows.length > 2000 && (
                    <p className="text-xs text-muted-foreground p-2">
                      Exibindo primeiras 2000 linhas. Total: {rows.length}.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
