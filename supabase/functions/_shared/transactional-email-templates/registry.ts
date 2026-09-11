// Registry of transactional email templates.
// Each template must be registered here to be available for sending.

export interface TemplateEntry {
  // React Email component
  component: any
  // Subject line — static string or function of the template data
  subject: string | ((data: Record<string, any>) => string)
  // Friendly name shown in the preview tool
  displayName?: string
  // Sample data used by the preview tool
  previewData?: Record<string, any>
  // Optional fixed recipient (overrides the recipient passed at send time)
  to?: string
}

import { template as testeEnvio } from './teste-envio.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'teste-envio': testeEnvio,
}
