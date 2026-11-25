import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { nf?: string; carga?: string; placa?: string; destinatario?: string; data?: string; operador?: string }

const Email = ({ nf = '', carga = '', placa = '', destinatario = '', data = '', operador = '' }: Props) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>NF {nf} — Falta Direta do CD</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>NF {nf} — Falta Direta do CD</Heading>
        <Text style={text}>A NF <strong>{nf || '—'}</strong> é <strong>Falta Direta do CD</strong>.</Text>
        <Text style={text}>A nota foi lançada como <strong>falta total</strong> na divergência de recebimento e passou para o status <strong>Falta Direta do CD</strong>. Ela não aparece na preparação e não pode ser agendada.</Text>
        <Text style={text}><strong>NF:</strong> {nf || '—'} &nbsp; <strong>Carga:</strong> {carga || '—'} &nbsp; <strong>Placa:</strong> {placa || '—'} &nbsp; <strong>Status da NF:</strong> Falta Direta do CD</Text>
        {destinatario ? <Text style={text}><strong>Destinatário:</strong> {destinatario}</Text> : null}
        <Text style={text}><strong>Data:</strong> {data} &nbsp; <strong>Lançado por:</strong> {operador || '—'}</Text>
        <Text style={muted}>Expresso Ebenezer.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `NF ${d.nf ?? ''} — Falta Direta do CD`,
  displayName: 'Falta Direta do CD',
  to: 'arquivostlm@tlmlogistica.com.br',
  previewData: { nf: '4400120', carga: '226834', placa: 'ABC1D23', destinatario: 'Cliente Exemplo', data: '25/11/2026', operador: 'Gilson' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', padding: '24px', maxWidth: '600px' }
const h1 = { color: '#b42318', fontSize: '22px', margin: '0 0 8px' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px', margin: '6px 0' }
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '24px' }
