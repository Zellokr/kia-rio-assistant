import { describe, expect, it, vi } from 'vitest'

import {
  sendSessionToTelegram
} from '~/services/telegramFieldLog'
import type {
  ObdSessionExport
} from '~~/core/obd/logging/ObdSessionLog'

/**
 * TEMPORARY — field-test evidence delivery. Delete with
 * `app/services/telegramFieldLog.ts`; see `docs/FIELD_TEST_TELEGRAM.md`.
 *
 * The guarantee that matters most here is not that the upload works. It is
 * that a failed upload never costs a session: the log stays on the device
 * either way, and the caller is told what happened in words a person can
 * act on. A garage has no signal, and a thirty-minute run is not repeatable
 * on a whim.
 */
const session: ObdSessionExport = {
  schemaVersion: 1,
  sessionId: 'session-1',
  startedAt: '2026-08-28T10:00:00.000Z',
  endedAt: '2026-08-28T10:30:00.000Z',
  transport: { kind: 'android-ble', name: 'VEEPEAK' },
  retention: { maxEvents: 5000, droppedEvents: 0, complete: true },
  events: []
}

const config = { botToken: 'token', chatId: '-1001' }

function okResponse() {
  return { ok: true, status: 200 } as Response
}

describe('sendSessionToTelegram', () => {
  it('posts the export as a document to the configured chat', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())

    const result = await sendSessionToTelegram(session, config, fetchImpl)

    expect(result).toEqual({ ok: true })

    const [url, init] = fetchImpl.mock.calls[0]

    expect(url).toBe('https://api.telegram.org/bottoken/sendDocument')
    expect(init.method).toBe('POST')

    const body = init.body as FormData

    expect(body.get('chat_id')).toBe('-1001')
    expect((body.get('document') as File).name).toBe('session-1.json')
  })

  /**
   * The caption is what a reader sees in the channel without opening the
   * file. A truncated log must say so there: a session that silently lost
   * events looks identical to a complete one otherwise.
   */
  it('says in the caption when the log was truncated', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())

    await sendSessionToTelegram(
      {
        ...session,
        retention: { maxEvents: 10, droppedEvents: 42, complete: false }
      },
      config,
      fetchImpl
    )

    const caption = (fetchImpl.mock.calls[0][1].body as FormData).get('caption')

    expect(String(caption)).toContain('truncado')
    expect(String(caption)).toContain('42')
  })

  it('reports a rejected request without throwing at the caller', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response)

    const result = await sendSessionToTelegram(session, config, fetchImpl)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toContain('401')
  })

  /**
   * No signal is the expected case at a car, not an exceptional one. The
   * message has to tell the driver the evidence survived.
   */
  it('tells the driver the log survived when the network fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('Network request failed'))

    const result = await sendSessionToTelegram(session, config, fetchImpl)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason)
      .toContain('El registro sigue en el móvil')
  })

  it('refuses a build that carries no credentials rather than posting nowhere', async () => {
    const fetchImpl = vi.fn()

    const result = await sendSessionToTelegram(
      session,
      { botToken: '', chatId: '' },
      fetchImpl
    )

    expect(result.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
