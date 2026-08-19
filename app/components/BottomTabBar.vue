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
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    aria-label="Navegación principal del laboratorio"
  >
    <UContainer class="max-w-md p-2">
      <div class="grid grid-cols-3 gap-2">
        <UButton
          v-for="view in views"
          :key="view.value"
          :color="active === view.value ? 'primary' : 'neutral'"
          :variant="active === view.value ? 'soft' : 'ghost'"
          :icon="view.icon"
          size="lg"
          class="min-h-14 flex-col justify-center gap-1 px-2 text-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
          :aria-current="active === view.value ? 'page' : undefined"
          @click="emit('select', view.value)"
        >
          {{ view.label }}
        </UButton>
      </div>
    </UContainer>
  </nav>
</template>
