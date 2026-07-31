-- ============ Cadastro Mestre de Produtos (cross-docking + armazenagem) ============
CREATE TABLE public.produtos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  embarcador_id uuid REFERENCES public.embarcadores(id) ON DELETE SET NULL,
  cnpj_embarcador text,
  -- Identificação
  codigo text NOT NULL,                 -- cProd do XML / SKU do embarcador
  codigo_alternativo text,              -- ZREP / FERT / código interno
  descricao text NOT NULL,
  unidade text,                         -- CX, UN, FD...
  marca text,
  segmento text,
  categoria text,
  hierarquia_produto text,
  ncm text,
  cest text,
  -- Códigos de barras por nível
  ean_tdu text,                         -- caixa (TDU)
  ean_mcu text,                         -- pack intermediário
  ean_rsu text,                         -- unidade de venda
  dun14 text,
  qtd_mcu_por_tdu numeric,
  qtd_rsu_por_tdu numeric,              -- unidades por caixa
  -- Pesos
  peso_bruto_cx_kg numeric,
  peso_liquido_cx_kg numeric,
  peso_bruto_un_kg numeric,
  -- Dimensões da caixa (mm)
  largura_mm numeric,
  comprimento_mm numeric,
  altura_mm numeric,
  volume_m3 numeric,                    -- cubagem da caixa
  volume_calculado boolean NOT NULL DEFAULT false,
  -- Paletização / armazenagem
  lastro integer,                       -- caixas por camada
  camadas integer,                      -- camadas por pallet (LAY)
  caixas_por_pallet integer,            -- PLB
  tipo_pallet text DEFAULT 'PBR',
  altura_pallet_mm numeric,
  peso_pallet_kg numeric,
  empilhamento_max integer,
  -- Regras operacionais
  controla_lote boolean NOT NULL DEFAULT true,
  controla_validade boolean NOT NULL DEFAULT true,
  shelf_life_dias integer,              -- Validade total
  shelf_life_min_recebimento_dias integer,  -- At Risk
  shelf_life_min_expedicao_dias integer,    -- Aged
  regra_giro text NOT NULL DEFAULT 'FEFO',  -- FEFO / FIFO / LIFO
  temperatura_min_c numeric,
  temperatura_max_c numeric,
  faixa_temperatura text NOT NULL DEFAULT 'ambiente', -- ambiente / climatizado / refrigerado / congelado
  fragil boolean NOT NULL DEFAULT false,
  empilhavel boolean NOT NULL DEFAULT true,
  produto_perigoso boolean NOT NULL DEFAULT false,
  onu_numero text,
  classe_risco text,
  sensivel_furto boolean NOT NULL DEFAULT false,
  -- Valores
  valor_unitario_ref numeric,
  -- Governança
  status_comercial text,                -- Ativo / Descontinuado
  origem_cadastro text NOT NULL DEFAULT 'manual', -- manual / planilha / xml
  ativo boolean NOT NULL DEFAULT true,
  rascunho boolean NOT NULL DEFAULT false,
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX produtos_embarcador_codigo_uniq
  ON public.produtos (COALESCE(cnpj_embarcador,'-'), lower(btrim(codigo)));
CREATE INDEX idx_produtos_codigo ON public.produtos (lower(btrim(codigo)));
CREATE INDEX idx_produtos_embarcador ON public.produtos (embarcador_id);
CREATE INDEX idx_produtos_ean_tdu ON public.produtos (ean_tdu);
CREATE INDEX idx_produtos_descricao ON public.produtos (lower(descricao));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "produtos_select_operadores" ON public.produtos
  FOR SELECT TO authenticated USING (public.is_active_operator());
CREATE POLICY "produtos_insert_operadores" ON public.produtos
  FOR INSERT TO authenticated WITH CHECK (public.is_active_operator());
CREATE POLICY "produtos_update_operadores" ON public.produtos
  FOR UPDATE TO authenticated USING (public.is_active_operator());
CREATE POLICY "produtos_delete_admin" ON public.produtos
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER trg_produtos_updated_at
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Volume calculado automaticamente quando dimensões existem e m3 não veio
CREATE OR REPLACE FUNCTION public.fn_produtos_calc_volume()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.volume_m3 IS NULL OR NEW.volume_m3 = 0)
     AND NEW.largura_mm > 0 AND NEW.comprimento_mm > 0 AND NEW.altura_mm > 0 THEN
    NEW.volume_m3 := round((NEW.largura_mm * NEW.comprimento_mm * NEW.altura_mm) / 1000000000.0, 6);
    NEW.volume_calculado := true;
  END IF;
  IF NEW.caixas_por_pallet IS NULL AND NEW.lastro > 0 AND NEW.camadas > 0 THEN
    NEW.caixas_por_pallet := NEW.lastro * NEW.camadas;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_produtos_calc_volume
  BEFORE INSERT OR UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.fn_produtos_calc_volume();

