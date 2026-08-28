/**
 * Which adapter the lab is pointed at.
 *
 * This union used to be declared three times — once inside `ConnectionView`,
 * once inside `DataView`, and once inline in the page — which made
 * `labTransportFactory` import a domain type *from a component*. The
 * dependency arrow pointed backwards: a util cannot depend on the view that
 * happens to render it. It lives here so both components and the session
 * composable depend on the type, and none of them depend on each other.
 *
 * `android-ble` is the only choice a shipped build can actually construct;
 * see `createLabTransport`.
 */
export type ObdTransportChoice = 'mock' | 'replay' | 'android-ble'
