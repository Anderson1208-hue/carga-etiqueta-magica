import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";

type Item = { label: string; count: number; to: string };

function hojeStr() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
}

async function contar(q: PromiseLike<{ count: number | null }>) {
  try {
    return (await q).count ?? 0;
  } catch {
    return 0;
  }
}

async function loadAcoes(): Promise<Item[]> {
  const head = { count: "exact" as const, head: true };
  const [okRecusado, okErro, ibacErro, smFalha, coleta, diverg] = await Promise.all([
    contar(supabase.from("okentrega_queue").select("id", head).eq("status", "recusado")),
    contar(supabase.from("okentrega_queue").select("id", head).eq("status", "erro")),
    contar(supabase.from("ibac_eventos_queue").select("id", head).eq("status", "erro")),
    contar(supabase.from("overhaul_sm").select("id", head).eq("status", "falha").eq("data_rota", hojeStr())),
    contar(supabase.from("pandurata_otm_envios").select("id", head).in("status", ["erro", "incerto"])),
    contar(supabase.from("divergencias_recebimento").select("id", head).is("cancelado_em", null)),
  ]);
  return [
    { label: "SM com falha hoje", count: smFalha, to: "/roteirizacao" },
    { label: "Fotos recusadas OK Entrega", count: okRecusado, to: "/integracoes/okentrega" },
    { label: "Envios OK Entrega com erro", count: okErro, to: "/integracoes/okentrega" },
    { label: "Eventos Cacau Show com erro", count: ibacErro, to: "/integracoes/ibac" },
    { label: "Ordens de coleta sem confirmação do portal", count: coleta, to: "/ordem-coleta" },
    { label: "Divergências de recebimento abertas", count: diverg, to: "/divergencia-recebimento" },
  ];
}

export function AcaoHoje() {
  const { data, isLoading } = useQuery({ queryKey: ["acao-hoje"], queryFn: loadAcoes, refetchInterval: 60_000 });
  const pendentes = (data ?? []).filter((i) => i.count > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" /> Precisa de ação hoje
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : pendentes.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Nada pendente agora.
          </p>
        ) : (
          <ul className="divide-y">
            {pendentes.map((i) => (
              <li key={i.label}>
                <Link to={i.to} className="flex items-center justify-between py-2 text-sm hover:bg-muted/50 rounded px-2">
                  <span>{i.label}</span>
                  <span className="flex items-center gap-2 font-semibold text-destructive">
                    {i.count} <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
