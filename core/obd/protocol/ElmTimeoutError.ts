/**
 * A typed rejection for a command that never produced a response before its
 * deadline.
 *
 * A timeout is not an ELM327 response, so `classifyElmResponse` has no kind
 * for it and `ElmResponseError` cannot carry it. Without this type the only
 * way to tell a timeout apart from a transport failure would be to match on
 * the error message, which is exactly what the typed rejection exists to
 * avoid: message text is copy-editable and unreviewable.
 *
 * The message is unchanged from the plain `Error` it replaces, so callers
 * that only read `error.message` keep working.
 */
export class ElmTimeoutError extends Error {
  constructor(message: string) {
    super(message)

    this.name = 'ElmTimeoutError'
  }
}
