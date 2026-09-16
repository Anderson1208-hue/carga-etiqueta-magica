# 2ª conferência (Expedição) amarrada por placa do veículo — Conferência Interna

## Como funciona hoje
A Conferência Interna tem duas etapas:
1. **Etapa 1 — Separação:** bipagem dupla (código do cliente + QR da etiqueta), exclusiva da IBAC/Pandurata.
2. **Etapa 2 — Expedição:** bipagem única (só QR), NF por NF, dentro de uma carga. Não existe amarração com a placa do veículo que vai sair, nem um fechamento coletivo que impeça o veículo de sair com etiquetas não bipadas.

A 2ª etapa acontece no galpão, no momento da expedição/carregamento. O veículo já foi formado na Roteirização (`veiculo_nfs`), então a relação entre placa e notas fiscais já existe.

## Como ficaria
1. **Ao trocar para a Etapa 2 (Expedição), o operador escolhe a placa** em vez de buscar uma NF isolada. A tela mostra os veículos com notas pendentes de expedição.
2. **Ao abrir a placa, aparecem as NFs daquele veículo** e um painel de progresso geral:
   `Placa TLM1234 — 10 notas no escopo · 6 conferidas · 4 faltando`.
3. **O escopo obrigatório continua sendo IBAC/Pandurata:** notas cujo emitente (CNPJ raiz) esteja ativo em `cnpj_envio_canhoto_auto`. Notas de outros embarcadores aparecem para conferência, mas não contam no fechamento e não travam o veículo.
4. **A conferência em si continua igual:** o operador bipa o QR da etiqueta. Se a etiqueta pertence a uma NF daquela placa e já passou pela Etapa 1, ela é marcada como expedida (`status = 'conferido'`).
5. **Fechamento do veículo:** o botão **"Liberar veículo para saída"** só libera quando 100% das etiquetas do escopo estiverem bipadas. Enquanto faltar algo, o botão mostra o que falta e impede a liberação.
6. **Fechamento forçado:** administrador pode liberar com pendência, informando o motivo (nota retirada da carga, avaria, sobra de galpão, outro veículo). O motivo fica registrado e aparece na Prestação de Contas.
7. **Reflexos visuais:**
   - Lista de veículos na Roteirização ganha selo: *Aguardando expedição*, *Faltam N notas*, *Expedido*.
   - Prestação de Contas e Torre de Controle leem o mesmo selo.
   - Veículo só aparece como "pronto" quando a expedição está fechada.

## Pontos de atenção operacionais
- **NF retirada da carga depois da roteirização:** sem um caminho formal de "remover NF do veículo", o fechamento travaria por nota que fisicamente saiu do veículo. Por isso o fechamento forçado com motivo é obrigatório.
- **Múltiplas cargas na mesma placa:** a Roteirização já permite unir NFs de várias cargas em um veículo (`veiculo_nfs.carga_origem_id`). A conferência por placa usa essa mesma estrutura.
- **Offline:** o galpão/pátio pode ficar sem sinal. O cache local de etiquetas continua funcionando para bipagem rápida; o fechamento em si exige sincronizar os bipes pendentes, para não liberar um veículo com dados parciais.
- **Etapa 1 não muda:** a separação continua por NF/carga, com dupla bipagem para IBAC. A Etapa 2 passa a exigir a seleção da placa antes de bipar.
- **App do motorista não é alterado.**

## Detalhes técnicos
- **Escopo:** `veiculo_nfs` → `notas_fiscais` → CNPJ emitente com prefixo ativo em `cnpj_envio_canhoto_auto`.
- **Progresso:** agregar `get_conferencia_progress` por `carga_origem_id` + `numero_nf` de cada NF do veículo, contando etiquetas com `status = 'conferido'`.
- **Novas colunas em `veiculos`:**
  - `conferencia_interna_fechada_em` (timestamptz)
  - `conferencia_interna_fechada_por` (uuid)
  - `conferencia_interna_com_pendencia` (boolean, default false)
  - `conferencia_interna_pendencia_motivo` (text)
- **Novas RPCs (security definer, fail-closed):**
  - `conferencia_interna_status_veiculo(p_veiculo_id uuid) → jsonb`
  - `fechar_conferencia_interna_veiculo(p_veiculo_id uuid, p_forcar boolean, p_motivo text) → jsonb`
- **UI:** ajustar `src/pages/ConferenciaInterna.tsx` para, na Etapa 2, listar veículos e exibir painel de fechamento antes da bipagem.
- **Selos:** refletir status em `src/pages/Roteirizacao.tsx` (lista de veículos), `src/pages/PrestacaoContas.tsx` e `src/pages/TorreControle.tsx`.
- **Migração:** cria colunas com GRANT/RLS conforme padrão do projeto; nenhuma alteração na lógica `calculateBoxes` nem nas duas etapas de conferência.
