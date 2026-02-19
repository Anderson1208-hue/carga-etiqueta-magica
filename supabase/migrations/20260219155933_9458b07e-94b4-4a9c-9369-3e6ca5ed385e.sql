
-- Fix veiculo_nfs.nf_id to cascade on delete
ALTER TABLE public.veiculo_nfs DROP CONSTRAINT veiculo_nfs_nf_id_fkey;
ALTER TABLE public.veiculo_nfs ADD CONSTRAINT veiculo_nfs_nf_id_fkey FOREIGN KEY (nf_id) REFERENCES public.notas_fiscais(id) ON DELETE CASCADE;

-- Fix baixas_entrega.nf_id to cascade on delete
ALTER TABLE public.baixas_entrega DROP CONSTRAINT baixas_entrega_nf_id_fkey;
ALTER TABLE public.baixas_entrega ADD CONSTRAINT baixas_entrega_nf_id_fkey FOREIGN KEY (nf_id) REFERENCES public.notas_fiscais(id) ON DELETE CASCADE;
