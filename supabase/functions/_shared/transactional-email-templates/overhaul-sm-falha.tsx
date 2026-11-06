import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { placa?: string; data?: string; motivo?: string }

const OverhaulSmFalha = ({ placa = '', data = '', motivo = '' }: Props) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>Falha ao gerar SM Overhaul — {placa}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>SM Overhaul não gerada</Heading>
        <Hr style={hr} />
        <Section>
          <Text style={text}><strong>Placa:</strong> {placa}</Text>
          <Text style={text}><strong>Data da rota:</strong> {data}</Text>
          <Text style={text}><strong>Motivo:</strong> {motivo}</Text>
          <Text style={text}>Corrija o motivo e use o botão "Gerar SM" na Roteirização de novo, ou abra a SM manualmente no portal.</Text>
          <Text style={muted}>TLM Logística — geração de SM Overhaul</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OverhaulSmFalha,
  subject: (d: Record<string, any>) => `Falha ao gerar SM Overhaul — ${d.placa ?? ''} ${d.data ?? ''}`,
  displayName: 'Falha na geração de SM Overhaul',
  to: 'arquivostlm@tlmlogistica.com.br',
  previewData: { placa: 'LLJ6E62', data: '06/11/2026', motivo: 'Cliente sem cadastro na Overhaul: CNPJ 17611014033824' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', padding: '24px', maxWidth: '560px' }
const h1 = { color: '#b42318', fontSize: '22px', margin: '0 0 8px' }
const hr = { borderColor: '#e6ebf1', margin: '16px 0' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px' }
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '24px' }
