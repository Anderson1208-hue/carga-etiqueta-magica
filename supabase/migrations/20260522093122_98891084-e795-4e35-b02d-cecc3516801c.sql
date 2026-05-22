
-- ============================================================
-- FASE 1: Cadastros Mestres (Embarcador + Destinatário) — 3PL
-- ============================================================

-- 1) EMBARCADORES
CREATE TABLE public.embarcadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj text NOT NULL UNIQUE,
  razao_social text NOT NULL,
  nome_fantasia text,
  contato_nome text,
  contato_email text,
  contato_telefone text,
  sla_padrao_horas integer DEFAULT 48,
  centro_custo text,
  observacao_operacional text,
  ativo boolean NOT NULL DEFAULT true,
  rascunho boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_embarcadores_cnpj ON public.embarcadores(cnpj);
CREATE INDEX idx_embarcadores_ativo ON public.embarcadores(ativo);

ALTER TABLE public.embarcadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view embarcadores" ON public.embarcadores FOR SELECT TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Users can create embarcadores" ON public.embarcadores FOR INSERT TO authenticated WITH CHECK (has_profile());
CREATE POLICY "Users can update embarcadores" ON public.embarcadores FOR UPDATE TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Admins can delete embarcadores" ON public.embarcadores FOR DELETE TO authenticated USING (is_admin());

CREATE TRIGGER trg_embarcadores_updated_at BEFORE UPDATE ON public.embarcadores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) DESTINATARIOS
CREATE TABLE public.destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj_cpf text NOT NULL UNIQUE,
  razao_social text NOT NULL,
  nome_fantasia text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  rascunho boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_destinatarios_cnpj ON public.destinatarios(cnpj_cpf);
CREATE INDEX idx_destinatarios_ativo ON public.destinatarios(ativo);

ALTER TABLE public.destinatarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view destinatarios" ON public.destinatarios FOR SELECT TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Users can create destinatarios" ON public.destinatarios FOR INSERT TO authenticated WITH CHECK (has_profile());
CREATE POLICY "Users can update destinatarios" ON public.destinatarios FOR UPDATE TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Admins can delete destinatarios" ON public.destinatarios FOR DELETE TO authenticated USING (is_admin());

CREATE TRIGGER trg_destinatarios_updated_at BEFORE UPDATE ON public.destinatarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3) ENDEREÇOS DO DESTINATARIO
CREATE TABLE public.destinatario_enderecos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id uuid NOT NULL REFERENCES public.destinatarios(id) ON DELETE CASCADE,
  apelido text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  latitude numeric,
  longitude numeric,
  principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dest_end_destinatario ON public.destinatario_enderecos(destinatario_id);
CREATE INDEX idx_dest_end_principal ON public.destinatario_enderecos(destinatario_id) WHERE principal = true;

ALTER TABLE public.destinatario_enderecos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view dest enderecos" ON public.destinatario_enderecos FOR SELECT TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Users can create dest enderecos" ON public.destinatario_enderecos FOR INSERT TO authenticated WITH CHECK (has_profile());
CREATE POLICY "Users can update dest enderecos" ON public.destinatario_enderecos FOR UPDATE TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Users can delete dest enderecos" ON public.destinatario_enderecos FOR DELETE TO authenticated USING (is_admin() OR is_active_operator());

CREATE TRIGGER trg_dest_end_updated_at BEFORE UPDATE ON public.destinatario_enderecos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 4) RESTRIÇÕES DO DESTINATARIO
CREATE TABLE public.destinatario_restricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id uuid NOT NULL UNIQUE REFERENCES public.destinatarios(id) ON DELETE CASCADE,
  dias_semana int[] DEFAULT ARRAY[1,2,3,4,5], -- 0=dom..6=sáb
  hora_inicio time,
  hora_fim time,
  altura_max_veiculo_m numeric,
  agendamento_obrigatorio boolean NOT NULL DEFAULT false,
  exige_escolta boolean NOT NULL DEFAULT false,
  documentos_canhoto text[],
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.destinatario_restricoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view dest restricoes" ON public.destinatario_restricoes FOR SELECT TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Users can create dest restricoes" ON public.destinatario_restricoes FOR INSERT TO authenticated WITH CHECK (has_profile());
CREATE POLICY "Users can update dest restricoes" ON public.destinatario_restricoes FOR UPDATE TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Users can delete dest restricoes" ON public.destinatario_restricoes FOR DELETE TO authenticated USING (is_admin() OR is_active_operator());

