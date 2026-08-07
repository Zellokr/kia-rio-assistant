---
name: nuxt-ui
description: Build UIs with @nuxt/ui v4 — 125+ accessible Vue components with Tailwind CSS theming. Use when creating interfaces, customizing themes to match a brand, building forms, or composing layouts like dashboards, docs sites, and chat interfaces. Prioritizes visual coherence, consistent spacing, alignment and solid UI/UX.
---

# Nuxt UI

Vue component library built on [Reka UI](https://reka-ui.com/) + [Tailwind CSS](https://tailwindcss.com/) + [Tailwind Variants](https://www.tailwind-variants.org/). Works with Nuxt, Vue (Vite), Laravel (Vite + Inertia), and AdonisJS (Vite + Inertia).

## MCP Server

Use the mcp server nuxt-ui to access the component library reference files. The MCP server provides a **single source of truth** for all component documentation, props, slots, events, and usage examples.

Key MCP tools:
- `search_components` — find components by name, description, or category (no params = list all)
- `search_composables` — find composables by name or description (no params = list all)
- `search_icons` — search Iconify icons (defaults to `lucide`), returns `i-{prefix}-{name}` names
- `get_component` — full component documentation with usage examples
- `get_component_metadata` — props, slots, events (lightweight, no docs content)
- `get_example` — real-world code examples

When you need to know **what a component accepts** or **how its API works**, use the MCP. This skill teaches you **when to use which component** and **how to build well**.

## Core rules (always apply)

1. **Always wrap the app in `UApp`** — required for toasts, tooltips, and programmatic overlays. Accepts a `locale` prop for i18n.
2. **Always use semantic colors** — `text-default`, `bg-elevated`, `border-muted`, `text-muted`, `bg-primary`, etc. Never use raw Tailwind palette colors like `text-gray-500` or `bg-slate-100`.
3. **Read generated theme files for slot names** — Nuxt: `.nuxt/ui/<component>.ts`, Vue: `node_modules/.nuxt-ui/ui/<component>.ts`. These show every slot, variant, and default class for any component.
4. **Override priority** (highest wins): `ui` prop / `class` prop → global config → theme defaults.
5. **Icons use `i-{collection}-{name}` format** — `lucide` is the default collection. Use the MCP `search_icons` tool to find icons, or browse at [icones.js.org](https://icones.js.org).

## Visual Coherence & UI/UX Rules (mandatory)

These rules ensure every interface feels intentional, balanced and professional. Apply them on **every** layout, page and component composition.

### 1. Spacing system (8pt grid)

Use the Tailwind spacing scale exclusively. Prefer multiples of 4 (especially 8):

| Token   | Value | Use for                                      |
|---------|-------|----------------------------------------------|
| `1` / `0.5` | 4px / 2px | Micro adjustments, icon gaps                |
| `2`     | 8px   | Tight gaps between related elements          |
| `3`     | 12px  | Compact lists, form field gaps               |
| `4`     | 16px  | Default gap between elements in a group      |
| `6`     | 24px  | Section internal padding / medium separation |
| `8`     | 32px  | Card padding, major group separation         |
| `12`    | 48px  | Section vertical rhythm                      |
| `16`    | 64px  | Large page sections / hero spacing           |

**Rules:**
- Never use arbitrary values (`p-[13px]`, `gap-[1.1rem]`). Stick to the scale.
- Prefer `gap-*` on flex/grid containers over individual margins when possible.
- Vertical rhythm: keep consistent vertical spacing inside the same visual group.
- External margin ≥ internal padding (elements need more air outside than inside).

### 2. Padding & margin conventions

- **Cards / panels / elevated surfaces**: `p-4` (compact) or `p-6` (comfortable). Avoid mixing both in the same view.
- **Page containers**: `px-4 sm:px-6 lg:px-8` + `py-6` or `py-8`.
- **Form fields**: `space-y-4` or `gap-4` between fields. Labels + control should have `gap-1.5` or `gap-2`.
- **Buttons groups**: `gap-2` or `gap-3`. Never leave buttons floating without consistent horizontal spacing.
- **Lists**: Use `divide-y divide-default` + consistent `py-3` / `py-4` on items, or `space-y-1` for compact menus.
- Prefer **padding on the parent** rather than margins on every child when the goal is internal breathing room.

### 3. Alignment & layout structure

- Always define a clear **alignment axis**:
  - Horizontal groups → `flex items-center gap-*`
  - Vertical stacks → `flex flex-col gap-*` or `space-y-*`
  - Complex layouts → CSS Grid with explicit `gap-*`
- Align related elements on the same baseline (`items-center` or `items-baseline`).
- Never mix left-aligned and center-aligned content in the same visual section without a strong hierarchy reason.
- Use `justify-between` only when the two extremes are intentionally related (header actions, toolbar).
- For multi-column content, prefer `grid grid-cols-* gap-*` over nested floats or absolute positioning.

### 4. Visual hierarchy & density

- **Primary actions** stand out (color + size). Secondary actions use `variant="ghost"` or `variant="soft"`.
- Maintain consistent density within a page:
  - Dense UIs (tables, sidebars, settings) → tighter gaps (`gap-2` / `gap-3`, `p-4`)
  - Marketing / landing → more generous spacing (`gap-6` / `gap-8`, `py-12`+)
- Group related information with proximity (Gestalt). Separate unrelated groups with more space or a subtle divider (`border-t border-default` / `divide-y`).
- Avoid “floating” elements: every element should feel anchored to a group or to the layout structure.

### 5. Component-level consistency

- Prefer Nuxt UI layout primitives (`UContainer`, `UCard`, `UPage*`, `UDashboard*`, `UHeader`, etc.) over raw `<div class="...">` when they exist.
- When overriding with the `ui` prop or `class`, keep the same spacing language used by the design system.
- Icons next to text: always use `gap-2` (or `gap-1.5`) and `items-center`.
- Form controls + labels + descriptions: keep the vertical stack tight (`gap-1` / `gap-1.5`) and the fields themselves consistently spaced.

### 6. Responsive behavior

- Mobile-first spacing: start with `px-4 py-6`, then increase at `sm:` / `lg:`.
- Collapse gaps and padding on small screens when needed (`gap-4 lg:gap-6`).
- Avoid large horizontal padding on mobile that wastes precious width.

### Quick visual checklist (run before finishing any UI)

- [ ] All spacing values come from the Tailwind scale (no arbitrary numbers)
- [ ] Related elements share the same gap / alignment
- [ ] Cards and panels use consistent internal padding
- [ ] Vertical rhythm is even inside each section
- [ ] Primary vs secondary actions are visually distinct
- [ ] No element feels randomly placed or cramped
- [ ] Semantic colors only (`text-muted`, `bg-elevated`, `border-default`…)
- [ ] Layout uses flex/grid + `gap-*` instead of scattered margins

## How to use this skill

Based on the task, load the relevant reference files **before writing any code**. Don't load everything — only what's needed.

### Reference files

**Guidelines** — design decisions and conventions:
- [design-system](references/guidelines/design-system.md) — semantic colors, theming, brand customization, variants, the `ui` prop
- [component-selection](references/guidelines/component-selection.md) — decision matrices: when to use Modal vs Slideover, Select vs SelectMenu, Toast vs Alert, etc.
- [conventions](references/guidelines/conventions.md) — coding patterns, slot naming, items arrays, composables, keyboard shortcuts
- [forms](references/guidelines/forms.md) — form validation, field layout, error handling, Standard Schema

**Layouts** — full page structure patterns:
- [landing](references/layouts/landing.md) — landing pages, blog, changelog, pricing
- [dashboard](references/layouts/dashboard.md) — admin UI with sidebar and panels
- [docs](references/layouts/docs.md) — documentation sites with navigation and TOC
- [chat](references/layouts/chat.md) — AI chat with Vercel AI SDK
- [editor](references/layouts/editor.md) — rich text editor with toolbars

**Recipes** — complete patterns for common tasks:
- [data-tables](references/recipes/data-tables.md) — tables with filters, pagination, sorting, selection
- [auth](references/recipes/auth.md) — login, signup, forgot password forms
- [overlays](references/recipes/overlays.md) — modals, slideovers, drawers, command palette
- [navigation](references/recipes/navigation.md) — headers, sidebars, breadcrumbs, tabs

**Quick reference:**
- [components](references/components.md) — categorized component index for finding the right component name

### Routing table

| Task | Load these references |
|---|---|
| Build a landing page | design-system, conventions, landing |
| Build a dashboard / admin UI | conventions, component-selection, dashboard |
| Add a settings page | conventions, forms |
| Create a login / signup form | conventions, forms, auth |
| Display data in a table | conventions, component-selection, data-tables |
| Customize theme / brand colors | design-system |
| Add a chat interface | conventions, chat |
| Add a modal, slideover, or drawer | conventions, component-selection, overlays |
| Build site navigation | conventions, component-selection, navigation |
| Build a documentation site | conventions, docs |
| Render markdown | component-selection, components, docs |
| Add a rich text editor | conventions, editor |
| General UI work | conventions, component-selection |

## Installation

### Nuxt

```bash
pnpm add @nuxt/ui tailwindcss
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css']
})
```

```css
/* app/assets/css/main.css */
@import "tailwindcss";
@import "@nuxt/ui";
```

```vue
<!-- app.vue -->
<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
```

### Vue (Vite)

```bash
pnpm add @nuxt/ui tailwindcss
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'

export default defineConfig({
  plugins: [
    vue(),
    ui()
  ]
})
```

```ts
// src/main.ts
import './assets/css/main.css'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'

const app = createApp(App)
const router = createRouter({
  routes: [],
  history: createWebHistory()
})

app.use(router)
app.use(ui)
app.mount('#app')
```

```css
/* src/assets/css/main.css */
@import "tailwindcss";
@import "@nuxt/ui";
```

```vue
<!-- src/App.vue -->
<template>
  <UApp>
    <RouterView />
  </UApp>
</template>
```

> Add `class="isolate"` to your root `<div id="app">` in `index.html`.
> For Inertia: use `ui({ router: 'inertia' })` in `vite.config.ts`.
```
