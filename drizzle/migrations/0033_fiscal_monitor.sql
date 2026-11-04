CREATE TABLE public.fiscal_monitor_fontes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tema text NOT NULL,
  url text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_hash text,
  ultimo_texto text,
  ultima_verificacao timestamptz,
  ultima_mudanca timestamptz,
  ultimo_erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.fiscal_monitor_fontes TO authenticated;
GRANT ALL ON public.fiscal_monitor_fontes TO service_role;
ALTER TABLE public.fiscal_monitor_fontes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin le fontes" ON public.fiscal_monitor_fontes FOR SELECT TO authenticated USING ((SELECT public.is_admin(auth.uid())));
CREATE POLICY "admin edita fontes" ON public.fiscal_monitor_fontes FOR UPDATE TO authenticated USING ((SELECT public.is_admin(auth.uid()))) WITH CHECK ((SELECT public.is_admin(auth.uid())));

CREATE TABLE public.fiscal_monitor_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte_id uuid NOT NULL REFERENCES public.fiscal_monitor_fontes(id) ON DELETE CASCADE,
  detectado_em timestamptz NOT NULL DEFAULT now(),
  titulo text NOT NULL,
  resumo text NOT NULL,
  impacto text,
  regras_afetadas text[] NOT NULL DEFAULT '{}',
  relevancia text NOT NULL DEFAULT 'media',
  trecho text,
  status text NOT NULL DEFAULT 'pendente',
  decidido_por uuid,
  decidido_em timestamptz,
  observacao text
);
GRANT SELECT, UPDATE ON public.fiscal_monitor_alertas TO authenticated;
GRANT ALL ON public.fiscal_monitor_alertas TO service_role;
ALTER TABLE public.fiscal_monitor_alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin le alertas" ON public.fiscal_monitor_alertas FOR SELECT TO authenticated USING ((SELECT public.is_admin(auth.uid())));
CREATE POLICY "admin decide alertas" ON public.fiscal_monitor_alertas FOR UPDATE TO authenticated USING ((SELECT public.is_admin(auth.uid()))) WITH CHECK ((SELECT public.is_admin(auth.uid())));
CREATE INDEX fiscal_monitor_alertas_status_idx ON public.fiscal_monitor_alertas(status, detectado_em DESC);

CREATE TABLE public.fiscal_monitor_cron_auth (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  token uuid NOT NULL DEFAULT gen_random_uuid()
);
GRANT ALL ON public.fiscal_monitor_cron_auth TO service_role;
ALTER TABLE public.fiscal_monitor_cron_auth ENABLE ROW LEVEL SECURITY;
INSERT INTO public.fiscal_monitor_cron_auth DEFAULT VALUES;

INSERT INTO public.fiscal_monitor_fontes (nome, tema, url) VALUES
('Portal CT-e — informes e notas técnicas','CT-e','https://www.cte.fazenda.gov.br/portal/informe.aspx'),
('Portal MDF-e — documentos','MDF-e','https://dfe-portal.svrs.rs.gov.br/Mdfe/Documentos'),
('ANTT — pagamento eletrônico de frete / CIOT','CIOT','https://www.gov.br/antt/pt-br/assuntos/cargas/pagamento-eletronico-de-frete'),
('ANTT — vale-pedágio obrigatório','Vale-pedágio','https://www.gov.br/antt/pt-br/assuntos/cargas/vale-pedagio-obrigatorio'),
('CONFAZ — convênios ICMS','ICMS','https://www.confaz.fazenda.gov.br/legislacao/convenios'),
('RICMS/MG 2023 — Anexo X (isenções)','ICMS MG','https://www.fazenda.mg.gov.br/empresas/legislacao_tributaria/ricms_2023/anexox2023.html'),
('SEFAZ-RJ — legislação','ICMS RJ','https://portal.fazenda.rj.gov.br/legislacao/'),
('Reforma tributária — IBS/CBS','IBS/CBS','https://www.gov.br/fazenda/pt-br/acesso-a-informacao/acoes-e-programas/reforma-tributaria');