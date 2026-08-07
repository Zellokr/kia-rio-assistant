# AGENTS.md

## Misión actual

Implementa exclusivamente la Fase 0 del laboratorio OBD-II.

El objetivo es comprobar la comunicación entre:

- Android y Chrome
- Web Serial sobre Bluetooth RFCOMM
- Veepeak OBDCheck BLE+
- Kia Rio YB 2019 1.2 MPI

No implementes todavía IA, Convex, voz, mantenimiento ni el
dashboard definitivo.

## Stack

- Node.js 24 LTS
- pnpm
- Nuxt 4
- Vue 3
- TypeScript estricto
- Vitest
- Playwright

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

Implementa:

1. `ObdTransport`.
2. `MockObdTransport`.
3. `WebSerialRfcommTransport`.
4. Parser incremental hasta el prompt `>`.
5. Cola FIFO de comandos.
6. Estados explícitos de conexión.
7. Logs exportables.
8. Página `/lab/obd`.
9. Pruebas unitarias con respuestas fragmentadas.
10. Instrucciones para la prueba física.

## Comandos permitidos inicialmente

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

No expongas un campo que permita enviar comandos arbitrarios en
una versión destinada a conducción.

## Finalización de la Fase 0

La tarea queda terminada cuando:

- El laboratorio funciona con el transporte simulado.
- El parser reconstruye respuestas fragmentadas.
- Los comandos se ejecutan secuencialmente.
- Los timeouts y desconexiones se controlan.
- El log puede exportarse.
- Las pruebas automatizadas pasan.
- La prueba física queda marcada como `NOT RUN` hasta que el usuario
  la realice en el coche.

## Fuentes

Consulta solo cuando sea necesario:

- `docs/architecture.md`
- `docs/phase-0.md`
- `docs/obd-protocol.md`
- `docs/testing.md`
- `docs/safety.md`
- `Especificacion_Final_Asistente_Kia_Rio_v2.0.pdf`

## Forma de trabajar

Antes de cambiar código:

1. Inspecciona el repositorio.
2. Ejecuta las pruebas existentes.
3. Presenta un plan breve.
4. Implementa cambios pequeños y comprobables.
5. Ejecuta lint, typecheck y tests.
6. Resume archivos modificados, pruebas y bloqueos reales.

Detente al completar la Fase 0.
