import type {
  ObdTransport,
  ObdTransportMetadata,
  ObdTransportState
} from './ObdTransport'
import { assertPhysicalCommandAllowed } from '../policy/PhysicalObdCommandPolicy'

export interface WebSerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
  bluetoothServiceClassId?: string
}

export interface WebSerialReader {
  read(): Promise<{
    done: boolean
    value?: Uint8Array
  }>
  cancel(): Promise<void>
  releaseLock(): void
}

export interface WebSerialWriter {
  write(data: Uint8Array): Promise<void>
  releaseLock(): void
}

export interface WebSerialPort {
  readonly readable: {
    getReader(): WebSerialReader
  } | null
  readonly writable: {
    getWriter(): WebSerialWriter
  } | null
  open(options: WebSerialOpenOptions): Promise<void>
  close(): Promise<void>
  getInfo?(): WebSerialPortInfo
}

export interface WebSerialProvider {
  requestPort(): Promise<WebSerialPort>
}

export interface WebSerialOpenOptions {
  baudRate: number
  dataBits: 8
  stopBits: 1
  parity: 'none'
  bufferSize: number
  flowControl: 'none'
}

export interface WebSerialRfcommTransportOptions {
  /** Injected in tests; omitted in the browser to resolve navigator.serial lazily. */
  provider?: WebSerialProvider
  isSecureContext?: () => boolean
  baudRate?: number
}

interface BrowserNavigator {
  serial?: WebSerialProvider
}

const DEFAULT_BAUD_RATE = 38400

function browserProvider(): WebSerialProvider | undefined {
  if (typeof navigator === 'undefined') {
    return undefined
  }

  return (navigator as BrowserNavigator).serial
}

function browserIsSecureContext(): boolean {
  return typeof globalThis !== 'undefined'
    && globalThis.isSecureContext === true
}

/**
 * Raw Web Serial transport for an already paired serial/RFCOMM adapter.
 * Protocol parsing and ELM initialization stay above this boundary so this
 * class remains vehicle-agnostic. The Step 19 physical read-only command
 * policy is enforced here, in `write()`, so it applies to every caller
 * (manual commands, initialization, discovery, polling, reconnection)
 * regardless of UI state.
 */
export class WebSerialRfcommTransport implements ObdTransport {
  readonly kind = 'web-serial-rfcomm' as const

  state: ObdTransportState = 'idle'

  private readonly listeners = new Set<
    (data: Uint8Array) => void
  >()

  private readonly stateListeners = new Set<
    (state: ObdTransportState) => void
  >()

  private readonly baudRate: number

  private port: WebSerialPort | undefined

  private reader: WebSerialReader | undefined

  private writer: WebSerialWriter | undefined

  private readLoop: Promise<void> | undefined

  private writeTail: Promise<void> = Promise.resolve()

  private disconnectTask: Promise<void> | undefined

  private disconnectRequested = false

  private portOpen = false

  constructor(
    private readonly options: WebSerialRfcommTransportOptions = {}
  ) {
    this.baudRate = options.baudRate ?? DEFAULT_BAUD_RATE

    if (!Number.isInteger(this.baudRate) || this.baudRate <= 0) {
      throw new Error('Web Serial baudRate must be a positive integer')
    }
  }

  async select(): Promise<ObdTransportMetadata> {
    if (
      this.state === 'connecting'
      || this.state === 'connected'
      || this.state === 'disconnecting'
    ) {
      throw new Error('Disconnect the current Web Serial port before selecting another')
    }

    this.setState('selecting')

    try {
      this.assertSupported()

      const provider = this.options.provider ?? browserProvider()

      if (!provider) {
        throw new Error(
          'Web Serial is unavailable. Use a supported Chromium browser in a secure context; current Chrome documentation limits native Web Serial to desktop platforms.'
        )
      }

      this.port = await provider.requestPort()
      this.setState('selected')

      return this.metadata()
    } catch (error) {
      this.setState('error')
      throw this.toError(error)
    }
  }

  async connect(): Promise<ObdTransportMetadata> {
    if (!this.port) {
      throw new Error('Select a Web Serial adapter before connecting')
    }
    if (this.state !== 'selected' && this.state !== 'disconnected') {
      throw new Error('Web Serial transport must be selected before connecting')
    }

    this.setState('connecting')
    this.disconnectRequested = false

    try {
      this.assertSupported()

      await this.port.open({
        baudRate: this.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 255,
        flowControl: 'none'
      })
      this.portOpen = true

      // A disconnect requested while the port was opening (slow Bluetooth
      // link) already moved us out of 'connecting'. Honour it instead of
      // clobbering its terminal state with a phantom 'connected' session.
      // The local annotation restores the full union: TS narrows this.state
      // from the connect() guard and cannot see setState() mutate it.
      const stateAfterOpen = this.state as ObdTransportState

      if (stateAfterOpen !== 'connecting') {
        throw new Error(
          'Web Serial connect was cancelled by a concurrent disconnect'
        )
      }

      if (!this.port.readable || !this.port.writable) {
        throw new Error(
          'The selected serial port did not expose readable and writable streams'
        )
      }

      this.reader = this.port.readable.getReader()
      this.writer = this.port.writable.getWriter()
      this.setState('connected')
      this.readLoop = this.pumpReads(this.reader)

      return this.metadata()
    } catch (error) {
      // Preserve a concurrent disconnect's state; only a genuine connect
      // failure (still 'connecting') escalates to 'error'.
      const stateOnFailure = this.state as ObdTransportState

      if (stateOnFailure === 'connecting') {
        this.setState('error')
      }

      await this.cleanupAfterConnectFailure()
      throw this.toError(error)
    }
  }

