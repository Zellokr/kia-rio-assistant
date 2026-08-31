import { describe, expect, it, vi } from 'vitest'

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

function request(): AssistantRequest {
  const built = buildAssistantRequest({
    query: { text: '¿puedo conducir?', intent: null },
    assessment: null,
    nowMs: Date.parse('2026-08-29T10:00:00.000Z')
  })

  if (!built) {
    throw new Error('the fixture query must build a request')
  }

  return built
}

function jsonResponse(body: unknown, init?: Partial<Response>): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body
  } as Response
}

describe('createRemoteAssistantProvider', () => {
  it('leaves the resolver in no-provider fallback when unconfigured', async () => {
    const fetchImpl = vi.fn()
    const ask = createRemoteAssistantProvider({ endpointUrl: '   ' }, fetchImpl)

    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(ask).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(answer.source).toBe('local-template')
    expect(answer.reasons).toEqual([{ kind: 'no-provider' }])
  })

  it('turns an insecure remote endpoint into resolver fallback', async () => {
    const fetchImpl = vi.fn()
    const ask = createRemoteAssistantProvider({
      endpointUrl: 'http://assistant.example.test/ask'
    }, fetchImpl)

    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(answer.source).toBe('local-template')
    expect(answer.reasons).toEqual([{
      kind: 'provider-failed',
      message: 'El endpoint remoto del asistente debe usar HTTPS'
    }])
  })

  it('posts the assistant request to the configured public endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ text: 'Lee códigos antes de decidir si seguir.' })
    )
    const ask = createRemoteAssistantProvider({
      endpointUrl: 'https://assistant.example.test/ask'
    }, fetchImpl)

    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer).toEqual({
      text: 'Lee códigos antes de decidir si seguir.',
      source: 'ai',
      reasons: []
    })

    const [url, init] = fetchImpl.mock.calls[0]

    expect(url).toBe('https://assistant.example.test/ask')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      'accept': 'application/json'
    })
    expect(JSON.parse(String(init.body))).toEqual(request())
  })

  it('turns a non-2xx response into resolver provider-failed fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'bad gateway' }, { ok: false, status: 502 })
    )
    const ask = createRemoteAssistantProvider({
      endpointUrl: 'https://assistant.example.test/ask'
    }, fetchImpl)

    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer.source).toBe('local-template')
    expect(answer.reasons).toEqual([{
      kind: 'provider-failed',
      message: 'El proveedor remoto respondió 502'
    }])
  })

  it('turns network failures into resolver provider-failed fallback', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Network request failed'))
    const ask = createRemoteAssistantProvider({
      endpointUrl: 'https://assistant.example.test/ask'
    }, fetchImpl)

    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer.source).toBe('local-template')
    expect(answer.reasons).toEqual([{
      kind: 'provider-failed',
      message: 'Network request failed'
    }])
  })

  it('keeps malformed remote payloads behind resolver fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ answer: 'wrong field' }))
    const ask = createRemoteAssistantProvider({
      endpointUrl: 'https://assistant.example.test/ask'
    }, fetchImpl)

    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer.source).toBe('local-template')
    expect(answer.reasons).toEqual([{
      kind: 'provider-failed',
      message: 'El proveedor remoto no devolvió una respuesta de texto'
    }])
  })

  it('still lets resolver validation reject unsafe remote text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ text: 'Seguro que también tiene un P0420.' })
    )
    const ask = createRemoteAssistantProvider({
      endpointUrl: 'https://assistant.example.test/ask'
    }, fetchImpl)

    const answer = await resolveAssistantAnswer({ request: request(), ask })

    expect(answer.source).toBe('local-template')
    expect(answer.reasons).toEqual([{ kind: 'unknown-dtc', codes: ['P0420'] }])
  })
})
