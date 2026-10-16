-- Performance: avaliar is_admin()/is_active_operator() uma vez por consulta (initplan) em vez de por linha.
-- Mesma lógica de acesso; apenas envolve as chamadas em (SELECT ...).
DO $mig$
DECLARE
  r record;
  nq text;
  nw text;
  stmt text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') || coalesce(with_check,'')) ~ '(is_admin\(\)|is_active_operator\(\))'
  LOOP
    nq := regexp_replace(regexp_replace(r.qual, '(?<!SELECT )is_admin\(\)', '(SELECT is_admin())', 'g'), '(?<!SELECT )is_active_operator\(\)', '(SELECT is_active_operator())', 'g');
    nw := regexp_replace(regexp_replace(r.with_check, '(?<!SELECT )is_admin\(\)', '(SELECT is_admin())', 'g'), '(?<!SELECT )is_active_operator\(\)', '(SELECT is_active_operator())', 'g');
    stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.qual IS NOT NULL AND nq IS DISTINCT FROM r.qual THEN
      stmt := stmt || ' USING (' || nq || ')';
    END IF;
    IF r.with_check IS NOT NULL AND nw IS DISTINCT FROM r.with_check THEN
      stmt := stmt || ' WITH CHECK (' || nw || ')';
    END IF;
    IF stmt <> format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename) THEN
      EXECUTE stmt;
    END IF;
  END LOOP;
END
$mig$;