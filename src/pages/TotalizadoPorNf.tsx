import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { calculateBoxes } from "@/lib/xml-parser";
import { toast } from "sonner";
import { Calculator, Loader2 } from "lucide-react";

interface NfRow {
  numero_nf: string;
  razao_social_emitente: string | null;
  dest_razao_social: string | null;
  dest_cidade: string | null;
  dest_uf: string | null;
  peso_bruto: number | null;
  volume_m3: number | null;
  valor_nf: number | null;
  carga_id: string | null;
  cargas: { placa: string | null; motorista: string | null; data: string | null } | null;
  itens_nf: { q_com: number }[];
}

interface Resultado {
  encontradas: NfRow[];
  naoEncontradas: string[];
}

export default function TotalizadoPorNf() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const parseNfs = (raw: string): string[] => {
    return Array.from(
      new Set(
        raw
          .split(/[\s,;\n\r\t]+/)
          .map((s) => s.replace(/\D/g, ""))
          .filter((s) => s.length > 0)
      )
    );
  };

  const consultar = async () => {
    const nfs = parseNfs(input);
    if (nfs.length === 0) {
      toast.error("Informe ao menos uma NF");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select(
          "numero_nf,razao_social_emitente,dest_razao_social,dest_cidade,dest_uf,peso_bruto,volume_m3,valor_nf,carga_id,cargas(placa,motorista,data),itens_nf(q_com)"
        )
        .in("numero_nf", nfs);
      if (error) throw error;
      const rows = (data ?? []) as unknown as NfRow[];
      const found = new Set(rows.map((r) => r.numero_nf));
      const naoEncontradas = nfs.filter((n) => !found.has(n));
      setResultado({ encontradas: rows, naoEncontradas });
    } catch (e: any) {
      toast.error("Erro ao consultar: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const limpar = () => {
    setInput("");
    setResultado(null);
  };

  // Agrupar por carga/placa
  const grupos = resultado
    ? Object.values(
        resultado.encontradas.reduce<Record<string, { chave: string; placa: string; motorista: string; data: string; nfs: NfRow[] }>>(
          (acc, nf) => {
            const chave = nf.carga_id ?? "sem-carga";
            const placa = nf.cargas?.placa ?? "—";
            if (!acc[chave]) {
              acc[chave] = {
                chave,
                placa,
                motorista: nf.cargas?.motorista ?? "—",
                data: nf.cargas?.data ?? "",
                nfs: [],
              };
            }
            acc[chave].nfs.push(nf);
            return acc;
          },
          {}
        )
      ).sort((a, b) => a.placa.localeCompare(b.placa))
    : [];

  const totalizar = (nfs: NfRow[]) => ({
    qtdNfs: nfs.length,
    caixas: nfs.reduce((s, nf) => s + nf.itens_nf.reduce((si, it) => si + calculateBoxes(Number(it.q_com) || 0), 0), 0),
    peso: nfs.reduce((s, nf) => s + Number(nf.peso_bruto || 0), 0),
    volume: nfs.reduce((s, nf) => s + Number(nf.volume_m3 || 0), 0),
    valor: nfs.reduce((s, nf) => s + Number(nf.valor_nf || 0), 0),
  });

  const totalGeral = resultado ? totalizar(resultado.encontradas) : null;

  return (
    <MainLayout>
      <div className="space-y-4 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="w-6 h-6" /> Totalizado por NF
          </h1>
          <p className="text-muted-foreground text-sm">
            Cole ou digite números de NF (de qualquer carreta). O sistema agrupa por placa e apresenta o totalizado.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas Fiscais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Ex: 749344, 749345 749346&#10;749347"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={5}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={consultar} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}
                Calcular Totalizado
              </Button>
              <Button variant="outline" onClick={limpar} disabled={loading}>
                Limpar
              </Button>
              <span className="text-sm text-muted-foreground self-center">
                {parseNfs(input).length} NF(s) informada(s)
              </span>
            </div>
          </CardContent>
        </Card>

        {resultado && totalGeral && (
          <>
            <Card className="border-primary">
              <CardHeader>
                <CardTitle className="text-base">Total Geral</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Metric label="NFs" value={String(totalGeral.qtdNfs)} />
                  <Metric label="Caixas" value={String(totalGeral.caixas)} />
                  <Metric label="Peso (kg)" value={totalGeral.peso.toFixed(2)} />
                  <Metric label="Volume (m³)" value={totalGeral.volume.toFixed(3)} />
                  <Metric label="Valor (R$)" value={totalGeral.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                </div>
                {resultado.naoEncontradas.length > 0 && (
                  <div className="mt-4 p-3 rounded bg-destructive/10 text-destructive text-sm">
                    <strong>NFs não encontradas ({resultado.naoEncontradas.length}):</strong>{" "}
                    {resultado.naoEncontradas.join(", ")}
                  </div>
                )}
              </CardContent>
            </Card>

            {grupos.map((g) => {
              const t = totalizar(g.nfs);
              return (
                <Card key={g.chave}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Badge variant="secondary" className="text-sm">{g.placa}</Badge>
                        <span className="font-normal text-muted-foreground text-sm">
                          {g.motorista} {g.data && `• ${g.data.split("-").reverse().join("/")}`}
                        </span>
                      </CardTitle>
                      <div className="text-sm font-medium flex gap-4">
                        <span>{t.qtdNfs} NFs</span>
                        <span>{t.caixas} cx</span>
                        <span>{t.peso.toFixed(2)} kg</span>
                        <span>{t.volume.toFixed(3)} m³</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>NF</TableHead>
                          <TableHead>Emitente</TableHead>
                          <TableHead>Destinatário</TableHead>
                          <TableHead>Cidade/UF</TableHead>
                          <TableHead className="text-right">Cx</TableHead>
                          <TableHead className="text-right">Peso (kg)</TableHead>
                          <TableHead className="text-right">m³</TableHead>
                          <TableHead className="text-right">Valor (R$)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.nfs
                          .slice()
                          .sort((a, b) => (parseInt(a.numero_nf) || 0) - (parseInt(b.numero_nf) || 0))
                          .map((nf) => {
                            const cx = nf.itens_nf.reduce((s, it) => s + calculateBoxes(Number(it.q_com) || 0), 0);
                            return (
                              <TableRow key={nf.numero_nf + (nf.carga_id ?? "")}>
                                <TableCell className="font-mono font-medium">{nf.numero_nf}</TableCell>
                                <TableCell className="text-xs">{nf.razao_social_emitente ?? "—"}</TableCell>
                                <TableCell className="text-xs">{nf.dest_razao_social ?? "—"}</TableCell>
                                <TableCell className="text-xs">
                                  {nf.dest_cidade ?? "—"}/{nf.dest_uf ?? "—"}
                                </TableCell>
                                <TableCell className="text-right">{cx}</TableCell>
                                <TableCell className="text-right">{Number(nf.peso_bruto || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right">{Number(nf.volume_m3 || 0).toFixed(3)}</TableCell>
                                <TableCell className="text-right">
                                  {Number(nf.valor_nf || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>
    </MainLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
