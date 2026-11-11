import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EMBARCADORES_CLIENTES, type EmbarcadorCliente } from "@/lib/divergencia-clientes";
import DivergenciaRecebimento from "./DivergenciaRecebimento";
import DivergenciaClientes from "./DivergenciaClientes";

export default function Divergencias() {
  const [params] = useSearchParams();
  const inicial = params.get("embarcador") ?? "";
  const [embarcador, setEmbarcador] = useState(inicial === "IBAC" || inicial === "IBAE" ? "IBAC/IBAE" : inicial);
  const cacau = embarcador === "IBAC/IBAE";
  return (
    <MainLayout>
      <div className="space-y-4 p-4 md:p-6">
        <h1 className="text-2xl font-bold">Divergência de Recebimento</h1>
        <div className="max-w-sm space-y-2">
          <Label htmlFor="divergencia-embarcador">Embarcador</Label>
          <Select value={embarcador} onValueChange={setEmbarcador}>
            <SelectTrigger id="divergencia-embarcador"><SelectValue placeholder="Selecione o embarcador" /></SelectTrigger>
            <SelectContent>
              {["IBAC/IBAE", ...EMBARCADORES_CLIENTES].map((e) => <SelectItem key={e} value={e}>{e === "HERSHEYS" ? "Hershey's" : e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {embarcador && (cacau
        ? <DivergenciaRecebimento key={embarcador} embedded />
        : <DivergenciaClientes key={embarcador} embedded embarcador={embarcador as EmbarcadorCliente} />)}
    </MainLayout>
  );
}