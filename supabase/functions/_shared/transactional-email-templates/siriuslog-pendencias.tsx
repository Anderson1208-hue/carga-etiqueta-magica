import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface NotaItem { nf?: string; status?: string; erro?: string }
interface Props { quando?: string; total?: number; notas?: NotaItem[] }

const SiriusPendencias = ({ quando = '', total = 0, notas = [] }: Props) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>Tracking Pandurata: notas sem atualização no portal Sirius Log</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Tracking Pandurata — notas sem envio</Heading>
        <Hr style={hr} />
        <Section>
          <Text style={text}>
            Na rodada das 15:00 de {quando}, {total} nota(s) continuaram sem atualização no portal Sirius Log:
          </Text>
          {notas.map((n, i) => (
            <Text key={i} style={item}>
              <strong>NF {n.nf}</strong>
              {n.status ? ` — portal: ${n.status}` : ''}
              {n.erro ? ` — motivo: ${n.erro}` : ''}
            </Text>
          ))}
          <Text style={text}>
            Essas notas serão tentadas de novo na próxima rodada. Viagens não localizadas dependem da
            Bauducco cadastrar a viagem no portal.
          </Text>
          <Text style={muted}>TLM Logística — rotina de tracking Pandurata (Sirius Log)</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SiriusPendencias,
  subject: 'Tracking Pandurata: notas sem atualização no portal Sirius Log',
  displayName: 'Pendências do tracking Pandurata (2ª rodada)',
  to: 'arquivostlm@tlmlogistica.com.br',
  previewData: {
    quando: '30/09/2026 15:00',
    total: 2,
    notas: [
      { nf: '762288', status: 'Na filial da transportadora', erro: 'sem_status_enviado: situacao=viagem_nao_encontrada' },
      { nf: '759790', status: 'Em trânsito para cliente', erro: '422 Resource unprocessable' },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', padding: '24px', maxWidth: '560px' }
const h1 = { color: '#b42318', fontSize: '22px', margin: '0 0 8px' }
const hr = { borderColor: '#e6ebf1', margin: '16px 0' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px' }
const item = { color: '#333333', fontSize: '14px', lineHeight: '20px', margin: '4px 0' }
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '24px' }
