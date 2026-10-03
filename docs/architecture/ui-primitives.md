# UI primitives and the Zag.js adapter

**Status:** U1 design and U2 adapter implementation and verification complete. U4 batch 1 adds the first seven styled registry components; complex Zag-backed styled controls remain later U4 batches. Zag.js and its machine packages are pinned to 1.44.0. No hidden ID generator or internal import is allowed. See the [U2 checkpoint](../checkpoints/ui-U2.md) for the per-primitive browser matrix and observed Zag/APG differences.

**Scope label:** U2 adapters and U4 batch 1 styled components are built; the remaining registry controls and their theming are later U4 work (required for 0.2.0).

## Goals

- Reuse Zag.js state machines for complex accessibility behavior: keyboard interaction, focus, ARIA state, and controlled/uncontrolled state.
- Adapt machine services to Benos callable signals, run-once components, getter-backed props, owner lifetime, and DOM event semantics.
- Keep copied components inspectable and editable. A copied component should be a thin styled wrapper over behavior.
- Make primitives optional: apps that never install or import them load no primitive code.

## Non-goals

- Reimplementing machine behavior in Benos or forking Zag.
- Exposing Zag private service classes as stable Benos API.
- Adding a universal hook system or component rerenders.
- Putting UI code into the 4 KB core or adding dependencies to core or DOM.
- Importing internal @benosjs subpaths from copied component source.

## Adapter boundary and lifetime

