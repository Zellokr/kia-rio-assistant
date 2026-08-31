<script setup lang="ts">
defineProps<{
  label: string
  value: string
  unit?: string
  freshnessLabel: string
  stale: boolean
  icon?: string
  elevated?: boolean
  large?: boolean
}>()
</script>

<template>
  <UCard v-if="!elevated">
    <div class="flex min-h-36 flex-col justify-between gap-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-muted">{{ label }}</span>
        <UIcon
          v-if="icon"
          :name="icon"
          class="size-5 text-primary"
          aria-hidden="true"
        />
      </div>
      <div>
        <span
          class="font-mono font-bold tabular-nums transition-colors"
          :class="[
            large ? 'text-4xl' : 'text-2xl',
            stale ? 'text-muted/60' : 'text-highlighted'
          ]"
        >
          {{ value }}
        </span>
        <span
          v-if="unit"
          class="ml-1 text-xs text-muted"
        >{{ unit }}</span>
      </div>
      <span
        class="text-xs"
        :class="stale ? 'font-medium text-warning' : 'text-muted'"
      >
        {{ freshnessLabel }}
      </span>
    </div>
  </UCard>

  <div
    v-else
    class="rounded-xl bg-elevated p-4"
  >
    <p class="text-sm text-muted">
      {{ label }}
    </p>
    <p
      class="mt-2 font-mono text-2xl font-bold tabular-nums transition-colors"
      :class="stale ? 'text-muted/60' : 'text-highlighted'"
    >
      {{ unit ? `${value} ${unit}` : value }}
    </p>
    <p
      class="mt-1 text-xs"
      :class="stale ? 'font-medium text-warning' : 'text-muted'"
    >
      {{ freshnessLabel }}
    </p>
  </div>
</template>