-- Import em lote idempotente (upsert por cnpj_embarcador + codigo)
CREATE OR REPLACE FUNCTION public.importar_produtos_lote(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_inseridos int := 0;
  v_atualizados int := 0;
  v_embarcador_id uuid;
  v_cnpj text;
  v_exists uuid;
BEGIN
  IF NOT public.is_active_operator() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'produtos') LOOP
    v_cnpj := nullif(regexp_replace(coalesce(v_item->>'cnpj_embarcador',''), '\D', '', 'g'), '');
    v_embarcador_id := NULL;
    IF v_cnpj IS NOT NULL THEN
      SELECT id INTO v_embarcador_id FROM public.embarcadores WHERE cnpj = v_cnpj LIMIT 1;
    END IF;

    SELECT id INTO v_exists FROM public.produtos
     WHERE COALESCE(cnpj_embarcador,'-') = COALESCE(v_cnpj,'-')
       AND lower(btrim(codigo)) = lower(btrim(v_item->>'codigo'))
     LIMIT 1;

    IF v_exists IS NULL THEN
      INSERT INTO public.produtos (
        embarcador_id, cnpj_embarcador, codigo, codigo_alternativo, descricao, unidade,
        marca, segmento, hierarquia_produto, ncm, ean_tdu, ean_mcu, ean_rsu,
        qtd_mcu_por_tdu, qtd_rsu_por_tdu, peso_bruto_cx_kg, peso_liquido_cx_kg,
        largura_mm, comprimento_mm, altura_mm, volume_m3,
        lastro, camadas, caixas_por_pallet,
        shelf_life_dias, shelf_life_min_recebimento_dias, shelf_life_min_expedicao_dias,
        status_comercial, origem_cadastro, created_by
      ) VALUES (
        v_embarcador_id, v_cnpj, btrim(v_item->>'codigo'), v_item->>'codigo_alternativo',
        v_item->>'descricao', v_item->>'unidade', v_item->>'marca', v_item->>'segmento',
        v_item->>'hierarquia_produto', v_item->>'ncm',
        v_item->>'ean_tdu', v_item->>'ean_mcu', v_item->>'ean_rsu',
        (v_item->>'qtd_mcu_por_tdu')::numeric, (v_item->>'qtd_rsu_por_tdu')::numeric,
        (v_item->>'peso_bruto_cx_kg')::numeric, (v_item->>'peso_liquido_cx_kg')::numeric,
        (v_item->>'largura_mm')::numeric, (v_item->>'comprimento_mm')::numeric,
        (v_item->>'altura_mm')::numeric, (v_item->>'volume_m3')::numeric,
        (v_item->>'lastro')::int, (v_item->>'camadas')::int, (v_item->>'caixas_por_pallet')::int,
        (v_item->>'shelf_life_dias')::int, (v_item->>'shelf_life_min_recebimento_dias')::int,
        (v_item->>'shelf_life_min_expedicao_dias')::int,
        v_item->>'status_comercial', 'planilha', auth.uid()
      );
      v_inseridos := v_inseridos + 1;
    ELSE
      UPDATE public.produtos SET
        embarcador_id = COALESCE(v_embarcador_id, embarcador_id),
        descricao = COALESCE(nullif(v_item->>'descricao',''), descricao),
        codigo_alternativo = COALESCE(nullif(v_item->>'codigo_alternativo',''), codigo_alternativo),
        unidade = COALESCE(nullif(v_item->>'unidade',''), unidade),
        marca = COALESCE(nullif(v_item->>'marca',''), marca),
        segmento = COALESCE(nullif(v_item->>'segmento',''), segmento),
        hierarquia_produto = COALESCE(nullif(v_item->>'hierarquia_produto',''), hierarquia_produto),
        ncm = COALESCE(nullif(v_item->>'ncm',''), ncm),
        ean_tdu = COALESCE(nullif(v_item->>'ean_tdu',''), ean_tdu),
        ean_mcu = COALESCE(nullif(v_item->>'ean_mcu',''), ean_mcu),
        ean_rsu = COALESCE(nullif(v_item->>'ean_rsu',''), ean_rsu),
        qtd_mcu_por_tdu = COALESCE((v_item->>'qtd_mcu_por_tdu')::numeric, qtd_mcu_por_tdu),
        qtd_rsu_por_tdu = COALESCE((v_item->>'qtd_rsu_por_tdu')::numeric, qtd_rsu_por_tdu),
        peso_bruto_cx_kg = COALESCE((v_item->>'peso_bruto_cx_kg')::numeric, peso_bruto_cx_kg),
        peso_liquido_cx_kg = COALESCE((v_item->>'peso_liquido_cx_kg')::numeric, peso_liquido_cx_kg),
        largura_mm = COALESCE((v_item->>'largura_mm')::numeric, largura_mm),
        comprimento_mm = COALESCE((v_item->>'comprimento_mm')::numeric, comprimento_mm),
        altura_mm = COALESCE((v_item->>'altura_mm')::numeric, altura_mm),
        volume_m3 = COALESCE((v_item->>'volume_m3')::numeric, volume_m3),
        lastro = COALESCE((v_item->>'lastro')::int, lastro),
        camadas = COALESCE((v_item->>'camadas')::int, camadas),
        caixas_por_pallet = COALESCE((v_item->>'caixas_por_pallet')::int, caixas_por_pallet),
        shelf_life_dias = COALESCE((v_item->>'shelf_life_dias')::int, shelf_life_dias),
        shelf_life_min_recebimento_dias = COALESCE((v_item->>'shelf_life_min_recebimento_dias')::int, shelf_life_min_recebimento_dias),
        shelf_life_min_expedicao_dias = COALESCE((v_item->>'shelf_life_min_expedicao_dias')::int, shelf_life_min_expedicao_dias),
        status_comercial = COALESCE(nullif(v_item->>'status_comercial',''), status_comercial),
        rascunho = false,
        updated_at = now()
      WHERE id = v_exists;
      v_atualizados := v_atualizados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inseridos', v_inseridos, 'atualizados', v_atualizados);
END;
$$;
