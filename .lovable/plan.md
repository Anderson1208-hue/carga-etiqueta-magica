# Cadastro de região por fornecedor com cidades já atendidas (checkbox)

Sim, é possível — e os dados já existem na base. Confirmei consultando as notas fiscais do emitente Pandurata (CNPJ 70.940.994/0082-77): há **27 cidades distintas atendidas** (todas no RJ), do maior para o menor volume: Rio de Janeiro (1.078 NFs / 89 clientes), Duque de Caxias (364), São Gonçalo (121), Três Rios (81), Seropédica (72), Volta Redonda (66), Campos dos Goytacazes (57), Nova Iguaçu (48), São Pedro da Aldeia (42), Nova Friburgo, Piraí, Macaé, Cabo Frio, Niterói, São João de Meriti, Araruama, Mesquita, Petrópolis, Carmo, Resende, Belford Roxo, Nilópolis, Maricá, Rio das Ostras, Itaboraí, Teresópolis, Itaguaí.

Hoje a tela `/comercial/sla-fornecedor` só aceita cidades digitadas/coladas manualmente e ainda **não existe nenhuma região cadastrada** para nenhum fornecedor.

## O que será feito

### Painel "Cidades já atendidas" na tela de Regiões e SLA
- Ao escolher o fornecedor, aparece a lista das cidades que esse fornecedor já atendeu, extraída das notas fiscais históricas.
- Cada cidade tem uma **caixa de marcação**; marcar várias e clicar em "Adicionar à região" grava todas de uma vez na região selecionada.
- Cada linha mostra UF, município, nº de NFs, nº de clientes distintos e data da última entrega — para priorizar as cidades relevantes.
- Filtro por texto, botões "marcar todas / limpar", e filtro por UF.
- Cidades que já estão nesta região aparecem marcadas e travadas ("já na região"); cidades que estão em **outra região do mesmo fornecedor** aparecem com aviso e o motivo, evitando conflito de SLA.
- Após adicionar, a lista de cidades da região e o contador são atualizados na hora.
- A entrada manual (colar cidades) continua existindo como alternativa.

### Cadastro completo da região
Na mesma tela, o cadastro da região passa a concentrar em um só lugar:
- Nome da região e situação (ativa/inativa).
- Cidades (pela marcação acima ou manual), com contagem e remoção individual.
- SLA em dias úteis, com vigência e observação (já existe, permanece).
- Atalho para a tela de tarifas da mesma região.

## Detalhes técnicos

- Nova função no banco `listar_cidades_atendidas(_embarcador_id uuid)`: agrupa `notas_fiscais` por `dest_uf` + `upper(dest_cidade)` casando o CNPJ do emitente (comparação por CNPJ apenas com dígitos, pois em `notas_fiscais` ele está formatado com pontos/barra e em `embarcadores` sem máscara), retornando uf, município, total de NFs, clientes distintos e última emissão. `security definer`, `search_path = public`, execute apenas para `authenticated` e protegida por `pode_gestao_comercial()` internamente.
- Frontend: novo bloco em `src/pages/fiscal/SlaFornecedor.tsx` consumindo a RPC (React Query, `staleTime` alto por ser dado histórico) e gravando via o mesmo `upsert` em `embarcador_regiao_cidades` com `onConflict: "regiao_id,uf,municipio_norm", ignoreDuplicates: true`.
- Municípios gravados em maiúsculas sem acento na coluna `municipio` (a coluna `municipio_norm` é gerada), mantendo compatibilidade com `resolver_sla_tarifa`.
- Nenhuma alteração em `tabelas_frete`, no simulador fiscal ou nas telas operacionais.

## Fora do escopo
- Vincular código IBGE do município (fica nulo, como hoje).
- Aplicar o SLA nas telas operacionais (Preparação, Agendamento, Torre).
