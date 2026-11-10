import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { link?: string; ocorrencias?: number; total?: number; quando?: string; embarcadores?: string }

const Email = ({ link = '#', ocorrencias = 0, total = 0, quando = '', embarcadores = '' }: Props) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>Consolidado de divergências atualizado — {quando}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Consolidado de divergências de recebimento</Heading>
        <Text style={text}>Atualizado em {quando} após um novo lançamento.</Text>
        <Text style={text}><strong>{ocorrencias}</strong> ocorrência(s), <strong>{total}</strong> linha(s) na planilha.</Text>
        {embarcadores ? <Text style={text}>{embarcadores}</Text> : null}
        <Text style={text}>A planilha tem a aba TODAS e uma aba por embarcador, com filtro em todas as colunas.</Text>
        <Button href={link} style={btn}>Baixar planilha consolidada</Button>
        <Text style={muted}>O link vale por 7 dias. Um consolidado mais recente pode ser baixado a qualquer momento na tela Divergência de Recebimento. TLM Logística.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Consolidado de divergências — ${d.quando ?? ''}`,
  displayName: 'Consolidado de divergências',
  to: 'gessica.rodrigues@tlmlogistica.com.br',
  previewData: { link: 'https://example.com', ocorrencias: 12, total: 15, quando: '10/11/2026 15:45', embarcadores: 'IBAC: 10 linha(s) · IBAE: 5 linha(s)' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', padding: '24px', maxWidth: '560px' }
const h1 = { color: '#1f2937', fontSize: '22px', margin: '0 0 8px' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px' }
const btn = { backgroundColor: '#1d4ed8', color: '#ffffff', padding: '12px 20px', borderRadius: '6px', fontSize: '15px', textDecoration: 'none' }
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '24px' }
