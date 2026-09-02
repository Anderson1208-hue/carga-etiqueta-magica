import { useAuth } from "@/hooks/useAuth";

/** Operadores autorizados a acompanhar a Integração OK Entrega (somente leitura). */
export const EMAILS_ACESSO_OKENTREGA = [
  "fabiana.souza@tlmlogistica.com.br",
  "marcos.alves@tlmlogistica.com.br",
  "delma.pierre@tlmlogistica.com.br",
  "julio.nogueira@tlmlogistica.com.br",
];

/**
 * Acesso ao módulo Integração OK Entrega: administradores (gestão completa) +
 * operadores autorizados (somente visualização do acompanhamento de NFs).
 */
export function useAcessoOkEntrega() {
  const { profile, isAdmin, isLoading } = useAuth();
  const email = (profile?.email || "").toLowerCase();
  const podeVerOkEntrega =
    !!profile?.ativo && (isAdmin || EMAILS_ACESSO_OKENTREGA.includes(email));
  return { podeVerOkEntrega, podeGerenciarOkEntrega: isAdmin, isLoading };
}
