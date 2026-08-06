---
name: DACTE — layout de referência (Praxio/Ebenezer)
description: O DACTE emitido hoje pelo Praxio (Expresso Ebenezer) é o layout OFICIAL a ser mantido na emissão própria de CT-e. Não redesenhar.
type: constraint
---

# DACTE — layout a ser mantido

Quando o módulo fiscal passar a emitir CT-e (PlugNotas ou emissor equivalente),
o **DACTE deve reproduzir exatamente o layout já usado hoje** pelo Praxio para o
emitente Expresso Ebenezer Transportes Ltda. (CNPJ 31.598.974/0001-42).

**Why:** os embarcadores (Docile, Pandurata, etc.) e os destinatários já
conferem/arquivam o documento nesse formato; mudar o desenho gera retrabalho
operacional e recusa no recebimento.

## Elementos obrigatórios do modelo de referência (DACTE nº 136169, série 1, modelo 57)

- Cabeçalho: razão social + endereço/CNPJ/IE/telefone do emitente à esquerda,
  bloco "DACTE — Documento Auxiliar do Conhecimento de Transporte Eletrônico"
  ao centro, MODAL/RODOVIÁRIO à direita.
- Faixa com MODELO / SÉRIE / NÚMERO / FL / DATA E HORA DE EMISSÃO / INSC. SUFRAMA.
- Chave de acesso em grupos de 4 dígitos + **QR Code** do portal nacional e
  frase de consulta de autenticidade (`www.cte.fazenda.gov.br/portal`).
- Linha TIPO DO CT-E / TIPO DO SERVIÇO / GLOBALIZADO / IMPR. GLOBALIZADO.
- CFOP + natureza da prestação; INÍCIO e TÉRMINO da prestação (município/UF).
- Blocos completos: REMETENTE, DESTINATÁRIO, EXPEDIDOR, RECEBEDOR, TOMADOR DO
  SERVIÇO (endereço, bairro, CEP, CNPJ/CPF, IE, município, UF, país, fone).
- Bloco de carga: produto predominante, outras características, QTD/CARGA,
  peso bruto, peso BC cálculo, peso aferido, cubagem M³, qtd. volumes,
  valor total da mercadoria.
- **COMPONENTES DO VALOR DA PRESTAÇÃO DE SERVIÇO** em colunas (FRETE PESO,
  FRETE VALOR, CAT, PEDAGIO, GRIS, etc.) + VALOR TOTAL DO SERVIÇO e
  VALOR A RECEBER.
- Bloco de imposto: situação tributária, base de cálculo, alíq. ICMS,
  valor ICMS, % red. BC.
- DOCUMENTOS ORIGINÁRIOS: TP DOC / CNPJ-CPF EMITENTE / CHAVE / NÚMERO NFE
  (uma linha por NF-e do CT-e).
- OBSERVAÇÕES (seguradora, apólice, peso cubado, origem/destino, placas).
- USO EXCLUSIVO DO EMISSOR DO CT-E / RESERVADO AO FISCO.
- INFORMAÇÕES DO MODAL RODOVIÁRIO com **RNTRC da empresa**.
- Recibo de entrega (declaração, assinatura/carimbo, chegada e saída data/hora).
- Canhoto/rodapé com código de barras Code128 da chave de acesso,
  CNPJ emitente, nº protocolo, série/número, forma de pagamento,
  tomador do serviço, valor total e séries/números dos documentos originários.

## Referência visual
Foto do DACTE 136169 (Docile Alimentos → Doce Mel da Barata Ribeiro),
enviada pelo usuário em 06/08/2026.
