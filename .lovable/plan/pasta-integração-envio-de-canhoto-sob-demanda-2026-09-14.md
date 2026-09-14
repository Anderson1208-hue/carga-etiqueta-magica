# Pasta Integração + Envio de Canhoto sob demanda

## O que muda no menu

Dentro de Transporte, criar o grupo **Integração** e mover para dentro dele:

```text
Integração
├── Integração IBAC
├── Integração OK Entrega
└── Envio de Canhoto
```

Os itens IBAC e OK Entrega continuam com as mesmas permissões que já têm hoje; apenas mudam de lugar visualmente.

## Tela "Envio de Canhoto"

Nova tela para montar e disparar um envio manual de canhotos por e-mail, usando o mesmo remetente já configurado (canhotos@imagens.tlmlogistica.com.br).

Filtros de seleção:
- Embarcador (lista dos emitentes existentes)
- Período (data inicial / data final da baixa)
- Ou lista de NFs (colar números, um por linha ou separados por vírgula)

Ao buscar, a tela mostra a relação encontrada: NF, destinatário, cidade/UF, placa, data da baixa e se tem foto de canhoto. As notas sem foto aparecem separadas, como pendências, e não entram no PDF.

Envio:
- Campo de e-mail do destinatário (um ou vários, separados por vírgula) e um campo opcional de observação que vai no corpo do e-mail.
- Botão "Enviar" gera os arquivos (PDF dos canhotos em volumes + planilha das notas sem canhoto) e envia um e-mail com **links seguros de download**, válidos por 90 dias.
- Limite de segurança por envio (ex.: 500 notas) com aviso claro se a seleção passar disso.

Acesso: mesma lista da Integração OK Entrega (Fabiana Ferreira de Souza, Marcos Alves, Delma Pierre, Julio) mais administradores.

## Histórico na tela

Abaixo do formulário, uma tabela com os envios já feitos: data/hora, quem enviou, destinatários, filtro usado, quantidade de notas, quantidade sem canhoto, status (gerando / enviado / erro) e os links dos arquivos daquele envio.

## O que NÃO muda

- A rotina diária das 06:00 continua **apenas gerando e guardando** os arquivos, sem enviar e-mail, até sua autorização expressa.
- Nenhuma imagem é apagada; nada é alterado no app do motorista.
- Nenhum envio para IBAC ou OK Entrega é afetado.

## Detalhes técnicos

- `Sidebar.tsx`: novo subgrupo "Integração" dentro de Transporte reunindo `/integracoes/ibac`, `/integracoes/okentrega` e a nova rota `/integracoes/envio-canhoto`.
- Nova página `src/pages/EnvioCanhoto.tsx` + rota em `App.tsx`; hook de acesso reaproveitando o padrão de `useAcessoOkEntrega.ts`.
- Nova tabela `envios_canhoto_manuais` (filtro em JSONB, destinatários, contadores, status, arquivos, `criado_por`), com GRANTs e RLS restringindo leitura/gravação aos operadores autorizados.
- Nova Edge Function `enviar-canhotos-manual`: valida entrada com Zod, resolve as baixas (embarcador/período/NFs), reaproveita a lógica de PDF/ZIP/XLSX de `relatorio-canhotos-diario` (extraída para `_shared/canhotos-report.ts`), grava no bucket `relatorios-canhotos` em `manuais/<id>/`, gera signed URLs de 90 dias e chama `send-transactional-email` com um novo template `canhotos-envio-manual`.
- Processamento em lotes com re-invocação (mesmo padrão da rotina diária) para não estourar CPU/memória; status atualizado na tabela para a tela acompanhar.
- Deploy: `enviar-canhotos-manual`, `send-transactional-email` e `preview-transactional-email`.
