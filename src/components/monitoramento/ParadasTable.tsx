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
                <TableHead>Dwell (raio)</TableHead>
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
                const analise = analisePorParada[parada.id];
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
                      {analise && analise.dwellMin != null ? (
                        <div className="flex flex-col leading-tight">
                          {isPassagem(analise) ? (
                            <Badge variant="outline" className="h-5 w-fit text-[11px] gap-1">
                              Passagem
                            </Badge>
                          ) : (
                            <span className="font-medium">{analise.dwellMin} min</span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {analise.pingsDentro} pings
                          </span>
                        </div>
                      ) : parada.tempo_permanencia_min != null ? (
                        <span className="text-muted-foreground italic">
                          {parada.tempo_permanencia_min} min*
                        </span>
                      ) : parada.horario_chegada && !parada.horario_saida ? (
                        "..."
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col leading-tight">
                        <span>{formatTime(baixaIso)}</span>
                        {analise?.offSite && analise.baixaDistM != null && (
                          <Badge
                            variant="destructive"
                            className="h-5 w-fit text-[10px] gap-1 mt-0.5"
                          >
                            <MapPinOff className="w-2.5 h-2.5" />
                            Off-site {analise.baixaDistM}m
                          </Badge>
                        )}
                      </div>
                    </TableCell>
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
        <p className="text-[11px] text-muted-foreground mt-2">
          <strong>Dwell</strong> = tempo entre 1º e último ping GPS dentro do raio da parada
          (padrão Samsara/Trimble). <em>*</em> quando não há GPS suficiente, mostra o valor legado
          do sistema. <strong>Off-site</strong> = baixa registrada fora do raio cadastrado.
        </p>
      </CardContent>
    </Card>
  );
}
