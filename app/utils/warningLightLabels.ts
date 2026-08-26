import type { LightQuestion } from '~~/core/obd/diagnostics/identifyWarningLight'
import type {
  DiagnosticConfidence,
  DiagnosticSeverity,
  WarningLightBehavior,
  WarningLightColor
} from '~~/core/obd/diagnostics/ports'

/**
 * Spanish copy for the guided flow.
 *
 * Labels live here and not in the catalogue on purpose: the catalogue is
 * data about the car, this is words for a person. They change for
 * different reasons and should not force each other to move.
 */
export const LIGHT_QUESTION_LABELS: Record<LightQuestion, string> = {
  color: '¿De qué color es el testigo?',
  shape: '¿Qué forma tiene el símbolo?',
  behavior: '¿El testigo está fijo o parpadea?',
  displayText: '¿Aparece algún texto en la pantalla del cuadro?',
  symptoms: '¿Notas algo raro al conducir?'
}

export const LIGHT_COLOR_LABELS: Record<WarningLightColor, string> = {
  red: 'Rojo',
  amber: 'Ámbar',
  green: 'Verde',
  blue: 'Azul',
  white: 'Blanco'
}

export const LIGHT_BEHAVIOR_LABELS: Record<WarningLightBehavior, string> = {
  steady: 'Fijo',
  blinking: 'Parpadea'
}

export const SEVERITY_LABELS: Record<DiagnosticSeverity, string> = {
  info: 'Informativo',
  warning: 'Requiere revisión',
  critical: 'Grave'
}

export const CONFIDENCE_LABELS: Record<DiagnosticConfidence, string> = {
  low: 'Confianza baja',
  medium: 'Confianza media',
  high: 'Confianza alta'
}

/**
 * Shape identifiers come from the catalogue and describe a symbol, not a
 * word. Anything without copy here falls back to its identifier rather
 * than to an invented description — an unlabelled shape is a gap in this
 * file, and showing the raw value makes that visible instead of hiding it
 * behind plausible prose.
 */
const LIGHT_SHAPE_LABELS: Record<string, string> = {
  'engine-outline': 'Silueta de un motor',
  'oil-can': 'Aceitera con una gota',
  'battery': 'Batería con los polos + y −',
  'thermometer-in-liquid': 'Termómetro sobre olas',
  'circle-exclamation-in-brackets': 'Círculo con “!” entre paréntesis',
  'circle-with-abs': 'Círculo con las letras ABS',
  'seated-person-with-airbag': 'Persona sentada frente a un airbag',
  'steering-wheel-with-exclamation': 'Volante con “!”',
  'tyre-cross-section-with-exclamation': 'Sección de neumático con “!”',
  'car-with-skid-marks': 'Coche sobre huellas de derrape',
  'fuel-pump': 'Surtidor de combustible',
  'car-with-key': 'Coche con una llave'
}

export function shapeLabel(shape: string): string {
  return LIGHT_SHAPE_LABELS[shape] ?? shape
}