The integration follows Zag's documented adapter flow: machine definition and user props create a service; the adapter observes service state; a machine-specific connect function derives DOM props; a framework normalizer translates those props. See [Zag framework adapters](https://www.zagjs.com/guides/framework-adapters) and [Ark UI's architecture](https://ark-ui.com/docs/overview/about).

A Benos adapter instance is created inside a copied UI component while its renderer-created owner is current. Its lifetime is exactly that owner:

1. Read machine configuration and controlled props through a getter function. Never destructure or snapshot getter-backed Benos props during component invocation.
2. Create one machine service for that component identity. Initialize it from current props, then synchronize controlled prop changes with an owned Benos effect using only public @benosjs/core APIs.
3. Bridge current service state into a stable Benos readonly signal/accessor. Publish a new snapshot only when machine state changes.
4. Connect machine state to accessible API props and DOM props. Return stable getters or event functions so a run-once component does not need to rerun. Looking up a machine API method must not read the state revision; reactive connected prop descriptors read that revision only when their values are evaluated. This keeps the enclosing component from remounting its subtree for each machine update.
5. Register service stop/unsubscribe and external listener teardown with public onCleanup. Disposal must release service, DOM, and callback references.

No signal, computed, effect, root, mount, or cleanup may be created inside a Benos computed evaluation; see [reactivity.md](./reactivity.md). Adapter effects are created in the component owner. Stop is idempotent, and queued updates after stop are ignored.

**U2 contract (Zag 1.44.0):** use the public `@zag-js/vanilla` `VanillaMachine<T>` API (`start`, `stop`, `subscribe`, `updateProps`, `service`, and `send`) and public machine packages such as `@zag-js/checkbox`. Use `createNormalizer` from `@zag-js/types` for type-safe prop normalization, but preserve Benos style objects rather than using Zag's string-style normalizer. Prototype controlled updates, subscriptions, stop/unsubscribe, owner cleanup, equivalent snapshots, DOM-free imports, and Benos DOM prop/event mapping before freezing types. Pin all Zag packages to the same exact version. The required lifecycle and ID capabilities are available through public `@benosjs/core` APIs.

Every primitive factory accepts an optional `id`. A caller-provided value is forwarded to Zag; when absent, the adapter calls public `createUniqueId()` inside the current owner. `createUniqueId(): string` is part of `@benosjs/core` and is designed to keep the same API when SSR later derives IDs from request/root namespace, deterministic owner path, and per-owner call ordinal. The client counter is shared across roots within one core module instance. The registry contract requires the same optional ID override on each component that uses generated IDs.

The isolated 1.44.0 prototype confirmed that importing the checkbox machine and vanilla adapter succeeds without `document` or `window`. Starting the checkbox service touches `document` through its public machine effects, so startup belongs after Benos `onMount` on a live host. With happy-dom present, controlled `checked` updates notify subscribers, `send` invokes the public change callback, and `stop` prevents later notifications. `subscribe` does not provide an initial snapshot; the adapter reads `service` after startup before relying on notifications. Lifecycle, cleanup, and generated IDs use public `onMount`, `onCleanup`, `signal`, `effect`, `untrack`, and `createUniqueId` APIs.

## Proposed primitive API shape

Copied components are the primary user-facing API; app authors may also use a machine-specific primitive factory. Each options type includes `id?: string`, which overrides the generated ID. The package root exports only shared type utilities; concrete factories are imported from individual public subpaths.

    export interface PrimitiveController<State, Connected, Event> {
      readonly state: ReadonlySignal<State>
      readonly api: ReadonlySignal<Connected>
      send(event: Event): void
      stop(): void
    }

    export function createCheckbox(
      getProps: () => CheckboxOptions, // CheckboxOptions includes id?: string
    ): PrimitiveController<CheckboxState, CheckboxApi, CheckboxEvent>

The adapter owns machine startup, signal subscription, prop synchronization, and teardown. stop is also registered with onCleanup; an explicit stop is useful for tests and component-local state transitions. Each machine factory retains Zag's public state, event, and connected API types without exposing the vanilla service class in Benos application APIs.

A copied component may use a local helper and return ordinary TSX:

    function Checkbox(props: CheckboxProps) {
      const primitive = createCheckboxPrimitive(() => props)
      return (
        <label class="benos-checkbox">
          <input {...primitive.inputProps} />
          <span>{primitive.label}</span>
        </label>
      )
    }

This illustrates intent only. Spread and type details must be checked against the selected Zag version. Component source remains readable and does not require generator syntax.

## Props and event normalization

Benos accepts standard class and for attributes; className and htmlFor are compile-time errors and development diagnostics. Zag adapters commonly return React-shaped keys, so normalize at the primitive boundary:

- Rename className to class and htmlFor to for before values reach a Benos JSX descriptor.
- Preserve valid aria-* and data-* keys and the original element-specific event types.
- Translate only documented framework differences; do not alias invalid names in general Benos JSX.
- Keep reactive values as getters/accessors. Do not eagerly read a prop getter while constructing a descriptor.
- Keep events as functions on the descriptor. Benos wraps delegated and native handlers in a synchronous batch; the adapter must not add a second independent flush boundary.
- Respect native/delegated ordering, focus behavior, and stopPropagation rules in [renderer.md](./renderer.md) and [event-ordering.md](../event-ordering.md).

Controlled values remain controlled by the caller: incoming accessor changes update the machine; events request changes through documented callbacks. The adapter must not write stale machine state over a newer caller value. Uncontrolled state initializes once per owner and lives in the service until disposal.

Toast is the exception to the controlled/uncontrolled value pattern: Zag 1.44.0's public `ToastProps` has no `open` or `onOpenChange` prop. Visibility is owned by the toast and its required parent-group service, with public dismiss/pause/resume actions. Its U2 tests therefore cover group-backed lifecycle and dismissal; a controlled-visibility case is not exposed by the upstream contract.

## Optionality and tree-shaking

Do not import a catalog barrel from the package root. Provide machine-sized public subpaths such as @benosjs/primitives/checkbox and @benosjs/primitives/dialog, each depending only on its machine adapter and Zag machine package. Any root export may expose type-only utilities but must not eagerly load concrete machines.

Batch 1 (button, input, textarea, label, card, badge, separator) imports no primitive package. Adding one of those items installs no primitive runtime. Batch 2/3 components declare exact primitive subpaths and dependencies; benos add installs @benosjs/primitives only if the resolved component graph requires it. Verify tree-shaking in a production consumer build; source shape alone is not proof.

## Edge cases

- Controlled props change inside a batch: observe the final getter value after flush and do not emit stale intermediate state.
- A branch is removed during a machine callback: stop is idempotent and queued updates never touch detached DOM.
- A user callback throws: Benos event reporting applies; do not convert this into a machine state or render boundary error.
- Equivalent machine snapshots should not notify dependents when Zag's equality contract allows deduplication.
- Refs receive non-null nodes and tear down through onCleanup; no machine may rely on null refs.
- Multiple component instances have independent services unless a primitive explicitly documents shared state.
- Do not access document/window at module initialization. U2 must test imports in a DOM-free process and document server service behavior.
- If startup or connect fails, stop partial services and route the error through the component owner.

## Trade-offs versus related libraries

| Project                                                                 | Relevant design                                                | Benos trade-off                                                                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [shadcn/ui](https://ui.shadcn.com/docs)                                 | Copies source; users own styles and implementation.            | Same ownership model, with copied TSX tailored to Benos run-once/getter props. Zag supplies complex behavior.                                       |
| [Radix](https://www.radix-ui.com/primitives/docs/overview/introduction) | Accessible, unstyled React primitives distributed as packages. | Mature React integration cannot be consumed directly. Zag gives framework-independent machines; Benos owns a typed adapter and copied presentation. |
| [Ark UI](https://ark-ui.com/docs/overview/about)                        | Components built on Zag for React, Solid, Vue, and Svelte.     | Closest precedent. Benos still needs an adapter for its event batching, prop types, and owner cleanup.                                              |
| [Kobalte](https://kobalte.dev/docs/core/overview/introduction/)         | Accessible, unstyled, composable Solid components.             | Solid-specific and package-owned; Benos copies styled source and delegates complex behavior to Zag.                                                 |

## Test plan for U2

- **Complete:** per-primitive unit tests cover controlled/uncontrolled behavior where Zag exposes control, optional ID override, unique IDs across instances and roots, and machine stop/subscription release on owner disposal.
- **Complete:** APG keyboard and axe-core fixture scans cover all eleven primitives in Chromium, Firefox, and WebKit. RTL arrow behavior is checked for radio groups and tabs. Known Zag/APG differences are recorded in the [U2 checkpoint](../checkpoints/ui-U2.md).
- **Complete:** normalizer tests verify Zag-shaped prop keys are converted only at the adapter boundary while general JSX remains strict about className/htmlFor.
- **Complete:** production consumer builds prove a checkbox subpath excludes the other ten machine entries and a consumer with no primitive imports includes none.
- **Complete:** every machine subpath imports in a Node process without `window` or `document`; owner-disposal tests verify service stop and listener cleanup.
- **Complete:** `@benosjs/core` tests verify `createUniqueId()` produces unique values across instances and roots; explicit primitive IDs override generated ones.
- **Complete:** the adapter contract is pinned to `@zag-js/vanilla`, `@zag-js/types`, and machine packages at 1.44.0. The U2 suites verify initial state, controlled updates where supported, machine actions and callbacks, owner cleanup/stop, and import without `document` or `window`.

U2 has no open test-coverage items. Test totals, bundle sizes, browser results, and the Zag behaviors kept as documented deviations are recorded in the [U2 checkpoint](../checkpoints/ui-U2.md).

## Hard-to-reverse decisions

- Public primitive factory/service API and whether it exposes Zag types.
- Adapter package ownership, subpath naming, and Zag compatibility range.
- Mapping machine state into Benos signals and controlled props back into the service.
- Owner-bound stop behavior and the guarantee that imports never start machines.
- Package optionality and per-machine dependency granularity.
- Normalizing className/htmlFor only at the Zag boundary while keeping general Benos JSX strict.
