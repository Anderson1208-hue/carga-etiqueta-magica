-- Adiciona suporte a Minuta + CT-e na tabela ctes (Opção 2 do spec)
-- Mantém retrocompatibilidade: chave_cte segue UNIQUE NOT NULL.
-- Para minutas sem chave fiscal real, chave_cte recebe identificador_interno (MIN-{cnpj}-{numero}).

ALTER TABLE public.ctes
  ADD COLUMN IF NOT EXISTS tipo_documento text NOT NULL DEFAULT 'CTE',
  ADD COLUMN IF NOT EXISTS data_emissao date,
  ADD COLUMN IF NOT EXISTS numero_nf_referenciada text,
  ADD COLUMN IF NOT EXISTS identificador_interno text;

-- Validação de tipo
CREATE OR REPLACE FUNCTION public.validate_documento_transporte_tipo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo_documento NOT IN ('CTE','MINUTA') THEN
    RAISE EXCEPTION 'tipo_documento inválido: % (esperado CTE ou MINUTA)', NEW.tipo_documento;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_doc_transporte_tipo ON public.ctes;
CREATE TRIGGER trg_validate_doc_transporte_tipo
BEFORE INSERT OR UPDATE ON public.ctes
FOR EACH ROW EXECUTE FUNCTION public.validate_documento_transporte_tipo();

-- Backfill: registros existentes que começam com MIN- são minutas
UPDATE public.ctes
   SET tipo_documento = 'MINUTA',
       identificador_interno = chave_cte
 WHERE chave_cte LIKE 'MIN-%' AND tipo_documento = 'CTE';

-- Backfill: numero_nf_referenciada a partir da chave_nf_referenciada (posições 26-34 da chave NFe)
UPDATE public.ctes
   SET numero_nf_referenciada = SUBSTRING(chave_nf_referenciada FROM 26 FOR 9)
 WHERE numero_nf_referenciada IS NULL
   AND chave_nf_referenciada IS NOT NULL
   AND length(chave_nf_referenciada) = 44;

CREATE INDEX IF NOT EXISTS idx_ctes_tipo_documento ON public.ctes(tipo_documento);
CREATE INDEX IF NOT EXISTS idx_ctes_numero_nf_ref ON public.ctes(numero_nf_referenciada);