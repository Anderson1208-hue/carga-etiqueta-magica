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
              const baixaFmt = formatTime(baixaIso);

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

                  <TableCell className="py-1 px-1.5 align-top">
                    <p className="font-medium text-xs truncate leading-tight" title={parada.razao_social || parada.cnpj_destinatario || ""}>
                      {parada.razao_social || parada.cnpj_destinatario}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate leading-tight" title={parada.endereco_completo || ""}>
                      {parada.endereco_completo}
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
                    <div>
                      {chegada} <span className="text-muted-foreground">→</span> {saida}
                    </div>
                    <div className="text-[10px]">{dwellNode}</div>
                  </TableCell>

                  <TableCell className="py-1 px-1.5 text-[11px] align-top whitespace-nowrap tabular-nums leading-tight">
                    <div className="flex items-center gap-1">
                      <span>{baixaFmt}</span>
                      {analise?.offSite && analise.baixaDistM != null && (
                        <Badge variant="destructive" className="h-4 text-[9px] px-1 gap-0.5">
                          <MapPinOff className="w-2.5 h-2.5" />
                          {analise.baixaDistM}m
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px]">
                      {gapMin === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : gapSuspeito ? (
                        <span className="inline-flex items-center gap-0.5 text-destructive font-medium">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {gapMin > 0 ? "+" : ""}{gapMin}m
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {gapMin > 0 ? "+" : ""}{gapMin}m
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
          <strong>Dwell</strong> = tempo dentro do raio da parada (min/pings).
          <em> *</em> valor legado sem GPS. <strong>Off-site</strong> = baixa fora do raio.
        </p>
      </CardContent>
    </Card>
  );
}
