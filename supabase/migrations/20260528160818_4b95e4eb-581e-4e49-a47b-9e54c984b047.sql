DELETE FROM public.baixas_entrega WHERE id='20587b71-db39-47e9-93ac-bcaf9b2a206d';
UPDATE public.notas_fiscais SET status_entrega='NF EM ROTA' WHERE id='3eaaf309-34f6-4c7d-9df6-495e12400f91';
INSERT INTO public.veiculo_nfs (veiculo_id, nf_id, carga_origem_id)
VALUES ('c0fc089d-6087-40b6-a7a6-d6ee58c7e93d','3eaaf309-34f6-4c7d-9df6-495e12400f91','ebcc93f5-06b5-4349-9a7e-85fabfcc3ee8')
ON CONFLICT (nf_id) DO NOTHING;