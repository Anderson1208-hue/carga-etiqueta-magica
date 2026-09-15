# 2ª conferência fechada por placa (escopo IBAC/Pandurata)

## Como funciona hoje
A 2ª conferência (Expedição / motorista) já começa pela **placa do veículo da roteirização**: o operador escolhe a placa, vê as notas daquele veículo e bipa etiqueta por etiqueta. O que **não** existe é um fechamento por veículo: cada nota é conferida de forma independente e nada impede o veículo de sair com notas não bipadas.

## Como ficaria
1. Ao abrir a placa, o sistema mostra um painel de fechamento no topo:
   `Placa TLM1234 — 10 notas no escopo · 6 conferidas · 4 faltando`.
2. As notas do escopo são as do embarcador IBAC (Pandurata/Bauducco), identificadas pelo mesmo cadastro de CNPJ já usado no envio de canhoto. Notas de outros embarcadores continuam aparecendo, mas marcadas como "fora do escopo" e não contam para o fechamento.
3. Botão **"Fechar conferência do veículo"** fica bloqueado enquanto faltar qualquer nota (ou qualquer caixa de uma nota) do escopo. Ao passar o dedo/mouse, mostra a lista do que falta.
4. Quando as 10 notas estiverem 100% bipadas, o botão libera. Ao fechar, o veículo recebe data/hora e nome de quem fechou, e a partir daí a expedição está oficialmente liberada.
5. Só um administrador pode fechar com pendência, escolhendo o motivo (nota retirada da carga, avaria, sobra de galpão). Isso fica registrado e aparece na prestação de contas.
6. Reflexos: a lista de veículos passa a exibir um selo por placa — *Aguardando conferência* / *Faltam N notas* / *Conferido*. A Torre de Controle e a Prestação de Contas leem esse mesmo selo.

## Pontos de atenção operacionais
- **Nota retirada da carga depois da roteirização:** hoje isso não tem registro formal. Sem um caminho de "remover nota do veículo", o fechamento travaria por algo que fisicamente não existe. Por isso o item 5 é obrigatório.
- **Escopo IBAC:** se um veículo tiver 10 notas Pandurata + 4 de outros embarcadores, o fechamento considera só as 10. Se preferir exigir tudo, é só uma chave de configuração.
- **Offline:** o galpão/pátio pode ficar sem sinal. O contador funciona com o cache local; o fechamento em si exige sincronizar as bipagens pendentes, para não fechar com dado parcial.
- **App do motorista não é alterado** — a mudança fica na tela de conferência da expedição.

## Detalhes técnicos
- Escopo: `veiculo_nfs` → `notas_fiscais` → prefixo de CNPJ (emitente) ativo em `cnpj_envio_canhoto_auto`.
- Progresso: reuso de `get_conferencia_progress` por carga, agregado por veículo, contando `etiquetas.status = 'conferido'`.
- Novas colunas em `veiculos`: `conferencia_externa_fechada_em`, `_por`, `_com_pendencia`, `_pendencia_motivo` + RPC `fechar_conferencia_veiculo(p_veiculo_id, p_forcar, p_motivo)` security definer, validando o escopo no servidor (fail-closed) e exigindo admin para forçar.
- UI: painel de fechamento + selos em `src/pages/ConferenciaExterna.tsx`; leitura do selo em `PrestacaoContas.tsx` e Torre de Controle.
- Migração cria as colunas com GRANT/RLS conforme padrão do projeto; nenhuma alteração no fluxo `calculateBoxes` nem nas duas etapas de conferência.
