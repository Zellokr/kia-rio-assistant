<script setup lang="ts">
/**
 * The application chrome: header, safe-area padding and the main region every
 * route renders into.
 *
 * This used to sit inside `app.vue` alongside the head and SEO calls. Those
 * are two different jobs — `app.vue` is the single root that configures the
 * document, a layout is the frame a page is placed in — and keeping them in
 * one file meant there was no frame to reuse. `error.vue` needs exactly this
 * frame, and could not have it.
 */
</script>

<template>
  <div class="min-h-dvh bg-muted">
    <UHeader
      class="border-b border-default bg-default/95 pt-[env(safe-area-inset-top)] backdrop-blur"
      :toggle="false"
    >
      <template #left>
        <NuxtLink
          to="/"
          class="flex min-h-12 items-center gap-3"
          aria-label="Abrir laboratorio OBD-II"
        >
          <span class="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UIcon
              name="i-lucide-car-front"
              class="size-5"
              aria-hidden="true"
            />
          </span>
          <span class="flex flex-col leading-tight">
            <span class="font-semibold text-highlighted">Kia Rio Assistant</span>
            <span class="text-xs text-muted">Área de diagnóstico local</span>
          </span>
        </NuxtLink>
      </template>

      <template #right>
        <UBadge
          color="success"
          variant="subtle"
          class="hidden sm:inline-flex"
        >
          Solo lectura
        </UBadge>
        <UColorModeButton
          size="lg"
          aria-label="Cambiar tema de color"
        />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
