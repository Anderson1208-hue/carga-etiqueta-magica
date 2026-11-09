import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { integracao?: string; tentativas?: number; erro?: string; quando?: string }

const IntegracaoFalha = ({ integracao = '', tentativas = 5, erro = '', quando = '' }: Props) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>Integração sem retorno — {integracao}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Integração sem retorno</Heading>
        <Hr style={hr} />
        <Section>
          <Text style={text}><strong>Integração:</strong> {integracao}</Text>
          <Text style={text}><strong>Tentativas:</strong> {tentativas} (de 10 em 10 minutos), todas sem sucesso</Text>
          <Text style={text}><strong>Último erro:</strong> {erro}</Text>
          <Text style={text}><strong>Última tentativa:</strong> {quando}</Text>
          <Text style={text}>O status das notas não foi atualizado nesta rodada. A próxima rodada no horário normal tentará de novo. Se o erro for de login, confira a senha do portal.</Text>
          <Text style={muted}>TLM Logística — monitoramento das integrações</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: IntegracaoFalha,
  subject: (d: Record<string, any>) => `Integração sem retorno — ${d.integracao ?? ''} ${d.dia ?? ''}`,
  displayName: 'Falha na consulta de integração',
  to: 'arquivostlm@tlmlogistica.com.br',
  previewData: { integracao: 'Cacau Show (IBAC/IBAE)', tentativas: 5, erro: 'Falha no login do portal Cacau Show', quando: '09/11/2026 07:40', dia: '09/11/2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', padding: '24px', maxWidth: '560px' }
const h1 = { color: '#b42318', fontSize: '22px', margin: '0 0 8px' }
const hr = { borderColor: '#e6ebf1', margin: '16px 0' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px' }
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '24px' }
