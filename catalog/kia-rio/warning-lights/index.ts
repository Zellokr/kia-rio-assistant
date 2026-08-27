import type {
  WarningLightCatalog,
  WarningLightEntry
} from '../../../core/obd/diagnostics/ports'

/**
 * Dashboard warning lights for the Kia Rio YB (2017-2023).
 *
 * PROVENANCE, and its limit. These entries describe the **standardised**
 * instrument-cluster tell-tales defined by ISO 2575 / ECE R121, which this
 * generation shares with essentially every modern car. That standardisation
 * is what makes them safe to describe without the vehicle in front of you.
 *
 * Eleven of the thirteen were checked against the owner's manual
 * (`YB_2019_es_ES.pdf`, section "Testigos indicadores y de advertencia",
 * 4-70 to 4-77) and confirmed. Two were not, and are kept on the strength of
 * OBD convention rather than the manual — see `coolant-temperature` and
 * `check-engine-blinking` below, and
 * `docs/WARNING_LIGHT_CATALOG_VERIFICATION.md` for the full comparison.
 *
 * Three consequences follow, and none is hypothetical:
 *
 * 1. A trim-specific or market-specific tell-tale that is not in the
 *    standardised set is simply absent here. `identifyWarningLight` answers
 *    `unidentified` for it and shows the safe alternative — which is the
 *    correct outcome, not a bug to work around by guessing an entry.
 * 2. `shape` values are descriptive identifiers chosen for this catalogue,
 *    not names taken from any Kia document. They exist so the guided flow
 *    can narrow on symbol shape; they are not a claim about Kia's own
 *    naming.
 * 3. The manual names tell-tales this catalogue does not carry, three of
 *    them inside this project's engine and emissions scope: the exhaust
 *    (GPF) lamp, the engine oil **level** lamp — a different lamp from
 *    `oil-pressure` — and the master warning. Adding them is open work.
 *
 * Checking the catalogue against the real instrument cluster is still open:
 * the manual covers the YB generation across trims and markets, and "si
 * está equipado" runs through it. Treat coverage as "the standard set",
 * never as "every light this car can show".
 *
 * SEVERITY. `critical` is reserved for lights that mean stop now — loss of
 * lubrication, cooling, braking or charging. Note that not every red light
 * is `critical`: the airbag tell-tale is red, but pulling over does not
 * make an occupant safer, so it is `warning` with an action that says what
 * actually helps. The conservative red-means-critical floor applies to
 * *unidentified* lights, where nothing better is known; an identified light
 * gets the severity it has actually earned.
 */

const CONSULT_MANUAL = 'Consultar el manual del vehículo'
const READ_DTCS = 'Leer los códigos de diagnóstico con el adaptador'

