import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:https'
import type { Server } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildAssistantRequest } from '../../core/assistant/buildAssistantRequest'
import type {
  AssistantRequest
} from '../../core/assistant/buildAssistantRequest'
import {
  resolveAssistantAnswer
} from '../../core/assistant/resolveAssistantAnswer'
import {
  createRemoteAssistantProvider
} from '~/services/remoteAssistantProvider'

/**
 * The remote assistant seam against a real HTTPS server.
 *
 * `test/unit/remoteAssistantProvider.test.ts` covers the same outcomes with an
 * injected `fetchImpl`, which proves the branching and nothing about the wire.
 * This file removes that injection: `createRemoteAssistantProvider` is called
 * with one argument, so it uses its own `globalThis.fetch` default, and the
 * bytes cross a loopback TLS socket to a dummy endpoint that answers
 * `{ "text": "..." }`. No AI key, no provider account and no backend of any
 * kind is involved — the dummy is the whole server.
 *
 * **What this proves.** That the configured URL is really contacted over
 * HTTPS, that an `AssistantRequest` survives `JSON.stringify` and arrives
 * intact, that a real `Response` is parsed, and that every failure a network
 * can produce — a status code, a payload without `text`, a refused
 * connection, a slow answer — degrades to the local template instead of
 * removing the answer.
 *
 * **What this does NOT prove.** Certificate validation is switched off for
 * the loopback dummy, so the deployment requirement of a trusted certificate
 * is untested here. Neither is the Android WebView: this is Node's fetch, not
 * the one inside the APK, and no run on the phone backs any claim in this
 * file. CORS is likewise a deployment concern a same-process server cannot
 * exercise.
 */

interface ReceivedRequest {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string | string[] | undefined>
  readonly body: string
}

/** Set per test; decides what the dummy endpoint answers. */
type Responder = (received: ReceivedRequest) => Promise<{
  status: number
  body: string
}>

let server: Server
let endpointUrl: string
let certDir: string
let previousTlsSetting: string | undefined
let respond: Responder
let received: ReceivedRequest[] = []

function selfSignedCert(): { cert: Buffer, key: Buffer } {
  certDir = mkdtempSync(join(tmpdir(), 'kia-assistant-seam-'))

  const certPath = join(certDir, 'cert.pem')
  const keyPath = join(certDir, 'key.pem')

  // Generated per run and thrown away; nothing here is ever committed.
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath,
    '-out', certPath,
    '-days', '1',
    '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'
  ], { stdio: 'ignore' })

  return { cert: readFileSync(certPath), key: readFileSync(keyPath) }
}

function readBody(
  stream: NodeJS.ReadableStream
): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''

    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => {
      body += chunk
    })
    stream.on('end', () => resolve(body))
    stream.on('error', reject)
  })
}

function request(): AssistantRequest {
  const built = buildAssistantRequest({
    query: { text: '¿puedo conducir?', intent: null },
    assessment: null,
    nowMs: Date.parse('2026-09-01T10:00:00.000Z')
  })

  if (!built) {
    throw new Error('the fixture query must build a request')
  }

  return built
}

beforeAll(async () => {
  // The loopback dummy is self-signed, so Node's fetch would reject it before
  // any of this file's behaviour ran. Restored in `afterAll`.
  previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  server = createServer(selfSignedCert(), (req, res) => {
    void (async () => {
      const incoming: ReceivedRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: await readBody(req)
      }

      received.push(incoming)

      const answer = await respond(incoming)

      res.writeHead(answer.status, { 'content-type': 'application/json' })
      res.end(answer.body)
    })()
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()

  if (address === null || typeof address === 'string') {
    throw new Error('the dummy endpoint must listen on a TCP port')
  }

  endpointUrl = `https://127.0.0.1:${address.port}/assistant`
})

afterEach(() => {
  received = []
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })

  rmSync(certDir, { recursive: true, force: true })

  if (previousTlsSetting === undefined) {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
  } else {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting
  }
})

