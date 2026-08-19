<script setup lang="ts">
import type { LabNavView, LabViewId } from '~/utils/labNav'

defineProps<{
  views: LabNavView[]
  active: LabViewId
}>()

const emit = defineEmits<{
  select: [LabViewId]
}>()
</script>

<template>
  <nav
    class="hidden shrink-0 flex-col gap-2 border-r border-default bg-default/95 p-2 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] md:sticky md:top-0 md:flex md:h-screen md:w-20"
    aria-label="Navegación principal del laboratorio"
  >
    <UButton
      v-for="view in views"
      :key="view.value"
      :color="active === view.value ? 'primary' : 'neutral'"
      :variant="active === view.value ? 'soft' : 'ghost'"
      :icon="view.icon"
      size="lg"
      class="min-h-12 w-full flex-col justify-center gap-1 px-1 text-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      :aria-current="active === view.value ? 'page' : undefined"
      @click="emit('select', view.value)"
    >
      {{ view.label }}
    </UButton>
  </nav>
</template>
