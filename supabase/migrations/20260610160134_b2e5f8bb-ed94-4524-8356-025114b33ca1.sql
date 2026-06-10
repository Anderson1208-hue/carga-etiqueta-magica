-- 1) Remover trigger antigo que disparava expedição no momento da roteirização (D-1)
DROP TRIGGER IF EXISTS tg_nfev_veiculo_nf_i ON public.veiculo_nfs;
DROP FUNCTION IF EXISTS public.tg_nfev_veiculo_nf();

-- 2) Nova função/trigger: dispara "expedicao_veiculo" quando a rota é efetivamente iniciada
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
    PERFORM public.fn_nfev_insert(
      r.nf_id, 'expedicao_veiculo', NEW.created_at, v_ator, v_ator_nome,
      jsonb_build_object(
        'veiculo_id', r.veiculo_id, 'placa', r.placa,
        'motorista', r.motorista, 'carga_origem_id', r.carga_origem_id,
        'monitoramento_rota_id', NEW.id
      ),
      'trigger', 'rota_exp:'||NEW.id::text||':'||r.vnf_id::text
    );
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_nfev_rota_iniciada_i ON public.monitoramento_rotas;
CREATE TRIGGER tg_nfev_rota_iniciada_i
  AFTER INSERT ON public.monitoramento_rotas
  FOR EACH ROW EXECUTE FUNCTION public.tg_nfev_rota_iniciada();

-- 3) Limpar eventos antigos de expedição (datados erroneamente pela roteirização)
DELETE FROM public.nf_eventos
 WHERE tipo = 'expedicao_veiculo'
   AND (dedupe_key LIKE 'vnf:%' OR dedupe_key LIKE 'bf_vnf:%');

-- 4) Backfill com a data REAL de saída (created_at de monitoramento_rotas)
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key)
SELECT vnf.nf_id, 'expedicao_veiculo', mr.created_at, mr.created_by, NULL,
       jsonb_build_object(
         'veiculo_id', vnf.veiculo_id, 'placa', v.placa,
         'motorista', v.motorista, 'carga_origem_id', vnf.carga_origem_id,
         'monitoramento_rota_id', mr.id
       ),
       'backfill', 'rota_exp:'||mr.id::text||':'||vnf.id::text
  FROM public.monitoramento_rotas mr
  JOIN public.veiculos v ON v.id = mr.veiculo_id
  JOIN public.veiculo_nfs vnf ON vnf.veiculo_id = mr.veiculo_id
ON CONFLICT (dedupe_key) DO NOTHING;