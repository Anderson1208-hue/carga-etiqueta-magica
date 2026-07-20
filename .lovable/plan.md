
# Fluxo Fiscal Completo — Transporte Rodoviário de Cargas

Objetivo: sair da simulação e chegar num pipeline de documentos fiscais reais (ou fictícios calibrados) cobrindo **CT-e, MDF-e, Averbação de Seguro, CIOT** e insumos correlatos (DACTE, DAMDFE, encerramento).

Este plano lista **o quê precisa entrar no sistema** (dados, telas, integrações) e **a ordem lógica de emissão**. Serve tanto como roadmap interno quanto como briefing pra você validar com GPT / mercado.

---

## 1. Cadastros base (pré-requisitos por emitente)

Já temos o Ebenezer cadastrado. Faltam campos pra virar 100% operacional:

**Emitente (expandir `configuracao_fiscal_emitente`)**
- Certificado A1 + senha (já temos)
- Séries: CT-e, CT-e OS, MDF-e (temos)
- Ambiente (homolog / prod) por documento
- Tomador padrão + CFOP padrão intra/inter
- **Convênios / Regimes Especiais** (chave nova): lista de textos livres a serem colados em `<infAdFisco>` / `<infCpl>` por combinação `(embarcador, UF origem, UF destino)`. Ex: Pandurata MG→RJ → Decreto MG 46.266/2013.
- Seguradora contratada (RCTR-C e RCF-DC): razão, CNPJ, nº apólice, nº averbação-mãe, endpoint API
- Contratos ANTT (RNTRC) e faixa CIOT
- Provedor de emissão (PlugNotas / Focus / TecnoSpeed) — chaves homolog e prod

**Veículo (expandir `veiculos`)**
- Placa, UF, RENAVAM, tara, capacidade (kg e m³)
- Tipo rodado, tipo carroceria, proprietário (CNPJ/CPF + tipo: TAC / ETC / próprio)
- RNTRC do proprietário
- **Combustível** (obrigatório MDF-e 3.0)
- Vínculos: reboque(s), condutor(es) habilitado(s)

**Motorista (novo cadastro `motoristas` ou expandir profile)**
- Nome, CPF, CNH, categoria, validade
- Dados bancários (PIX) para CIOT / pagamento
- Flag TAC (Transportador Autônomo) → obriga CIOT

**Embarcador (expandir `embarcadores`)**
- IE, regime tributário, CNAE
- Convênios aplicáveis (FK pra tabela de convênios)
- Tabela de frete vigente (FK)
- Tipo de operação padrão (Seco=01 / Refrigerado=02 / outros)
- Tomador do serviço (0=Remetente, 1=Expedidor, 2=Recebedor, 3=Destinatário, 4=Outros)

**Destinatário (já cobre 95%)**
- Confirmar IE, regime, endereço fiscal

---

## 2. Tabelas fiscais paramétricas (novas)

- `tabelas_frete` — versionadas por embarcador, com vigência (`vigente_de`, `vigente_ate`)
- `tabelas_frete_faixas` — tarifa por (zona, tipo carga, faixa peso)
- `zonas_entrega` — cidade/UF → zona (RJ Capital, Baixada, Interior, etc.)
- `convenios_fiscais` — texto legal + regra de aplicação (UF origem, UF destino, CFOP, CST)
- `tomadores_servico` — quem paga por embarcador
- `componentes_frete` — GRIS, Ad Valorem, Pedágio, TAS, Despacho, etc. (fórmula + base)

---

## 3. Fluxo operacional — ordem de emissão

```text
Roteirização confirmada
        │
        ▼
┌───────────────────────────┐
│ 1. Pré-CT-e (por NF)      │  ← código 01/02 por carga, calcula frete
│    - Aplica tabela        │
│    - Aplica convênio      │
│    - Gera prévia DACTE    │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 2. Emissão CT-e           │  ← 1 por NF (padrão Pandurata) ou agrupado
│    - Assina XML           │
│    - Envia SEFAZ          │
│    - Guarda protocolo     │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 3. Averbação Seguro       │  ← API seguradora, referencia chave CT-e
│    - RCTR-C obrigatório   │
│    - RCF-DC quando aplic. │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 4. CIOT (se TAC)          │  ← Banco/IPEF, gera nº operação
│    - Vincula CPF motor.   │
│    - Vincula CT-es        │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 5. MDF-e                  │  ← 1 por veículo/viagem
│    - Lista TODOS CT-es    │
│    - Lista NFes (bkp)     │
│    - Percurso UFs         │
│    - CIOT, seguro, ANTT   │
│    - Vale-pedágio se aplic│
└─────────────┬─────────────┘
              ▼
      ROTA ATIVA (torre)
              │
              ▼
┌───────────────────────────┐
│ 6. Eventos em rota        │
│    - CT-e: entrega, EPEC  │
│    - MDF-e: inclusão cond,│
│      pagamento operação   │
└─────────────┬─────────────┘
              ▼
┌───────────────────────────┐
│ 7. Encerramento MDF-e     │  ← obrigatório em até 30 dias
│    - Por UF de descarga   │
└───────────────────────────┘
```

