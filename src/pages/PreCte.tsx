import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { FileText, FileSpreadsheet, Upload } from "lucide-react";
import {
  parsePreCteReport,
  exportPreCteExcel,
  exportPreCtePDF,
  isPreCteEbenezerContent,
  type PreCteReport,
} from "@/lib/precte-report-parser";

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtCnpj(c: string | null) {
  if (!c) return "—";
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export default function PreCte() {
  const { toast } = useToast();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [report, setReport] = useState<PreCteReport | null>(null);
  const [processando, setProcessando] = useState(false);

  const handleProcessar = async () => {
    if (!arquivo) {
      toast({ title: "Selecione um arquivo .TXT", variant: "destructive" });
      return;
    }
    setProcessando(true);
    try {
      // valida layout
      const head = new TextDecoder("iso-8859-1").decode(
        await arquivo.slice(0, 1024).arrayBuffer()
      );
      if (!isPreCteEbenezerContent(head)) {
        toast({
          title: "Arquivo não reconhecido",
          description: "Esperado pré-fatura Ebenezer (layout 390/393/394/396).",
          variant: "destructive",
        });
        return;
      }
      const r = await parsePreCteReport(arquivo);
      setReport(r);
      toast({
        title: "Arquivo processado",
        description: `${r.total_nfs} NFs · Total ${fmtMoney(r.total_geral)}`,
      });
    } catch (err) {
      toast({
        title: "Erro ao processar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setProcessando(false);
    }
  };

  const baseNome = report
    ? report.arquivo_nome.replace(/\.[^.]+$/, "")
    : "pre-cte";

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pré-CT-e</h1>
            <p className="text-sm text-muted-foreground">
              Leitura da pré-fatura (.TXT) para emissão de CT-e pelo time de transportes.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="w-4 h-4" />
              Importar pré-fatura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <Label htmlFor="arq" className="text-xs">Arquivo .TXT da pré-fatura</Label>
                <Input
                  id="arq"
                  type="file"
                  accept=".txt,.TXT"
                  onChange={(e) => {
                    setArquivo(e.target.files?.[0] || null);
                    setReport(null);
                  }}
                />
              </div>
              <Button onClick={handleProcessar} disabled={!arquivo || processando}>
                {processando ? "Processando..." : "Processar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O arquivo não é salvo no banco — apenas processado para gerar o relatório.
            </p>
          </CardContent>
        </Card>

        {report && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total de NFs</p>
                  <p className="text-2xl font-bold">{report.total_nfs}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total Frete</p>
                  <p className="text-2xl font-bold">{fmtMoney(report.total_frete)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total ICMS</p>
                  <p className="text-2xl font-bold">{fmtMoney(report.total_icms)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total Geral</p>
                  <p className="text-2xl font-bold">{fmtMoney(report.total_geral)}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Relatório</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Transportador: {fmtCnpj(report.cnpj_transportador)} · Destinatário:{" "}
                    {fmtCnpj(report.cnpj_destinatario_principal)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportPreCteExcel(report, `${baseNome}.xlsx`)}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportPreCtePDF(report, `${baseNome}.pdf`)}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>NF</TableHead>
                        <TableHead className="text-right">Frete</TableHead>
                        <TableHead className="text-right">ICMS</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Obs.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.linhas.map((l, idx) => (
                        <TableRow key={`${l.grupo_id}-${idx}`}>
                          <TableCell className="font-medium">{l.numero_nf}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(l.valor_frete)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(l.valor_icms)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtMoney(l.valor_total)}</TableCell>
                          <TableCell>
                            {l.rateado ? (
                              <Badge variant="secondary" className="text-xs">
                                Rateado ({l.nfs_no_grupo} NFs)
                              </Badge>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total ({report.total_nfs} NFs)</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(report.total_frete)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(report.total_icms)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtMoney(report.total_geral)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
