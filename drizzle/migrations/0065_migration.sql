DO $m1$
DECLARE
  d text;
  anchor text := $a$ SELECT 'veiculos'::text AS dataset,$a$;
  novo text := $n$ SELECT 'cargas_agrupadas'::text AS dataset,
    x.chave AS row_id,
    x.data::timestamp with time zone AS data_ref,
    jsonb_build_object('data', x.data, 'placa', x.placa, 'numero_carga', x.numeros, 'motorista', x.motoristas, 'status', x.statuses, 'tipo_carga', x.tipos, 'embarcador', x.embarcador, 'cargas', x.cargas, 'nfs', x.nfs, 'volume_m3', x.m3, 'peso_kg', x.peso) AS dados
   FROM ( SELECT md5(coalesce(nullif(trim(b.placa), ''), 'id-' || b.id::text) || '|' || b.data::text) AS chave,
            b.data,
            max(nullif(trim(b.placa), '')) AS placa,
            count(*) AS cargas,
            sum(coalesce(b.nfs, 0)) AS nfs,
            round(sum(coalesce(b.m3, 0))::numeric, 2) AS m3,
            round(sum(coalesce(b.peso, 0))::numeric, 2) AS peso,
            string_agg(DISTINCT b.embarcador, ' / ') AS embarcador,
            string_agg(DISTINCT nullif(trim(b.motorista), ''), ' / ') AS motoristas,
            string_agg(DISTINCT b.numero_carga::text, ' / ') AS numeros,
            string_agg(DISTINCT b.status::text, ' / ') AS statuses,
            string_agg(DISTINCT b.tipo_carga, ' / ') AS tipos
           FROM ( SELECT c.id, c.placa, c.data, c.motorista, c.status, c.tipo_carga, c.numero_carga, cn.nfs, cn.m3, cn.peso, cn.embarcador
                    FROM cargas c
                      LEFT JOIN LATERAL ( SELECT count(*) AS nfs,
                            sum(nf.volume_m3) AS m3,
                            sum(nf.peso_bruto) AS peso,
                            string_agg(DISTINCT nf.razao_social_emitente, ' / ') AS embarcador
                           FROM notas_fiscais nf
                          WHERE nf.carga_id = c.id) cn ON true) b
          GROUP BY 1, 2) x
UNION ALL
 SELECT 'veiculos'::text AS dataset,$n$;
BEGIN
  d := pg_get_viewdef('public.agente_gerencial_dados'::regclass);
  IF position('cargas_agrupadas' in d) > 0 THEN RAISE EXCEPTION 'cargas_agrupadas ja existe na view'; END IF;
  IF position(anchor in d) = 0 THEN RAISE EXCEPTION 'ancora de veiculos nao encontrada'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.agente_gerencial_dados AS ' || replace(d, anchor, novo);
END $m1$;

DO $m2$
DECLARE
  d text;
  a1 text := $a$p_dataset NOT IN ('notas','cargas','veiculos','agendas','entregas','ibac','okentrega','produtos','destinatarios','embarcadores','roteirizacoes','prefaturas','prefatura_itens','ctes','sla','tarifas')$a$;
  n1 text := $n$p_dataset NOT IN ('notas','cargas','cargas_agrupadas','veiculos','agendas','entregas','ibac','okentrega','produtos','destinatarios','embarcadores','roteirizacoes','prefaturas','prefatura_itens','ctes','sla','tarifas')$n$;
  a2 text := $a$p_dataset IN ('cargas','veiculos','agendas','prefaturas')$a$;
  n2 text := $n$p_dataset IN ('cargas','cargas_agrupadas','veiculos','agendas','prefaturas')$n$;
BEGIN
  d := pg_get_functiondef('public.agente_gerencial_relatorio(uuid,uuid,text,date,date,jsonb)'::regprocedure);
  IF position(a1 in d) = 0 THEN RAISE EXCEPTION 'lista de datasets nao encontrada'; END IF;
  IF position(a2 in d) = 0 THEN RAISE EXCEPTION 'lista de datasets com data nao encontrada'; END IF;
  EXECUTE replace(replace(d, a1, n1), a2, n2);
END $m2$;