  disconnect(): Promise<void> {
    if (this.state === 'disconnected') {
      return Promise.resolve()
    }
    if (this.disconnectTask) {
      return this.disconnectTask
    }

    this.disconnectTask = this.performDisconnect()
      .finally(() => {
        this.disconnectTask = undefined
      })

    return this.disconnectTask
  }

  private async performDisconnect(): Promise<void> {
    this.setState('disconnecting')
    this.disconnectRequested = true
    const reader = this.reader

    if (reader) {
      try {
        await reader.cancel()
      } catch {
        // Cancellation commonly races with EOF or a failed Bluetooth link.
      }
    }

    if (this.readLoop) {
      await this.readLoop
    }

    try {
      await this.writeTail.catch(() => undefined)
      this.releaseWriter()

      if (this.portOpen && this.port) {
        await this.port.close()
        this.portOpen = false
      }

      this.setState('disconnected')
    } catch (error) {
      this.setState('error')
      throw this.toError(error)
    } finally {
      this.readLoop = undefined
      this.disconnectRequested = false
    }
  }

  write(data: Uint8Array): Promise<void> {
    const bytes = data.slice()
    const task = this.writeTail
      .catch(() => undefined)
      .then(async () => {
        const command = new TextDecoder().decode(bytes).trim()

        assertPhysicalCommandAllowed(command)

        if (this.state !== 'connected' || !this.writer) {
          throw new Error('OBD transport is not connected')
        }

        try {
          await this.writer.write(bytes)
        } catch (error) {
          if (!this.disconnectRequested) {
            this.setState('error')
          }

          throw this.toError(error)
        }
      })

    this.writeTail = task
    return task
  }

  subscribe(
    listener: (data: Uint8Array) => void
  ): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeState(
    listener: (state: ObdTransportState) => void
  ): () => void {
    this.stateListeners.add(listener)

    return () => {
      this.stateListeners.delete(listener)
    }
  }

  private setState(next: ObdTransportState): void {
    if (this.state === next) {
      return
    }

    this.state = next

    for (const listener of this.stateListeners) {
      try {
        listener(next)
      } catch {
        // State observers must not break transport transitions.
      }
    }
  }

  private assertSupported(): void {
    const isSecure = this.options.isSecureContext
      ? this.options.isSecureContext()
      : browserIsSecureContext()

    if (!isSecure) {
      throw new Error(
        'Web Serial requires a secure context (HTTPS or localhost). Open this lab in Chrome over HTTPS before selecting the adapter.'
      )
    }
  }

  private async pumpReads(reader: WebSerialReader): Promise<void> {
    try {
      while (!this.disconnectRequested) {
        const { done, value } = await reader.read()

        if (done) {
          if (!this.disconnectRequested) {
            this.setState('error')
          }

          return
        }

        if (value && value.byteLength > 0) {
          this.emit(value)
        }
      }
    } catch {
      if (!this.disconnectRequested) {
        this.setState('error')
      }
    } finally {
      if (this.reader === reader) {
        this.reader = undefined
      }

      try {
        reader.releaseLock()
      } catch {
        // The stream may already have released its lock after a fatal read.
      }
    }
  }

  private async cleanupAfterConnectFailure(): Promise<void> {
    if (this.reader) {
      try {
        await this.reader.cancel()
      } catch {
        // Preserve the original connection error.
      }

      try {
        this.reader.releaseLock()
      } catch {
        // Preserve the original connection error.
      }

      this.reader = undefined
    }

    this.releaseWriter()

    if (this.portOpen && this.port) {
      try {
        await this.port.close()
      } catch {
        // Preserve the original connection error.
      }

      this.portOpen = false
    }
  }

  private releaseWriter(): void {
    if (!this.writer) {
      return
    }

    try {
      this.writer.releaseLock()
    } finally {
      this.writer = undefined
    }
  }

  private metadata(): ObdTransportMetadata {
    const info = this.port?.getInfo?.() ?? {}

    if (info.bluetoothServiceClassId) {
      return {
        kind: this.kind,
        name: 'Bluetooth RFCOMM serial adapter'
      }
    }

    if (info.usbVendorId !== undefined) {
      const vendor = info.usbVendorId
        .toString(16)
        .padStart(4, '0')
        .toUpperCase()
      const product = info.usbProductId === undefined
        ? ''
        : `:${info.usbProductId.toString(16).padStart(4, '0').toUpperCase()}`

      return {
        kind: this.kind,
        name: `Serial adapter ${vendor}${product}`
      }
    }

    return {
      kind: this.kind,
      name: 'Web Serial / RFCOMM adapter'
    }
  }

  private emit(data: Uint8Array): void {
    for (const listener of this.listeners) {
      listener(data)
    }
  }

  private toError(error: unknown): Error {
    return error instanceof Error
      ? error
      : new Error(String(error))
  }
}
