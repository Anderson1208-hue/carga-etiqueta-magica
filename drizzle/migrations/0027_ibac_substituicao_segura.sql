ALTER TABLE public.ibac_portal_validacao ADD COLUMN IF NOT EXISTS correcao_estado text, ADD COLUMN IF NOT EXISTS correcao_lock uuid, ADD COLUMN IF NOT EXISTS correcao_lock_em timestamptz;
CREATE TABLE public.ibac_foto_substituicoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chave text NOT NULL REFERENCES public.ibac_portal_validacao(chave), nova_foto_path text NOT NULL UNIQUE, estado text NOT NULL DEFAULT 'preparada', portal_oid text, backup_path text, imagem_removida_em timestamptz, enviada_em timestamptz, resultado text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ibac_foto_substituicoes TO authenticated;
GRANT ALL ON public.ibac_foto_substituicoes TO service_role;
ALTER TABLE public.ibac_foto_substituicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY ibac_substituicoes_leitura ON public.ibac_foto_substituicoes FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()));
CREATE OR REPLACE FUNCTION public.ibac_reservar_correcao(p_chave text, p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.ibac_portal_validacao SET correcao_lock=p_token, correcao_lock_em=now() WHERE chave=p_chave AND (correcao_lock IS NULL OR correcao_lock_em < now()-interval '5 minutes');
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.ibac_reservar_correcao(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ibac_reservar_correcao(text,uuid) TO service_role;