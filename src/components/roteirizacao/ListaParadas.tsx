import { MapPin, FileText, ChevronDown, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState, useMemo } from "react";
import { getMacroRegiaoLabel } from "@/lib/macro-regioes";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  onReorder?: (reordered: Entrega[]) => void;
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

function sortNfs(nfs: string[]): string[] {
  return [...nfs].sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });
}

// Sortable row component
function SortableRow({
  entrega,
  index,
  totalCount,
  isOpen,
  onToggle,
  onMoveUp,
  onMoveDown,
  canReorder,
}: {
  entrega: Entrega;
  index: number;
  totalCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canReorder: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entrega.cnpjDestinatario });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
      <TableRow
        ref={setNodeRef}
        style={style}
        className={`hover:bg-accent/50 ${isDragging ? "bg-accent" : ""}`}
      >
        {canReorder && (
          <TableCell className="w-[40px] px-1">
            <div className="flex flex-col items-center gap-0.5">
              <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted"
                title="Arrastar para reordenar"
              >
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </button>
              <div className="flex flex-col gap-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                  disabled={index === 0}
                  title="Mover para cima"
                >
                  <ArrowUp className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                  disabled={index === totalCount - 1}
                  title="Mover para baixo"
                >
                  <ArrowDown className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </TableCell>
        )}
        <TableCell className="font-bold cursor-pointer" onClick={onToggle}>
          {entrega.ordem || index + 1}
        </TableCell>
        <TableCell className="text-sm cursor-pointer" onClick={onToggle}>
          {entrega.bairro || "—"}
        </TableCell>
        <TableCell className="cursor-pointer" onClick={onToggle}>
          <span className="font-medium">{entrega.razaoSocial}</span>
        </TableCell>
        <TableCell className="font-mono text-xs cursor-pointer" onClick={onToggle}>
          {entrega.cnpjDestinatario}
        </TableCell>
        <TableCell className="text-center">{entrega.totalNfs}</TableCell>
        <TableCell className="text-center">{entrega.totalCaixas}</TableCell>
        <TableCell className="text-right">{entrega.pesoTotalKg.toFixed(1)} kg</TableCell>
        <TableCell className="text-right">{entrega.volumeTotalM3.toFixed(2)} m³</TableCell>
        <TableCell className="cursor-pointer" onClick={onToggle}>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={canReorder ? 10 : 9} className="py-3">
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
}

export function ListaParadas({ entregas, onReorder }: ListaParadasProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const canReorder = !!onReorder;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
      if (next.has(cnpj)) next.delete(cnpj);
      else next.add(cnpj);
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;

    const oldIndex = entregas.findIndex((e) => e.cnpjDestinatario === active.id);
    const newIndex = entregas.findIndex((e) => e.cnpjDestinatario === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(entregas, oldIndex, newIndex).map((e, i) => ({
      ...e,
      ordem: i + 1,
    }));
    onReorder(reordered);
  }

  function handleMove(index: number, direction: "up" | "down") {
    if (!onReorder) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= entregas.length) return;

    const reordered = arrayMove(entregas, index, targetIndex).map((e, i) => ({
      ...e,
      ordem: i + 1,
    }));
    onReorder(reordered);
  }

  // Group by macro region (maintaining current order)
  const grupos: GrupoMacroRegiao[] = useMemo(() => {
    const result: GrupoMacroRegiao[] = [];
    let currentMR: number | null = null;

    entregas.forEach((entrega) => {
      if (entrega.macroRegiao !== currentMR) {
        currentMR = entrega.macroRegiao;
        result.push({
          macroRegiao: entrega.macroRegiao,
          label: getMacroRegiaoLabel(entrega.macroRegiao),
          entregas: [],
          totalNfs: 0,
          totalCaixas: 0,
          pesoTotalKg: 0,
          volumeTotalM3: 0,
        });
      }
      const grupo = result[result.length - 1];
      grupo.entregas.push(entrega);
      grupo.totalNfs += entrega.totalNfs;
      grupo.totalCaixas += entrega.totalCaixas;
      grupo.pesoTotalKg += entrega.pesoTotalKg;
      grupo.volumeTotalM3 += entrega.volumeTotalM3;
    });

    return result;
  }, [entregas]);

  // When reorder is enabled, render flat list (no grouping) for easier drag
  if (canReorder) {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={entregas.map((e) => e.cnpjDestinatario)}
          strategy={verticalListSortingStrategy}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
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
                {entregas.map((entrega, index) => (
                  <SortableRow
                    key={entrega.cnpjDestinatario}
                    entrega={entrega}
                    index={index}
                    totalCount={entregas.length}
                    isOpen={openItems.has(entrega.cnpjDestinatario)}
                    onToggle={() => toggleItem(entrega.cnpjDestinatario)}
                    onMoveUp={() => handleMove(index, "up")}
                    onMoveDown={() => handleMove(index, "down")}
                    canReorder
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  // Read-only grouped view
  return (
    <div className="space-y-6">
      {grupos.map((grupo) => (
        <div key={grupo.macroRegiao} className="space-y-1">
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
                {grupo.entregas.map((entrega, index) => (
                  <SortableRow
                    key={entrega.cnpjDestinatario}
                    entrega={entrega}
                    index={index}
                    totalCount={grupo.entregas.length}
                    isOpen={openItems.has(entrega.cnpjDestinatario)}
                    onToggle={() => toggleItem(entrega.cnpjDestinatario)}
                    onMoveUp={() => {}}
                    onMoveDown={() => {}}
                    canReorder={false}
                  />
                ))}
              </TableBody>
              <tfoot>
                <tr className="border-t-2 border-primary/30 bg-primary/5 font-semibold text-sm">
                  <td className="p-3" colSpan={2}>Total MR {grupo.macroRegiao}</td>
                  <td className="p-3" colSpan={2}></td>
                  <td className="p-3 text-center">{grupo.totalNfs}</td>
                  <td className="p-3 text-center">{grupo.totalCaixas}</td>
                  <td className="p-3 text-right">{grupo.pesoTotalKg.toFixed(1)} kg</td>
                  <td className="p-3 text-right">{grupo.volumeTotalM3.toFixed(2)} m³</td>
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}
