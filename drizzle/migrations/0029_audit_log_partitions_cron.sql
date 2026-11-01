SELECT public.ensure_audit_log_partition();
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ensure-audit-log-partition';
SELECT cron.schedule('ensure-audit-log-partition', '0 3 * * *', 'SELECT public.ensure_audit_log_partition();');