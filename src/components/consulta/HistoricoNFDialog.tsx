import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2 } from "lucide-react";
import { HistoricoNFTimeline } from "./HistoricoNFTimeline";

interface Props {
  nfId: string | null;
  numeroNf?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function HistoricoNFDialog({ nfId, numeroNf, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Histórico da NF {numeroNf || ""}
          </DialogTitle>
          <DialogDescription>
            Timeline completa: emissão, agendamentos, conferências, expedição, chegada e baixa.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          {open && <HistoricoNFTimeline nfId={nfId} />}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
