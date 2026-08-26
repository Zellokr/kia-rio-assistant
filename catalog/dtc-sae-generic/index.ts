import type {
  DtcCatalog,
  DtcCatalogEntry
} from '../../core/obd/diagnostics/ports'

/**
 * Curated SAE J2012 generic powertrain codes (`P0xxx`).
 *
 * SCOPE, and the reason it is narrow. These are the SAE-defined generic
 * definitions, applicable to any OBD-II petrol engine. Nothing here is
 * vehicle-specific: no manufacturer, model or engine code appears, because
 * this catalogue sits outside `core/` precisely so generic OBD logic never
 * acquires brand knowledge (`AGENTS.MD`), and it would defeat the split to
 * smuggle that knowledge into the data instead.
 *
 * A code that is not curated here resolves to `no-entry` rather than to a
 * plausible-sounding guess. That fallback is the point, not a gap: an
 * invented cause reads exactly like a real one to a driver who cannot tell
 * them apart.
 *
 * SEVERITY. `critical` is reserved for faults that can leave the driver
 * without engine power while moving, or that risk rapid mechanical or
 * catalyst damage if driving continues. Everything else that needs a
 * workshop is `warning`. `info` is for faults with no driveability or
 * safety consequence. Over-alarming is as dishonest as under-alarming.
 *
 * CAUSES are possibilities, never diagnoses. The wording keeps them that
 * way, because this catalogue has no way to know which one applies.
 */

const MISFIRE_CAUSES = [
  'Bujías desgastadas o con la separación incorrecta',
  'Bobina o cable de encendido defectuoso',
  'Inyector obstruido o defectuoso',
  'Pérdida de compresión en el cilindro',
  'Entrada de aire no medida en la admisión'
] as const

const MISFIRE_CHECKS = [
  'Revisar el estado y la antigüedad de las bujías',
  'Comprobar bobinas y cables de encendido',
  'Medir la compresión de los cilindros',
  'Buscar entradas de aire en la admisión'
] as const

const MISFIRE_ACTION
  = 'Detén el vehículo en un lugar seguro y apaga el motor. Un fallo de '
    + 'encendido sostenido puede dañar el catalizador en pocos minutos, '
    + 'así que no sigas conduciendo hasta que un taller lo revise.'

function misfireEntry(
  code: string,
  cylinder: number
): DtcCatalogEntry {
  return {
    code,
    title: `Fallo de encendido detectado en el cilindro ${cylinder}`,
    severity: 'critical',
    possibleCauses: [...MISFIRE_CAUSES],
    recommendedChecks: [...MISFIRE_CHECKS],
    immediateAction: MISFIRE_ACTION,
    subsystems: ['engine', 'emissions']
  }
}

