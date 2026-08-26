import type {
  ElmResponseKind
} from './classifyElmResponse'

/**
 * A typed rejection for an ELM327 response classified as an error by
 * `classifyElmResponse`, carrying the classification alongside the message
 * so a caller can branch on `responseKind` instead of parsing error text.
 *
 * Not yet thrown anywhere: `ElmCommandExecutor` still rejects with a plain
 * `Error` for these cases. Wiring it in is a later unit's scope.
 */
export class ElmResponseError extends Error {
  readonly responseKind: ElmResponseKind

  constructor(
    message: string,
    responseKind: ElmResponseKind
  ) {
    super(message)

    this.name = 'ElmResponseError'
    this.responseKind = responseKind
  }
}
