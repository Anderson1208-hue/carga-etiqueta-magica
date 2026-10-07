import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateBoxes } from "@/lib/xml-parser";

type Linha = {
  nfId: string;
  numero: string;
  emitente: string;
  status: string;
  data: string | null;
  caixas: number;
};

const LABEL: Record<string, string> = {
  AGENDAMENTO: "Agendado",
  REENTREGA: "Reentrega agendada",
  "AGUARDANDO AGENDA": "Aguardando agenda",
  "AGUARDANDO REAGENDA": "Aguardando reagenda",
};

function hojeStr() {
  const d = new Date();
  return format(d, "yyyy-MM-dd");
}

/** Somente leitura: agendas futuras (a partir de amanhã) e pendentes de agenda do CNPJ, todos os embarcadores. */
export function AgendasFuturasDialog({ cnpj, nome }: { cnpj: string; nome: string }) {
  const [open, setOpen] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ["agendas-futuras-cnpj", cnpj],
    enabled: open && !!cnpj,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas_fiscais")
        .select("id, numero_nf, razao_social_emitente, status_entrega, agendamentos(data_agendamento, status, created_at), itens_nf(q_com)")
        .eq("cnpj_destinatario", cnpj)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const hoje = hojeStr();
      const linhas: Linha[] = [];
      for (const nf of (data || []) as any[]) {
        if (nf.status_entrega === "entregue") continue;
        const ags = [...(nf.agendamentos || [])].sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
        const ag = ags[0];
        if (!ag) continue;
        const agendado = ag.status === "AGENDAMENTO" || ag.status === "REENTREGA";
        const pendente = ag.status === "AGUARDANDO AGENDA" || ag.status === "AGUARDANDO REAGENDA";
        if (agendado && !(ag.data_agendamento && ag.data_agendamento > hoje)) continue;
        if (!agendado && !pendente) continue;
        linhas.push({
          nfId: nf.id,
          numero: nf.numero_nf,
          emitente: nf.razao_social_emitente || "",
          status: ag.status,
          data: agendado ? ag.data_agendamento : null,
          caixas: (nf.itens_nf || []).reduce((s: number, i: any) => s + calculateBoxes(Number(i.q_com) || 0), 0),
        });
      }
      return linhas.sort((a, b) => {
        if (a.data && b.data) return a.data.localeCompare(b.data);
        if (a.data) return -1;
        if (b.data) return 1;
        return a.numero.localeCompare(b.numero, undefined, { numeric: true });
      });
    },
  });

  return (
    <>
      <Button
        size="icon"
        variant="outline"
        className="h-7 w-7 shrink-0"
        title="Ver agendas futuras deste cliente"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <CalendarDays className="w-4 h-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Agendas futuras</DialogTitle>
            <DialogDescription>
              {nome} — CNPJ {cnpj}. A partir de amanhã, todos os embarcadores.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : data.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhuma agenda futura para este cliente.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead>Embarcador</TableHead>
                    <TableHead className="text-right">Caixas</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((l) => (
                    <TableRow key={l.nfId}>
                      <TableCell>{l.data ? format(new Date(l.data + "T00:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell className="font-mono">{l.numero}</TableCell>
                      <TableCell className="text-xs">{l.emitente}</TableCell>
                      <TableCell className="text-right">{l.caixas}</TableCell>
                      <TableCell>
                        <Badge variant={l.data ? "default" : "outline"}>{LABEL[l.status] || l.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
