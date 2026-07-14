---
name: Emitente fiscal piloto
description: CNPJ, IE, séries CT-e/MDF-e, endereço, RNTRC, regime e certificado A1 do emitente piloto do módulo fiscal
type: reference
---

# Emitente fiscal — piloto

- **Razão social:** Expresso Ebenezer Transportes Ltda.
- **CNPJ emitente:** 31.598.974/0001-42
- **Inscrição Estadual:** 12.149.65-4
- **Regime tributário:** Lucro Presumido
- **Endereço:** Rua da Regeneração, 161 - G — CEP 21.040-170
- **RNTRC:** 051278555
- **Série CT-e:** 1
- **Série MDF-e:** 2
- **Certificado Digital A1:** disponível, validade **03/12/2026**
- **Ambientes SEFAZ liberados:** CT-e homolog + produção, MDF-e homolog + produção

## Pendências externas (bloqueiam Fase 3+)
- Contrato PlugNotas (ou emissor equivalente) com credenciais homolog + prod
- Contador definido (regime tributário, CST/CFOP, alíquotas ICMS por UF)
- Planilha IE / regime tributário dos embarcadores e destinatários (Fase 1 preenchimento)
- Tabela de frete vigente (Fase 2)
- Endereço fiscal completo do emitente + código IBGE + RNTRC (preencher em /fiscal/configuracao)

## Onde está no sistema
Tela: **/fiscal/configuracao** (admin only) — tabela `configuracao_fiscal_emitente`.
