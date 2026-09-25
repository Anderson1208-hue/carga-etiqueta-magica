CREATE OR REPLACE FUNCTION public.sincronizar_rota_torre_veiculo(p_veiculo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_veic record;
  v_rota record;
  v_nfs int;
  v_raio int;
BEGIN
  SELECT id, placa, data, prestacao_contas_em, status INTO v_veic
    FROM public.veiculos WHERE id = p_veiculo_id;
  IF v_veic.id IS NULL OR v_veic.prestacao_contas_em IS NOT NULL
     OR v_veic.data < v_hoje OR v_veic.status NOT IN ('pendente','em_rota') THEN
    RETURN jsonb_build_object('status','ignorado');
  END IF;

  SELECT count(*) INTO v_nfs FROM public.veiculo_nfs WHERE veiculo_id = p_veiculo_id;

  SELECT r.* INTO v_rota FROM public.monitoramento_rotas r
   WHERE r.veiculo_id = p_veiculo_id AND r.status IN ('aguardando','ativa','pausada')
   ORDER BY r.created_at DESC LIMIT 1;

  -- Rota ainda sem GPS: pode ser refeita inteira.
  IF v_rota.id IS NOT NULL AND v_rota.status = 'aguardando' AND v_rota.ultima_atualizacao IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.posicoes_gps p WHERE p.monitoramento_rota_id = v_rota.id) THEN
    DELETE FROM public.monitoramento_rotas WHERE id = v_rota.id;
    v_rota := NULL;
  END IF;

  IF v_nfs = 0 THEN
    RETURN jsonb_build_object('status','sem_nfs');
  END IF;

  IF v_rota.id IS NULL THEN
    RETURN public.provisionar_torre_veiculo(p_veiculo_id);
  END IF;

  -- Rota já em andamento: ajusta só as paradas afetadas.
  SELECT COALESCE(raio_padrao_metros, 200) INTO v_raio FROM public.monitoramento_config LIMIT 1;
  v_raio := COALESCE(v_raio, 200);

  CREATE TEMP TABLE IF NOT EXISTS _sync_grp (cnpj text, cnpj_n text, razao text, endereco text, qtd int, peso numeric, vol numeric) ON COMMIT DROP;
  TRUNCATE _sync_grp;
  INSERT INTO _sync_grp
  SELECT coalesce(nf.cnpj_destinatario,'SEM_CNPJ'),
         regexp_replace(coalesce(nf.cnpj_destinatario,''),'\D','','g'),
         min(nf.dest_razao_social),
         concat_ws(', ', nullif(min(nf.dest_logradouro),''), nullif(min(nf.dest_numero),''))
           || coalesce(' - '||min(nf.dest_bairro),'')
           || coalesce(', '||min(nf.dest_cidade)||'/'||coalesce(min(nf.dest_uf),''),''),
         count(*)::int, coalesce(sum(nf.peso_bruto),0), coalesce(sum(nf.volume_m3),0)
    FROM public.veiculo_nfs vn JOIN public.notas_fiscais nf ON nf.id = vn.nf_id
   WHERE vn.veiculo_id = p_veiculo_id
   GROUP BY 1,2;

  -- Remove paradas que não têm mais notas e ainda não foram visitadas.
  DELETE FROM public.monitoramento_paradas mp
   WHERE mp.monitoramento_rota_id = v_rota.id
     AND mp.status = 'programada' AND mp.horario_chegada IS NULL
     AND regexp_replace(coalesce(mp.cnpj_destinatario,''),'\D','','g') NOT IN (SELECT cnpj_n FROM _sync_grp);

  -- Atualiza totais das paradas existentes.
  UPDATE public.monitoramento_paradas mp
     SET total_nfs = g.qtd, peso_total_kg = g.peso, volume_total_m3 = g.vol
    FROM _sync_grp g
   WHERE mp.monitoramento_rota_id = v_rota.id
     AND regexp_replace(coalesce(mp.cnpj_destinatario,''),'\D','','g') = g.cnpj_n;

  -- Inclui paradas novas no fim da rota.
  INSERT INTO public.monitoramento_paradas (
    monitoramento_rota_id, ordem, cnpj_destinatario, razao_social, endereco_completo,
    latitude, longitude, raio_geofence_metros, total_nfs, total_caixas, peso_total_kg, volume_total_m3)
  SELECT v_rota.id,
         (SELECT coalesce(max(ordem),0) FROM public.monitoramento_paradas WHERE monitoramento_rota_id = v_rota.id)
           + row_number() OVER (ORDER BY g.cnpj),
         g.cnpj, g.razao, g.endereco, em.lat, em.lng, coalesce(em.raio, v_raio),
         g.qtd, 0, g.peso, g.vol
    FROM _sync_grp g
    LEFT JOIN LATERAL (
      SELECT de.latitude lat, de.longitude lng, d.raio_geofence_metros raio
        FROM public.destinatarios d JOIN public.destinatario_enderecos de ON de.destinatario_id = d.id
       WHERE regexp_replace(d.cnpj_cpf,'\D','','g') = g.cnpj_n
         AND de.latitude IS NOT NULL AND de.longitude IS NOT NULL
       ORDER BY de.principal DESC NULLS LAST, de.updated_at DESC NULLS LAST LIMIT 1
    ) em ON true
   WHERE NOT EXISTS (
     SELECT 1 FROM public.monitoramento_paradas mp
      WHERE mp.monitoramento_rota_id = v_rota.id
        AND regexp_replace(coalesce(mp.cnpj_destinatario,''),'\D','','g') = g.cnpj_n);

  UPDATE public.monitoramento_rotas
     SET total_paradas = (SELECT count(*) FROM public.monitoramento_paradas WHERE monitoramento_rota_id = v_rota.id)
   WHERE id = v_rota.id;

  RETURN jsonb_build_object('status','ajustada','rota_id',v_rota.id);
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_rota_torre_veiculo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_rota_torre_veiculo(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_veiculo_nfs_sync_torre()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN
    SELECT DISTINCT veiculo_id FROM (
      SELECT veiculo_id FROM novas WHERE TG_OP IN ('INSERT','UPDATE')
      UNION ALL
      SELECT veiculo_id FROM antigas WHERE TG_OP IN ('DELETE','UPDATE')
    ) x WHERE veiculo_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.sincronizar_rota_torre_veiculo(v_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[sync torre] veiculo % falhou: %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Trigger por instrução com tabelas de transição: uma vez por gravação da roteirização.
CREATE OR REPLACE FUNCTION public.fn_veiculo_nfs_sync_torre_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT DISTINCT veiculo_id FROM novas WHERE veiculo_id IS NOT NULL LOOP
    BEGIN PERFORM public.sincronizar_rota_torre_veiculo(v_id);
    EXCEPTION WHEN OTHERS THEN RAISE WARNING '[sync torre] %: %', v_id, SQLERRM; END;
  END LOOP;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_veiculo_nfs_sync_torre_del()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT DISTINCT veiculo_id FROM antigas WHERE veiculo_id IS NOT NULL LOOP
    BEGIN PERFORM public.sincronizar_rota_torre_veiculo(v_id);
    EXCEPTION WHEN OTHERS THEN RAISE WARNING '[sync torre] %: %', v_id, SQLERRM; END;
  END LOOP;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_veiculo_nfs_sync_torre_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT DISTINCT veiculo_id FROM (SELECT veiculo_id FROM novas UNION SELECT veiculo_id FROM antigas) x WHERE veiculo_id IS NOT NULL LOOP
    BEGIN PERFORM public.sincronizar_rota_torre_veiculo(v_id);
    EXCEPTION WHEN OTHERS THEN RAISE WARNING '[sync torre] %: %', v_id, SQLERRM; END;
  END LOOP;
  RETURN NULL;
END; $$;

DROP FUNCTION IF EXISTS public.fn_veiculo_nfs_sync_torre();

DROP TRIGGER IF EXISTS tg_veiculo_nfs_sync_torre_ins ON public.veiculo_nfs;
DROP TRIGGER IF EXISTS tg_veiculo_nfs_sync_torre_del ON public.veiculo_nfs;
DROP TRIGGER IF EXISTS tg_veiculo_nfs_sync_torre_upd ON public.veiculo_nfs;
CREATE TRIGGER tg_veiculo_nfs_sync_torre_ins AFTER INSERT ON public.veiculo_nfs
  REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION public.fn_veiculo_nfs_sync_torre_ins();
CREATE TRIGGER tg_veiculo_nfs_sync_torre_del AFTER DELETE ON public.veiculo_nfs
  REFERENCING OLD TABLE AS antigas FOR EACH STATEMENT EXECUTE FUNCTION public.fn_veiculo_nfs_sync_torre_del();
CREATE TRIGGER tg_veiculo_nfs_sync_torre_upd AFTER UPDATE ON public.veiculo_nfs
  REFERENCING OLD TABLE AS antigas NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION public.fn_veiculo_nfs_sync_torre_upd();

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'provisionar-torre-10min';