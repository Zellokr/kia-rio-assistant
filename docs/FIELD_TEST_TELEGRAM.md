# Field-test evidence over Telegram — TEMPORARY

**This exists to get session JSON off the phone during vehicle validation,
and is meant to be deleted afterwards.** Removal instructions are at the
bottom; nothing else in the project depends on it.

## Why it exists

`downloadJson` does nothing in the Android WebView, which ignores
`<a download>` on a `blob:` URL — so the phone is the one place a session
cannot be saved from, and the phone is where every physical session is
recorded. Copying hundreds of kilobytes of JSON through the clipboard next
to a running engine is not a plan.

## What it conflicts with, and how that is contained

`AGENTS.MD` forbids secrets in the client. A bot token inside a shipped APK
is exactly that: unzipping an APK and grepping its bundle is two commands.

So the token never reaches an ordinary build. Both the credentials and the
sender are behind `FIELD_TEST_TELEGRAM=1`:

- `nuxt.config.ts` puts the token in `runtimeConfig.public` **only** when the
  flag is set.
- `vite.define` turns `__FIELD_TEST_TELEGRAM__` into a build-time literal, so
  the branch that imports the sender is deleted by the bundler rather than
  skipped at runtime.

The difference matters and was not theoretical. The first version guarded the
dynamic import with a runtime boolean; the chunk shipped anyway, merely
unreachable, and `scripts/assert-no-field-test-secrets.mjs` caught it.

That script is the actual guarantee. It greps the built output — the emitted
bytes, not the source — for the sender, for `api.telegram.org`, and for
anything shaped like a bot token, and CI runs it after every build.

## What leaves the device

The whole session export: timestamps, the Bluetooth adapter's name, the
supported-PID map, and every trouble code read from the car. **No VIN** —
`PHYSICAL_ALLOWED_COMMANDS` contains no Mode 09, so the app cannot read one.

It goes to Telegram's servers. That is a deliberate trade for the field test
and the reason this is temporary.

## Setting it up, once

1. Message [@BotFather](https://t.me/BotFather) on Telegram, send
   `/newbot`, and follow it. It hands back a token shaped like
   `123456789:AA...`.
2. Create a channel (or use a private chat), and add the bot as an
   **administrator** — a bot cannot post to a channel it does not administer.
3. Get the chat id:
   - Public channel: its `@handle` works directly.
   - Private channel: post any message, then open
     `https://api.telegram.org/bot<TOKEN>/getUpdates` and read
     `result[].channel_post.chat.id`. It looks like `-1001234567890`.

## Building the field APK

```bash
FIELD_TEST_TELEGRAM=1 \
TELEGRAM_BOT_TOKEN=123456789:AA... \
TELEGRAM_CHAT_ID=-1001234567890 \
pnpm android:build:debug
```

Or `pnpm field:build`, which sets the flag and expects the two variables in
your environment.

**Do not distribute that APK.** It contains a working bot token. Keep it on
the phone doing the test, and rebuild without the flag afterwards.

To confirm an ordinary build is clean:

```bash
pnpm build:android:web && pnpm field:assert-clean
```

## Using it at the car

The **Enviar a Telegram** button appears in **Registro**, next to *Copiar
registro*, and only in a build made with the flag.

The upload is never the only copy. The session stays in the log and in
IndexedDB whether it succeeds or not, so a garage with no signal costs you
nothing — press it again when you have coverage. The status line under the
buttons says what happened, including when the network failed.

## Removing it

1. Delete `app/services/telegramFieldLog.ts`.
2. Delete `test/unit/telegramFieldLog.test.ts`.
3. Delete `scripts/assert-no-field-test-secrets.mjs` and the
   `field:assert-clean` / `field:build` scripts in `package.json`.
4. Delete the "Assert no field-test secrets" step in
   `.github/workflows/ci.yml`.
5. Remove the `runtimeConfig` and `vite.define` blocks in `nuxt.config.ts`,
   and the `define` block in `vitest.config.ts`.
6. Remove `telegramEnabled` / `sendToTelegram` from `useObdSessionLog` and
   `useObdSessionRecording`, the `telegram` prop and emit from `LogView` and
   `SessionLogPanel`, and `sendLogToTelegram` from `app/pages/index.vue`.
7. Delete this file.

Every one of those carries a `TEMPORARY` comment pointing back here, so
`grep -rn "TEMPORARY — field-test"` finds them all.
