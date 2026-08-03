# Teste IBAC — canhoto por API com 5 NFs da Cacau (KYN7B08)

## Situação verificada agora

- As 5 notas (3934679, 3934680, 3934484, 3934485, 3934550) estão na **mesma carga**, placa **KYN7B08**, `status_entrega = CARGA NO DEPOSITO`, carga `aberta`, **sem baixa e sem foto**.
- Todas do mesmo destinatário **ASSB / Cacau Show 17.611.014/0338-24** — caso real de "1 entrega, 5 NFs". Esse CNPJ já está ativo no envio automático de canhoto.
- KYN7B08 já tem veículo com código de acesso **5D1703** (07/07, sem prestação de contas).
- Envio: `envio_ativo = true`, `modo_imagem = base64`, `codigo_evento_entrega = 01`, `max_imagem_kb = 1024`, `whitelist_nfs = [3897130]`.
- De-para: só `envio_canhoto → 01` está ativo; `entrega_realizada` (cód. 1) está **inativo**.

Três travas para o teste rodar como você quer: a etapa 1 não sairia (evento inativo), a imagem estoura o limite de 1 MB (foto sai ~3,4 MB por ser 2000 px / q92), e a whitelist ainda aponta para a nota antiga.

## O que será feito

### 1. Preparar o veículo de teste (sem expedir de verdade)
- Vincular as 5 NFs a um veículo de teste da placa KYN7B08 e deixar a carga/rota em estado que faça as notas aparecerem na tela **Baixa de Entrega** do celular.
- Gerar/confirmar o código de acesso do motorista para abrir `/motorista-acesso` no celular e bater a foto real do canhoto (uma foto para a entrega das 5 NFs).

### 2. Compressão da imagem no envio
- No `ibac-sync`, antes de gerar o base64: redimensionar para largura máx. 1600 px e recomprimir JPEG (~q72), preservando legibilidade do canhoto. A foto original armazenada **não** é alterada.
- Só falhar se, **após** a compressão, ainda passar do limite; registrar no erro o tamanho original e o comprimido.
- Subir `max_imagem_kb` para 2048 como margem.

### 3. Duas etapas, com 5 minutos de intervalo
- Ativar o de-para do evento de entrega (etapa 1) com **código 01**, conforme sua definição.
- Etapa 1 (entregue, sem imagem): dispara no ato da baixa pelo trigger e é postada no próximo ciclo do sync.
- Etapa 2 (canhoto no evento 01, base64): enfileirada manualmente ~5 min depois, sem mexer no cron das 23h.
- Whitelist ajustada para as 5 notas do teste; nada fora dela é postado.

### 4. Execução e verificação
- Após a foto: rodar o sync, conferir em `ibac_log_envios` o `response_status` e o corpo da resposta da IBAC na etapa 1.
- 5 minutos depois: enfileirar e enviar os canhotos; conferir resposta e `baixas_entrega.imagem_ibac_enviada_em` preenchido.
- Relatório final para o Igor: horário de cada etapa, corpo enviado (sem o base64), status e tamanho da imagem.

### 5. Plano B (sem mudar código)
- Se a IBAC recusar base64: alternar `modo_imagem` para `url` (link assinado de 7 dias) e repetir — é só o toggle da aba **Envio**.

## Dúvidas que seguem com o Igor (não bloqueiam o teste)
- O "JPNG" é base64 no corpo do JSON ou URL/multipart?
- O evento 01 chegando duas vezes (primeiro sem imagem, depois com imagem) é aceito ou gera duplicidade do lado deles?

## Detalhes técnicos
- `supabase/functions/ibac-sync/index.ts`: compressão só no bloco `evento_interno === "envio_canhoto"` com `modo_imagem === "base64"`, via `ImageScript`, com try/catch — se a lib falhar, usa os bytes originais e aplica a regra de limite atual (sem regressão).
- Dados: `ibac_config_envio` (whitelist + `max_imagem_kb`), `ibac_de_para_eventos` (ativar evento de entrega com 01), vínculo das 5 NFs ao veículo de teste.
- Continua **1 requisição por NF** e o kill switch segue no comando: nada sai sem sua liberação.

## Autorização
Nada será executado até você autorizar. A execução em si (bater a foto e rodar as duas etapas) fica para o momento que você combinar com o Igor.
