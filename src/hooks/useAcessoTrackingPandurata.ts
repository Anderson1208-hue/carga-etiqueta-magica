import { useAuth } from "@/hooks/useAuth";

/**
 * Acesso ao módulo Tracking Pandurata (FIORD):
 * todos os operadores ativos podem visualizar e exportar a planilha de status.
 * Administradores têm acesso naturalmente por também serem operadores ativos.
 */
export function useAcessoTrackingPandurata() {
  const { profile, isLoading } = useAuth();
  const podeVerTrackingPandurata = !!profile?.ativo;
  return { podeVerTrackingPandurata, isLoading };
}
