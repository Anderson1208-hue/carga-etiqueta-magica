import { useAuth } from "@/hooks/useAuth";

export const EMAILS_GESTAO_COMERCIAL = [
  "julio.nogueira@tlmlogistica.com.br",
  "rodrigo.boamorte@tlmlogistica.com.br",
];

/**
 * Acesso ao módulo comercial (Regiões/SLA e Tarifas por fornecedor):
 * administradores + lista fixa de operadores autorizados.
 * A mesma regra está replicada no banco em public.pode_gestao_comercial().
 */
export function useGestaoComercial() {
  const { profile, isAdmin, isLoading } = useAuth();
  const email = (profile?.email || "").toLowerCase();
  const podeGestaoComercial =
    !!profile?.ativo && (isAdmin || EMAILS_GESTAO_COMERCIAL.includes(email));
  return { podeGestaoComercial, isLoading };
}
