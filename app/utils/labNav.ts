export type LabViewId = 'connection' | 'data' | 'diagnostics' | 'warnings' | 'log'

export interface LabNavView {
  value: LabViewId
  label: string
  icon: string
}

export const labViews: LabNavView[] = [
  {
    value: 'connection',
    label: 'Conexión',
    icon: 'i-lucide-plug-zap'
  },
  {
    value: 'data',
    label: 'Datos',
    icon: 'i-lucide-gauge'
  },
  {
    value: 'diagnostics',
    label: 'Averías',
    icon: 'i-lucide-stethoscope'
  },
  {
    value: 'warnings',
    label: 'Testigos',
    icon: 'i-lucide-triangle-alert'
  },
  {
    value: 'log',
    label: 'Registro',
    icon: 'i-lucide-scroll-text'
  }
]
