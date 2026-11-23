DO $m$
DECLARE d text; o text := $o$jsonb_build_object('data', cargas.data, 'placa', cargas.placa, 'motorista', cargas.motorista, 'status', cargas.status, 'tipo_carga', cargas.tipo_carga) AS dados
   FROM cargas$o$;
BEGIN
  d := pg_get_viewdef('public.agente_gerencial_dados'::regclass);
  IF position(o in d) = 0 THEN RAISE EXCEPTION 'trecho de cargas não encontrado'; END IF;
  d := replace(d, o, $n$jsonb_build_object('data', cargas.data, 'numero_carga', cargas.numero_carga, 'placa', cargas.placa, 'motorista', cargas.motorista, 'status', cargas.status, 'tipo_carga', cargas.tipo_carga, 'embarcador', cn.embarcador, 'nfs', COALESCE(cn.nfs, 0), 'volume_m3', COALESCE(cn.m3, 0), 'peso_kg', COALESCE(cn.peso, 0)) AS dados
   FROM cargas
     LEFT JOIN LATERAL ( SELECT string_agg(DISTINCT nf.razao_social_emitente, ' / ') AS embarcador, count(*) AS nfs, round(sum(nf.volume_m3)::numeric, 2) AS m3, round(sum(nf.peso_bruto)::numeric, 2) AS peso FROM notas_fiscais nf WHERE nf.carga_id = cargas.id) cn ON true$n$);
  EXECUTE 'CREATE OR REPLACE VIEW public.agente_gerencial_dados AS ' || d;
END $m$;