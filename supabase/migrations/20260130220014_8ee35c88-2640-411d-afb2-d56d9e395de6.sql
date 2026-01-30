-- Create enum for load status
CREATE TYPE public.load_status AS ENUM ('aberta', 'fechada');

-- Create enum for label status
CREATE TYPE public.label_status AS ENUM ('pendente', 'conferido');

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'operador');

-- ============================================
-- PROFILES TABLE (links auth.users to roles)
-- ============================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role app_role NOT NULL DEFAULT 'operador',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================
-- CARGAS (LOADS) TABLE
-- ============================================
CREATE TABLE public.cargas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    placa TEXT NOT NULL,
    motorista TEXT NOT NULL,
    observacao TEXT,
    status load_status NOT NULL DEFAULT 'aberta',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================
-- NOTAS FISCAIS (NF) TABLE
-- ============================================
CREATE TABLE public.notas_fiscais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carga_id UUID NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
    numero_nf TEXT NOT NULL,
    chave_acesso TEXT NOT NULL UNIQUE,
    razao_social_emitente TEXT NOT NULL,
    cnpj_emitente TEXT NOT NULL,
    data_emissao DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================
-- ITENS NF TABLE
-- ============================================
CREATE TABLE public.itens_nf (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nf_id UUID NOT NULL REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
    c_prod TEXT NOT NULL,
    x_prod TEXT NOT NULL,
    q_com NUMERIC(15,4) NOT NULL,
    u_com TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ============================================
-- ETIQUETAS TABLE
-- ============================================
CREATE TABLE public.etiquetas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carga_id UUID NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
    nf_id UUID NOT NULL REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
    c_prod TEXT NOT NULL,
    x_prod TEXT NOT NULL,
    numero_nf TEXT NOT NULL,
    chave_acesso TEXT NOT NULL,
    seq INTEGER NOT NULL,
    total INTEGER NOT NULL,
    qr_payload TEXT NOT NULL,
    status label_status NOT NULL DEFAULT 'pendente',
    conferido_em TIMESTAMP WITH TIME ZONE,
    conferido_por UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE(carga_id, nf_id, c_prod, seq)
);

-- ============================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================

-- Check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
$$;

-- Check if user has any role (is authenticated with profile)
CREATE OR REPLACE FUNCTION public.has_profile()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid()
    )
$$;

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cargas_updated_at
    BEFORE UPDATE ON public.cargas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- TRIGGER TO CREATE PROFILE ON SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'operador'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_nf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etiquetas ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES FOR PROFILES
-- ============================================
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid() OR is_admin());

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can manage all profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (is_admin());

-- ============================================
-- RLS POLICIES FOR CARGAS
-- ============================================
CREATE POLICY "Authenticated users can view cargas"
    ON public.cargas FOR SELECT
    TO authenticated
    USING (has_profile());

CREATE POLICY "Authenticated users can create cargas"
    ON public.cargas FOR INSERT
    TO authenticated
    WITH CHECK (has_profile());

CREATE POLICY "Authenticated users can update cargas"
    ON public.cargas FOR UPDATE
    TO authenticated
    USING (has_profile());

CREATE POLICY "Admins can delete cargas"
    ON public.cargas FOR DELETE
    TO authenticated
    USING (is_admin());

-- ============================================
-- RLS POLICIES FOR NOTAS_FISCAIS
-- ============================================
CREATE POLICY "Authenticated users can view notas fiscais"
    ON public.notas_fiscais FOR SELECT
    TO authenticated
    USING (has_profile());

CREATE POLICY "Authenticated users can create notas fiscais"
    ON public.notas_fiscais FOR INSERT
    TO authenticated
    WITH CHECK (has_profile());

CREATE POLICY "Admins can delete notas fiscais"
    ON public.notas_fiscais FOR DELETE
    TO authenticated
    USING (is_admin());

-- ============================================
-- RLS POLICIES FOR ITENS_NF
-- ============================================
CREATE POLICY "Authenticated users can view itens nf"
    ON public.itens_nf FOR SELECT
    TO authenticated
    USING (has_profile());

CREATE POLICY "Authenticated users can create itens nf"
    ON public.itens_nf FOR INSERT
    TO authenticated
    WITH CHECK (has_profile());

CREATE POLICY "Admins can delete itens nf"
    ON public.itens_nf FOR DELETE
    TO authenticated
    USING (is_admin());

-- ============================================
-- RLS POLICIES FOR ETIQUETAS
-- ============================================
CREATE POLICY "Authenticated users can view etiquetas"
    ON public.etiquetas FOR SELECT
    TO authenticated
    USING (has_profile());

CREATE POLICY "Authenticated users can create etiquetas"
    ON public.etiquetas FOR INSERT
    TO authenticated
    WITH CHECK (has_profile());

CREATE POLICY "Authenticated users can update etiquetas status"
    ON public.etiquetas FOR UPDATE
    TO authenticated
    USING (has_profile())
    WITH CHECK (has_profile());

CREATE POLICY "Admins can delete etiquetas"
    ON public.etiquetas FOR DELETE
    TO authenticated
    USING (is_admin());

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_notas_fiscais_carga_id ON public.notas_fiscais(carga_id);
CREATE INDEX idx_itens_nf_nf_id ON public.itens_nf(nf_id);
CREATE INDEX idx_itens_nf_c_prod ON public.itens_nf(c_prod);
CREATE INDEX idx_etiquetas_carga_id ON public.etiquetas(carga_id);
CREATE INDEX idx_etiquetas_nf_id ON public.etiquetas(nf_id);
CREATE INDEX idx_etiquetas_status ON public.etiquetas(status);
CREATE INDEX idx_etiquetas_qr_payload ON public.etiquetas(qr_payload);