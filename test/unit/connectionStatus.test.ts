// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import ConnectionStatus from '~/components/ConnectionStatus.vue'
import {
  describeSessionStatus
} from '~/utils/sessionStatusPresentation'
import {
  OBD_SESSION_STATES
} from '~~/core/obd/session/ObdSessionStateMachine'

const stubs = {
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' }
}

function render(sessionState: string) {
  return mount(ConnectionStatus, {
    props: { sessionState: sessionState as never },
    global: { stubs }
  })
}

describe('describeSessionStatus', () => {
  /**
   * Exhaustive by construction: `describeSessionStatus` ends in
   * `assertNever`, so a state added to the machine fails to compile. This
   * catches the other half — a member added to the union and to the switch
   * but left with nothing a person can read.
   */
  it.each(OBD_SESSION_STATES)('describes %s in words a driver can act on', (state) => {
    const status = describeSessionStatus(state)

    expect(status.label.length).toBeGreaterThan(0)
    expect(status.detail.length).toBeGreaterThan(0)
    expect(status.icon).toMatch(/^i-lucide-/)
  })

  it('marks only the states that are waiting on something as busy', () => {
    expect(describeSessionStatus('connecting').busy).toBe(true)
    expect(describeSessionStatus('reconnecting').busy).toBe(true)
    expect(describeSessionStatus('ready').busy).toBe(false)
    expect(describeSessionStatus('idle').busy).toBe(false)
  })

  it('places the three connection phases in order', () => {
    expect(describeSessionStatus('connecting').phase).toBe(1)
    expect(describeSessionStatus('initializing').phase).toBe(2)
    expect(describeSessionStatus('discovering').phase).toBe(3)
  })

  it('has no phase for states outside the connection sequence', () => {
    expect(describeSessionStatus('ready').phase).toBeUndefined()
    expect(describeSessionStatus('error').phase).toBeUndefined()
  })

  it('separates a healthy session from one needing attention', () => {
    expect(describeSessionStatus('ready').tone).toBe('ready')
    expect(describeSessionStatus('error').tone).toBe('attention')
    expect(describeSessionStatus('reconnecting').tone).toBe('attention')
    expect(describeSessionStatus('idle').tone).toBe('neutral')
    expect(describeSessionStatus('connecting').tone).toBe('progress')
  })
})

describe('ConnectionStatus', () => {
  /**
   * `color-not-decorative-only`. Someone who cannot tell the green from the
   * amber has to get the same information, so every state carries an icon
   * and words as well as a hue.
   */
  it.each(OBD_SESSION_STATES)('never leaves %s to colour alone', (state) => {
    const wrapper = render(state)
    const expected = describeSessionStatus(state)

    expect(wrapper.text()).toContain(expected.label)
    expect(wrapper.find(`[data-icon="${expected.icon}"]`).exists()).toBe(true)
  })

  /**
   * Reaching ready took 7.5–9.8 s on the vehicle, nearly all of it in the
   * first phase. Without this a driver watches one unchanging word for most
   * of the wait and starts wondering whether it hung.
   */
  it('shows where the connection is while it is connecting', () => {
    const text = render('initializing').text()

    expect(text).toContain('Enlazar')
    expect(text).toContain('Preparar')
    expect(text).toContain('Consultar')
  })

  it('keeps the phase strip off screen when nothing is connecting', () => {
    expect(render('ready').find('ol').exists()).toBe(false)
    expect(render('idle').find('ol').exists()).toBe(false)
  })

  /**
   * A dot that breathes says the wait is alive; a motionless one reads as a
   * hang. It only appears while something is actually in flight.
   */
  it('animates only while something is in flight', () => {
    expect(render('connecting').find('.animate-ping').exists()).toBe(true)
    expect(render('ready').find('.animate-ping').exists()).toBe(false)
  })

  it('announces itself to a screen reader when the state changes', () => {
    const status = render('connecting').find('[role="status"]')

    expect(status.exists()).toBe(true)
    expect(status.attributes('aria-live')).toBe('polite')
  })
})
