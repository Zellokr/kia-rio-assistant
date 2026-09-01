<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import type {
  MaintenanceDue
} from '~~/core/maintenance/computeMaintenanceDue'
import { useMaintenanceRecords } from '~/composables/useMaintenanceRecords'

/**
 * The owner's service history, inside Registro rather than behind a sixth
 * destination — the same reason the speech probe lives here. The bottom bar
 * is capped at five on purpose, and this destination already holds what the
 * app knows over time rather than what it is reading right now.
 *
 * Every number on this screen was typed by a person. The panel says so, in
 * the one place it could otherwise be mistaken for live data: a
 * remaining-kilometres figure always names the reading it was measured from
 * and when that reading was taken, because this vehicle's odometer is not
 * among the PIDs this project reads.
 */

const {
  due,
  records,
  available,
  errorMessage,
  load,
  save
} = useMaintenanceRecords()

const today = new Date().toISOString().slice(0, 10)

const performedAt = ref(today)
const odometerKm = ref<number | null>(null)
const item = ref('')
const notes = ref('')
const intervalKm = ref<number | null>(null)
const intervalMonths = ref<number | null>(null)
const saving = ref(false)
const savedMessage = ref('')

const hasRecords = computed(() => records.value.length > 0)

onMounted(load)

async function submit(): Promise<void> {
  saving.value = true
  savedMessage.value = ''

  const stored = await save({
    performedAt: performedAt.value,
    odometerKm: odometerKm.value ?? Number.NaN,
    item: item.value,
    notes: notes.value,
    intervalKm: intervalKm.value,
    intervalMonths: intervalMonths.value
  })

  saving.value = false

  if (stored) {
    savedMessage.value = 'Registro guardado.'
    item.value = ''
    notes.value = ''
  }
}

/** Never "faltan 3 días" for something already past: overdue says so first. */
function dueLabel(entry: MaintenanceDue): string {
  if (entry.overdue) {
    return 'Vencido'
  }

  if (entry.remainingDays !== null) {
    return `Faltan ${entry.remainingDays} días`
  }

  return entry.remainingKm !== null
    ? `Faltan ${entry.remainingKm.toLocaleString('es-ES')} km`
    : 'Sin intervalo'
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="min-w-0">
        <h2 class="font-semibold text-highlighted">
          Mantenimiento
        </h2>
        <p class="text-sm leading-6 text-muted">
          Lo que registras tú. El coche no informa de su cuentakilómetros, así
          que los avisos se calculan sobre la última lectura que hayas
          introducido.
        </p>
      </div>
    </template>

    <div class="space-y-6">
      <p
        v-if="!available"
        class="text-sm text-muted"
      >
        Este dispositivo no tiene almacenamiento local disponible, así que no
        se puede guardar el historial.
      </p>

      <section aria-labelledby="maintenance-due-heading">
        <h3
          id="maintenance-due-heading"
          class="mb-2 text-sm font-medium text-highlighted"
        >
          Próximos vencimientos
        </h3>

        <p
          v-if="!hasRecords"
          class="text-sm text-muted"
        >
          Todavía no has registrado ningún mantenimiento.
        </p>

        <ul
          v-else
          class="space-y-2"
        >
          <li
            v-for="entry in due"
            :key="entry.item"
            class="rounded-xl border px-4 py-3"
            :class="entry.overdue
              ? 'border-warning/40 bg-warning/10'
              : 'border-default'"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span class="font-medium text-highlighted">{{ entry.item }}</span>
              <UBadge
                :color="entry.overdue ? 'warning' : 'neutral'"
                variant="subtle"
              >
                {{ dueLabel(entry) }}
              </UBadge>
            </div>

            <p class="mt-1 text-sm text-muted">
              Último: {{ entry.lastPerformedAt }} a
              {{ entry.lastOdometerKm.toLocaleString('es-ES') }} km.
              <template v-if="entry.dueOnDate">
                Toca el {{ entry.dueOnDate }}.
              </template>
              <template v-if="entry.dueAtKm">
                Toca a los {{ entry.dueAtKm.toLocaleString('es-ES') }} km.
              </template>
            </p>

            <!--
              The provenance line. Without it a kilometre figure reads as
              something the app measured, and it is not: it is arithmetic on
              a number the owner typed on a date that may be months old.
            -->
            <p
              v-if="entry.basedOnOdometer"
              class="mt-1 text-xs text-muted"
            >
              Según los
              {{ entry.basedOnOdometer.km.toLocaleString('es-ES') }} km que
              registraste el {{ entry.basedOnOdometer.readAt }}.
            </p>
          </li>
        </ul>
      </section>

      <form
        class="space-y-3"
        aria-labelledby="maintenance-form-heading"
        @submit.prevent="submit"
      >
        <h3
          id="maintenance-form-heading"
          class="text-sm font-medium text-highlighted"
        >
          Registrar un mantenimiento
        </h3>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="flex flex-col gap-1">
            <label
              class="text-sm text-muted"
              for="maintenance-item"
            >Qué se hizo</label>
            <UInput
              id="maintenance-item"
              v-model="item"
              placeholder="Cambio de aceite y filtro"
              autocomplete="off"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label
              class="text-sm text-muted"
              for="maintenance-date"
            >Fecha</label>
            <UInput
              id="maintenance-date"
              v-model="performedAt"
              type="date"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label
              class="text-sm text-muted"
              for="maintenance-odometer"
            >Kilómetros del coche</label>
            <UInput
              id="maintenance-odometer"
              v-model.number="odometerKm"
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="92400"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label
              class="text-sm text-muted"
              for="maintenance-interval-km"
            >Se repite cada (km)</label>
            <UInput
              id="maintenance-interval-km"
              v-model.number="intervalKm"
              type="number"
              min="1"
              inputmode="numeric"
              placeholder="15000"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label
              class="text-sm text-muted"
              for="maintenance-interval-months"
            >Se repite cada (meses)</label>
            <UInput
              id="maintenance-interval-months"
              v-model.number="intervalMonths"
              type="number"
              min="1"
              inputmode="numeric"
              placeholder="12"
            />
          </div>

          <div class="flex flex-col gap-1">
            <label
              class="text-sm text-muted"
              for="maintenance-notes"
            >Notas (opcional)</label>
            <UInput
              id="maintenance-notes"
              v-model="notes"
              placeholder="Taller, aceite usado…"
              autocomplete="off"
            />
          </div>
        </div>

        <p class="text-xs text-muted">
          El intervalo lo pones tú, del libro de mantenimiento del coche. Esta
          app no lo sabe y no se lo inventa. Puedes dejar los dos en blanco si
          solo quieres dejar constancia.
        </p>

        <UButton
          type="submit"
          :loading="saving"
          :disabled="saving || !available"
        >
          Guardar registro
        </UButton>

        <p
          class="text-sm"
          :class="errorMessage ? 'text-warning' : 'text-muted'"
          role="status"
          aria-live="polite"
        >
          {{ errorMessage || savedMessage }}
        </p>
      </form>
    </div>
  </UCard>
</template>
