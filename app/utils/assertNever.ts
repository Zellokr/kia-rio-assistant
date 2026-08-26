/**
 * Compile-time exhaustiveness check with a runtime backstop.
 *
 * TypeScript rejects the call if `value` is not `never`, so an unhandled
 * union member is a build error. The throw matters anyway: types are
 * erased at runtime, and a payload that arrives from storage or a future
 * version of a module can carry a member this build never knew about.
 * Failing loudly beats rendering nothing at a user who is waiting to be
 * told what is wrong with their car.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(
    `Unhandled ${context}: ${JSON.stringify(value)}`
  )
}
