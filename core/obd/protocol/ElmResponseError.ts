import type {
  ElmResponseKind
} from './classifyElmResponse'

/**
 * A typed rejection for an ELM327 response classified as an error by
 * `classifyElmResponse`, carrying the classification alongside the message
 * so a caller can branch on `responseKind` instead of parsing error text.
 *
 * Thrown by `ElmCommandExecutor` for every response `isElmErrorResponse`
 * classifies as an error. The message is unchanged from the plain `Error` it
 * replaced, so callers that only read `error.message` keep working.
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
