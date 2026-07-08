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
import { MapPin, AlertTriangle } from "lucide-react";
import type { MonitoramentoParada } from "./types";
import { StatusBadge } from "./StatusBadge";

interface ParadasTableProps {
  paradas: MonitoramentoParada[];
  onJustificar: (parada: MonitoramentoParada) => void;
  formatTime: (iso: string | null) => string;
  /** cnpj_destinatario -> ISO da última baixa "entregue" */
  baixasPorCnpj?: Record<string, string>;
}

const GAP_ALERTA_MIN = 10;

const normCnpj = (c: string | null) => (c || "").replace(/\D/g, "");

export function ParadasTable({ paradas, onJustificar, formatTime, baixasPorCnpj = {} }: ParadasTableProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Paradas da Rota
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Chegada GPS</TableHead>
                <TableHead>Saída GPS</TableHead>
                <TableHead>Perm.</TableHead>
                <TableHead>Baixa</TableHead>
                <TableHead>Δ Gap</TableHead>
                <TableHead className="w-20">Ações</TableHead>
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
                return (
                  <TableRow
                    key={parada.id}
                    className={parada.is_excecao ? "bg-destructive/5" : ""}
                  >
                    <TableCell className="font-bold">{parada.ordem}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm truncate max-w-[200px]">
                          {parada.razao_social || parada.cnpj_destinatario}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {parada.endereco_completo}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={parada.status} size="sm" />
                      {parada.justificativa_tipo && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ✓ {parada.justificativa_tipo}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{formatTime(parada.horario_chegada)}</TableCell>
                    <TableCell className="text-sm">{formatTime(parada.horario_saida)}</TableCell>
                    <TableCell className="text-sm">
                      {parada.tempo_permanencia_min != null
                        ? `${parada.tempo_permanencia_min} min`
                        : parada.horario_chegada && !parada.horario_saida
                        ? "..."
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{formatTime(baixaIso)}</TableCell>
                    <TableCell>
                      {gapMin === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : gapSuspeito ? (
                        <Badge variant="destructive" className="gap-1 h-6 text-[11px]">
                          <AlertTriangle className="w-3 h-3" />
                          {gapMin > 0 ? "+" : ""}
                          {gapMin} min
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {gapMin > 0 ? "+" : ""}
                          {gapMin} min
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {parada.is_excecao && !parada.justificativa_tipo && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
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
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Nenhuma parada registrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
