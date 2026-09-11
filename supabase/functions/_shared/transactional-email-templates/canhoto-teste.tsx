import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface CanhotoTesteProps {
  numeroNf?: string
  cliente?: string
  dataEntrega?: string
  imageUrl?: string
}

const CanhotoTeste = ({
  numeroNf = '000000',
  cliente = '—',
  dataEntrega = '—',
  imageUrl,
}: CanhotoTesteProps) => (
  <Html lang="pt-BR">
    <Head />
    <Preview>{`Canhoto da NF ${numeroNf} — teste de envio`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Carga Fácil — canhoto de entrega</Heading>
        <Hr style={hr} />
        <Section>
          <Text style={text}>
            <strong>Nota fiscal:</strong> {numeroNf}
          </Text>
          <Text style={text}>
            <strong>Cliente:</strong> {cliente}
          </Text>
          <Text style={text}>
            <strong>Data da entrega:</strong> {dataEntrega}
          </Text>
          {imageUrl ? (
            <>
              <Img src={imageUrl} alt={`Canhoto da NF ${numeroNf}`} style={img} />
              <Text style={muted}>
                Se a imagem não aparecer, <Link href={imageUrl}>abra o canhoto aqui</Link>.
                O link fica ativo por 7 dias; a imagem permanece guardada no sistema.
              </Text>
            </>
          ) : (
            <Text style={text}>Imagem do canhoto indisponível neste envio.</Text>
          )}
          <Text style={muted}>TLM Logística — envio automático de comprovantes</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CanhotoTeste,
  subject: (data: Record<string, any>) =>
    `Canhoto da NF ${data?.numeroNf ?? ''} — Carga Fácil`,
  displayName: 'Canhoto de entrega',
  previewData: { numeroNf: '759539', cliente: 'CASAS GUANABARA', dataEntrega: '11/09/2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = {
  margin: '0 auto',
  padding: '24px',
  maxWidth: '620px',
}
const h1 = { color: '#1a3a5c', fontSize: '22px', margin: '0 0 8px' }
const hr = { borderColor: '#e6ebf1', margin: '16px 0' }
const text = { color: '#333333', fontSize: '15px', lineHeight: '22px' }
const img = {
  width: '100%',
  borderRadius: '6px',
  border: '1px solid #e6ebf1',
  margin: '12px 0',
}
const muted = { color: '#8898aa', fontSize: '12px', marginTop: '18px' }
