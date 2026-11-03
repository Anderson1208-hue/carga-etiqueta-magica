import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
export function useAgenteGerencial() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['acesso-agente-gerencial',user?.id], enabled: Boolean(user?.id), staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pode_agente_gerencial');
      if (error) return false;
      return data === true;
    },
  });
  return { allowed: query.data === true, loading: query.isLoading };
}