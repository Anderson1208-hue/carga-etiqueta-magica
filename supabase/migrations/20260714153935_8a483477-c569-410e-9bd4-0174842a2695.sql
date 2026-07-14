
-- =====================================================================
-- FASE 1 FISCAL — Cadastros mestres com campos fiscais + config emitente
-- =====================================================================

-- 1) Colunas fiscais em EMBARCADORES
ALTER TABLE public.embarcadores
  ADD COLUMN IF NOT EXISTS ie text,
  ADD COLUMN IF NOT EXISTS ie_st text,
  ADD COLUMN IF NOT EXISTS regime_tributario text,   -- 'simples' | 'lucro_presumido' | 'lucro_real' | 'mei'
  ADD COLUMN IF NOT EXISTS indicador_ie smallint,    -- 1=contribuinte ICMS, 2=isento, 9=não contribuinte
  ADD COLUMN IF NOT EXISTS suframa text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS codigo_municipio_ibge text;

-- 2) Colunas fiscais em DESTINATARIOS
ALTER TABLE public.destinatarios
  ADD COLUMN IF NOT EXISTS ie text,
  ADD COLUMN IF NOT EXISTS ie_st text,
  ADD COLUMN IF NOT EXISTS regime_tributario text,
  ADD COLUMN IF NOT EXISTS indicador_ie smallint,
  ADD COLUMN IF NOT EXISTS suframa text,
  ADD COLUMN IF NOT EXISTS orgao_publico boolean NOT NULL DEFAULT false;

-- 3) Nova tabela CONFIGURACAO_FISCAL_EMITENTE
CREATE TABLE IF NOT EXISTS public.configuracao_fiscal_emitente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj text NOT NULL UNIQUE,
  razao_social text NOT NULL,
  nome_fantasia text,
  ie text NOT NULL,
  ie_st text,
  regime_tributario text NOT NULL,            -- simples | lucro_presumido | lucro_real
  cnae text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cep text,
  municipio text NOT NULL,
  codigo_municipio_ibge text NOT NULL,
  uf text NOT NULL,
  telefone text,
  email text,
  rntrc text,                                 -- RNTRC ANTT (obrigatório para CT-e/MDF-e)
  ambiente text NOT NULL DEFAULT 'homologacao', -- homologacao | producao
  emissor_api text NOT NULL DEFAULT 'plugnotas', -- plugnotas | focus | migrate | outros
  serie_cte integer NOT NULL DEFAULT 1,
  proximo_numero_cte integer NOT NULL DEFAULT 1,
  serie_mdfe integer NOT NULL DEFAULT 1,
  proximo_numero_mdfe integer NOT NULL DEFAULT 1,
  tomador_padrao text,                        -- 'emitente' | 'expedidor' | 'recebedor' | 'destinatario' | 'outro'
  observacao_padrao text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.configuracao_fiscal_emitente TO authenticated;
GRANT ALL ON public.configuracao_fiscal_emitente TO service_role;

ALTER TABLE public.configuracao_fiscal_emitente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ativo operador ou admin lê emitente fiscal"
  ON public.configuracao_fiscal_emitente
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_active_operator());

CREATE POLICY "Só admin altera emitente fiscal"
  ON public.configuracao_fiscal_emitente
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_configuracao_fiscal_emitente_updated_at
  BEFORE UPDATE ON public.configuracao_fiscal_emitente
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validação de valores permitidos via trigger (evita CHECK constraint)
CREATE OR REPLACE FUNCTION public.validate_configuracao_fiscal_emitente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.regime_tributario NOT IN ('simples','lucro_presumido','lucro_real','mei') THEN
    RAISE EXCEPTION 'regime_tributario inválido: %', NEW.regime_tributario;
  END IF;
  IF NEW.ambiente NOT IN ('homologacao','producao') THEN
    RAISE EXCEPTION 'ambiente inválido: %', NEW.ambiente;
  END IF;
  IF length(regexp_replace(NEW.cnpj, '[^0-9]', '', 'g')) <> 14 THEN
    RAISE EXCEPTION 'CNPJ do emitente inválido (esperado 14 dígitos)';
  END IF;
  -- normaliza CNPJ para só dígitos
  NEW.cnpj := regexp_replace(NEW.cnpj, '[^0-9]', '', 'g');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_configuracao_fiscal_emitente
  BEFORE INSERT OR UPDATE ON public.configuracao_fiscal_emitente
  FOR EACH ROW EXECUTE FUNCTION public.validate_configuracao_fiscal_emitente();
