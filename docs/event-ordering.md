# Event ordering

| Situation                                                        | Order and result                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native target/ancestor listeners and a delegated handler         | Native listeners run in the browser's normal target-to-root dispatch order; the delegated hub runs at the root afterward.                         |
| Native `stopPropagation()`                                       | Stops propagation before the root, so the delegated handler does not run.                                                                         |
| Delegated handlers on nested elements                            | The hub visits the event path from target outward. A delegated `stopPropagation()` stops later logical ancestors.                                 |
| Capture handler                                                  | Uses a native capture listener and follows browser capture ordering.                                                                              |
| `focus`, `blur`, `scroll`, `load`, and other non-bubbling events | Uses native element listeners.                                                                                                                    |
| `on:<name>` custom event                                         | Uses a native listener with the lower-case custom name.                                                                                           |
| Handler writes                                                   | The handler runs inside an automatic `batch`; all synchronous writes flush once after the handler.                                                |
| Handler throws                                                   | The batch completes, then the error is reported through `reportError`; it is not thrown to the signal writer and does not enter an ErrorBoundary. |
| Handler returns a rejected promise                               | The rejection is reported when it settles. Writes after `await` form a later transaction.                                                         |

The delegated event set is `click`, `input`, `change`, `keydown`, `keyup`,
`pointerdown`, `pointerup`, `submit`, `focusin`, `focusout`, and `dblclick`.
Delegated callbacks receive the matched element as `event.currentTarget`.
