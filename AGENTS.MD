# AGENTS.md

## Misión actual

Mantén el laboratorio OBD-II Android para el Kia Rio YB 2019 1.2 MPI,
con comunicación física exclusivamente mediante BLE nativo en Android.

Estado actual:

- `AndroidBleObdTransport` es el único transporte físico de la aplicación.
- `WebSerialRfcommTransport` fue eliminado; Web Serial/RFCOMM no es una ruta
  ejecutable para la app Capacitor Android ni para el adaptador BLE disponible.
- La validación física A1 está cerrada con once conexiones consecutivas.
- La validación física A2 está cerrada por waiver del propietario en ADR-004:
  queda visible la brecha de una recuperación post-fix por toggle de Bluetooth
  no repetida en el vehículo.
- Las partes B y C están cerradas; C combina fotografía del cuadro con reporte
  del propietario para el identificador guiado de ABS, cinturón e inmovilizador.
- La parte D no es ejecutable en este coche porque no hay DTC almacenados.

## Stack

- Node.js 24 LTS
- pnpm
- Nuxt 4
- Vue 3
- TypeScript estricto
- Vitest

## Reglas no negociables

- El sistema será exclusivamente de lectura.
- No implementar el modo OBD 04 ni funciones para borrar DTC.
- No escribir ni modificar parámetros de la ECU.
- No incluir secretos en el cliente.
- No afirmar que una prueba física ha pasado si no se ejecutó
  con el vehículo real.
- No modificar ni eliminar trabajo previo del usuario.
- El código OBD genérico no debe contener lógica específica de Kia.
- Toda API física del navegador debe ejecutarse únicamente en cliente.

## Tarea de esta iteración

No hay una tarea fija de Fase 0 pendiente en este archivo. Sigue la tarea
concreta delegada por el usuario o el orquestador y conserva el estado físico
registrado en la documentación.

## Política de comandos físicos permitidos

La aplicación física debe seguir siendo exclusivamente de lectura. La allowlist
actual de comandos que pueden llegar a un vehículo real vive en
`core/obd/policy/PhysicalObdCommandPolicy.ts` y debe mantenerse sincronizada con
la defensa nativa en
`android/app/src/main/java/dev/krist/kiarioassistant/plugins/BleObdBridgePlugin.kt`.

Comandos originales de Fase 0:

- `ATZ`
- `ATE0`
- `ATL0`
- `ATS0`
- `ATH0`
- `ATSP0`
- `0100`
- `010C`
- `0105`
- `03`

Ampliaciones read-only posteriores:

- `0120`
- `0140`
- `0160`
- `0180`
- `01A0`
- `01C0`
- `07`
- `0A`

Estas ampliaciones solo permiten lecturas: rangos de descubrimiento de PIDs y
lecturas DTC pendientes/permanentes. La lectura vacía de DTC pendientes y
permanentes ya fue observada en la parte B; cualquier otra afirmación física
requiere evidencia real del vehículo.

No expongas un campo que permita enviar comandos arbitrarios en
una versión destinada a conducción.

## Estado de cierre físico

La prueba física ya no está marcada como `NOT RUN` globalmente:

- A1, B y C están cerradas por evidencia registrada.
- A2 está cerrada por waiver del propietario en ADR-004, con la brecha concreta
  de recuperación post-fix por toggle de Bluetooth todavía sin rerun en el
  vehículo.
- D queda como no ejecutable hasta que exista un vehículo con DTC almacenados.

No afirmes evidencia física nueva sin una ejecución real contra el coche y sus
artefactos.

## Forma de trabajar

Antes de cambiar código:

1. Inspecciona el repositorio.
2. Ejecuta las pruebas existentes.
3. Presenta un plan breve.
4. Implementa cambios pequeños y comprobables.
5. Ejecuta lint, typecheck y tests.
6. Resume archivos modificados, pruebas y bloqueos reales.
