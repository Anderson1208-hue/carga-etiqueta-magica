import { MapPin, Package, FileText, Weight, Box } from "lucide-react";

interface Entrega {
  cep: string;
  cnpjDestinatario: string;
  razaoSocial: string;
  enderecoCompleto: string;
  latitude: number | null;
  longitude: number | null;
  totalNfs: number;
  totalCaixas: number;
  pesoTotalKg: number;
  volumeTotalM3: number;
  ordem?: number;
}

interface ListaParadasProps {
  entregas: Entrega[];
}

export function ListaParadas({ entregas }: ListaParadasProps) {
  if (entregas.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhuma entrega encontrada para esta carga
      </div>
    );
  }

  // Sort by ordem if available, otherwise by CEP ascending (numeric)
  const sortedEntregas = [...entregas].sort((a, b) => {
    if (a.ordem && b.ordem) return a.ordem - b.ordem;
    const cepA = parseInt((a.cep || "0").replace(/\D/g, ""), 10);
    const cepB = parseInt((b.cep || "0").replace(/\D/g, ""), 10);
    return cepA - cepB;
  });

  return (
    <div className="space-y-3">
      {sortedEntregas.map((entrega, index) => (
        <div
          key={entrega.cep}
          className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
        >
          {/* Order number */}
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
              entrega.ordem
                ? "bg-success text-success-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {entrega.ordem || index + 1}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{entrega.razaoSocial}</h4>
            <p className="text-sm text-muted-foreground font-mono">
              CEP: {entrega.cep} | CNPJ: {entrega.cnpjDestinatario}
            </p>
            <div className="flex items-start gap-1 mt-1">
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">
                {entrega.enderecoCompleto}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-3 text-sm shrink-0">
            <div className="flex items-center gap-1">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span>{entrega.totalNfs} NFs</span>
            </div>
            <div className="flex items-center gap-1">
              <Package className="w-4 h-4 text-muted-foreground" />
              <span>{entrega.totalCaixas} cx</span>
            </div>
            <div className="flex items-center gap-1">
              <Weight className="w-4 h-4 text-muted-foreground" />
              <span>{entrega.pesoTotalKg.toFixed(1)} kg</span>
            </div>
            <div className="flex items-center gap-1">
              <Box className="w-4 h-4 text-muted-foreground" />
              <span>{entrega.volumeTotalM3.toFixed(2)} m³</span>
            </div>
            {entrega.latitude ? (
              <span className="text-success text-xs">📍</span>
            ) : (
              <span className="text-warning text-xs">⚠️</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
