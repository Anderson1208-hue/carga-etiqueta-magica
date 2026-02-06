import { MapPin, Package, FileText, Weight, Box, ChevronDown } from "lucide-react";
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

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">#</TableHead>
            <TableHead className="w-[70px]">MR</TableHead>
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
          {entregas.map((entrega, index) => {
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
                  <TableCell>
                    <Badge
                      variant={entrega.macroRegiao === 99 ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {entrega.macroRegiao}
                    </Badge>
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
                    <TableCell colSpan={10} className="py-3">
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
  );
}
