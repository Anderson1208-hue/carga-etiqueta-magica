import { useAuth } from "@/hooks/useAuth";
import { EMAILS_ACESSO_OKENTREGA } from "@/hooks/useAcessoOkEntrega";

/**
 * Acesso à tela de Envio de Canhoto: mesma lista da Integração OK Entrega
 * (Fabiana, Marcos, Delma, Julio) + administradores.
 */
export function useAcessoEnvioCanhoto() {
  const { profile, isAdmin, isLoading } = useAuth();
  const email = (profile?.email || "").toLowerCase();
  const podeEnviarCanhoto =
    !!profile?.ativo && (isAdmin || EMAILS_ACESSO_OKENTREGA.includes(email));
  return { podeEnviarCanhoto, isLoading };
}