describe('the remote assistant seam over a real HTTPS endpoint', () => {
  it('shows the endpoint answer when it validates', async () => {
    respond = async () => ({
      status: 200,
      body: JSON.stringify({
        text: 'Detén el coche en un lugar seguro antes de decidir nada.'
      })
    })

    const ask = createRemoteAssistantProvider({ endpointUrl })
    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer).toEqual({
      text: 'Detén el coche en un lugar seguro antes de decidir nada.',
      source: 'ai',
      reasons: []
    })
  })

  it('delivers the request intact and carries no client secret', async () => {
    respond = async () => ({
      status: 200,
      body: JSON.stringify({ text: 'Lee los códigos antes de continuar.' })
    })

    const ask = createRemoteAssistantProvider({ endpointUrl })
    await resolveAssistantAnswer({ request: request(), ask })

    expect(received).toHaveLength(1)

    const [incoming] = received

    expect(incoming.method).toBe('POST')
    expect(incoming.url).toBe('/assistant')
    expect(incoming.headers['content-type']).toBe('application/json')
    expect(incoming.headers.accept).toBe('application/json')
    expect(JSON.parse(incoming.body)).toEqual(request())

    // RNF-006: the APK knows a URL and nothing else. A key reaching the wire
    // from the client is the failure this assertion exists to catch.
    expect(incoming.headers.authorization).toBeUndefined()
    expect(incoming.headers['x-api-key']).toBeUndefined()
  })

  it('falls back locally when the endpoint answers a non-2xx status', async () => {
    respond = async () => ({
      status: 502,
      body: JSON.stringify({ error: 'bad gateway' })
    })

    const ask = createRemoteAssistantProvider({ endpointUrl })
    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer.source).toBe('local-template')
    expect(answer.reasons).toEqual([{
      kind: 'provider-failed',
      message: 'El proveedor remoto respondió 502'
    }])
    expect(answer.text.length).toBeGreaterThan(0)
  })

  it('falls back locally when the payload has no text field', async () => {
    respond = async () => ({
      status: 200,
      body: JSON.stringify({ answer: 'wrong field' })
    })

    const ask = createRemoteAssistantProvider({ endpointUrl })
    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer.source).toBe('local-template')
    expect(answer.reasons).toEqual([{
      kind: 'provider-failed',
      message: 'El proveedor remoto no devolvió una respuesta de texto'
    }])
  })

  it('falls back locally when the endpoint answers unparseable bytes', async () => {
    respond = async () => ({ status: 200, body: 'not json at all' })

    const ask = createRemoteAssistantProvider({ endpointUrl })
    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer.source).toBe('local-template')
    expect(answer.reasons[0]?.kind).toBe('provider-failed')
  })

  it('rejects an answer that invents a code the vehicle never reported', async () => {
    respond = async () => ({
      status: 200,
      body: JSON.stringify({ text: 'Seguro que también tiene un P0420.' })
    })

    const ask = createRemoteAssistantProvider({ endpointUrl })
    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer.source).toBe('local-template')
    expect(answer.reasons).toEqual([{ kind: 'unknown-dtc', codes: ['P0420'] }])
  })

  it('gives up on a slow endpoint and answers locally', async () => {
    respond = async () => {
      await new Promise(resolve => setTimeout(resolve, 300))

      return {
        status: 200,
        body: JSON.stringify({ text: 'demasiado tarde' })
      }
    }

    const ask = createRemoteAssistantProvider({ endpointUrl })
    const answer = await resolveAssistantAnswer({
      request: request(),
      ask,
      timeoutMs: 50
    })

    expect(answer.source).toBe('local-template')
    expect(answer.reasons).toEqual([{ kind: 'provider-timed-out' }])
  })

  it('falls back locally when nothing is listening on the endpoint', async () => {
    // A port nothing is bound to: the closest a same-process test gets to the
    // phone being out of coverage.
    const ask = createRemoteAssistantProvider({
      endpointUrl: 'https://127.0.0.1:1/assistant'
    })
    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer.source).toBe('local-template')
    expect(answer.reasons[0]?.kind).toBe('provider-failed')
    expect(answer.text.length).toBeGreaterThan(0)
  })
})
