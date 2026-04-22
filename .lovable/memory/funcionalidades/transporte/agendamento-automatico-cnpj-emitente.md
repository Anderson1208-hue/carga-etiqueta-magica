---
name: Agendamento automático por CNPJ + Emitente
description: Trigger auto_agenda_por_cnpj cria AGUARDANDO AGENDA validando o par (CNPJ destinatário + razão social do emitente). Coluna emitente NULL = wildcard.
type: feature
---
A tabela `cnpj_agenda_automatica` tem colunas `cnpj` (somente dígitos) + `emitente` (texto, opcional).

Regra do trigger `auto_agenda_por_cnpj` em `notas_fiscais` (AFTER INSERT):
- Normaliza `cnpj_destinatario` removendo não-dígitos.
- Faz match `WHERE cnpj = v_cnpj_norm AND (emitente IS NULL OR upper(razao_social_emitente) LIKE '%' || upper(emitente) || '%')`.
- Se houver match, insere `agendamentos(nf_id, status='AGUARDANDO AGENDA')`.

`emitente IS NULL` = vale para qualquer emitente (retrocompat com cadastros antigos).

Emitentes usados na planilha-base de 22/04/2026 (319 pares): PANDURATA (Bauducco), BAGLEY, ARCOR, HERSHEYS, MARS. Docile foi excluído por instrução do usuário.

Unicidade: índice `cnpj_agenda_automatica_cnpj_emitente_uniq` em `(cnpj, COALESCE(upper(emitente),''))`.
