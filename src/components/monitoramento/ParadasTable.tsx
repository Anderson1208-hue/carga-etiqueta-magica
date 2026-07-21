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
import type { ParadaAnalise } from "@/lib/dwellTime";
import { isPassagem } from "@/lib/dwellTime";

interface ParadasTableProps {
  paradas: MonitoramentoParada[];
  onJustificar: (parada: MonitoramentoParada) => void;
  formatTime: (iso: string | null) => string;
  analisePorParada?: Record<string, ParadaAnalise>;
}

export function ParadasTable({
  paradas,
  onJustificar,
  formatTime,
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
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="h-7">
              <TableHead className="w-7 h-7 px-1 text-[11px]">#</TableHead>
              <TableHead className="h-7 px-1.5 text-[11px]">Cliente</TableHead>
              <TableHead className="h-7 px-1 text-[11px] w-[88px]">Status</TableHead>
              <TableHead className="h-7 px-1 text-[11px] w-[108px]">GPS</TableHead>
              <TableHead className="h-7 px-1 text-[11px] w-[92px]">Evidência GPS</TableHead>
              <TableHead className="h-7 px-1 text-[11px] w-[68px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paradas.map((parada) => {
              const analise = analisePorParada[parada.id];
              const gpsFirst = analise?.firstIn || null;
              const gpsLast = analise?.lastIn || null;
              const chegada = formatTime(gpsFirst);
              const saida = formatTime(gpsLast);

              const dwellNode = analise && analise.dwellMin != null
                ? (isPassagem(analise)
                    ? <span className="text-[10px] text-muted-foreground">passagem</span>
                    : <span className="tabular-nums">{analise.dwellMin}m<span className="text-muted-foreground">/{analise.pingsDentro}p</span></span>)
                : parada.tempo_permanencia_min != null
                  ? <span className="text-muted-foreground italic tabular-nums">{parada.tempo_permanencia_min}m*</span>
                  : parada.horario_chegada && !parada.horario_saida
                    ? <span className="text-muted-foreground">…</span>
                    : <span className="text-muted-foreground">—</span>;

              return (
                <TableRow
                  key={parada.id}
                  className={`h-9 ${parada.is_excecao ? "bg-destructive/5" : ""}`}
                >
                  <TableCell className="font-bold py-1 px-1.5 text-xs align-top">
                    {parada.ordem}
                  </TableCell>

                  <TableCell className="py-1 px-1.5 align-top overflow-hidden">
                    <p className="font-medium text-xs truncate leading-tight" title={parada.razao_social || parada.cnpj_destinatario || ""}>
                      {parada.razao_social || parada.cnpj_destinatario}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate leading-tight" title={parada.endereco_completo || ""}>
                      {(parada.endereco_completo || "").split(",").slice(0, 2).join(",")}
                    </p>
                  </TableCell>

                  <TableCell className="py-1 px-1.5 align-top">
                    <StatusBadge status={parada.status} size="sm" />
                    {parada.justificativa_tipo && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight truncate" title={parada.justificativa_tipo}>
                        ✓ {parada.justificativa_tipo}
                      </p>
                    )}
                  </TableCell>

                  <TableCell className="py-1 px-1.5 text-[11px] align-top whitespace-nowrap tabular-nums leading-tight">
                    {gpsFirst && gpsLast ? (
                      <div>
                        {chegada} <span className="text-muted-foreground">→</span> {saida}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">sem GPS no raio</div>
                    )}
                    <div className="text-[10px]">{dwellNode}</div>
                  </TableCell>

                  <TableCell className="py-1 px-1.5 text-[11px] align-top whitespace-nowrap tabular-nums leading-tight">
                    <div className="flex items-center gap-1">
                      {analise?.pingsDentro ? (
                        <Badge
                          variant="outline"
                          className="h-4 text-[9px] px-1 border-success/30 text-success"
                          title="Há pings GPS factuais dentro do raio da parada"
                        >
                          dentro
                        </Badge>
                      ) : analise?.minDistM != null ? (
                        <Badge
                          variant="outline"
                          className="h-4 text-[9px] px-1 border-warning/30 text-warning"
                          title="Menor distância factual do GPS do veículo até o ponto da parada"
                        >
                          mín {analise.minDistM}m
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="text-[10px]">
                      {analise?.pingsDentro ? (
                        <span className="text-muted-foreground">
                          {analise.pingsDentro} ping{analise.pingsDentro === 1 ? "" : "s"}
                        </span>
                      ) : analise?.minDistM != null ? (
                        <span className="inline-flex items-center gap-0.5 text-warning font-medium" title="Sem ping dentro do raio configurado; mostra apenas a menor aproximação factual">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          fora do raio
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">sem GPS</span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="py-1 px-1.5 align-top">
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
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">
                  Nenhuma parada registrada
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          <strong>Dwell</strong> = tempo dentro do raio por GPS factual. Baixa operacional não compõe localização, chegada, saída nem divergência da Torre.
        </p>
      </CardContent>
    </Card>
  );
}
