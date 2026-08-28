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
  <!--
    Five destinations, all visible, no scrolling.

    This bar briefly became a horizontally scrolling row when the lab grew
    from three destinations to five. Scrolling a bottom bar hides
    destinations behind a gesture with nothing on screen to announce them,
    and it is the one navigation pattern a driver cannot afford to hunt
    through. Five is the documented ceiling for this pattern, so five still
    fit — as an equal-width grid rather than a row that overflows.

    The column count is fixed at five rather than derived from `views.length`
    so that adding a sixth destination breaks the layout visibly here
    instead of silently reintroducing the overflow.
  -->
  <nav
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    aria-label="Navegación principal del laboratorio"
  >
    <UContainer class="max-w-none px-1 py-1.5">
      <div class="grid grid-cols-5 gap-0.5">
        <UButton
          v-for="view in views"
          :key="view.value"
          :color="active === view.value ? 'primary' : 'neutral'"
          :variant="active === view.value ? 'soft' : 'ghost'"
          :icon="view.icon"
          :aria-label="view.label"
          :aria-current="active === view.value ? 'page' : undefined"
          class="min-h-14 min-w-0 flex-col justify-center gap-0.5 px-0.5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          :ui="{ leadingIcon: 'size-5 shrink-0' }"
          @click="emit('select', view.value)"
        >
          <!--
            Truncation is a guard, not the plan: every label fits at 320px.
            It is here so a longer one can never wrap to a third line and
            push the bar over the content it sits above.
          -->
          <span class="w-full truncate text-center text-xs leading-tight">
            {{ view.label }}
          </span>
        </UButton>
      </div>
    </UContainer>
  </nav>
</template>
