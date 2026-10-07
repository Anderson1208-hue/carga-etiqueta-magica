# Agendas futuras como opção de antecipação na Preparação

## 1. Desfazer o que foi feito
- Remover o botão de calendário e a janela "Agendas futuras" da Preparação.
- A Preparação volta exatamente como era antes.

## 2. Nova regra (proposta)
Quando um cliente (mesmo CNPJ) tiver uma nota **liberada** na Preparação (agenda de amanhã / próximo dia útil), as outras notas desse mesmo CNPJ com **agenda futura** (data depois da liberação) passam a aparecer **na mesma lista**, junto das demais notas do cliente.

Como aparecem:
- Na lista normal, agrupadas no mesmo cliente.
- Com marcação própria, ex.: **"ANTECIPAÇÃO – agenda dd/MM"**, em cor diferente do verde da agendada liberada.
- Selecionáveis como qualquer nota, para entrar no caminhão se o transporte decidir antecipar.

Continuam fora da lista:
- Notas "aguardando agenda", "aguardando reagenda" e devolução.
- Agendas futuras de um CNPJ que **não** tem nota liberada hoje.
- Notas já em veículo ou entregues.

Nada muda na regra de liberação na véspera, nas demais notas, na contagem de caixas nem na conferência.

## 3. Pontos para o transporte decidir
1. Ao programar uma nota antecipada, a data da agenda dela deve ser **alterada automaticamente** para a nova data, ou fica como está e o transporte ajusta na tela de Agendamento?
2. Considerar agendas futuras de **todos os embarcadores** do CNPJ ou só do mesmo embarcador da nota liberada?
3. Limite de dias à frente (ex.: até 7 dias) ou qualquer agenda futura?

## Detalhes técnicos
- Remover `AgendasFuturasDialog.tsx` e seu uso em `Programacao.tsx`.
- No filtro de `available` em `Programacao.tsx`: calcular o conjunto de CNPJs com nota AGENDAMENTO/REENTREGA liberada (data <= limiteLiberacao); manter as notas com agenda > limiteLiberacao apenas se o CNPJ estiver nesse conjunto, marcando `antecipacao: true`.
- Novo campo `antecipacao` em `NfDisponivel` e selo visual com token de cor semântico.
- Nenhuma mudança no banco nesta etapa (salvo se o ponto 1 for "alterar automaticamente").
