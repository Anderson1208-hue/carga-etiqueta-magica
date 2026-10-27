import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { urlFotoLeve } from '@/lib/foto-leve';
import { fotoCorretivaConfirmada, type FotoCorretivaIbac } from '@/lib/ibac-foto-consulta';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Loader2 } from 'lucide-react';

function Foto({ path, titulo }: { path: string | null; titulo: string }) {
  const [aberta, setAberta] = useState(false);
  const { data: url, isFetching, error } = useQuery({
    queryKey: ['consulta-canhoto-url', path],
    enabled: aberta && !!path,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      const result = await urlFotoLeve(path, 3600);
      if (!result) throw new Error('Foto não encontrada');
      return result;
    },
  });
  if (!path) return <p className="text-sm text-muted-foreground italic">Sem foto registrada</p>;
  return <div className="space-y-2">
    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block">
      <img src={url} alt={titulo} className="max-h-64 max-w-full rounded border" />
    </a> : <Button size="sm" variant="outline" disabled={isFetching} onClick={() => setAberta(true)}>
      {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Ver canhoto
    </Button>}
    {error && <p role="alert" className="text-sm text-destructive">Não foi possível carregar a foto.</p>}
  </div>;
}

export function CanhotoConsulta({ chave, originalPath }: { chave: string; originalPath: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['consulta-canhoto-ibac', chave],
    enabled: chave.length === 44,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('ibac_portal_validacao')
        .select('nova_foto_path,nova_foto_enviada_em,correcao_estado').eq('chave', chave).maybeSingle();
      if (error) throw error;
      return data as FotoCorretivaIbac | null;
    },
  });
  if (isLoading) return <Loader2 aria-label="Carregando canhotos" className="h-4 w-4 animate-spin" />;
  const corrigidaPath = fotoCorretivaConfirmada(data);
  return <div className="space-y-2">
    {error && <p role="alert" className="text-sm text-destructive">Não foi possível consultar a foto reenviada à MO.</p>}
    {corrigidaPath ? <Tabs key={corrigidaPath} defaultValue="corrigida">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="corrigida">Reenviado à MO</TabsTrigger>
        <TabsTrigger value="original">Original da entrega</TabsTrigger>
      </TabsList>
      <TabsContent value="corrigida"><Foto path={corrigidaPath} titulo="Canhoto reenviado à MO" /></TabsContent>
      <TabsContent value="original"><Foto path={originalPath} titulo="Canhoto original da entrega" /></TabsContent>
    </Tabs> : <Foto path={originalPath} titulo="Canhoto original da entrega" />}
  </div>;
}