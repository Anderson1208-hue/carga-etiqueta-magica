
-- Fix 1: Restrict INSERTs to active operators or admins
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname='public' AND cmd='INSERT' AND with_check LIKE '%has_profile()%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I WITH CHECK (is_admin() OR is_active_operator())',
      r.policyname, r.schemaname, r.tablename
    );
  END LOOP;
END $$;

-- Fix 2: Add UPDATE/DELETE policies on comprovantes storage bucket
CREATE POLICY "Admins and operators can update comprovantes"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'comprovantes' AND (is_admin() OR is_active_operator()))
WITH CHECK (bucket_id = 'comprovantes' AND (is_admin() OR is_active_operator()));

CREATE POLICY "Admins and operators can delete comprovantes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'comprovantes' AND (is_admin() OR is_active_operator()));
