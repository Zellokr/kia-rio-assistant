# Assistant remote provider contract

The Android app is a static Capacitor build. It does **not** ship a Nitro
`/api` route, an AI SDK, or a model key. If a remote assistant is used, the APK
only knows a public HTTPS endpoint URL through
`NUXT_PUBLIC_ASSISTANT_ENDPOINT_URL`.

That endpoint owns every secret and provider-specific integration.

## Request

The app sends one JSON `POST` request:

```http
POST https://example.test/assistant
content-type: application/json
accept: application/json
```

Body shape is `AssistantRequest` from
`core/assistant/buildAssistantRequest.ts`:

```ts
interface AssistantRequest {
  query: {
    text: string
    intent: QuickCommandIntent | null
  }
  assessment: DiagnosticAssessment | null
  telemetry: Array<{
    key: string
    pid: string
    label: string
    value: number
    unit: string
    ageMs: number
  }>
  recentTurns: Array<{
    role: 'user' | 'assistant'
    text: string
  }>
  omissions: Array<
    | { kind: 'history-truncated'; droppedTurns: number }
    | { kind: 'stale-telemetry'; keys: string[] }
  >
}
```

The request deliberately has no audio, VIN, location, raw session log, client
secret, or full conversation history.

## Response

The endpoint returns JSON:

```ts
interface AssistantRemoteResponse {
  text: string
}
```

Only `text` is consumed. Any non-2xx response, network failure, malformed JSON,
missing `text`, or non-string `text` becomes local fallback in the app.

## Validation boundary

Remote text is always untrusted. The app passes it through
`resolveAssistantAnswer`, which validates the answer before showing it. If the
answer invents unsent DTCs/PIDs, downgrades critical severity, authorises
continued driving, promises a repair, or is empty, the remote answer is discarded
and replaced with the local template.

The backend must still use a conservative system prompt, but the APK does not
trust that prompt as a safety boundary.

## Deployment requirements

- Use HTTPS. Non-HTTPS URLs are rejected by the client provider and fall back
  locally.
- Keep model keys and provider credentials server-side only.
- Enable CORS for the Android WebView origin used by the deployed app.
- Treat the request as privacy-sensitive diagnostic context.
- Return quickly. The app falls back locally after the resolver timeout.

## Local/offline behavior

If `NUXT_PUBLIC_ASSISTANT_ENDPOINT_URL` is absent, the app never performs a
remote request. It shows the existing local fallback with reason `no-provider`.
