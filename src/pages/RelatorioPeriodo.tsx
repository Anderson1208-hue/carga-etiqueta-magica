import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileSpreadsheet, Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type RelatorioRow = {
  dimensao: string;
  cargas: number;
  nfs: number;
  destinatarios: number;
  caixas: number;
  peso_kg: number;
  volume_m3: number;
  densidade: number | null;
  entregues: number;
  pendentes: number;
  recusados: number;
};

const DIMENSOES = [
  { value: "placa", label: "Placa / Veículo" },
  { value: "destinatario", label: "Destinatário" },
  { value: "embarcador", label: "Embarcador (emitente)" },
  { value: "cidade", label: "Cidade / UF" },
  { value: "uf", label: "UF" },
  { value: "bairro", label: "Bairro" },
  { value: "data", label: "Data da carga" },
  { value: "carga", label: "Carga (data + placa)" },
  { value: "total", label: "Total do período (sem quebra)" },
];

function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function nf(n: number, dec = 0) {
  return Number(n || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export default function RelatorioPeriodo() {
  const { toast } = useToast();
  const [dataIni, setDataIni] = useState(isoDay(-7));
  const [dataFim, setDataFim] = useState(isoDay(0));
  const [dimensao, setDimensao] = useState("placa");
  const [embarcador, setEmbarcador] = useState("");
  const [destinatario, setDestinatario] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [placa, setPlaca] = useState("");
  const [rows, setRows] = useState<RelatorioRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [gerado, setGerado] = useState<string | null>(null);

  const dimLabel = DIMENSOES.find((d) => d.value === dimensao)?.label ?? "Agrupamento";

  const totais = useMemo(() => {
    const t = rows.reduce(
      (acc, r) => {
        acc.nfs += Number(r.nfs || 0);
        acc.cargas += Number(r.cargas || 0);
        acc.destinatarios += Number(r.destinatarios || 0);
        acc.caixas += Number(r.caixas || 0);
        acc.peso_kg += Number(r.peso_kg || 0);
        acc.volume_m3 += Number(r.volume_m3 || 0);
        acc.entregues += Number(r.entregues || 0);
        acc.pendentes += Number(r.pendentes || 0);
        acc.recusados += Number(r.recusados || 0);
        return acc;
      },
      {
        nfs: 0,
        cargas: 0,
        destinatarios: 0,
        caixas: 0,
        peso_kg: 0,
        volume_m3: 0,
        entregues: 0,
        pendentes: 0,
        recusados: 0,
      }
    );
    const densidade = t.volume_m3 > 0 ? t.peso_kg / t.volume_m3 : null;
    return { ...t, densidade };
  }, [rows]);

  async function gerar() {
    if (!dataIni || !dataFim) {
      toast({ title: "Informe o período", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("relatorio_periodo", {
        p_inicio: dataIni,
        p_fim: dataFim,
        p_dimensao: dimensao,
        p_embarcador: embarcador.trim() || null,
        p_uf: uf.trim() || null,
        p_cidade: cidade.trim() || null,
        p_destinatario: destinatario.trim() || null,
        p_placa: placa.trim() || null,
      });
      if (error) throw error;
      setRows((data as RelatorioRow[]) || []);
      setGerado(new Date().toLocaleString("pt-BR"));
      if (!data || (data as RelatorioRow[]).length === 0) {
        toast({ title: "Nenhum dado no período com esses filtros" });
      }
    } catch (e) {
      toast({
        title: "Erro ao gerar relatório",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function exportarExcel() {
    if (rows.length === 0) return;
    const header = [
      dimLabel,
      "Cargas",
      "NFs",
      "Destinatários",
      "Caixas",
      "Peso (kg)",
      "M³",
      "Densidade (kg/m³)",
      "Entregues",
      "Pendentes",
      "Recusados",
    ];
    const body = rows.map((r) => [
      r.dimensao,
      Number(r.cargas || 0),
      Number(r.nfs || 0),
      Number(r.destinatarios || 0),
      Number(r.caixas || 0),
      Number(r.peso_kg || 0),
      Number(r.volume_m3 || 0),
      r.densidade === null ? "" : Number(r.densidade),
      Number(r.entregues || 0),
      Number(r.pendentes || 0),
      Number(r.recusados || 0),
    ]);
    const totalRow = [
      "TOTAL",
      totais.cargas,
      totais.nfs,
      totais.destinatarios,
      totais.caixas,
      totais.peso_kg,
      totais.volume_m3,
      totais.densidade === null ? "" : totais.densidade,
      totais.entregues,
      totais.pendentes,
      totais.recusados,
    ];
    const info = [
      [`Relatório por período — agrupado por ${dimLabel}`],
      [`Período: ${dataIni} a ${dataFim}`],
      [
        `Filtros: embarcador=${embarcador || "-"}; destinatário=${destinatario || "-"}; cidade=${
          cidade || "-"
        }; UF=${uf || "-"}; placa=${placa || "-"}`,
      ],
      [],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...info, header, ...body, totalRow]);
    ws["!cols"] = [{ wch: 42 }, ...header.slice(1).map(() => ({ wch: 14 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
    XLSX.writeFile(wb, `relatorio_${dimensao}_${dataIni}_a_${dataFim}.xlsx`);
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Relatórios por Período</h1>
          <p className="text-sm text-muted-foreground">
            Monte relatórios operacionais escolhendo o período, o agrupamento e os filtros. Base:
            NFs vinculadas a cargas com data no período.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Parâmetros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>De</Label>
                <Input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Até</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Agrupar por</Label>
                <Select value={dimensao} onValueChange={setDimensao}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIMENSOES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1">
                <Label>Embarcador</Label>
                <Input
                  placeholder="ex: IBAC"
                  value={embarcador}
                  onChange={(e) => setEmbarcador(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Destinatário / CNPJ</Label>
                <Input
                  placeholder="nome ou CNPJ"
                  value={destinatario}
                  onChange={(e) => setDestinatario(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Cidade</Label>
                <Input value={cidade} onChange={(e) => setCidade(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Input
                  maxLength={2}
                  value={uf}
                  onChange={(e) => setUf(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-1">
                <Label>Placa</Label>
                <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={gerar} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Gerar relatório
              </Button>
              <Button variant="outline" onClick={exportarExcel} disabled={rows.length === 0}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar Excel
              </Button>
              {gerado && (
                <span className="text-xs text-muted-foreground">Gerado em {gerado}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <>
            <div className="grid gap-3 md:grid-cols-5">
              {[
                { label: "NFs", value: nf(totais.nfs) },
                { label: "Destinatários", value: nf(totais.destinatarios) },
                { label: "Caixas", value: nf(totais.caixas) },
                { label: "Peso (kg)", value: nf(totais.peso_kg, 1) },
                {
                  label: "Densidade (kg/m³)",
                  value: totais.densidade === null ? "—" : nf(totais.densidade, 1),
                },
              ].map((k) => (
                <Card key={k.label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-xl font-bold">{k.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {rows.length} linha(s) — agrupado por {dimLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[60vh]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="min-w-[220px]">{dimLabel}</TableHead>
                        <TableHead className="text-right">Cargas</TableHead>
                        <TableHead className="text-right">NFs</TableHead>
                        <TableHead className="text-right">Dest.</TableHead>
                        <TableHead className="text-right">Caixas</TableHead>
                        <TableHead className="text-right">Peso (kg)</TableHead>
                        <TableHead className="text-right">M³</TableHead>
                        <TableHead className="text-right">kg/m³</TableHead>
                        <TableHead className="text-right">Entregues</TableHead>
                        <TableHead className="text-right">Pendentes</TableHead>
                        <TableHead className="text-right">Recus.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.dimensao}>
                          <TableCell className="font-medium">{r.dimensao}</TableCell>
                          <TableCell className="text-right">{nf(r.cargas)}</TableCell>
                          <TableCell className="text-right">{nf(r.nfs)}</TableCell>
                          <TableCell className="text-right">{nf(r.destinatarios)}</TableCell>
                          <TableCell className="text-right">{nf(r.caixas)}</TableCell>
                          <TableCell className="text-right">{nf(r.peso_kg, 1)}</TableCell>
                          <TableCell className="text-right">{nf(r.volume_m3, 2)}</TableCell>
                          <TableCell className="text-right">
                            {r.densidade === null ? "—" : nf(r.densidade, 1)}
                          </TableCell>
                          <TableCell className="text-right">{nf(r.entregues)}</TableCell>
                          <TableCell className="text-right">{nf(r.pendentes)}</TableCell>
                          <TableCell className="text-right">{nf(r.recusados)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-bold">TOTAL</TableCell>
                        <TableCell className="text-right font-bold">{nf(totais.cargas)}</TableCell>
                        <TableCell className="text-right font-bold">{nf(totais.nfs)}</TableCell>
                        <TableCell className="text-right font-bold">
                          {nf(totais.destinatarios)}
                        </TableCell>
                        <TableCell className="text-right font-bold">{nf(totais.caixas)}</TableCell>
                        <TableCell className="text-right font-bold">
                          {nf(totais.peso_kg, 1)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {nf(totais.volume_m3, 2)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {totais.densidade === null ? "—" : nf(totais.densidade, 1)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {nf(totais.entregues)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {nf(totais.pendentes)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {nf(totais.recusados)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">
              Observação: ao agrupar por destinatário, cidade, UF ou bairro, a soma da coluna
              "Cargas" pode repetir a mesma carga em linhas diferentes.
            </p>
          </>
        )}
      </div>
    </MainLayout>
  );
}
