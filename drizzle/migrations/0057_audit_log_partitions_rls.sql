ALTER TABLE public.audit_log_2026_11 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log_2026_12 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log_2027_01 ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.ensure_audit_log_partition()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_start date; v_end date; v_partition_name text; i int;
BEGIN
  FOR i IN 0..2 LOOP
    v_start := date_trunc('month', CURRENT_DATE + (i || ' month')::interval)::date;
    v_end := (v_start + interval '1 month')::date;
    v_partition_name := 'audit_log_' || to_char(v_start, 'YYYY_MM');
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)', v_partition_name, v_start, v_end);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition_name);
  END LOOP;
END;
$function$;