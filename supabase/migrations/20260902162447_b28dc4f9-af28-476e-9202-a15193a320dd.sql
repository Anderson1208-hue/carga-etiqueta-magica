UPDATE public.okentrega_config
SET blocklist_nfs = array_append(blocklist_nfs, '749515')
WHERE id = true AND NOT ('749515' = ANY (blocklist_nfs));

UPDATE public.okentrega_queue
SET status = 'bloqueado',
    erro_mensagem = 'Bloqueado manualmente: digitacao direta no portal do cliente (2026-09-02)'
WHERE status = 'pendente' AND numero_nf = '749515';