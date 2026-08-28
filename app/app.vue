<script setup lang="ts">
const colorMode = useColorMode()

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'es'
  }
})

useHead(() => ({
  meta: [
    { name: 'theme-color', content: colorMode.value === 'dark' ? '#0f172a' : '#ffffff' }
  ]
}))

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
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
