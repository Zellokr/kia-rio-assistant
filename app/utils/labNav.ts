export type LabViewId = 'connection' | 'data' | 'log'

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
    value: 'log',
    label: 'Registro',
    icon: 'i-lucide-scroll-text'
  }
]
