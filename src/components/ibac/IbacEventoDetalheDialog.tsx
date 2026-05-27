import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface Props {
  eventoId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function IbacEventoDetalheDialog({ eventoId, onOpenChange }: Props) {
  const open = !!eventoId;

  const { data: evento } = useQuery({
    queryKey: ["ibac-evento-detalhe", eventoId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ibac_eventos_queue")
        .select("*")
        .eq("id", eventoId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["ibac-evento-logs", eventoId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ibac_log_envios")
        .select("*")
        .eq("queue_id", eventoId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Detalhe do evento IBAC</DialogTitle>
          <DialogDescription>
            Payload completo, metadados e histórico de tentativas de envio.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          {!evento ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Info label="Evento interno" value={<span className="font-mono">{evento.evento_interno}</span>} />
                <Info label="Status" value={<Badge variant="outline">{evento.status}</Badge>} />
                <Info label="Tentativas" value={String(evento.tentativas)} />
                <Info
                  label="Criado em"
                  value={new Date(evento.created_at).toLocaleString("pt-BR")}
                />
                <Info
                  label="Última tentativa"
                  value={
                    evento.ultima_tentativa_em
                      ? new Date(evento.ultima_tentativa_em).toLocaleString("pt-BR")
                      : "—"
                  }
                />
                <Info
                  label="Enviado em"
                  value={
                    evento.enviado_em ? new Date(evento.enviado_em).toLocaleString("pt-BR") : "—"
                  }
                />
                <Info label="Chave NF-e" value={<span className="font-mono text-xs break-all">{evento.chave_acesso ?? "—"}</span>} />
                <Info label="NF id" value={<span className="font-mono text-xs">{evento.nf_id ?? "—"}</span>} />
              </div>

              {evento.erro_mensagem && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                  <div className="font-medium text-destructive mb-1">Último erro</div>
                  <div className="text-destructive whitespace-pre-wrap">{evento.erro_mensagem}</div>
                </div>
              )}

              <Separator />

              <div>
                <div className="text-sm font-medium mb-2">Payload</div>
                <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-72">
                  {JSON.stringify(evento.payload, null, 2)}
                </pre>
              </div>

              <Separator />

              <div>
                <div className="text-sm font-medium mb-2">
                  Histórico de envios ({logs.length})
                </div>
                {logs.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                    Nenhum envio registrado ainda.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {logs.map((log: any) => (
                      <div key={log.id} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            {log.sucesso ? (
                              <Badge className="bg-green-600">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Sucesso
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <AlertCircle className="w-3 h-3 mr-1" /> Falha
                              </Badge>
                            )}
                            <span className="text-muted-foreground">
                              HTTP {log.response_status ?? "—"} · {log.duracao_ms ?? 0} ms
                            </span>
                          </div>
                          <span className="text-muted-foreground">
                            {new Date(log.created_at).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Request body
                          </summary>
                          <pre className="mt-2 rounded bg-muted p-2 overflow-auto max-h-48">
                            {JSON.stringify(log.request_body, null, 2)}
                          </pre>
                        </details>
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Response body
                          </summary>
                          <pre className="mt-2 rounded bg-muted p-2 overflow-auto max-h-48">
                            {JSON.stringify(log.response_body, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
