# Rotina diária de canhotos: arquivo consolidado + pendências

Objetivo: todo dia às 06:00 (Brasília), gerar automaticamente os arquivos do dia anterior (já fechado) e enviar por e-mail para `faturamento@tlmlogistica.com.br`. Nada é apagado — os arquivos ficam guardados e o histórico permanece acessível.

## O que será gerado por dia

1. **PDF de canhotos** — uma página por NF entregue com foto, contendo a imagem do canhoto e os dados de cabeçalho (NF, destinatário, cidade, placa, motorista, data/hora da baixa, recebedor).
2. **ZIP de imagens** — as fotos originais (sem recorte), nomeadas `NF_<numero>_<placa>.jpg`, para uso em portais de clientes.
3. **Excel de pendências** — NFs entregues no dia **sem foto de canhoto**, com NF, destinatário, cidade, placa, motorista, data da baixa, motivo/observação da pendência e status atual.

Resumo no corpo do e-mail: total de entregas do dia, quantas com canhoto, quantas sem canhoto e % de cobertura.

## Escopo dos dados

- Considera as baixas registradas no dia anterior (00:00–23:59, horário de Brasília).
- Cobre todos os embarcadores (não é restrito a Pandurata/IBAC).
- "Sem canhoto" = entrega registrada sem imagem anexada ou marcada como pendência de canhoto.

## Entrega e retenção

- Os três arquivos são gravados em um novo armazenamento privado de relatórios, organizado por data (`2026/09/AAAA-MM-DD/...`).
- O e-mail traz o resumo e **links seguros de download** (o PDF e o ZIP podem passar de 20–30 MB e seriam rejeitados como anexo). O Excel de pendências, sendo pequeno, vai também como anexo.
- Nada é excluído: sem rotina de limpeza, sem expiração de arquivos.
- Uma tela simples de histórico (dentro de Integração OK Entrega) lista os relatórios já gerados e permite baixar qualquer dia anterior — visível aos mesmos operadores já autorizados naquele módulo.
- Se um dia falhar, a rotina registra o erro, tenta novamente na próxima hora e é possível regerar qualquer data manualmente.

## Pré-requisito: envio de e-mail

O projeto ainda não tem domínio de envio configurado, então hoje o sistema não consegue disparar e-mails. Antes de ligar a rotina, é preciso habilitar o envio pelo domínio `tlmlogistica.com.br` (é feito por um assistente de configuração, com registros de DNS informados na hora). Enquanto o DNS não estiver validado, a rotina já gera e guarda os arquivos normalmente — só o disparo do e-mail fica pendente.

## Detalhes técnicos

- Nova função `relatorio-canhotos-diario` (Edge Function) com parâmetro opcional `data` para regeração manual e modo `dry_run`.
- Novo bucket privado `relatorios-canhotos` + tabela `relatorios_canhotos_diarios` (data de referência, contadores, caminhos dos 3 arquivos, status, erro, enviado_em) com RLS: leitura para operadores ativos, escrita apenas pelo serviço.
- Idempotência por `data_referencia` única; reexecução regenera e sobrescreve os arquivos daquele dia sem duplicar e-mail (campo `enviado_em`).
- Fonte de dados: `baixas_entrega` + `notas_fiscais` + `veiculos`/`motoristas`, com paginação determinística em lotes; imagens lidas do bucket `comprovantes` (`foto_path`).
- PDF montado no servidor (jsPDF), imagens redimensionadas antes de embutir para conter o tamanho; ZIP via fflate; Excel via SheetJS.
- Agendamento: `pg_cron` diário `0 9 * * *` (09:00 UTC = 06:00 Brasília) chamando a função. Job de reconciliação já existente não é alterado; um segundo cron leve às 10:00 UTC reprocessa apenas se o dia anterior não tiver saído com sucesso.
- E-mail via infraestrutura de e-mail do Lovable Cloud (fila + retentativas), destinatário configurável em tabela para não ficar fixo no código.
- Sem qualquer alteração no app do motorista e sem alteração nos fluxos de integração IBAC/OK Entrega.
