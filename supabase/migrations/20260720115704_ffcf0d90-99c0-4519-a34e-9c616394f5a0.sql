CREATE OR REPLACE FUNCTION public.provisionar_torre_veiculo(p_veiculo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_veic record;
  v_rota_id uuid;
  v_total_paradas int;
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  SELECT v.id, v.placa, v.motorista, v.data
    INTO v_veic
    FROM public.veiculos v
   WHERE v.id = p_veiculo_id
     AND v.status IN ('pendente','em_rota')
     AND v.prestacao_contas_em IS NULL
     AND EXISTS (SELECT 1 FROM public.veiculo_nfs vn WHERE vn.veiculo_id = v.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.monitoramento_rotas r
        WHERE (r.veiculo_id = v.id OR upper(regexp_replace(coalesce(r.placa,''),'[^A-Za-z0-9]','','g'))
                                     = upper(regexp_replace(coalesce(v.placa,''),'[^A-Za-z0-9]','','g')))
          AND r.status IN ('aguardando','ativa','pausada')
     );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','skipped','veiculo_id',p_veiculo_id);
  END IF;

  WITH nfs AS (
    SELECT nf.cnpj_destinatario, nf.dest_razao_social,
           nf.dest_logradouro, nf.dest_numero, nf.dest_bairro,
           nf.dest_cidade, nf.dest_uf, nf.peso_bruto, nf.volume_m3,
           vn.carga_origem_id
      FROM public.veiculo_nfs vn
      JOIN public.notas_fiscais nf ON nf.id = vn.nf_id
     WHERE vn.veiculo_id = v_veic.id
  ),
  grouped AS (
    SELECT coalesce(cnpj_destinatario,'SEM_CNPJ') AS cnpj,
           regexp_replace(coalesce(cnpj_destinatario,''),'\D','','g') AS cnpj_n,
           min(dest_razao_social) AS razao,
           min(dest_logradouro) AS log, min(dest_numero) AS num,
           min(dest_bairro) AS bai, min(dest_cidade) AS cid, min(dest_uf) AS uf,
           count(*)::int AS qtd_nfs,
           coalesce(sum(peso_bruto),0)::numeric AS peso,
           coalesce(sum(volume_m3),0)::numeric AS vol
      FROM nfs GROUP BY 1,2
  )
  SELECT count(*)::int INTO v_total_paradas FROM grouped;

  IF v_total_paradas = 0 THEN
    RETURN jsonb_build_object('status','skipped','reason','sem_paradas');
  END IF;

  INSERT INTO public.monitoramento_rotas (veiculo_id, motorista, placa, data, status, total_paradas)
  VALUES (v_veic.id, v_veic.motorista, v_veic.placa, v_veic.data, 'aguardando', v_total_paradas)
  RETURNING id INTO v_rota_id;

  INSERT INTO public.monitoramento_paradas (
    monitoramento_rota_id, ordem, cnpj_destinatario, razao_social,
    endereco_completo, latitude, longitude, raio_geofence_metros,
    total_nfs, total_caixas, peso_total_kg, volume_total_m3
  )
  WITH nfs AS (
    SELECT nf.cnpj_destinatario, nf.dest_razao_social,
           nf.dest_logradouro, nf.dest_numero, nf.dest_bairro,
           nf.dest_cidade, nf.dest_uf, nf.peso_bruto, nf.volume_m3,
           vn.carga_origem_id
      FROM public.veiculo_nfs vn
      JOIN public.notas_fiscais nf ON nf.id = vn.nf_id
     WHERE vn.veiculo_id = v_veic.id
  ),
  grouped AS (
    SELECT coalesce(cnpj_destinatario,'SEM_CNPJ') AS cnpj,
           regexp_replace(coalesce(cnpj_destinatario,''),'\D','','g') AS cnpj_n,
           min(dest_razao_social) AS razao,
           min(dest_logradouro) AS log, min(dest_numero) AS num,
           min(dest_bairro) AS bai, min(dest_cidade) AS cid, min(dest_uf) AS uf,
           count(*)::int AS qtd_nfs,
           coalesce(sum(peso_bruto),0)::numeric AS peso,
           coalesce(sum(volume_m3),0)::numeric AS vol
      FROM nfs GROUP BY 1,2
  ),
  cargas AS (SELECT DISTINCT carga_origem_id AS carga_id FROM nfs WHERE carga_origem_id IS NOT NULL),
  rots AS (SELECT r.id, r.created_at FROM public.roteirizacoes r WHERE r.carga_id IN (SELECT carga_id FROM cargas)),
  rot_paradas AS (
    SELECT rp.*, regexp_replace(coalesce(rp.cnpj_destinatario,''),'\D','','g') AS cnpj_n
      FROM public.roteirizacao_paradas rp WHERE rp.roteirizacao_id IN (SELECT id FROM rots)
  ),
  rot_rank AS (
    SELECT r.id FROM rots r LEFT JOIN rot_paradas rp ON rp.roteirizacao_id = r.id
     GROUP BY r.id, r.created_at
     ORDER BY count(*) FILTER (WHERE rp.cnpj_n IN (SELECT cnpj_n FROM grouped WHERE cnpj_n <> '')) DESC, r.created_at DESC
     LIMIT 1
  ),
  rot_best AS (SELECT rp.* FROM rot_paradas rp WHERE rp.roteirizacao_id = (SELECT id FROM rot_rank)),
  end_mestre AS (
    SELECT DISTINCT ON (regexp_replace(d.cnpj_cpf,'\D','','g'))
           regexp_replace(d.cnpj_cpf,'\D','','g') AS cnpj_n,
           de.latitude AS lat, de.longitude AS lng, d.raio_geofence_metros
      FROM public.destinatarios d
      JOIN public.destinatario_enderecos de ON de.destinatario_id = d.id
     WHERE de.latitude IS NOT NULL AND de.longitude IS NOT NULL
       AND regexp_replace(d.cnpj_cpf,'\D','','g') IN (SELECT cnpj_n FROM grouped)
     ORDER BY regexp_replace(d.cnpj_cpf,'\D','','g'), de.principal DESC NULLS LAST, de.updated_at DESC NULLS LAST
  ),
  merged AS (
    SELECT g.cnpj, g.cnpj_n, g.razao, g.log, g.num, g.bai, g.cid, g.uf,
           g.qtd_nfs, g.peso, g.vol,
           rb.ordem AS rot_ordem, rb.razao_social AS rot_razao, rb.endereco_completo AS rot_end,
           coalesce(em.lat, rb.latitude) AS lat, coalesce(em.lng, rb.longitude) AS lng,
           rb.total_nfs AS rot_total_nfs, rb.total_caixas AS rot_total_caixas,
           rb.peso_total_kg AS rot_peso, rb.volume_total_m3 AS rot_vol,
           em.raio_geofence_metros AS raio_cli
      FROM grouped g
      LEFT JOIN rot_best rb ON rb.cnpj_n = g.cnpj_n
      LEFT JOIN end_mestre em ON em.cnpj_n = g.cnpj_n
  ),
  ordered AS (
    SELECT m.*, row_number() OVER (
             ORDER BY (m.rot_ordem IS NULL), m.rot_ordem NULLS LAST, m.cnpj
           )::int AS ordem_final
      FROM merged m
  )
  SELECT v_rota_id, ordem_final, cnpj,
         coalesce(rot_razao, razao),
         coalesce(rot_end,
           concat_ws(', ', nullif(log,''), nullif(num,''))
           || case when bai is not null then ' - '||bai else '' end
           || case when cid is not null then ', '||cid||'/'||coalesce(uf,'') else '' end
         ),
         lat, lng,
         coalesce(raio_cli, 100),
         coalesce(rot_total_nfs, qtd_nfs),
         coalesce(rot_total_caixas, 0),
         coalesce(rot_peso, peso),
         coalesce(rot_vol, vol)
    FROM ordered;

  RETURN jsonb_build_object('status','ok','rota_id',v_rota_id,'paradas',v_total_paradas);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.provisionar_torre_veiculo(uuid) TO authenticated;