export const SAE_GENERIC_DTC_ENTRIES: readonly DtcCatalogEntry[] = [
  {
    code: 'P0300',
    title: 'Fallo de encendido detectado en varios cilindros',
    severity: 'critical',
    possibleCauses: [...MISFIRE_CAUSES],
    recommendedChecks: [...MISFIRE_CHECKS],
    immediateAction: MISFIRE_ACTION,
    subsystems: ['engine', 'emissions']
  },
  misfireEntry('P0301', 1),
  misfireEntry('P0302', 2),
  misfireEntry('P0303', 3),
  misfireEntry('P0304', 4),
  {
    code: 'P0335',
    title: 'Circuito del sensor de posición del cigüeñal',
    severity: 'critical',
    possibleCauses: [
      'Sensor de posición del cigüeñal defectuoso',
      'Cableado o conector del sensor dañado',
      'Rueda fónica del cigüeñal dañada o sucia'
    ],
    recommendedChecks: [
      'Comprobar el cableado y el conector del sensor',
      'Revisar el estado de la rueda fónica',
      'Medir la señal del sensor con el motor en marcha'
    ],
    immediateAction:
      'Detén el vehículo en un lugar seguro. Sin esta señal el motor '
      + 'puede pararse en marcha sin aviso, así que no sigas conduciendo '
      + 'hasta que un taller lo revise.',
    subsystems: ['engine', 'electrical']
  },
  {
    code: 'P0171',
    title: 'Mezcla demasiado pobre',
    severity: 'warning',
    possibleCauses: [
      'Entrada de aire no medida en la admisión',
      'Sensor de flujo o de presión de aire sucio o descalibrado',
      'Presión de combustible insuficiente',
      'Sonda lambda envejecida'
    ],
    recommendedChecks: [
      'Buscar fugas de aire en la admisión y en sus manguitos',
      'Comprobar la presión de combustible',
      'Revisar el estado del filtro de aire'
    ],
    immediateAction:
      'Puedes seguir conduciendo con precaución, pero lleva el vehículo '
      + 'a un taller lo antes posible: una mezcla pobre mantenida daña '
      + 'el catalizador.',
    subsystems: ['engine', 'fuel']
  },
  {
    code: 'P0172',
    title: 'Mezcla demasiado rica',
    severity: 'warning',
    possibleCauses: [
      'Inyector con fuga o que no cierra',
      'Presión de combustible excesiva',
      'Filtro de aire muy sucio',
      'Sonda lambda envejecida'
    ],
    recommendedChecks: [
      'Comprobar la presión de combustible',
      'Revisar el estado del filtro de aire',
      'Comprobar la estanqueidad de los inyectores'
    ],
    immediateAction:
      'Puedes seguir conduciendo con precaución, pero lleva el vehículo '
      + 'a un taller lo antes posible: una mezcla rica mantenida daña el '
      + 'catalizador y dispara el consumo.',
    subsystems: ['engine', 'fuel']
  },
  {
    code: 'P0420',
    title: 'Eficiencia del catalizador por debajo del umbral',
    severity: 'warning',
    possibleCauses: [
      'Catalizador degradado o dañado',
      'Sonda lambda de salida envejecida',
      'Fuga en el escape antes del catalizador',
      'Un fallo de mezcla o de encendido previo que dañó el catalizador'
    ],
    recommendedChecks: [
      'Comprobar la señal de las dos sondas lambda',
      'Buscar fugas en la línea de escape',
      'Descartar primero cualquier fallo de encendido o de mezcla'
    ],
    immediateAction:
      'Puedes seguir conduciendo, pero lleva el vehículo a un taller: el '
      + 'aviso no desaparecerá solo y afecta a las emisiones.',
    subsystems: ['emissions']
  },
  {
    code: 'P0128',
    title: 'El refrigerante no alcanza la temperatura de regulación',
    severity: 'warning',
    possibleCauses: [
      'Termostato bloqueado en abierto',
      'Sensor de temperatura del refrigerante descalibrado',
      'Nivel de refrigerante bajo'
    ],
    recommendedChecks: [
      'Comprobar el nivel de refrigerante en frío',
      'Verificar la apertura del termostato',
      'Contrastar la lectura del sensor con la temperatura real'
    ],
    immediateAction:
      'Puedes seguir conduciendo, pero lleva el vehículo a un taller: el '
      + 'motor trabajando frío consume más y se desgasta antes.',
    subsystems: ['cooling', 'engine']
  },
  {
    code: 'P0117',
    title: 'Sensor de temperatura del refrigerante: señal baja',
    severity: 'warning',
    possibleCauses: [
      'Sensor de temperatura defectuoso',
      'Cortocircuito a masa en el cableado del sensor',
      'Conector con humedad o corrosión'
    ],
    recommendedChecks: [
      'Comprobar el cableado y el conector del sensor',
      'Medir la resistencia del sensor en frío y en caliente'
    ],
    immediateAction:
      'Lleva el vehículo a un taller pronto y vigila el indicador de '
      + 'temperatura: una lectura falsa puede ocultar un '
      + 'sobrecalentamiento real.',
    subsystems: ['cooling', 'electrical']
  },
  {
    code: 'P0118',
    title: 'Sensor de temperatura del refrigerante: señal alta',
    severity: 'warning',
    possibleCauses: [
      'Sensor de temperatura defectuoso',
      'Circuito abierto en el cableado del sensor',
      'Conector desconectado'
    ],
    recommendedChecks: [
      'Comprobar la continuidad del cableado del sensor',
      'Medir la resistencia del sensor en frío y en caliente'
    ],
    immediateAction:
      'Lleva el vehículo a un taller pronto y vigila el indicador de '
      + 'temperatura: una lectura falsa puede ocultar un '
      + 'sobrecalentamiento real.',
    subsystems: ['cooling', 'electrical']
  },
  {
    code: 'P0135',
    title: 'Calentador de la sonda lambda previa al catalizador',
    severity: 'warning',
    possibleCauses: [
      'Resistencia del calentador de la sonda abierta',
      'Fusible o cableado del circuito de calefacción dañado',
      'Sonda lambda al final de su vida útil'
    ],
    recommendedChecks: [
      'Comprobar el fusible del circuito de calefacción',
      'Medir la resistencia del calentador de la sonda'
    ],
    immediateAction:
      'Puedes seguir conduciendo, pero lleva el vehículo a un taller: '
      + 'afecta a las emisiones y al consumo en frío.',
    subsystems: ['emissions', 'electrical']
  },
  {
    code: 'P0141',
    title: 'Calentador de la sonda lambda situada tras el catalizador',
    severity: 'warning',
    possibleCauses: [
      'Resistencia del calentador de la sonda abierta',
      'Fusible o cableado del circuito de calefacción dañado',
      'Sonda lambda al final de su vida útil'
    ],
    recommendedChecks: [
      'Comprobar el fusible del circuito de calefacción',
      'Medir la resistencia del calentador de la sonda'
    ],
    immediateAction:
      'Puedes seguir conduciendo, pero lleva el vehículo a un taller: '
      + 'afecta al control de emisiones.',
    subsystems: ['emissions', 'electrical']
  },
  {
    code: 'P0340',
    title: 'Circuito del sensor de posición del árbol de levas',
    severity: 'warning',
    possibleCauses: [
      'Sensor de posición del árbol de levas defectuoso',
      'Cableado o conector del sensor dañado',
      'Distribución fuera de punto'
    ],
    recommendedChecks: [
      'Comprobar el cableado y el conector del sensor',
      'Verificar el punto de la distribución',
      'Medir la señal del sensor con el motor en marcha'
    ],
    immediateAction:
      'Lleva el vehículo a un taller pronto: el motor puede arrancar mal '
      + 'o pararse, así que evita trayectos largos hasta la revisión.',
    subsystems: ['engine', 'electrical']
  },
  {
    code: 'P0122',
    title: 'Sensor de posición de la mariposa: señal baja',
    severity: 'warning',
    possibleCauses: [
      'Sensor de posición de la mariposa defectuoso',
      'Cortocircuito a masa en el cableado del sensor',
      'Conector flojo o corroído'
    ],
    recommendedChecks: [
      'Comprobar el cableado y el conector del sensor',
      'Medir la señal del sensor recorriendo todo el pedal'
    ],
    immediateAction:
      'Conduce con precaución y lleva el vehículo a un taller pronto: la '
      + 'respuesta del acelerador puede volverse irregular o entrar en '
      + 'modo de emergencia.',
    subsystems: ['engine', 'electrical']
  },
  {
    code: 'P0123',
    title: 'Sensor de posición de la mariposa: señal alta',
    severity: 'warning',
    possibleCauses: [
      'Sensor de posición de la mariposa defectuoso',
      'Circuito abierto o cortocircuito a positivo en el cableado',
      'Conector flojo o corroído'
    ],
    recommendedChecks: [
      'Comprobar el cableado y el conector del sensor',
      'Medir la señal del sensor recorriendo todo el pedal'
    ],
    immediateAction:
      'Conduce con precaución y lleva el vehículo a un taller pronto: la '
      + 'respuesta del acelerador puede volverse irregular o entrar en '
      + 'modo de emergencia.',
    subsystems: ['engine', 'electrical']
  },
  {
    code: 'P0505',
    title: 'Sistema de control del ralentí',
    severity: 'warning',
    possibleCauses: [
      'Cuerpo de mariposa sucio',
      'Válvula de control de ralentí atascada',
      'Entrada de aire no medida en la admisión'
    ],
    recommendedChecks: [
      'Limpiar el cuerpo de mariposa',
      'Buscar entradas de aire en la admisión',
      'Comprobar el funcionamiento de la válvula de ralentí'
    ],
    immediateAction:
      'Puedes seguir conduciendo con precaución, pero lleva el vehículo '
      + 'a un taller: el motor puede pararse al detenerte.',
    subsystems: ['engine']
  },
  {
    code: 'P0562',
    title: 'Voltaje del sistema bajo',
    severity: 'warning',
    possibleCauses: [
      'Alternador que no carga correctamente',
      'Batería al final de su vida útil',
      'Correa de accesorios floja',
      'Bornes o masas con mala conexión'
    ],
    recommendedChecks: [
      'Medir el voltaje de carga con el motor en marcha',
      'Comprobar el estado de la batería y de sus bornes',
      'Revisar la tensión de la correa de accesorios'
    ],
    immediateAction:
      'Lleva el vehículo a un taller pronto: si la carga falla, el motor '
      + 'puede pararse y no volver a arrancar.',
    subsystems: ['electrical']
  },
  {
    code: 'P0563',
    title: 'Voltaje del sistema alto',
    severity: 'warning',
    possibleCauses: [
      'Regulador de voltaje del alternador defectuoso',
      'Mala conexión de masa'
    ],
    recommendedChecks: [
      'Medir el voltaje de carga con el motor en marcha',
      'Comprobar las conexiones de masa del motor'
    ],
    immediateAction:
      'Lleva el vehículo a un taller pronto: un voltaje excesivo daña la '
      + 'batería y los módulos electrónicos.',
    subsystems: ['electrical']
  },
  {
    code: 'P0442',
    title: 'Fuga pequeña en el sistema evaporativo',
    severity: 'info',
    possibleCauses: [
      'Tapón del depósito mal cerrado o con la junta gastada',
      'Manguito del sistema evaporativo agrietado',
      'Válvula de purga que no cierra del todo'
    ],
    recommendedChecks: [
      'Cerrar bien el tapón del depósito y borrar el aviso',
      'Revisar el estado de la junta del tapón',
      'Comprobar los manguitos del sistema evaporativo'
    ],
    immediateAction:
      'No requiere una acción inmediata. Empieza por cerrar bien el '
      + 'tapón del depósito y comenta el aviso en el próximo '
      + 'mantenimiento.',
    subsystems: ['emissions', 'fuel']
  },
  {
    code: 'P0455',
    title: 'Fuga grande en el sistema evaporativo',
    severity: 'info',
    possibleCauses: [
      'Tapón del depósito ausente o mal cerrado',
      'Manguito del sistema evaporativo suelto o roto',
      'Válvula de purga bloqueada en abierto'
    ],
    recommendedChecks: [
      'Comprobar que el tapón del depósito está puesto y bien cerrado',
      'Revisar los manguitos del sistema evaporativo',
      'Comprobar la válvula de purga'
    ],
    immediateAction:
      'No requiere una acción inmediata. Comprueba el tapón del depósito '
      + 'y comenta el aviso en el próximo mantenimiento.',
    subsystems: ['emissions', 'fuel']
  }
]

const BY_CODE = new Map<string, DtcCatalogEntry>(
  SAE_GENERIC_DTC_ENTRIES.map(entry => [entry.code, entry])
)

export const saeGenericDtcCatalog: DtcCatalog = {
  lookup: (code) => {
    const entry = BY_CODE.get(code.code)

    return entry
      ? { kind: 'catalog-entry', entry }
      : {
          kind: 'no-entry',
          code: code.code,
          system: code.system
        }
  }
}
