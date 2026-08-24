# Conferência de canhotos rápida + envio em volume à IBAC

## Respostas às suas dúvidas

**1. A foto aparece em retrato — o motorista precisa fotografar em paisagem?**
Não. O motorista deve continuar fotografando como está hoje (retrato, celular na vertical). O padrão "paisagem" não é da foto do motorista: é da **imagem final entregue ao cliente** (OK Entrega exige a tira do recibo em 1536 x 240 px, e a IBAC recebe o mesmo enquadramento de tira). Esse recorte já é feito pelo sistema, no navegador, a partir da foto retrato original. Pedir paisagem ao motorista pioraria: a tira do recibo ficaria menor dentro do quadro e menos legível.

O que está errado hoje é só a **visualização na Prestação de Contas**: ela mostra a foto original inteira (retrato, 1600x1200 ou maior), sem recorte e sem correção de rotação — por isso "não parece o padrão".

**2. Por que a abertura do canhoto é lenta?**
Cada clique na lupa faz uma chamada ao servidor para gerar um link assinado da foto e só então baixa a imagem **em resolução cheia** (centenas de KB a alguns MB). Nada é pré-carregado e não há navegação entre fotos: para 50 notas são 50 cliques, 50 chamadas e 50 downloads completos — um a um.

**3. Volume por veículo (50+ notas) e envio das imagens de 3 em 3**
O gargalo do envio é a Edge Function decodificar várias fotos grandes em base64 na mesma execução (estouro de memória). A solução não é enviar manualmente em lotes: é enviar a **tira recortada** (dezenas de KB em vez de MB) e deixar a função se auto-encadear até a fila esvaziar.

## O que será construído

### A. Visualizador de canhotos para conferência em massa (Prestação de Contas)

- **Contact sheet (folha de contatos)**: um novo modo "Conferir canhotos" abre uma grade com todas as fotos do veículo já enquadradas na tira do recibo, várias por tela — o operador valida assinatura/data/NF em blocos, sem abrir uma por uma.
- **Links assinados em lote**: um único pedido gera os links de todas as fotos do veículo (em vez de 1 pedido por clique), com cache durante a sessão.
- **Pré-carregamento**: as próximas imagens da lista são baixadas em segundo plano enquanto o operador olha a atual.
- **Visualizador com navegação**: setas ← →, teclado, contador "12 / 53", zoom e botão de girar 90°. Da própria tela o operador marca **Conferido** / **Pendência** / **Nova foto** e avança automaticamente para a próxima.
- **Correção automática de orientação**: a foto é exibida já rotacionada conforme os metadados (EXIF) e com a tira do recibo destacada; um toque alterna entre "tira" e "foto inteira".

### B. Envio das imagens à IBAC em volume

- Ao gravar a baixa, o app do motorista passa a salvar **também a tira 1536x240** já pronta (a foto original continua intacta no bucket). Isso reduz cada imagem de MB para dezenas de KB.
- O `ibac-sync` passa a usar essa tira, com lote pequeno e seguro de imagens por execução e **auto-encadeamento**: ao terminar um lote, ele mesmo chama a próxima rodada até a fila do veículo zerar. Você clica uma vez em "Encerrar prestação de contas" e o sistema envia as 50+ imagens sozinho.
- Para os canhotos que já existem sem a tira, um botão de reprocessamento gera a tira sob demanda.
- Painel de progresso na aba **Envio**: enviadas / na fila / erros por veículo.

Nada disso libera transmissão: `envio_ativo` continua **false** e o piloto segue restrito às placas LNA5B11 e DTB9J73.

## Detalhes técnicos

- `src/pages/PrestacaoContas.tsx`: substituir `verFoto` (signed URL individual) por `createSignedUrls` em lote + `Map` de cache; novo componente `CanhotoViewer` (grade + lightbox com navegação e ações inline).
- Reaproveitar `src/lib/okentrega-canhoto.ts` (`recortarRecibo`, `AJUSTE_PADRAO`) para gerar a pré-visualização em tira no cliente via canvas; nenhuma alteração no bucket original.
- `src/pages/BaixaEntrega.tsx`: após upload da foto, gerar e subir `foto_recibo_path` (JPEG 1536x240, 150 dpi). Coluna nova em `baixas_entrega` via migração.
- `supabase/functions/ibac-sync/index.ts`: preferir `foto_recibo_path` no modo base64; `CANHOTO_BATCH` dedicado (3–5 por execução) e re-invocação da própria função enquanto houver `envio_canhoto` pendente no escopo, com guarda contra loop infinito.
- Manter `useNativeCamera` como está (quality 92 / width 2000) — a qualidade da origem é o que garante legibilidade da tira.
