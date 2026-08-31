import type {
  AssistantRequest
} from '~~/core/assistant/buildAssistantRequest'
import type {
  AssistantProvider
} from '~~/core/assistant/resolveAssistantAnswer'

export interface RemoteAssistantProviderConfig {
  /** Public HTTPS endpoint. Never put model keys or provider secrets here. */
  readonly endpointUrl?: string | null
}

export type RemoteAssistantFetch = (
  input: string,
  init: RequestInit
) => Promise<Response>

interface RemoteAssistantResponse {
  readonly text?: unknown
}

export function createRemoteAssistantProvider(
  config: RemoteAssistantProviderConfig,
  fetchImpl: RemoteAssistantFetch = globalThis.fetch.bind(globalThis)
): AssistantProvider | null {
  if (!hasEndpointUrl(config.endpointUrl)) {
    return null
  }

  return async (request: AssistantRequest): Promise<string> => {
    const endpointUrl = normalizeEndpointUrl(config.endpointUrl)

    const response = await fetchImpl(endpointUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      throw new Error(`El proveedor remoto respondió ${response.status}`)
    }

    const body = await response.json() as RemoteAssistantResponse

    if (typeof body.text !== 'string') {
      throw new Error('El proveedor remoto no devolvió una respuesta de texto')
    }

    return body.text
  }
}

function hasEndpointUrl(endpointUrl: string | null | undefined): boolean {
  return (endpointUrl?.trim() ?? '').length > 0
}

function normalizeEndpointUrl(endpointUrl: string | null | undefined): string {
  const parsed = new URL(endpointUrl?.trim() ?? '')

  if (parsed.protocol !== 'https:') {
    throw new Error('El endpoint remoto del asistente debe usar HTTPS')
  }

  return parsed.toString()
}
