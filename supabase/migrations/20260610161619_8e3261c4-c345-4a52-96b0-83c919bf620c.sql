-- 1) Recriar trigger em veiculo_nfs: cria expedicao_veiculo com data da roteirização (fallback)
CREATE OR REPLACE FUNCTION public.tg_nfev_veiculo_nf()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_placa text; v_motorista text; v_ator uuid; v_ator_nome text;
BEGIN
  SELECT placa, motorista INTO v_placa, v_motorista
    FROM public.veiculos WHERE id = NEW.veiculo_id;
  SELECT * INTO v_ator, v_ator_nome FROM public.fn_nfev_actor();

  INSERT INTO public.nf_eventos (
    nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key
  ) VALUES (
    NEW.nf_id, 'expedicao_veiculo', NEW.created_at, v_ator, v_ator_nome,
    jsonb_build_object('veiculo_id', NEW.veiculo_id, 'placa', v_placa,
                       'motorista', v_motorista, 'carga_origem_id', NEW.carga_origem_id,
                       'origem_data','roteirizacao'),
    'trigger', 'expedicao:'||NEW.nf_id::text
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_nfev_veiculo_nf_i ON public.veiculo_nfs;
CREATE TRIGGER tg_nfev_veiculo_nf_i
  AFTER INSERT ON public.veiculo_nfs
  FOR EACH ROW EXECUTE FUNCTION public.tg_nfev_veiculo_nf();

-- 2) Atualizar trigger de rota iniciada: faz UPSERT, sobrescrevendo a data com a real
CREATE OR REPLACE FUNCTION public.tg_nfev_rota_iniciada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ator uuid; v_ator_nome text;
  r record;
BEGIN
  SELECT * INTO v_ator, v_ator_nome FROM public.fn_nfev_actor();
  FOR r IN
    SELECT vnf.id AS vnf_id, vnf.nf_id, vnf.veiculo_id, vnf.carga_origem_id,
           v.placa, v.motorista
      FROM public.veiculo_nfs vnf
      JOIN public.veiculos v ON v.id = vnf.veiculo_id
     WHERE vnf.veiculo_id = NEW.veiculo_id
  LOOP
    INSERT INTO public.nf_eventos (
      nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key
    ) VALUES (
      r.nf_id, 'expedicao_veiculo', NEW.created_at, v_ator, v_ator_nome,
      jsonb_build_object('veiculo_id', r.veiculo_id, 'placa', r.placa,
                         'motorista', r.motorista, 'carga_origem_id', r.carga_origem_id,
                         'monitoramento_rota_id', NEW.id, 'origem_data','rota'),
      'trigger', 'expedicao:'||r.nf_id::text
    )
    ON CONFLICT (dedupe_key) DO UPDATE
      SET ocorrido_em = EXCLUDED.ocorrido_em,
          ator_id    = EXCLUDED.ator_id,
          ator_nome  = EXCLUDED.ator_nome,
          payload    = EXCLUDED.payload,
          origem     = EXCLUDED.origem;
  END LOOP;
  RETURN NEW;
END $$;

-- 3) Limpar eventos antigos com chaves obsoletas
DELETE FROM public.nf_eventos
 WHERE tipo='expedicao_veiculo'
   AND (dedupe_key LIKE 'vnf:%' OR dedupe_key LIKE 'rota_exp:%' OR dedupe_key LIKE 'bf_vnf:%');

-- 4) Backfill base (roteirização) — 1 evento por NF
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key)
SELECT DISTINCT ON (vnf.nf_id)
       vnf.nf_id, 'expedicao_veiculo', vnf.created_at, NULL, NULL,
       jsonb_build_object('veiculo_id', vnf.veiculo_id, 'placa', v.placa,
                          'motorista', v.motorista, 'carga_origem_id', vnf.carga_origem_id,
                          'origem_data','roteirizacao'),
       'backfill', 'expedicao:'||vnf.nf_id::text
  FROM public.veiculo_nfs vnf
  JOIN public.veiculos v ON v.id = vnf.veiculo_id
 ORDER BY vnf.nf_id, vnf.created_at ASC
ON CONFLICT (dedupe_key) DO NOTHING;

-- 5) Backfill sobreposto (rota efetivamente iniciada — sobrescreve com data real)
WITH first_rota AS (
  SELECT DISTINCT ON (vnf.nf_id)
         vnf.nf_id, vnf.veiculo_id, vnf.carga_origem_id, v.placa, v.motorista,
         mr.id AS rota_id, mr.created_at AS rota_created
    FROM public.veiculo_nfs vnf
    JOIN public.veiculos v ON v.id = vnf.veiculo_id
    JOIN public.monitoramento_rotas mr ON mr.veiculo_id = vnf.veiculo_id
   ORDER BY vnf.nf_id, mr.created_at ASC
)
UPDATE public.nf_eventos e
   SET ocorrido_em = fr.rota_created,
       payload = jsonb_build_object('veiculo_id', fr.veiculo_id, 'placa', fr.placa,
                                     'motorista', fr.motorista, 'carga_origem_id', fr.carga_origem_id,
                                     'monitoramento_rota_id', fr.rota_id, 'origem_data','rota'),
       origem = 'backfill'
  FROM first_rota fr
 WHERE e.tipo = 'expedicao_veiculo'
   AND e.dedupe_key = 'expedicao:'||fr.nf_id::text;