---
name: Canhoto pendente de recuperação
description: Motorista não trouxe o canhoto — encerrar prestação de contas com pendência registrada, recuperar a foto depois em /canhotos-pendentes e só então enviar a imagem à IBAC
type: feature
---

Terceiro desfecho para a prestação de contas, além de "OK" e "pendência": **canhoto pendente de recuperação**
(`baixas_entrega.conferencia_status = 'canhoto_pendente'`). A entrega continua válida (status, GPS, recebedor);
só a imagem fica devendo.

- Marcação: botão âmbar (ícone `FileWarning`) na linha da NF em `PrestacaoContas.tsx` → RPC
  `registrar_canhoto_pendente(baixa_id, motivo, obs)`. Motivo obrigatório:
  `esquecido_motorista | perdido | retido_no_cliente | ilegivel_refazer | outro`.
  Grava `canhoto_pendente_motivo/obs/em/por` e evento `canhoto_pendente` em `nf_eventos`.
- Encerramento: permitido com essas linhas. `conciliar_veiculo_ibac` classifica como
  `canhoto_pendente_recuperacao` — **atenção** dentro do prazo, **erro** após 2 dias úteis
  (`canhoto_prazo_vencido`, fuso America/Sao_Paulo).
- `ibac-enfileirar-canhotos` ignora baixas com `conferencia_status = 'canhoto_pendente'`,
  então o encerramento não sobe imagem dessas NFs.
- Recuperação: tela `/canhotos-pendentes` (`src/pages/CanhotosPendentes.tsx`, RPC
  `listar_canhotos_pendentes`). O operador anexa foto/digitalização, o navegador gera a tira
  paisagem 1536×240 @150dpi (`blobCanhotoRecibo`) com prévia, e a RPC
  `registrar_canhoto_recuperado(baixa_id, foto_path, foto_recibo_path)` grava as fotos,
  volta o status para `ok`, zera `imagem_ibac_tentativas` e registra `canhoto_recuperado`.
  Em seguida a tela chama `ibac-enfileirar-canhotos` com `{ baixa_ids: [...] }` e `ibac-sync` —
  não espera novo encerramento de prestação de contas.
- Reabrir conferência limpa os campos `canhoto_pendente_*`.
