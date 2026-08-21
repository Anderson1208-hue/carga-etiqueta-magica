UPDATE public.notas_fiscais nf
SET volume_m3 = calc.vol
FROM (
  SELECT i.nf_id, SUM(i.q_com * p.volume_m3) AS vol
  FROM public.itens_nf i
  JOIN public.notas_fiscais n ON n.id = i.nf_id
  JOIN public.produtos p
    ON p.cnpj_embarcador = regexp_replace(n.cnpj_emitente,'\D','','g')
   AND ltrim(btrim(p.codigo),'0') = ltrim(btrim(i.c_prod),'0')
  WHERE n.numero_nf = '474844'
  GROUP BY i.nf_id
) calc
WHERE nf.id = calc.nf_id AND coalesce(nf.volume_m3,0) = 0;