export const KIA_RIO_WARNING_LIGHTS: readonly WarningLightEntry[] = [
  {
    id: 'check-engine',
    name: 'Testigo de avería del motor',
    color: 'amber',
    shape: 'engine-outline',
    behavior: ['steady'],
    displayTextKeywords: ['CHECK', 'ENGINE'],
    symptoms: [
      'Pérdida de potencia',
      'Ralentí irregular',
      'Mayor consumo de combustible',
      'Tirones al acelerar'
    ],
    severity: 'warning',
    immediateAction:
      'Puedes seguir conduciendo con precaución. Lee los códigos de '
      + 'diagnóstico y acude a un taller: el aviso no se apaga solo.',
    recommendedChecks: [
      READ_DTCS,
      'Comprobar el nivel de aceite y de refrigerante',
      'Revisar que el tapón del depósito esté bien cerrado'
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: ['P0', 'P2'],
    subsystems: ['engine', 'emissions']
  },
  /**
   * NOT in the owner's manual. Its MIL section describes steady
   * illumination only and never mentions a blinking state — and "parpadea"
   * appears 74 times elsewhere in the manual, so the silence is about this
   * section, not about the vocabulary.
   *
   * Kept on OBD convention, which is sound and safety-relevant: a blinking
   * MIL means an active misfire dumping unburnt fuel into the catalyst.
   * Recorded here so nobody later cites it as manual-verified.
   */
  {
    id: 'check-engine-blinking',
    name: 'Testigo de avería del motor parpadeando',
    color: 'amber',
    shape: 'engine-outline',
    behavior: ['blinking'],
    displayTextKeywords: ['CHECK', 'ENGINE'],
    symptoms: [
      'El motor tiembla o vibra',
      'Pérdida brusca de potencia',
      'Olor fuerte a combustible sin quemar'
    ],
    severity: 'critical',
    immediateAction:
      'Detén el vehículo en un lugar seguro y apaga el motor. Un testigo '
      + 'de motor que parpadea indica un fallo de encendido activo, que '
      + 'puede destruir el catalizador en pocos minutos.',
    recommendedChecks: [
      READ_DTCS,
      'No reanudar la marcha hasta que un taller revise el fallo'
    ],
    associatedDtcCodes: [
      'P0300',
      'P0301',
      'P0302',
      'P0303',
      'P0304'
    ],
    associatedDtcPrefixes: [],
    subsystems: ['engine', 'emissions']
  },
  {
    id: 'oil-pressure',
    name: 'Presión de aceite del motor',
    color: 'red',
    shape: 'oil-can',
    behavior: ['steady'],
    displayTextKeywords: ['OIL'],
    symptoms: [
      'Ruido metálico en el motor',
      'El testigo se enciende al frenar o al tomar una curva'
    ],
    severity: 'critical',
    immediateAction:
      'Detén el vehículo en un lugar seguro y apaga el motor de '
      + 'inmediato. Sin presión de aceite el motor se daña en segundos, '
      + 'así que no sigas conduciendo aunque el testigo se apague.',
    recommendedChecks: [
      'Comprobar el nivel de aceite con el motor frío y en llano',
      'Buscar fugas de aceite bajo el vehículo',
      CONSULT_MANUAL
    ],
    associatedDtcCodes: [
      'P0520',
      'P0521',
      'P0522',
      'P0523'
    ],
    associatedDtcPrefixes: [],
    subsystems: ['engine']
  },
  {
    id: 'charging-system',
    name: 'Sistema de carga de la batería',
    color: 'red',
    shape: 'battery',
    behavior: ['steady'],
    displayTextKeywords: [],
    symptoms: [
      'Luces del cuadro más débiles de lo normal',
      'Arranque lento',
      'Otros testigos que se encienden sin motivo'
    ],
    severity: 'critical',
    immediateAction:
      'Detén el vehículo en un lugar seguro en cuanto puedas. El motor '
      + 'está funcionando con la carga de la batería y se parará sin '
      + 'aviso cuando se agote, posiblemente en mitad del tráfico.',
    recommendedChecks: [
      'Comprobar la tensión y el estado de la correa de accesorios',
      'Revisar los bornes de la batería',
      READ_DTCS
    ],
    associatedDtcCodes: ['P0562', 'P0563'],
    associatedDtcPrefixes: [],
    subsystems: ['electrical']
  },
  /**
   * NOT a tell-tale on this car. The manual documents a needle gauge
   * ("Indicador de temperatura del refrigerante del motor") and a separate
   * LCD message ("Motor sobrecalentado", above 120 °C) — there is no
   * coolant warning lamp in its tell-tale section.
   *
   * Kept because a driver may still meet a thermometer symbol on a variant
   * the manual does not cover, and because answering `unidentified` for an
   * overheating engine is the worse failure. The symptoms below lead with
   * the gauge for that reason.
   */
  {
    id: 'coolant-temperature',
    name: 'Temperatura del refrigerante',
    color: 'red',
    shape: 'thermometer-in-liquid',
    behavior: ['steady'],
    displayTextKeywords: ['TEMP'],
    symptoms: [
      'Vapor saliendo del capó',
      'Aguja de temperatura en la zona roja',
      'Olor dulce a refrigerante'
    ],
    severity: 'critical',
    immediateAction:
      'Detén el vehículo en un lugar seguro y apaga el motor. No abras '
      + 'el circuito de refrigeración en caliente: el líquido sale a '
      + 'presión y quema.',
    recommendedChecks: [
      'Esperar a que el motor enfríe antes de comprobar nada',
      'Comprobar el nivel de refrigerante en frío',
      'Buscar fugas de refrigerante bajo el vehículo'
    ],
    associatedDtcCodes: [
      'P0117',
      'P0118',
      'P0128',
      'P0217'
    ],
    associatedDtcPrefixes: [],
    subsystems: ['cooling', 'engine']
  },
  {
    id: 'brake-system',
    name: 'Sistema de frenos',
    color: 'red',
    shape: 'circle-exclamation-in-brackets',
    behavior: ['steady'],
    displayTextKeywords: ['BRAKE'],
    symptoms: [
      'Pedal de freno más blando o más largo de lo normal',
      'Mayor distancia de frenada'
    ],
    severity: 'critical',
    immediateAction:
      'Comprueba primero que el freno de mano está quitado del todo. Si '
      + 'el testigo sigue encendido, detén el vehículo en un lugar seguro '
      + 'y no sigas conduciendo: puede indicar falta de líquido de frenos.',
    recommendedChecks: [
      'Comprobar que el freno de mano está completamente quitado',
      'Comprobar el nivel de líquido de frenos',
      'Revisar el desgaste de las pastillas'
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: ['C0'],
    subsystems: ['brakes']
  },
  {
    id: 'abs',
    name: 'Sistema antibloqueo de frenos (ABS)',
    color: 'amber',
    shape: 'circle-with-abs',
    behavior: ['steady'],
    displayTextKeywords: ['ABS'],
    symptoms: [
      'Las ruedas se bloquean al frenar fuerte',
      'El pedal ya no vibra al frenar en emergencia'
    ],
    severity: 'warning',
    immediateAction:
      'Puedes seguir conduciendo: el freno normal sigue funcionando, '
      + 'pero sin ABS. Aumenta la distancia de seguridad, evita frenadas '
      + 'bruscas y acude a un taller.',
    recommendedChecks: [
      'Comprobar los sensores de velocidad de rueda',
      'Revisar el fusible del sistema ABS',
      READ_DTCS
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: ['C0'],
    subsystems: ['brakes', 'electrical']
  },
  {
    id: 'airbag-srs',
    name: 'Sistema de airbags (SRS)',
    color: 'red',
    shape: 'seated-person-with-airbag',
    behavior: ['steady', 'blinking'],
    displayTextKeywords: ['SRS', 'AIRBAG'],
    symptoms: [],
    severity: 'warning',
    immediateAction:
      'Acude a un taller antes de llevar pasajeros. Con este testigo '
      + 'encendido los airbags pueden no desplegarse en un accidente. '
      + 'Detener el vehículo no reduce ese riesgo, conducir con cuidado '
      + 'sí.',
    recommendedChecks: [
      'Revisar los conectores bajo los asientos delanteros',
      'Comprobar el estado del pretensor de los cinturones',
      READ_DTCS
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: ['B0'],
    subsystems: ['restraints', 'electrical']
  },
  {
    id: 'power-steering',
    name: 'Dirección asistida',
    color: 'amber',
    shape: 'steering-wheel-with-exclamation',
    behavior: ['steady'],
    displayTextKeywords: ['EPS'],
    symptoms: [
      'El volante se ha vuelto muy duro',
      'La asistencia aparece y desaparece'
    ],
    severity: 'warning',
    immediateAction:
      'Conduce con precaución: el volante puede endurecerse mucho, sobre '
      + 'todo a baja velocidad y al aparcar. Acude a un taller pronto.',
    recommendedChecks: [
      'Comprobar el fusible de la dirección asistida',
      READ_DTCS
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: ['C1'],
    subsystems: ['steering', 'electrical']
  },
  {
    id: 'tpms',
    name: 'Presión de los neumáticos',
    color: 'amber',
    shape: 'tyre-cross-section-with-exclamation',
    behavior: ['steady', 'blinking'],
    displayTextKeywords: ['TPMS'],
    symptoms: [
      'El vehículo tira hacia un lado',
      'Un neumático se ve más bajo que el resto'
    ],
    severity: 'warning',
    immediateAction:
      'Comprueba la presión de los cuatro neumáticos en frío en cuanto '
      + 'puedas. Si el testigo parpadea al arrancar, el fallo está en el '
      + 'propio sistema, no en la presión.',
    recommendedChecks: [
      'Comprobar la presión de los cuatro neumáticos en frío',
      'Revisar la rueda de repuesto si la lleva el vehículo',
      'Buscar cortes u objetos clavados en los neumáticos'
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: [],
    subsystems: ['tyres']
  },
  {
    id: 'esc-traction',
    name: 'Control de estabilidad y tracción',
    color: 'amber',
    shape: 'car-with-skid-marks',
    behavior: ['steady', 'blinking'],
    displayTextKeywords: ['ESC', 'ESP', 'VDC'],
    symptoms: [
      'El testigo parpadea al acelerar sobre piso mojado'
    ],
    severity: 'warning',
    immediateAction:
      'Si parpadea solo al acelerar sobre piso deslizante, el sistema '
      + 'está funcionando y no hay avería. Si permanece fijo, el control '
      + 'de estabilidad está desactivado: conduce con precaución y acude '
      + 'a un taller.',
    recommendedChecks: [
      'Comprobar si el sistema se ha desactivado con el botón',
      'Revisar los sensores de velocidad de rueda',
      READ_DTCS
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: ['C0'],
    subsystems: ['brakes', 'steering']
  },
  {
    id: 'low-fuel',
    name: 'Nivel de combustible bajo',
    color: 'amber',
    shape: 'fuel-pump',
    behavior: ['steady'],
    displayTextKeywords: ['FUEL'],
    symptoms: [],
    severity: 'info',
    immediateAction:
      'Reposta en la próxima estación de servicio. Circular con el '
      + 'depósito casi vacío hace trabajar la bomba de combustible en '
      + 'peores condiciones.',
    recommendedChecks: [
      'Comprobar la autonomía restante en el cuadro'
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: [],
    subsystems: ['fuel']
  },
  {
    id: 'immobilizer',
    name: 'Inmovilizador',
    color: 'amber',
    shape: 'car-with-key',
    behavior: ['steady', 'blinking'],
    displayTextKeywords: ['KEY'],
    symptoms: [
      'El motor gira pero no arranca',
      'El vehículo no reconoce la llave'
    ],
    severity: 'warning',
    immediateAction:
      'Prueba con la llave de repuesto. Si el vehículo sigue sin '
      + 'reconocerla, no lo dejes en un sitio donde te quedes bloqueado y '
      + 'acude a un taller.',
    recommendedChecks: [
      'Probar con la segunda llave',
      'Cambiar la pila del mando',
      CONSULT_MANUAL
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: ['B1'],
    subsystems: ['electrical']
  },

  /*
   * The three lamps below are named by the owner's manual and are absent
   * from the ISO 2575 standard set the rest of this catalogue was built
   * from. Their wording follows the manual's own description of each — see
   * docs/WARNING_LIGHT_CATALOG_VERIFICATION.md.
   *
   * All three are "si está equipado" in the manual: it covers the YB
   * generation across trims and markets, so a car without the equipment
   * simply never lights them.
   */

  /**
   * Steady. The manual gives a regeneration drive that clears it, and the
   * numbers here are its numbers rather than a rule of thumb: over 30
   * minutes, at least 80 km/h, third gear or higher, 1500-4000 rpm.
   */
  {
    id: 'exhaust-gpf',
    name: 'Filtro de partículas de gasolina (GPF)',
    color: 'amber',
    shape: 'exhaust-with-dots',
    behavior: ['steady'],
    displayTextKeywords: ['GPF'],
    symptoms: [
      'Trayectos cortos y repetidos sin que el motor alcance temperatura',
      'Menor respuesta al acelerar'
    ],
    severity: 'warning',
    immediateAction:
      'Puedes seguir conduciendo. El filtro se limpia solo si le das la '
      + 'ocasión: más de 30 minutos a 80 km/h como mínimo, en tercera o '
      + 'superior y entre 1500 y 4000 rpm, siempre que la carretera lo '
      + 'permita con seguridad.',
    recommendedChecks: [
      'Hacer el trayecto de regeneración que indica el manual',
      READ_DTCS
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: ['P04', 'P24'],
    subsystems: ['emissions', 'engine']
  },

  /**
   * Blinking. The manual's own escalation: if it still blinks after the
   * regeneration drive — and it shows an LCD message when it does — the
   * filter needs a workshop, not another trip.
   */
  {
    id: 'exhaust-gpf-blinking',
    name: 'Filtro de partículas de gasolina (GPF) parpadeando',
    color: 'amber',
    shape: 'exhaust-with-dots',
    behavior: ['blinking'],
    displayTextKeywords: ['GPF'],
    symptoms: [
      'El aviso sigue tras el trayecto de regeneración',
      'Mensaje de advertencia en la pantalla del cuadro',
      'Pérdida de potencia'
    ],
    severity: 'warning',
    immediateAction:
      'El trayecto de regeneración ya no basta: lleva el coche a un taller '
      + 'para que revisen el GPF. Conducir mucho tiempo así puede dañar el '
      + 'sistema de escape.',
    recommendedChecks: [
      READ_DTCS,
      'Revisar el filtro de partículas en un taller'
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: ['P04', 'P24'],
    subsystems: ['emissions', 'engine']
  },

  /**
   * NOT the oil-pressure lamp. Low pressure means stop the engine before it
   * seizes; low level means top it up soon. Keeping the two apart is the
   * whole point of carrying this one.
   */
  {
    id: 'engine-oil-level',
    name: 'Nivel de aceite del motor',
    color: 'amber',
    shape: 'oil-can-with-level',
    behavior: ['steady'],
    displayTextKeywords: ['OIL'],
    symptoms: [
      'Consumo de aceite entre mantenimientos',
      'Sin señales de alarma en el motor'
    ],
    severity: 'warning',
    immediateAction:
      'Comprueba el nivel de aceite cuanto antes y añade si hace falta, '
      + 'sin pasar de la marca F de la varilla. No es una emergencia, pero '
      + 'no lo dejes: quedarse sin aceite sí lo es.',
    recommendedChecks: [
      'Medir el nivel con la varilla, en llano y con el motor frío',
      'Añadir el aceite especificado en el manual, despacio y con embudo',
      'Vigilar si el nivel vuelve a bajar: eso apunta a consumo o fuga'
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: [],
    subsystems: ['engine']
  },

  /**
   * Names no fault of its own. The manual lists what it stands in for —
   * TPMS fault or low pressure, low engine oil, and the FCA, BCW and HBA
   * driver-assistance systems — and says it goes out when the underlying
   * condition clears. Its advice has to send the driver to the display
   * rather than guess which of those is at fault.
   */
  {
    id: 'master-warning',
    name: 'Testigo de advertencia maestro',
    color: 'amber',
    shape: 'triangle-exclamation',
    behavior: ['steady'],
    displayTextKeywords: [],
    symptoms: [
      'Un mensaje de advertencia apareció antes en la pantalla',
      'Otro testigo se encendió a la vez'
    ],
    severity: 'warning',
    immediateAction:
      'Este testigo no dice qué falla por sí solo: mira el mensaje de la '
      + 'pantalla del cuadro, que es donde se nombra el sistema afectado. '
      + 'Se apaga cuando esa situación se resuelve.',
    recommendedChecks: [
      'Leer el mensaje de la pantalla del cuadro de instrumentos',
      'Comprobar la presión de los neumáticos y el nivel de aceite',
      READ_DTCS
    ],
    associatedDtcCodes: [],
    associatedDtcPrefixes: [],
    subsystems: ['electrical']
  }
]

const BY_ID = new Map<string, WarningLightEntry>(
  KIA_RIO_WARNING_LIGHTS.map(entry => [entry.id, entry])
)

export const kiaRioWarningLightsCatalog: WarningLightCatalog = {
  all: () => KIA_RIO_WARNING_LIGHTS,
  byId: id => BY_ID.get(id)
}
