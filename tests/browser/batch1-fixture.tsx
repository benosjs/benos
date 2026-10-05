import { render } from '@benosjs/dom'
import { signal } from '@benosjs/core'
import { Badge } from '../../registry/source/components/badge.js'
import { Button } from '../../registry/source/components/button.js'
import { Card } from '../../registry/source/components/card.js'
import { Input } from '../../registry/source/components/input.js'
import { Label } from '../../registry/source/components/label.js'
import { Separator } from '../../registry/source/components/separator.js'
import { Textarea } from '../../registry/source/components/textarea.js'
import '../../examples/ui-gallery/src/ui.css'
import type { JSX } from '@benosjs/dom'

type ComponentName =
  'button' | 'input' | 'textarea' | 'label' | 'card' | 'badge' | 'separator'

type ThemeName = 'light' | 'dark'

declare global {
  interface Window {
    __benosBatchOne: {
      render: (
        name: ComponentName,
        theme: ThemeName,
        direction: 'ltr' | 'rtl',
      ) => void
      refId: () => string | undefined
      refCount: () => number
      dispose: () => void
    }
  }
}

const host = document.querySelector<HTMLElement>('#app')
if (!host) throw new Error('Batch 1 fixture host is missing')

let dispose: (() => void) | undefined
const activations = signal(0)
let lastRef: Element | undefined
let refsCalled = 0

function recordRef(element: Element): void {
  refsCalled++
  lastRef = element
}

function ButtonFixture(): JSX.Element {
  return (
    <div>
      <Button
        id="batch-button"
        ref={recordRef}
        onClick={() => activations.update((count) => count + 1)}
      >
        Save changes
      </Button>
      <Button id="batch-disabled-button" disabled>
        Disabled
      </Button>
      <button id="batch-after" tabIndex={0}>
        After button
      </button>
      <output aria-hidden="true" id="batch-activations">
        {activations()}
      </output>
    </div>
  )
}

function InputFixture(): JSX.Element {
  return (
    <div class="field-stack">
      <Label for="batch-input">Email address</Label>
      <Input id="batch-input" ref={recordRef} type="email" />
      <Label for="batch-input-disabled">Disabled email</Label>
      <Input id="batch-input-disabled" type="email" disabled />
      <Label for="batch-input-invalid">Invalid email</Label>
      <Input
        id="batch-input-invalid"
        type="email"
        invalid
        aria-describedby="batch-input-error"
      />
      <span id="batch-input-error">Enter a valid email address.</span>
      <button id="batch-after" tabIndex={0}>
        After input
      </button>
    </div>
  )
}

function TextareaFixture(): JSX.Element {
  return (
    <div class="field-stack">
      <Label for="batch-textarea">Message</Label>
      <Textarea id="batch-textarea" ref={recordRef} />
      <Label for="batch-textarea-disabled">Disabled message</Label>
      <Textarea id="batch-textarea-disabled" disabled />
      <Label for="batch-textarea-invalid">Invalid message</Label>
      <Textarea id="batch-textarea-invalid" invalid />
      <button id="batch-after" tabIndex={0}>
        After textarea
      </button>
    </div>
  )
}

function LabelFixture(): JSX.Element {
  return (
    <div class="field-stack">
      <Label id="batch-label" ref={recordRef} for="batch-label-control">
        Display name
      </Label>
      <input id="batch-label-control" />
      <button id="batch-after" tabIndex={0}>
        After label
      </button>
    </div>
  )
}

function CardFixture(): JSX.Element {
  return (
    <div>
      <Card id="batch-card" ref={recordRef} variant="raised">
        <h2>Account details</h2>
        <p>Manage the details on your profile.</p>
        <button id="batch-card-action">Edit account</button>
      </Card>
      <button id="batch-after" tabIndex={0}>
        After card
      </button>
    </div>
  )
}

function BadgeFixture(): JSX.Element {
  return (
    <div>
      <button id="batch-before">Before badge</button>
      <Badge id="batch-badge" ref={recordRef} tone="success">
        Connected
      </Badge>
      <button id="batch-after" tabIndex={0}>
        After badge
      </button>
    </div>
  )
}

function SeparatorFixture(): JSX.Element {
  return (
    <div class="separator-fixture">
      <button id="batch-before">Before separator</button>
      <Separator id="batch-separator" ref={recordRef} />
      <button id="batch-after" tabIndex={0}>
        After separator
      </button>
    </div>
  )
}

const fixtures: Record<ComponentName, () => JSX.Element> = {
  button: ButtonFixture,
  input: InputFixture,
  textarea: TextareaFixture,
  label: LabelFixture,
  card: CardFixture,
  badge: BadgeFixture,
  separator: SeparatorFixture,
}

window.__benosBatchOne = {
  render(name, theme, direction) {
    dispose?.()
    activations.set(0)
    refsCalled = 0
    lastRef = undefined
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.dir = direction
    const Fixture = fixtures[name]
    dispose = render(() => <Fixture />, host)
  },
  refId() {
    return lastRef?.id
  },
  refCount() {
    return refsCalled
  },
  dispose() {
    dispose?.()
    dispose = undefined
  },
}
