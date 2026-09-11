import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface TesteEnvioProps {
  nome?: string
}

const TesteEnvio = ({ nome = 'Anderson' }: TesteEnvioProps) => (
  <Html>
    <Head />
    <Preview>E-mail de teste — Carga Fácil</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Carga Fácil</Heading>
        <Hr style={hr} />
        <Section>
          <Text style={text}>Olá, {nome}!</Text>
          <Text style={text}>
            Este é um e-mail de teste do remetente{' '}
            <strong>canhotos@imagens.tlmlogistica.com.br</strong>.
          </Text>
          <Text style={text}>
            Se você recebeu esta mensagem, a configuração de envio de e-mails do
            sistema está funcionando corretamente.
          </Text>
          <Text style={muted}>
            TLM Logística — Relatórios e notificações automáticas
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TesteEnvio,
  subject: 'Teste de envio — Carga Fácil',
  displayName: 'E-mail de teste',
  previewData: { nome: 'Anderson' },
} satisfies TemplateEntry

const main = { backgroundColor: '#f6f9fc', fontFamily: 'Arial, sans-serif' }
const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '24px',
  borderRadius: '8px',
  maxWidth: '560px',
}
const h1 = { color: '#1a3a5c', fontSize: '22px', margin: '0 0 8px' }
const hr = { borderColor: '#e6ebf1', margin: '16px 0' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px' }
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '24px' }
