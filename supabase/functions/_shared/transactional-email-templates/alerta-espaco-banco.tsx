import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Item { tabela: string; tamanho: string; motivo: string }
interface Props { medidoEm?: string; bancoTotal?: string; itens?: Item[] }

const nomeTabela = (t: string) => (t === '_banco_total' ? 'Banco inteiro' : t)

const AlertaEspaco = ({ medidoEm = '', bancoTotal = '', itens = [] }: Props) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>Aviso: crescimento fora do normal no banco</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Aviso de espaço do banco</Heading>
        <Hr style={hr} />
        <Section>
          <Text style={text}>Na medição de {medidoEm}, o sistema encontrou crescimento fora do normal:</Text>
          {itens.map((i, idx) => (
            <Text key={idx} style={item}>
              <strong>{nomeTabela(i.tabela)}</strong> — {i.tamanho} — {i.motivo}
            </Text>
          ))}
          {bancoTotal ? <Text style={text}>Tamanho total do banco: <strong>{bancoTotal}</strong></Text> : null}
          <Text style={text}>Nada foi alterado ou apagado automaticamente. Verifique a causa antes de qualquer ação.</Text>
          <Text style={muted}>TLM Logística — Carga Fácil</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AlertaEspaco,
  subject: 'Aviso: crescimento fora do normal no banco',
  displayName: 'Aviso de espaço do banco',
  to: 'anderson.teixeira@tlmlogistica.com.br',
  previewData: {
    medidoEm: '25/09/2026 04:00',
    bancoTotal: '1,9 GB',
    itens: [{ tabela: 'ibac_log_envios', tamanho: '450 MB', motivo: 'Cresceu mais de 30% em 1 dia' }],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', padding: '24px', maxWidth: '560px' }
const h1 = { color: '#b42318', fontSize: '22px', margin: '0 0 8px' }
const hr = { borderColor: '#e6ebf1', margin: '16px 0' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px' }
const item = { color: '#333333', fontSize: '14px', lineHeight: '20px', margin: '4px 0' }
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '24px' }
