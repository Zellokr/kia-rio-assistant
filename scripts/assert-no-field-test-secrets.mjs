#!/usr/bin/env node
/**
 * TEMPORARY — field-test evidence delivery. Delete with
 * `app/services/telegramFieldLog.ts`; see `docs/FIELD_TEST_TELEGRAM.md`.
 *
 * Asserts that an ordinary build carries no Telegram credentials and no
 * sender code.
 *
 * `AGENTS.MD` forbids secrets in the client. The field-test uploader is
 * allowed to exist only because `FIELD_TEST_TELEGRAM=1` gates both the
 * credentials in `runtimeConfig.public` and the dynamic import that pulls
 * the sender in — so without the flag the bundle should contain neither.
 *
 * That claim is about emitted bytes, not about source, so it is checked
 * against the built output. Reading the source would only prove the gate was
 * typed, which is exactly the kind of assertion this project keeps replacing.
 *
 * Run after `pnpm build:android:web`, with the flag unset.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../.output/public', import.meta.url).pathname

/** Strings that must never appear in a build made without the flag. */
const FORBIDDEN = [
  'api.telegram.org',
  'sendSessionToTelegram'
]

/**
 * A real bot token is `<digits>:<35 base64url chars>`. Matched by shape so
 * this keeps working if the credentials are rotated, and so it catches a
 * token that arrived through some path nobody predicted.
 */
const TOKEN_SHAPE = /\b\d{8,12}:[A-Za-z0-9_-]{30,40}\b/

function walk(dir) {
  const found = []

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)

    if (statSync(path).isDirectory()) {
      found.push(...walk(path))
    } else if (/\.(js|mjs|json|html|css|map)$/.test(entry)) {
      found.push(path)
    }
  }

  return found
}

if (process.env.FIELD_TEST_TELEGRAM === '1') {
  console.log(
    'FIELD_TEST_TELEGRAM=1 — this build is a field-test build by request; skipping.'
  )
  process.exit(0)
}

let files

try {
  files = walk(ROOT)
} catch {
  console.error(
    `No build found at ${ROOT}. Run \`pnpm build:android:web\` first.`
  )
  process.exit(1)
}

if (files.length === 0) {
  console.error(`No build output under ${ROOT}. Refusing to pass vacuously.`)
  process.exit(1)
}

const problems = []

for (const file of files) {
  const contents = readFileSync(file, 'utf8')

  for (const needle of FORBIDDEN) {
    if (contents.includes(needle)) {
      problems.push(`${file}: contains ${JSON.stringify(needle)}`)
    }
  }

  const token = contents.match(TOKEN_SHAPE)

  if (token) {
    // The value is deliberately not printed.
    problems.push(`${file}: contains something shaped like a bot token`)
  }
}

if (problems.length > 0) {
  console.error('Field-test credentials or sender code leaked into the build:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error(
    '\nThis build must not be installed or distributed. See'
    + ' app/services/telegramFieldLog.ts.'
  )
  process.exit(1)
}

console.log(
  `No field-test credentials or sender code in ${files.length} built files.`
)