CREATE TRIGGER trg_dest_restr_updated_at BEFORE UPDATE ON public.destinatario_restricoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 5) BACKFILL: auto-criar embarcadores das NFs existentes
-- ============================================================
INSERT INTO public.embarcadores (cnpj, razao_social, ativo, rascunho)
SELECT 
  REGEXP_REPLACE(cnpj_emitente, '[^0-9]', '', 'g') AS cnpj,
  MAX(razao_social_emitente) AS razao_social,
  true,
  true
FROM public.notas_fiscais
WHERE cnpj_emitente IS NOT NULL AND length(REGEXP_REPLACE(cnpj_emitente, '[^0-9]', '', 'g')) >= 11
GROUP BY REGEXP_REPLACE(cnpj_emitente, '[^0-9]', '', 'g')
ON CONFLICT (cnpj) DO NOTHING;


-- 6) BACKFILL: auto-criar destinatários das NFs existentes
INSERT INTO public.destinatarios (cnpj_cpf, razao_social, ativo, rascunho)
SELECT
  REGEXP_REPLACE(cnpj_destinatario, '[^0-9]', '', 'g') AS cnpj,
  MAX(COALESCE(dest_razao_social, 'SEM RAZÃO SOCIAL')) AS razao,
  true,
  true
FROM public.notas_fiscais
WHERE cnpj_destinatario IS NOT NULL AND length(REGEXP_REPLACE(cnpj_destinatario, '[^0-9]', '', 'g')) >= 11
GROUP BY REGEXP_REPLACE(cnpj_destinatario, '[^0-9]', '', 'g')
ON CONFLICT (cnpj_cpf) DO NOTHING;


-- 7) BACKFILL: criar endereço principal a partir da NF mais recente de cada destinatário
INSERT INTO public.destinatario_enderecos (
  destinatario_id, logradouro, numero, bairro, cidade, uf, cep, principal
)
SELECT DISTINCT ON (d.id)
  d.id,
  nf.dest_logradouro,
  nf.dest_numero,
  nf.dest_bairro,
  nf.dest_cidade,
  nf.dest_uf,
  nf.dest_cep,
  true
FROM public.destinatarios d
JOIN public.notas_fiscais nf 
  ON REGEXP_REPLACE(nf.cnpj_destinatario, '[^0-9]', '', 'g') = d.cnpj_cpf
WHERE nf.dest_logradouro IS NOT NULL
ORDER BY d.id, nf.created_at DESC;


-- ============================================================
-- 8) TRIGGER: auto-vincular ao importar NFs novas
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_auto_link_cadastros_nf()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emit_cnpj text;
  v_dest_cnpj text;
BEGIN
  v_emit_cnpj := REGEXP_REPLACE(COALESCE(NEW.cnpj_emitente, ''), '[^0-9]', '', 'g');
  v_dest_cnpj := REGEXP_REPLACE(COALESCE(NEW.cnpj_destinatario, ''), '[^0-9]', '', 'g');

  -- Embarcador
  IF length(v_emit_cnpj) >= 11 THEN
    INSERT INTO public.embarcadores (cnpj, razao_social, ativo, rascunho)
    VALUES (v_emit_cnpj, COALESCE(NEW.razao_social_emitente, 'SEM RAZÃO SOCIAL'), true, true)
    ON CONFLICT (cnpj) DO NOTHING;
  END IF;

  -- Destinatário
  IF length(v_dest_cnpj) >= 11 THEN
    INSERT INTO public.destinatarios (cnpj_cpf, razao_social, ativo, rascunho)
    VALUES (v_dest_cnpj, COALESCE(NEW.dest_razao_social, 'SEM RAZÃO SOCIAL'), true, true)
    ON CONFLICT (cnpj_cpf) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_link_cadastros_nf
AFTER INSERT ON public.notas_fiscais
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_link_cadastros_nf();
