// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    name: 'project/android-generated',
    ignores: [
      'android/.gradle/**',
      'android/**/build/**',
      'android/app/src/main/assets/**'
    ]
  }
)
