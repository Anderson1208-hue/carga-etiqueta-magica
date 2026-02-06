import { MapPin, FileText, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { getMacroRegiaoLabel } from "@/lib/macro-regioes";

interface Entrega {
  cep: string;
  cnpjDestinatario: string;
  razaoSocial: string;
  enderecoCompleto: string;
  bairro: string;
  macroRegiao: number;
  latitude: number | null;
  longitude: number | null;
  totalNfs: number;
  totalCaixas: number;
  pesoTotalKg: number;
  volumeTotalM3: number;
  nfs: string[];
  ordem?: number;
}

interface ListaParadasProps {
  entregas: Entrega[];
}

interface GrupoMacroRegiao {
  macroRegiao: number;
  label: string;
  entregas: Entrega[];
  totalNfs: number;
  totalCaixas: number;
  pesoTotalKg: number;
  volumeTotalM3: number;
}

export function ListaParadas({ entregas }: ListaParadasProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  if (entregas.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhuma entrega encontrada para esta carga
      </div>
    );
  }

  function toggleItem(cnpj: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(cnpj)) {
        next.delete(cnpj);
      } else {
        next.add(cnpj);
      }
      return next;
    });
  }

  function sortNfs(nfs: string[]): string[] {
    return [...nfs].sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });
  }

  // Agrupar entregas por macro região (mantendo a ordem já definida)
  const grupos: GrupoMacroRegiao[] = [];
  let currentMR: number | null = null;

  entregas.forEach((entrega) => {
    if (entrega.macroRegiao !== currentMR) {
      currentMR = entrega.macroRegiao;
      grupos.push({
        macroRegiao: entrega.macroRegiao,
        label: getMacroRegiaoLabel(entrega.macroRegiao),
        entregas: [],
        totalNfs: 0,
        totalCaixas: 0,
        pesoTotalKg: 0,
        volumeTotalM3: 0,
      });
    }
    const grupo = grupos[grupos.length - 1];
    grupo.entregas.push(entrega);
    grupo.totalNfs += entrega.totalNfs;
    grupo.totalCaixas += entrega.totalCaixas;
    grupo.pesoTotalKg += entrega.pesoTotalKg;
    grupo.volumeTotalM3 += entrega.volumeTotalM3;
  });

  return (
    <div className="space-y-6">
      {grupos.map((grupo) => (
        <div key={grupo.macroRegiao} className="space-y-1">
          {/* Cabeçalho da Macro Região */}
          <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-2.5 border border-primary/20">
            <div className="flex items-center gap-3">
              <Badge variant="default" className="text-sm font-bold px-3 py-1">
                MR {grupo.macroRegiao}
              </Badge>
              <span className="font-semibold text-sm">
                {grupo.label.replace(/^MR \d+ – /, "")}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{grupo.entregas.length} parada{grupo.entregas.length > 1 ? "s" : ""}</span>
              <span>{grupo.totalNfs} NFs</span>
              <span>{grupo.totalCaixas} cx</span>
              <span>{grupo.pesoTotalKg.toFixed(1)} kg</span>
              <span>{grupo.volumeTotalM3.toFixed(2)} m³</span>
            </div>
          </div>

          {/* Tabela de paradas da região */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Bairro</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-center">NFs</TableHead>
                  <TableHead className="text-center">Caixas</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupo.entregas.map((entrega, index) => {
                  const isOpen = openItems.has(entrega.cnpjDestinatario);
                  return (
                    <>
                      <TableRow
                        key={entrega.cnpjDestinatario}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => toggleItem(entrega.cnpjDestinatario)}
                      >
                        <TableCell className="font-bold">
                          {entrega.ordem || index + 1}
                        </TableCell>
                        <TableCell className="text-sm">
                          {entrega.bairro || "—"}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{entrega.razaoSocial}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {entrega.cnpjDestinatario}
                        </TableCell>
                        <TableCell className="text-center">
                          {entrega.totalNfs}
                        </TableCell>
                        <TableCell className="text-center">
                          {entrega.totalCaixas}
                        </TableCell>
                        <TableCell className="text-right">
                          {entrega.pesoTotalKg.toFixed(1)} kg
                        </TableCell>
                        <TableCell className="text-right">
                          {entrega.volumeTotalM3.toFixed(2)} m³
                        </TableCell>
                        <TableCell>
                          <ChevronDown
                            className={`w-4 h-4 text-muted-foreground transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow
                          key={`${entrega.cnpjDestinatario}-detail`}
                          className="bg-muted/30 hover:bg-muted/30"
                        >
                          <TableCell colSpan={9} className="py-3">
                            <div className="space-y-2 pl-4">
                              <div className="flex items-start gap-1 text-sm text-muted-foreground">
                                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span>{entrega.enderecoCompleto}</span>
                              </div>
                              <div className="flex items-center gap-1 text-sm">
                                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground mr-1">NFs:</span>
                                <span className="font-mono text-xs">
                                  {sortNfs(entrega.nfs).join(", ")}
                                </span>
                              </div>
                              {entrega.latitude ? (
                                <span className="text-xs text-success">📍 Geocodificado</span>
                              ) : (
                                <span className="text-xs text-warning">⚠️ Sem coordenadas</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}
