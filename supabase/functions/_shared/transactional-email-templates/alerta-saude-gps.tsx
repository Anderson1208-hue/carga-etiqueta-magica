import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { verificadoEm?: string; problemas?: string[]; detalhes?: string[] }

const AlertaSaude = ({ verificadoEm = '', problemas = [], detalhes = [] }: Props) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>Alerta: problema no app ou no GPS</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Alerta do sistema e do GPS</Heading>
        <Hr style={hr} />
        <Section>
          <Text style={text}>Na verificação de {verificadoEm}, foi encontrado:</Text>
          {problemas.map((p, i) => (<Text key={i} style={item}><strong>• {p}</strong></Text>))}
          {detalhes.length ? <Text style={text}>Detalhes:</Text> : null}
          {detalhes.map((d, i) => (<Text key={i} style={item}>{d}</Text>))}
          <Text style={text}>Nada foi alterado automaticamente. Avise no chat para investigar.</Text>
          <Text style={muted}>TLM Logística — acompanhamento de 2 dias</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AlertaSaude,
  subject: 'Alerta: problema no app ou no GPS',
  displayName: 'Alerta de saúde do app e GPS',
  to: 'anderson.teixeira@tlmlogistica.com.br',
  previewData: {
    verificadoEm: '28/09/2026 18:00',
    problemas: ['Nenhum GPS recebido há 20 minutos com 10 rotas ativas'],
    detalhes: ['KYY3041 — sem GPS há 25 min'],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', padding: '24px', maxWidth: '560px' }
const h1 = { color: '#b42318', fontSize: '22px', margin: '0 0 8px' }
const hr = { borderColor: '#e6ebf1', margin: '16px 0' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px' }
const item = { color: '#333333', fontSize: '14px', lineHeight: '20px', margin: '4px 0' }
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '24px' }
