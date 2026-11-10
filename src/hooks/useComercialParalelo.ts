import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
export function useComercialParalelo() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['acesso-comercial-paralelo', user?.id], enabled: Boolean(user?.id), staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pode_comercial_paralelo');
      if (error) throw error;
      return data === true;
    },
  });
  return { allowed: Boolean(user) && query.data === true, loading: query.isLoading, error: query.error };
}