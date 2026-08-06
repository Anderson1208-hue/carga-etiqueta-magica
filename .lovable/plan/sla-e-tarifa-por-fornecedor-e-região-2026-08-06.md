# SLA e Tarifa por Fornecedor e Região

Duas novas telas restritas (Admin + Julio + Rodrigo Boamorte), com regiões desenhadas por fornecedor.

## O que será criado

### 1. Tela "Regiões e SLA por Fornecedor" (`/fiscal/sla-fornecedor`)
- Seleciona o fornecedor (embarcador).
- Lista as **regiões** desse fornecedor (ex.: Capital, Baixada, Interior, Região dos Lagos).
- Ao selecionar uma região: painel lateral com as **cidades pertencentes** (UF + município), com inclusão rápida (digitar/colar várias cidades de uma vez, uma por linha) e remoção.
- Campo de **SLA em dias úteis** por região, com data de vigência e observação.
- Aviso quando a mesma cidade já estiver em outra região do mesmo fornecedor (evita conflito de roteamento de SLA).

### 2. Tela "Tarifas por Fornecedor e Região" (`/fiscal/tarifas-regiao`)
- Seleciona o fornecedor; lista uma linha por região com:
  - Tarifa (R$/tonelada) **ou** valor fixo por entrega
  - Frete mínimo, GRIS %, Ad valorem %, pedágio por 100kg, adicional CT-e
  - Vigência (de/até) e ativo/inativo
- Edição em diálogo, sem faixas de peso (valor único por região, conforme definido).
- Histórico preservado por vigência: nova tabela de preço não apaga a anterior.

### 3. Relação com a tela existente "Tabelas de Frete"
A tela atual (`tabelas_frete` + `tabelas_frete_faixas`) permanece intacta — ela é usada pelo simulador fiscal/CT-e. As novas telas ficam no nível **comercial por região**, e a nova tarifa por região é a fonte usada para cálculo quando o fornecedor não tiver faixa de peso. Nada é removido nesta etapa.

## Acesso

Lista fixa no sistema: administradores + `julio.nogueira@tlmlogistica.com.br` + `rodrigo.boamorte@tlmlogistica.com.br`.
- No banco: função `pode_gestao_comercial()` que retorna verdadeiro para admin ou para esses dois e-mails; usada nas políticas de acesso das novas tabelas.
- No app: as duas rotas e os itens de menu só aparecem/carregam para esses usuários; quem não tiver acesso vê "sem permissão".

## Script SQL proposto (migração)

```sql
-- Regiões por fornecedor
create table public.embarcador_regioes (
  id uuid primary key default gen_random_uuid(),
  embarcador_id uuid not null references public.embarcadores(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (embarcador_id, nome)
);

-- Cidades de cada região
create table public.embarcador_regiao_cidades (
  id uuid primary key default gen_random_uuid(),
  regiao_id uuid not null references public.embarcador_regioes(id) on delete cascade,
  uf text not null,
  municipio text not null,
  municipio_norm text generated always as (upper(municipio)) stored,
  codigo_municipio_ibge text,
  created_at timestamptz not null default now(),
  unique (regiao_id, uf, municipio_norm)
);

-- SLA por região (dias úteis), versionado por vigência
create table public.embarcador_regiao_sla (
  id uuid primary key default gen_random_uuid(),
  regiao_id uuid not null references public.embarcador_regioes(id) on delete cascade,
  prazo_dias_uteis integer not null,
  vigente_de date not null default current_date,
  vigente_ate date,
  observacao text,
  ativo boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tarifa por região (valor único, sem faixa de peso)
create table public.embarcador_regiao_tarifas (
  id uuid primary key default gen_random_uuid(),
  regiao_id uuid not null references public.embarcador_regioes(id) on delete cascade,
  tarifa_por_ton numeric,
  tarifa_fixa numeric,
  frete_minimo numeric,
  gris_percentual numeric,
  advalorem_percentual numeric,
  pedagio_por_100kg numeric,
  adicional_cte numeric,
  vigente_de date not null default current_date,
  vigente_ate date,
  observacao text,
  ativo boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Permissão: admin + Julio + Rodrigo
create or replace function public.pode_gestao_comercial()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo
      and (p.role = 'admin'
           or lower(p.email) in ('julio.nogueira@tlmlogistica.com.br',
                                 'rodrigo.boamorte@tlmlogistica.com.br'))
  )
$$;
revoke execute on function public.pode_gestao_comercial() from anon, public;
grant execute on function public.pode_gestao_comercial() to authenticated;

-- Grants + RLS (repetir para as 4 tabelas)
grant select, insert, update, delete on public.embarcador_regioes to authenticated;
grant all on public.embarcador_regioes to service_role;
alter table public.embarcador_regioes enable row level security;
create policy "comercial gerencia regioes" on public.embarcador_regioes
  for all to authenticated
  using (public.pode_gestao_comercial())
  with check (public.pode_gestao_comercial());
-- idem para embarcador_regiao_cidades, embarcador_regiao_sla, embarcador_regiao_tarifas

-- Índices e triggers de updated_at
create index on public.embarcador_regioes (embarcador_id);
create index on public.embarcador_regiao_cidades (uf, municipio_norm);
create index on public.embarcador_regiao_sla (regiao_id, vigente_de desc);
create index on public.embarcador_regiao_tarifas (regiao_id, vigente_de desc);
```

Também será criada uma função de consulta `resolver_sla_tarifa(embarcador_id, uf, municipio, data)` que devolve região, prazo em dias úteis e tarifa vigente — usada depois por Preparação/Agendamento e pelo cálculo de frete, sem duplicar regra no frontend.

## Detalhes técnicos do frontend

- Novos arquivos: `src/pages/fiscal/SlaFornecedor.tsx` e `src/pages/fiscal/TarifasRegiao.tsx`.
- Rotas em `src/App.tsx` protegidas por um guard `useGestaoComercial()` (admin ou os dois e-mails).
- Itens de menu em `src/components/layout/Sidebar.tsx`, no bloco restrito.
- Cálculo de dias úteis reaproveita `src/lib/feriados-rj.ts`.
- Sem alterações em `TabelasFrete.tsx`, `tabelas_frete` ou `tabelas_frete_faixas`.

## Fora do escopo desta etapa
- Aplicar o SLA nas telas operacionais (Preparação, Agendamento, Torre) e alertas de atraso.
- Substituir a tela de Tabelas de Frete pelo modelo por região.
