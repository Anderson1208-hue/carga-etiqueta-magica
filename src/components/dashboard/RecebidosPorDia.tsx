import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { calculateBoxes } from "@/lib/xml-parser";
import { PackageOpen } from "lucide-react";

const DIAS = 7;

type Row = { data: string; cargas: number; nfs: number; caixas: number; peso: number; m3: number };

async function loadRecebidos(): Promise<Row[]> {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - (DIAS - 1));
  const inicioStr = inicio.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("cargas")
    .select("id,data,notas_fiscais(peso_bruto,volume_m3,itens_nf(q_com))")
    .gte("data", inicioStr)
    .order("data", { ascending: false });

  if (error) throw error;

  const map = new Map<string, Row>();
  for (let i = 0; i < DIAS; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { data: key, cargas: 0, nfs: 0, caixas: 0, peso: 0, m3: 0 });
  }

  (data ?? []).forEach((c: any) => {
    const row = map.get(c.data);
    if (!row) return;
    row.cargas += 1;
    const nfs = c.notas_fiscais ?? [];
    row.nfs += nfs.length;
    for (const nf of nfs) {
      row.peso += Number(nf.peso_bruto || 0);
      row.m3 += Number(nf.volume_m3 || 0);
      for (const it of nf.itens_nf ?? []) {
        row.caixas += calculateBoxes(Number(it.q_com || 0));
      }
    }
  });

  return Array.from(map.values()).sort((a, b) => (a.data < b.data ? 1 : -1));
}

function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  const dia = dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${d}/${m} · ${dia}`;
}

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RecebidosPorDia() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-recebidos-dia"],
    queryFn: loadRecebidos,
    refetchInterval: 60_000,
  });

  const totais = (data ?? []).reduce(
    (a, r) => ({
      cargas: a.cargas + r.cargas,
      nfs: a.nfs + r.nfs,
      caixas: a.caixas + r.caixas,
      peso: a.peso + r.peso,
      m3: a.m3 + r.m3,
    }),
    { cargas: 0, nfs: 0, caixas: 0, peso: 0, m3: 0 }
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageOpen className="h-4 w-4 text-primary" />
          Cargas recebidas — últimos {DIAS} dias
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="text-left font-medium py-2">Data</th>
                <th className="text-right font-medium py-2">Cargas</th>
                <th className="text-right font-medium py-2">NFs</th>
                <th className="text-right font-medium py-2">Caixas</th>
                <th className="text-right font-medium py-2">Peso (kg)</th>
                <th className="text-right font-medium py-2">m³</th>
                <th className="text-right font-medium py-2">Peso cubado (kg)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Carregando…</td></tr>
              )}
              {!isLoading && (data ?? []).map((r) => (
                <tr key={r.data} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="py-2">{fmtData(r.data)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{nf0.format(r.cargas)}</td>
                  <td className="py-2 text-right tabular-nums">{nf0.format(r.nfs)}</td>
                  <td className="py-2 text-right tabular-nums">{nf0.format(r.caixas)}</td>
                  <td className="py-2 text-right tabular-nums">{nf2.format(r.peso)}</td>
                  <td className="py-2 text-right tabular-nums">{nf2.format(r.m3)}</td>
                  <td className="py-2 text-right tabular-nums">{nf2.format(r.m3 * 300)}</td>

                </tr>
              ))}
            </tbody>
            {!isLoading && (
              <tfoot>
                <tr className="font-semibold">
                  <td className="pt-3">Total</td>
                  <td className="pt-3 text-right tabular-nums">{nf0.format(totais.cargas)}</td>
                  <td className="pt-3 text-right tabular-nums">{nf0.format(totais.nfs)}</td>
                  <td className="pt-3 text-right tabular-nums">{nf0.format(totais.caixas)}</td>
                  <td className="pt-3 text-right tabular-nums">{nf2.format(totais.peso)}</td>
                  <td className="pt-3 text-right tabular-nums">{nf2.format(totais.m3)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
