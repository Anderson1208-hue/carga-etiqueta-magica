# Retomar teste IBAC — envio do canhoto por API

## Onde o teste parou (verificado agora no banco)

- `ibac_config_envio`: `envio_ativo = true`, `modo_imagem = base64`, `codigo_evento_entrega = 01`, `max_imagem_kb = 1024`, `whitelist_nfs = [3897130]`.
- De-para: `envio_canhoto → 01` ativo. (Os outros eventos estão inativos — nada mais além do canário sai.)
- Fila `envio_canhoto`: 5 eventos pendentes (3896307, 3896308, 3897255, 3897131, 3897130), todos com `foto_path`.
- **A nota canário falhou 4 vezes** com: `Imagem 3425 KB excede o limite de 1024 KB.` Nenhuma requisição chegou à IBAC (nada em `ibac_log_envios` desde 12/06).

Causa raiz: a foto do canhoto é capturada em alta qualidade (largura 2000, quality 92) para leitura por IA dos clientes; em base64 ela ainda cresce ~33%. O limite de 1 MB foi conservador e barra o envio antes do POST. Não é erro da IBAC.

## O que fazer

1. **Compactar a imagem no `ibac-sync` antes do base64** (não mexer na foto original armazenada):
   - redimensionar para largura máx. 1600 px e recomprimir em JPEG (qualidade ~72) usando `ImageScript` (`https://deno.land/x/imagescript`), preservando legibilidade do canhoto;
   - só falhar se, **após** a compressão, o payload continuar acima do limite;
   - gravar no `erro_mensagem` o tamanho original e o comprimido, para diagnóstico.
2. **Subir `max_imagem_kb` para 2048** na configuração de envio (margem para canhotos com muitas NFs), mantendo a compressão como primeira linha.
3. **Zerar as tentativas** dos 5 eventos pendentes (o canário está com 4 de 5 e seria descartado no próximo ciclo).
4. **Rodar o canário**: whitelist só com `3897130`, botão "Rodar sync agora" na aba **Envio** de `/integracao-ibac`. Conferir em `ibac_log_envios` o `response_status` e o corpo da resposta da IBAC.
5. **Se o canário voltar 200/201**: incluir as 4 notas restantes na whitelist e rodar de novo; confirmar `baixas_entrega.imagem_ibac_enviada_em` preenchido.
6. **Se a IBAC recusar o formato**: alternar `modo_imagem` para `url` (link assinado de 7 dias) e repetir o canário — nenhum código muda, é só o toggle da tela.

## Detalhes técnicos

- Arquivo alterado: `supabase/functions/ibac-sync/index.ts`, apenas no bloco `evento_interno === "envio_canhoto"` com `modo_imagem === "base64"`.
- A compressão roda por item, com try/catch: se a lib falhar, usa os bytes originais e aplica a regra de limite atual (sem regressão).
- Continua **1 requisição por NF** e as **duas etapas** (baixa sem imagem + canhoto no evento 01), como você definiu.
- O kill switch e a whitelist seguem controlando tudo; fora da whitelist nada é postado.
