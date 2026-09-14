import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  periodo?: string
  observacao?: string
  total?: number
  comCanhoto?: number
  semCanhoto?: number
  linkXlsx?: string
  links?: { volume: number; pdf: string; zip: string }[]
}

const CanhotosEnvioManual = ({
  periodo = '-',
  observacao = '',
  total = 0,
  comCanhoto = 0,
  semCanhoto = 0,
  linkXlsx,
  links = [],
}: Props) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>{`Canhotos de entrega — ${comCanhoto} comprovante(s)`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Canhotos de entrega</Heading>
        <Text style={text}>{periodo}</Text>
        <Hr style={hr} />
        <Section>
          <Text style={text}>
            <strong>Notas na seleção:</strong> {total}
          </Text>
          <Text style={text}>
            <strong>Com canhoto:</strong> {comCanhoto} &nbsp;•&nbsp; <strong>Sem canhoto:</strong> {semCanhoto}
          </Text>
          {observacao ? <Text style={obs}>{observacao}</Text> : null}
          <Hr style={hr} />
          {links.length ? (
            links.map((l) => (
              <Text key={l.volume} style={text}>
                <strong>Parte {l.volume}:</strong>{' '}
                {l.pdf ? <Link href={l.pdf}>PDF dos canhotos</Link> : 'PDF indisponível'}
                {l.zip ? (
                  <>
                    {' '}
                    | <Link href={l.zip}>imagens (ZIP)</Link>
                  </>
                ) : null}
              </Text>
            ))
          ) : (
            <Text style={text}>Nenhum canhoto disponível nesta seleção.</Text>
          )}
          {linkXlsx ? (
            <Text style={text}>
              <strong>Notas sem canhoto:</strong> <Link href={linkXlsx}>planilha (Excel)</Link>
            </Text>
          ) : null}
          <Text style={muted}>
            Os links ficam ativos por 90 dias. As imagens permanecem guardadas no sistema.
          </Text>
          <Text style={muted}>TLM Logística — Carga Fácil</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CanhotosEnvioManual,
  subject: (data: Record<string, any>) =>
    `Canhotos de entrega — ${data?.comCanhoto ?? 0} comprovante(s)`,
  displayName: 'Envio de canhotos (manual)',
  previewData: {
    periodo: 'Embarcador: PANDURATA • Período: 01/09/2026 a 05/09/2026',
    total: 42,
    comCanhoto: 40,
    semCanhoto: 2,
    linkXlsx: 'https://example.com/sem-canhoto.xlsx',
    links: [{ volume: 1, pdf: 'https://example.com/parte-01.pdf', zip: 'https://example.com/parte-01.zip' }],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', padding: '24px', maxWidth: '620px' }
const h1 = { color: '#1a3a5c', fontSize: '22px', margin: '0 0 4px' }
const hr = { borderColor: '#e6ebf1', margin: '16px 0' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px' }
const obs = {
  color: '#333333',
  fontSize: '14px',
  lineHeight: '21px',
  backgroundColor: '#f6f9fc',
  padding: '10px 12px',
  borderRadius: '6px',
}
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '16px' }
