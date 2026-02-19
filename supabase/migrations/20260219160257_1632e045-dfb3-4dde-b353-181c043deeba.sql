
ALTER TABLE public.veiculo_nfs DROP CONSTRAINT veiculo_nfs_carga_origem_id_fkey;
ALTER TABLE public.veiculo_nfs ADD CONSTRAINT veiculo_nfs_carga_origem_id_fkey FOREIGN KEY (carga_origem_id) REFERENCES public.cargas(id) ON DELETE CASCADE;