---

## 4. Telas novas / evoluções

| Tela | Função |
|---|---|
| `/fiscal/emitentes` (evoluir) | Aba Convênios, aba Seguradora, aba Provedor |
| `/fiscal/tabelas-frete` | CRUD + upload Excel + versionamento |
| `/fiscal/zonas` | Cidade/UF → zona |
| `/fiscal/veiculos-fiscal` | Complementar dados do MDF-e no veículo |
| `/fiscal/motoristas` | CPF, CNH, TAC, dados bancários |
| `/fiscal/emissao/cte` | Fila de NFs → gerar CT-e (com código 01/02 por carga) |
| `/fiscal/emissao/mdfe` | Consolida CT-es do veículo → gera MDF-e |
| `/fiscal/eventos` | Cancelar, carta correção, encerramento, inclusão condutor |
| `/fiscal/monitor` | Painel único: CT-e emitido, Averbado, CIOT ok, MDF-e ok, Encerrado |

---

## 5. Integrações externas a contratar/pesquisar

Este é o bloco que faz sentido dividir com o GPT pra mapeamento de mercado:

1. **Provedor de emissão fiscal** (CT-e + MDF-e + eventos)
   - Candidatos: PlugNotas, TecnoSpeed, Focus NFe, Migrate, eNotas
   - Critérios: preço por doc, sandbox, webhooks, suporte a eventos, SLA

2. **Seguradora com API de averbação**
   - Candidatos: Tokio Marine, Junto Seguros (ex-JMalucelli), Sompo, Pottencial
   - Critérios: API REST, apólice-mãe, retorno de nº averbação síncrono

3. **CIOT / Meio de pagamento eletrônico do frete (PEF)**
   - Candidatos: Repom, Sem Parar Empresas, DBTrans, Ticket Log, Frete Fácil
   - Critérios: geração de CIOT via API, integração com PIX, faixa de tarifa

4. **Vale-pedágio obrigatório**
   - Candidatos: Sem Parar, ConectCar, Repom
   - Só obrigatório em rotas com pedágio interestadual > 4 eixos

5. **Rastreamento veicular (opcional, calibra GPS APK)**
   - Sascar, Ituran, Omnilink, Cobli — API de posição

---

## 6. Compliance / obrigações que precisam existir no sistema

- Guarda de XMLs por 5 anos (bucket dedicado, imutável)
- Backup do certificado A1 + alerta 30 dias antes do vencimento
- Alerta de MDF-e não encerrado > 25 dias
- Alerta de CT-e sem averbação > 24h
- Relatório SPED-Fiscal / EFD Contribuições (exportável)

---

## 7. Fases sugeridas

- **Fase A** (2 sprints): cadastros expandidos + tabela de frete + zonas + simulador comparativo (o que já estávamos fazendo)
- **Fase B** (2 sprints): integração provedor fiscal em **homologação** → emite CT-e fictício assinado
- **Fase C** (1 sprint): MDF-e homolog + eventos básicos
- **Fase D** (2 sprints): Averbação + CIOT + Vale-pedágio
- **Fase E** (1 sprint): Monitor unificado + alertas + produção

---

## 8. O que preciso de você agora

1. **Confirmar seguradora atual** da operação (RCTR-C) — já tem apólice?
2. **Motoristas são CLT ou TAC?** (Define se CIOT é obrigatório sempre ou só em parte)
3. **Provedor fiscal preferido** — já tem conta em algum (PlugNotas, TecnoSpeed)?
4. **Convênios ativos hoje** além do Pandurata MG (temos outros embarcadores com regime especial?)
5. Se quiser dividir com o GPT: mande esse plano inteiro e peça foco nos **itens 5.1 a 5.4** (comparativo de fornecedores brasileiros com API REST, preço médio, SLA e cases de transportadoras porte médio).
