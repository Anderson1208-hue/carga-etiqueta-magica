import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapPin } from "lucide-react";
import type { MonitoramentoParada } from "./types";
import { StatusBadge } from "./StatusBadge";

interface ParadasTableProps {
  paradas: MonitoramentoParada[];
  onJustificar: (parada: MonitoramentoParada) => void;
  formatTime: (iso: string | null) => string;
}

export function ParadasTable({ paradas, onJustificar, formatTime }: ParadasTableProps) {
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
                <TableHead>Chegada</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead>Perm.</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paradas.map((parada) => (
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
              ))}
              {paradas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
