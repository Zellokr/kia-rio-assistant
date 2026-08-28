# Field-test evidence over Telegram — TEMPORARY

**This exists to get session JSON off the phone during vehicle validation.**
A/B/C are now closed and D is not executable on the current car, so keep this
field-test path only if future post-fix Bluetooth-toggle rerun evidence or a
new field session still needs phone-side export. Ordinary builds must not carry
Telegram credentials or sender code; removal instructions are at the bottom and
nothing else in the project depends on it.

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

It goes to Telegram's servers. That was a deliberate trade for field evidence,
and is the reason this remains temporary rather than part of ordinary builds.

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

The **Enviar informe** button appears in **Registro**, next to *Copiar
registro*, and only in a build made with the flag.

Press it once, at the end. It posts a report and then every recorded
session as a JSON file. **There is nothing to write down**: everything the
procedure asks a human to observe — whether each connection reached ready
and how long it took, what errored, whether a drop was detected, whether
recovery happened and how long it took, and whether telemetry resumed
afterwards — is computed from the event log by
`core/obd/fieldTest/summariseFieldTest.ts`.

The report is descriptive, never a verdict. It says what the log contains
and leaves the pass/fail to a person. It does call out the one thing that
sends people home early: a session with no drop recorded is an unfinished
A2, not a passing one.

### It reads storage, not the live log

`sessionLog.start()` resets the log, and `selectDevice()` calls it on every
connection attempt — so after ten connect/disconnect cycles the live log
holds the tenth and nothing else. Exporting it would have sent one
connection while claiming to be evidence for ten. The sessions are read
back from IndexedDB, where each was written as it happened.

### Failure is survivable

The upload is never the only copy. Sessions stay in IndexedDB whether it
succeeds or not, so a garage with no signal costs you nothing — press it
again when you have coverage. The report goes first, so if the connection
dies mid-upload the numbers that decide whether to keep testing have
already arrived. The status line under the buttons says what happened.

## Removing it

1. Delete `app/services/telegramFieldLog.ts`,
   `app/services/sendFieldTestReport.ts` and
   `core/obd/fieldTest/`.
2. Delete `test/unit/telegramFieldLog.test.ts` and
   `test/unit/summariseFieldTest.test.ts`.
3. Delete `scripts/assert-no-field-test-secrets.mjs` and the
   `field:assert-clean` / `field:build` scripts in `package.json`.
4. Delete the "Assert no field-test secrets" step in
   `.github/workflows/ci.yml`.
5. Remove the `runtimeConfig` and `vite.define` blocks in `nuxt.config.ts`,
   and the `define` block in `vitest.config.ts`.
6. Remove `telegramEnabled` from `useObdSessionLog`, `sendFieldReport` from
   `useObdSessionRecording`, both from `useObdLabSession`, the `telegram`
   prop and emit from `LogView` and `SessionLogPanel`, and
   `sendLogToTelegram` from `app/pages/index.vue`. That leaves **Copiar
   registro** as the only way to get a session off the phone, so remove this
   only after deciding no post-fix Bluetooth-toggle rerun or other field
   evidence still needs Telegram export.
7. Delete this file.

Every one of those carries a `TEMPORARY` comment pointing back here, so
`grep -rn "TEMPORARY — field-test"` finds them all.
