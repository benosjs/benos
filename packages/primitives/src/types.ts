import type { ReadonlySignal } from '@benosjs/core'

export interface PrimitiveController<State, Connected, Event> {
  readonly state: ReadonlySignal<State>
  readonly api: ReadonlySignal<Connected>
  send(event: Event): void
  stop(): void
}
