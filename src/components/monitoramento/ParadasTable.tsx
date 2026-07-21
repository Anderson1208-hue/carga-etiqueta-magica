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
  baixasPorCnpj?: Record<string, string>;
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
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow className="h-7">
              <TableHead className="w-7 h-7 px-1 text-[11px]">#</TableHead>
              <TableHead className="h-7 px-1.5 text-[11px]">Cliente</TableHead>
              <TableHead className="h-7 px-1 text-[11px] w-[88px]">Status</TableHead>
              <TableHead className="h-7 px-1 text-[11px] w-[108px]">GPS</TableHead>
              <TableHead className="h-7 px-1 text-[11px] w-[92px]">Baixa/Gap</TableHead>
              <TableHead className="h-7 px-1 text-[11px] w-[68px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paradas.map((parada) => {
              const baixaIso = baixasPorCnpj[normCnpj(parada.cnpj_destinatario)] || null;
              const analise = analisePorParada[parada.id];
              const gpsFirst = analise?.firstIn || null;
              const gpsLast = analise?.lastIn || null;
              const chegada = formatTime(gpsFirst);
              const saida = formatTime(gpsLast);
              const baixaFmt = formatTime(baixaIso);
              let baixaGapMin: number | null = null;
              if (baixaIso && gpsFirst && gpsLast) {
                const baixaMs = new Date(baixaIso).getTime();
                const firstMs = new Date(gpsFirst).getTime();
                const lastMs = new Date(gpsLast).getTime();
                if (baixaMs < firstMs) baixaGapMin = Math.round((baixaMs - firstMs) / 60000);
                else if (baixaMs > lastMs) baixaGapMin = Math.round((baixaMs - lastMs) / 60000);
                else baixaGapMin = 0;
              }

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
                      <span>{baixaFmt}</span>
                      {analise?.offSite && analise.baixaDistM != null && (
                        gpsFirst && gpsLast ? (
                          <Badge
                            variant="destructive"
                            className="h-4 text-[9px] px-1 gap-0.5"
                            title="Motorista bateu baixa fora do raio da parada (off-site real, com GPS factual)"
                          >
                            <MapPinOff className="w-2.5 h-2.5" />
                            {analise.baixaDistM}m
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="h-4 text-[9px] px-1 gap-0.5 border-amber-500 text-amber-600 dark:text-amber-400"
                            title="Sem GPS factual no raio. Distância entre baixa e ponto cadastrado — provável divergência de cadastro, não de motorista."
                          >
                            <MapPinOff className="w-2.5 h-2.5" />
                            {analise.baixaDistM}m
                          </Badge>
                        )
                      )}
                    </div>
                    <div className="text-[10px]">
                      {!baixaIso ? (
                        <span className="text-muted-foreground">—</span>
                      ) : !gpsFirst || !gpsLast ? (
                        <span className="text-muted-foreground italic" title="Não há pings GPS dentro do raio da parada para comparar com o horário da baixa">
                          sem GPS factual
                        </span>
                      ) : baixaGapMin !== null && Math.abs(baixaGapMin) >= GAP_ALERTA_MIN ? (
                        <span className="inline-flex items-center gap-0.5 text-destructive font-medium">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {baixaGapMin > 0 ? "+" : ""}{baixaGapMin}m
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {baixaGapMin !== null ? `${baixaGapMin > 0 ? "+" : ""}${baixaGapMin}m` : "0m"}
                        </span>
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
          <strong>Dwell</strong> = tempo dentro do raio (min/pings).
          <em> *</em> valor legado. Badge <span className="text-destructive font-medium">vermelho</span> = off-site real (com GPS). Badge <span className="text-amber-600 dark:text-amber-400 font-medium">âmbar</span> = distância cadastro↔baixa sem GPS factual (provável cadastro divergente).
        </p>
      </CardContent>
    </Card>
  );
}
