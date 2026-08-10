# Prueba física del transporte Web Serial/RFCOMM

**Estado: NOT RUN.** Esta lista no confirma compatibilidad con un vehículo o
adaptador concreto. Registra la evidencia real antes de cambiar ese estado.

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

1. Abre `/lab` y selecciona **Web Serial / Bluetooth RFCOMM (real)**.
2. Pulsa **Seleccionar adaptador** y elige únicamente el adaptador ya
   emparejado. El selector debe abrirse desde este gesto del usuario.
3. Confirma que la sesión queda en `selected` y registra el nombre mostrado.
4. Pulsa **Conectar**. Comprueba la apertura a 38 400 baudios, la
   inicialización ELM327 y el descubrimiento de PIDs.
5. Con la sesión en `ready`, prueba solo lecturas permitidas: `010C`, `0105` y
   `03`. No uses Mode 04, borrado de DTC, codificación ni adaptación.
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
