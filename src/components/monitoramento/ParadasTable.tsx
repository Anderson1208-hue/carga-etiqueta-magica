import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapPin, AlertTriangle, MapPinOff } from "lucide-react";
import type { MonitoramentoParada } from "./types";
import { StatusBadge } from "./StatusBadge";
import type { ParadaAnalise } from "@/lib/dwellTime";
import { isPassagem } from "@/lib/dwellTime";

interface ParadasTableProps {
  paradas: MonitoramentoParada[];
  onJustificar: (parada: MonitoramentoParada) => void;
  formatTime: (iso: string | null) => string;
  /** cnpj_destinatario -> ISO da última baixa "entregue" */
  baixasPorCnpj?: Record<string, string>;
  /** parada.id -> análise "estilo mercado" (dwell + off-site) */
  analisePorParada?: Record<string, ParadaAnalise>;
}

const GAP_ALERTA_MIN = 10;

const normCnpj = (c: string | null) => (c || "").replace(/\D/g, "");

export function ParadasTable({
  paradas,
  onJustificar,
  formatTime,
  baixasPorCnpj = {},
  analisePorParada = {},
}: ParadasTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Paradas da Rota
          <span className="text-xs font-normal text-muted-foreground ml-auto">
            {paradas.length} {paradas.length === 1 ? "parada" : "paradas"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="w-8 h-8 px-2 text-[11px]">#</TableHead>
                <TableHead className="h-8 px-2 text-[11px]">Cliente</TableHead>
                <TableHead className="h-8 px-2 text-[11px]">Status</TableHead>
                <TableHead className="h-8 px-2 text-[11px]">Chegada → Saída</TableHead>
                <TableHead className="h-8 px-2 text-[11px]">Dwell</TableHead>
                <TableHead className="h-8 px-2 text-[11px]">Baixa</TableHead>
                <TableHead className="h-8 px-2 text-[11px] w-16">Gap</TableHead>
                <TableHead className="h-8 px-2 text-[11px] w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paradas.map((parada) => {
                const baixaIso = baixasPorCnpj[normCnpj(parada.cnpj_destinatario)] || null;
                let gapMin: number | null = null;
                if (baixaIso && parada.horario_chegada) {
                  gapMin = Math.round(
                    (new Date(baixaIso).getTime() - new Date(parada.horario_chegada).getTime()) / 60000
                  );
                }
                const gapSuspeito = gapMin !== null && Math.abs(gapMin) >= GAP_ALERTA_MIN;
                const analise = analisePorParada[parada.id];
                const chegada = formatTime(parada.horario_chegada);
                const saida = formatTime(parada.horario_saida);
                return (
                  <TableRow
                    key={parada.id}
                    className={`h-9 ${parada.is_excecao ? "bg-destructive/5" : ""}`}
                  >
                    <TableCell className="font-bold py-1 px-2 text-xs">{parada.ordem}</TableCell>
                    <TableCell className="py-1 px-2">
                      <p className="font-medium text-xs truncate max-w-[180px] leading-tight">
                        {parada.razao_social || parada.cnpj_destinatario}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[180px] leading-tight">
                        {parada.endereco_completo}
                      </p>
                    </TableCell>
                    <TableCell className="py-1 px-2">
                      <StatusBadge status={parada.status} size="sm" />
                      {parada.justificativa_tipo && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                          ✓ {parada.justificativa_tipo}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="py-1 px-2 text-xs whitespace-nowrap tabular-nums">
                      {chegada !== "—" || saida !== "—" ? (
                        <span>
                          {chegada} <span className="text-muted-foreground">→</span> {saida}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 px-2 text-xs">
                      {analise && analise.dwellMin != null ? (
                        isPassagem(analise) ? (
                          <Badge variant="outline" className="h-4 text-[10px] px-1">
                            Passagem
                          </Badge>
                        ) : (
                          <span className="font-medium tabular-nums">
                            {analise.dwellMin}m
                            <span className="text-[10px] text-muted-foreground ml-1">
                              ({analise.pingsDentro}p)
                            </span>
                          </span>
                        )
                      ) : parada.tempo_permanencia_min != null ? (
                        <span className="text-muted-foreground italic tabular-nums">
                          {parada.tempo_permanencia_min}m*
                        </span>
                      ) : parada.horario_chegada && !parada.horario_saida ? (
                        <span className="text-muted-foreground">…</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 px-2 text-xs whitespace-nowrap tabular-nums">
                      {formatTime(baixaIso)}
                      {analise?.offSite && analise.baixaDistM != null && (
                        <Badge
                          variant="destructive"
                          className="h-4 text-[10px] px-1 gap-0.5 ml-1"
                        >
                          <MapPinOff className="w-2.5 h-2.5" />
                          {analise.baixaDistM}m
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-1 px-2">
                      {gapMin === null ? (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      ) : gapSuspeito ? (
                        <Badge variant="destructive" className="gap-0.5 h-5 text-[10px] px-1 tabular-nums">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {gapMin > 0 ? "+" : ""}
                          {gapMin}m
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {gapMin > 0 ? "+" : ""}
                          {gapMin}m
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 px-2">
                      {parada.is_excecao && !parada.justificativa_tipo && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] h-6 px-2"
                          onClick={() => onJustificar(parada)}
                        >
                          Justificar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {paradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6 text-sm">
                    Nenhuma parada registrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          <strong>Dwell</strong> = tempo entre 1º e último ping GPS dentro do raio.
          <em> *</em> valor legado quando falta GPS. <strong>Off-site</strong> = baixa fora do raio.
        </p>
      </CardContent>
    </Card>
  );
}
