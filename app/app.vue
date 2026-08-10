<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#0f172a' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'es'
  }
})

const title = 'Kia Rio Assistant'
const description = 'Área de diagnóstico local y seguro para Kia Rio.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})
</script>

<template>
  <UApp>
    <div class="min-h-dvh bg-muted">
      <UHeader
        class="border-b border-default bg-default/95 pt-[env(safe-area-inset-top)] backdrop-blur"
        :toggle="false"
      >
        <template #left>
          <NuxtLink
            to="/lab"
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
        <NuxtPage />
      </UMain>
    </div>
  </UApp>
</template>
