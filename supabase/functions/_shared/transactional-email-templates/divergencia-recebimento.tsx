import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Item { nf?: string; codigo?: string; descricao?: string; tipo?: string; quantidade?: number; observacao?: string; fotos?: number }
interface Props { carga?: string; placa?: string; data?: string; operador?: string; itens?: Item[]; canceladas?: string[] }

const Email = ({ carga = '', placa = '', data = '', operador = '', itens = [], canceladas = [] }: Props) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>Divergências no recebimento — carga {carga}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Divergências no recebimento</Heading>
        <Text style={text}><strong>Carga:</strong> {carga || '—'} &nbsp; <strong>Placa:</strong> {placa || '—'}</Text>
        <Text style={text}><strong>Data:</strong> {data} &nbsp; <strong>Enviado por:</strong> {operador}</Text>
        <Hr style={hr} />
        {itens.map((i, k) => (
          <Section key={k} style={item}>
            <Text style={text}><strong>NF {i.nf}</strong> — {i.tipo}{i.codigo ? ` — cód. ${i.codigo}` : ''}{i.quantidade ? ` — ${i.quantidade} cx` : ''}</Text>
            {i.descricao ? <Text style={muted2}>{i.descricao}</Text> : null}
            {i.observacao ? <Text style={muted2}>Obs.: {i.observacao}</Text> : null}
            <Text style={muted2}>Fotos: {i.fotos ?? 0}</Text>
          </Section>
        ))}
        {canceladas.length > 0 ? (
          <>
            <Hr style={hr} />
            <Text style={alert}><strong>NFs canceladas por falta total</strong> (motivo de devolução: Não veio produto — Falta oriunda da origem): {canceladas.join(', ')}</Text>
          </>
        ) : null}
        <Text style={muted}>A planilha no modelo da Cacau e as fotos são baixadas na tela Divergência de Recebimento. TLM Logística.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Divergências no recebimento — carga ${d.carga ?? ''} ${d.placa ?? ''}`.trim(),
  displayName: 'Divergência no recebimento (Cacau)',
  to: 'arquivostlm@tlmlogistica.com.br',
  previewData: { carga: '226834', placa: 'ABC1D23', data: '10/11/2026', operador: 'Gilson', canceladas: ['4400120'],
    itens: [{ nf: '4400103', codigo: '1003189', descricao: 'PANETTONE CHOCOLATE AO LEITE 420GX18UN', tipo: 'Avaria', quantidade: 2, fotos: 3 }] },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', padding: '24px', maxWidth: '600px' }
const h1 = { color: '#1f2937', fontSize: '22px', margin: '0 0 8px' }
const hr = { borderColor: '#e6ebf1', margin: '16px 0' }
const item = { borderBottom: '1px solid #eef1f4', paddingBottom: '6px', marginBottom: '6px' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px', margin: '2px 0' }
const muted2 = { color: '#555555', fontSize: '13px', margin: '2px 0' }
const alert = { color: '#b42318', fontSize: '14px', lineHeight: '20px' }
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '24px' }
