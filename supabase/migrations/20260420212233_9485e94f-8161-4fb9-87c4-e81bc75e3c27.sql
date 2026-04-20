DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT inhrelid::regclass AS partition_name
    FROM pg_inherits
    WHERE inhparent = 'public.audit_log'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.partition_name);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', r.partition_name);
  END LOOP;
END $$;