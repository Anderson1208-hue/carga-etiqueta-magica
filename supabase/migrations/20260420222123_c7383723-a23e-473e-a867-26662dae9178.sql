-- Tabela de endereçamento de NFs no CD (múltiplas posições por NF)
CREATE TABLE IF NOT EXISTS public.nf_enderecamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id uuid NOT NULL,
  posicao text NOT NULL,
  principal boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nf_enderecamento_posicao_chk CHECK (length(btrim(posicao)) > 0)
);

-- Evita posições duplicadas para a mesma NF (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS nf_enderecamento_unique_pos
  ON public.nf_enderecamento (nf_id, lower(btrim(posicao)));

CREATE INDEX IF NOT EXISTS idx_nf_enderecamento_nf_id ON public.nf_enderecamento(nf_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_nf_enderecamento_updated_at ON public.nf_enderecamento;
CREATE TRIGGER trg_nf_enderecamento_updated_at
  BEFORE UPDATE ON public.nf_enderecamento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.nf_enderecamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view nf_enderecamento"
  ON public.nf_enderecamento FOR SELECT TO authenticated
  USING (is_admin() OR is_active_operator());

CREATE POLICY "Users can create nf_enderecamento"
  ON public.nf_enderecamento FOR INSERT TO authenticated
  WITH CHECK (has_profile());

CREATE POLICY "Users can update nf_enderecamento"
  ON public.nf_enderecamento FOR UPDATE TO authenticated
  USING (is_admin() OR is_active_operator());

CREATE POLICY "Users can delete nf_enderecamento"
  ON public.nf_enderecamento FOR DELETE TO authenticated
  USING (is_admin() OR is_active_operator());