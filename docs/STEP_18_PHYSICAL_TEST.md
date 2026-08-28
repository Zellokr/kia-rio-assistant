# Prueba física del transporte Web Serial/RFCOMM

> **OBSOLETO desde el 2026-08-25. No ejecutes este procedimiento.**
> El transporte que describe ya no existe: `WebSerialRfcommTransport` fue
> eliminado del repositorio, y `PHYSICAL_TRANSPORT_KINDS` contiene una sola
> entrada, `android-ble`. No hay nada en la aplicación que pueda realizar estos
> pasos. Este documento se conserva como historial de una ruta que nunca llegó
> al vehículo, no como una lista de tareas pendiente.
> Motivo de la eliminación y evidencia completa: la enmienda de
> [ADR-002](decisions/ADR-002-obd-transport.md).
> **Lo único vivo que contenía este archivo** — la validación de Mode 03
> multi-trama, que no dependía del transporte — se movió a
> [DTC_PHYSICAL_VALIDATION.md](DTC_PHYSICAL_VALIDATION.md).

**Estado: NOT RUN, y ya no ejecutable.** Esta lista nunca confirmó
compatibilidad con ningún vehículo o adaptador, y ya no puede hacerlo.

> **Compatibilidad Android no confirmada:** la documentación oficial actual de
> Chrome limita Web Serial nativo a plataformas de escritorio. En Android solo
> documenta serial USB mediante WebUSB y un polyfill; el soporte RFCOMM de
> Chrome también se anuncia para escritorio. La detección en ejecución es la
> autoridad: si `navigator.serial` no existe, este recorrido no puede continuar
> y hará falta otro puente de transporte.

## Requisitos previos

- Android con una versión de Chrome que exponga `navigator.serial`.
- Aplicación servida desde un contexto seguro: HTTPS o `localhost`.
- Adaptador OBD emparejado en Android y visible como puerto serie Bluetooth
  RFCOMM en el selector de Chrome.
- Vehículo inmovilizado, freno de estacionamiento aplicado y zona ventilada.
- Para la primera conexión, contacto puesto y motor apagado. Arranca el motor
  solo cuando sea necesario para observar RPM y sea seguro hacerlo.

Si Chrome no muestra Web Serial o el adaptador no aparece como puerto RFCOMM,
detén la prueba. No asumas compatibilidad ni cambies permisos al azar.

Referencias: [Web Serial y plataformas compatibles](https://developer.chrome.com/docs/capabilities/serial)
y [serial Bluetooth RFCOMM en Chrome](https://developer.chrome.com/blog/serial-over-bluetooth/).

## Recorrido seguro

1. Abre `/` y selecciona **Web Serial / Bluetooth RFCOMM (real)**.
2. Pulsa **Seleccionar adaptador** y elige únicamente el adaptador ya
   emparejado. El selector debe abrirse desde este gesto del usuario.
3. Confirma que la sesión queda en `selected` y registra el nombre mostrado.
4. Pulsa **Conectar**. Comprueba la apertura a 38 400 baudios, la
   inicialización ELM327 y el descubrimiento de PIDs.
5. Con la sesión en `ready`, prueba solo lecturas permitidas: `010C`, `0105` y
   `03`. No uses Mode 04, borrado de DTC, codificación ni adaptación.
   - La validación pendiente de Mode 03 multi-trama **ya no vive aquí**. Nunca
     fue específica de Web Serial, así que se movió a
     [DTC_PHYSICAL_VALIDATION.md](DTC_PHYSICAL_VALIDATION.md), que sí está
     vigente. Es el documento al que apunta `decodeMode03Response.ts`.
6. Inicia telemetría durante un intervalo corto. Comprueba que los valores y
   latencias se actualizan sin bloquear la interfaz.
7. Detén la telemetría, pulsa **Desconectar** y confirma `disconnected`.
8. Exporta el log JSON después de desconectar.

## Evidencia que debes guardar

- Modelo y versión de Android y Chrome.
- Estado de `navigator.serial` y si la página estaba bajo HTTPS o localhost.
- Nombre del adaptador mostrado por el selector y si RFCOMM era visible.
- Estados de selección, conexión, inicialización, descubrimiento y cierre.
- Comandos ejecutados, respuestas sin editar, fragmentación y latencias.
- PIDs descubiertos, valores leídos y cualquier timeout o desconexión.
- JSON exportado con la sesión cerrada, sin datos personales innecesarios.

## Detén la prueba si

- El vehículo no está inmovilizado o el entorno deja de ser seguro.
- El adaptador, el teléfono o el conector OBD se calientan de forma anormal.
- Chrome pierde el puerto repetidamente, aparecen escrituras no solicitadas o
  la ECU/adaptador responde de manera inesperada.
- La aplicación ofrece Mode 04, borrado, codificación, adaptación o un comando
  arbitrario. Esta fase es exclusivamente de lectura.
