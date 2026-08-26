import { useAuth } from "@/hooks/useAuth";

/** Operadores autorizados a acompanhar a Integração IBAC (somente leitura). */
export const EMAILS_ACESSO_IBAC = [
  "fabiana.souza@tlmlogistica.com.br",
  "julio.nogueira@tlmlogistica.com.br",
];

/**
 * Acesso ao módulo Integração IBAC: administradores (gestão completa) +
 * operadores autorizados (somente leitura).
 * A mesma regra está replicada no banco em public.pode_ver_ibac().
 */
export function useAcessoIbac() {
  const { profile, isAdmin, isLoading } = useAuth();
  const email = (profile?.email || "").toLowerCase();
  const podeVerIbac =
    !!profile?.ativo && (isAdmin || EMAILS_ACESSO_IBAC.includes(email));
  return { podeVerIbac, podeGerenciarIbac: isAdmin, isLoading };
}
