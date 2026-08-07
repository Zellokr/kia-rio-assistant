<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

import { MockObdTransport } from '~~/core/obd/transport/MockObdTransport'

const transport = new MockObdTransport()

const status = ref(transport.state)
const log = ref<string[]>([])

const commands = [
  'ATZ',
  'ATE0',
  'ATL0',
  'ATS0',
  'ATH0',
  'ATSP0',
  '0100',
  '010C',
  '0105',
  '03'
]

const selectedCommand = ref('ATZ')

const unsubscribe = transport.subscribe((data) => {
  const text = new TextDecoder().decode(data)

  log.value.push(`RX ← ${text}`)
})

async function selectDevice() {
  try {
    await transport.select()

    status.value = transport.state

    log.value.push('Dispositivo seleccionado')
  } catch (error) {
    log.value.push(`ERROR: ${String(error)}`)
  }
}

async function connect() {
  try {
    await transport.connect()

    status.value = transport.state

    log.value.push('Conectado')
  } catch (error) {
    log.value.push(`ERROR: ${String(error)}`)
  }
}

async function disconnect() {
  try {
    await transport.disconnect()

    status.value = transport.state

    log.value.push('Desconectado')
  } catch (error) {
    log.value.push(`ERROR: ${String(error)}`)
  }
}

async function sendCommand() {
  const command = selectedCommand.value

  log.value.push(`TX → ${command}`)

  try {
    await transport.write(new TextEncoder().encode(`${command}\r`))

    status.value = transport.state
  } catch (error) {
    log.value.push(`ERROR: ${String(error)}`)
  }
}

function clearLog() {
  log.value = []
}

onBeforeUnmount(() => {
  unsubscribe()
})
</script>

<template>
  <main class="px-4 sm:px-6 lg:px-8 py-6">
    <UContainer>
      <h1 class="text-2xl font-semibold mb-4">
        OBD-II Lab
      </h1>

      <UCard class="p-4 mb-4">
        <div class="flex items-center justify-between">
          <div class="text-sm text-muted">
            Estado: <strong class="ml-2">{{ status }}</strong>
          </div>

          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              size="md"
              @click="selectDevice"
            >
              Seleccionar adaptador
            </UButton>
            <UButton
              color="primary"
              variant="soft"
              size="md"
              @click="connect"
            >
              Conectar
            </UButton>
            <UButton
              color="error"
              variant="soft"
              size="md"
              @click="disconnect"
            >
              Desconectar
            </UButton>
          </div>
        </div>
      </UCard>

      <UCard class="p-4 mb-4">
        <div class="flex items-center gap-4">
          <USelect
            v-model="selectedCommand"
            :items="commands"
            class="w-48"
          />

          <UButton
            color="primary"
            size="md"
            variant="subtle"
            @click="sendCommand"
          >
            Enviar
          </UButton>
        </div>
      </UCard>

      <UCard class="p-4 mb-4">
        <div class="flex justify-between items-center mb-2">
          <div class="text-sm text-muted">
            Logs
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            @click="clearLog"
          >
            Limpiar
          </UButton>
        </div>

        <pre class="min-h-[300px] p-4 bg-elevated text-default rounded overflow-auto">{{ log.join('\n') }}</pre>
      </UCard>
    </UContainer>
  </main>
</template>

<style scoped>
.text-muted { color: rgba(107,114,128,1); }
.bg-elevated { background-color: #0b1220; }
.text-default { color: #e6eef8; }
.bg-primary { background-color: #2563eb; }
</style>
