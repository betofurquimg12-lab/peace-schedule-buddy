import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  subject?: string
  body?: string
  meetLink?: string
}

const AppointmentReminderEmail = ({ subject, body, meetLink }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{subject ?? 'Lembrete de sessão'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{subject ?? 'Lembrete de sessão'}</Heading>
        {(body ?? '').split('\n').map((line, i) => (
          <Text key={i} style={text}>{line}</Text>
        ))}
        {meetLink && (
          <Section style={{ margin: '24px 0' }}>
            <Button href={meetLink} style={button}>Entrar na sessão</Button>
          </Section>
        )}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AppointmentReminderEmail,
  subject: (d: Record<string, any>) => d.subject ?? 'Lembrete: sua sessão em breve',
  displayName: 'Lembrete de sessão',
  previewData: {
    subject: 'Lembrete: sua sessão hoje às 14:00',
    body: 'Oi, Maria! Passando para lembrar da sua sessão hoje às 14:00.',
    meetLink: 'https://meet.google.com/abc-defg-hij',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '20px', fontWeight: 'bold', color: '#111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#444', lineHeight: '1.6', margin: '0 0 12px', whiteSpace: 'pre-wrap' as const }
const button = { backgroundColor: '#111', color: '#fff', padding: '10px 18px', borderRadius: '6px', textDecoration: 'none', fontSize: '14px' }
