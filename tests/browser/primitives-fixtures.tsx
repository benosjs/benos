import { onCleanup } from '@benosjs/core'
import { render } from '@benosjs/dom'
import { collection as createListCollection } from '@zag-js/select'
import { createStore, group as toastGroup } from '@zag-js/toast'
import { VanillaMachine } from '@zag-js/vanilla'
import { createAccordion } from '@benosjs/primitives/accordion'
import { createCheckbox } from '@benosjs/primitives/checkbox'
import { createDialog } from '@benosjs/primitives/dialog'
import { createMenu } from '@benosjs/primitives/menu'
import { createPopover } from '@benosjs/primitives/popover'
import { createRadioGroup } from '@benosjs/primitives/radio-group'
import { createSelect } from '@benosjs/primitives/select'
import { createSwitch } from '@benosjs/primitives/switch'
import { createTabs } from '@benosjs/primitives/tabs'
import { createToast } from '@benosjs/primitives/toast'
import { createTooltip } from '@benosjs/primitives/tooltip'

export const primitiveNames = [
  'checkbox',
  'switch',
  'radio-group',
  'select',
  'tabs',
  'accordion',
  'dialog',
  'popover',
  'tooltip',
  'menu',
  'toast',
] as const

export type PrimitiveName = (typeof primitiveNames)[number]

const collection = createListCollection({
  items: [
    { label: 'Alpha', value: 'alpha' },
    { label: 'Bravo', value: 'bravo' },
    { label: 'Charlie', value: 'charlie' },
  ],
})

function CheckboxFixture(): JSX.Element {
  const checkbox = createCheckbox(() => ({ id: 'fixture-checkbox' }))
  const api = checkbox.api
  return (
    <div>
      <label {...api().getRootProps()}>
        <input {...api().getHiddenInputProps()} tabIndex={0} />
        <span {...api().getControlProps()} />
        <span {...api().getLabelProps()}>Accept terms</span>
      </label>
    </div>
  )
}

function SwitchFixture(): JSX.Element {
  const item = createSwitch(() => ({
    id: 'fixture-switch',
    label: 'Email notifications',
  }))
  const api = item.api
  return (
    <div>
      <label {...api().getRootProps()}>
        <input {...api().getHiddenInputProps()} tabIndex={0} />
        <span {...api().getControlProps()}>
          <span {...api().getThumbProps()} />
        </span>
        <span {...api().getLabelProps()}>Email notifications</span>
      </label>
    </div>
  )
}

function RadioGroupFixture(): JSX.Element {
  const group = createRadioGroup(() => ({
    id: 'fixture-radio',
    defaultValue: 'alpha',
    orientation: 'horizontal',
  }))
  const api = group.api
  const values = [
    { value: 'alpha', label: 'Alpha' },
    { value: 'bravo', label: 'Bravo' },
    { value: 'charlie', label: 'Charlie' },
  ]
  return (
    <div>
      <div {...api().getRootProps()} style={{ display: 'flex' }}>
        <div {...api().getLabelProps()}>Delivery speed</div>
        {values.map((item) => (
          <label {...api().getItemProps({ value: item.value })}>
            <input {...api().getItemHiddenInputProps({ value: item.value })} />
            <span {...api().getItemControlProps({ value: item.value })} />
            <span {...api().getItemTextProps({ value: item.value })}>
              {item.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function SelectFixture(): JSX.Element {
  const select = createSelect(() => ({
    id: 'fixture-select',
    collection,
    positioning: { sameWidth: false },
  }))
  const api = select.api
  return (
    <div>
      <label {...api().getLabelProps()}>Choose a value</label>
      <div {...api().getRootProps()}>
        <div {...api().getControlProps()}>
          <button {...api().getTriggerProps()}>
            <span {...api().getValueTextProps()}>
              {api().valueAsString || 'Choose a value'}
            </span>
            <span {...api().getIndicatorProps()} aria-hidden="true">
              ▾
            </span>
          </button>
          <button {...api().getClearTriggerProps()}>Clear</button>
        </div>
        <select {...api().getHiddenSelectProps()} />
        <div {...api().getPositionerProps()}>
          <div {...api().getContentProps()}>
            {collection.items.map((item) => (
              <div {...api().getItemProps({ item })}>
                <span {...api().getItemTextProps({ item })}>{item.label}</span>
                <span
                  {...api().getItemIndicatorProps({ item })}
                  aria-hidden="true"
                >
                  ✓
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TabsFixture(): JSX.Element {
  const tabs = createTabs(() => ({
    id: 'fixture-tabs',
    defaultValue: 'alpha',
    activationMode: 'automatic',
  }))
  const api = tabs.api
  return (
    <div>
      <h2 id="tabs-label">Account sections</h2>
      <div {...api().getRootProps()}>
        <div {...api().getListProps()} aria-labelledby="tabs-label">
          <button {...api().getTriggerProps({ value: 'alpha' })}>Alpha</button>
          <button {...api().getTriggerProps({ value: 'bravo' })}>Bravo</button>
          <button {...api().getTriggerProps({ value: 'charlie' })}>
            Charlie
          </button>
        </div>
        <div {...api().getContentProps({ value: 'alpha' })}>Alpha panel</div>
        <div {...api().getContentProps({ value: 'bravo' })}>Bravo panel</div>
        <div {...api().getContentProps({ value: 'charlie' })}>
          Charlie panel
        </div>
      </div>
    </div>
  )
}

function AccordionFixture(): JSX.Element {
  const accordion = createAccordion(() => ({
    id: 'fixture-accordion',
    defaultValue: [],
    collapsible: true,
  }))
  const api = accordion.api
  return (
    <div>
      <h2>Help topics</h2>
      <div {...api().getRootProps()}>
        {['alpha', 'bravo', 'charlie'].map((value) => (
          <section {...api().getItemProps({ value })}>
            <h3>
              <button tabIndex={0} {...api().getItemTriggerProps({ value })}>
                {value[0]?.toUpperCase() + value.slice(1)}
              </button>
            </h3>
            <div {...api().getItemContentProps({ value })}>
              {value} information
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function DialogFixture(): JSX.Element {
  const dialog = createDialog(() => ({
    id: 'fixture-dialog',
    modal: true,
    trapFocus: true,
    defaultOpen: false,
  }))
  const api = dialog.api
  return (
    <div>
      <button id="outside-before">Before dialog</button>
      <button {...api().getTriggerProps()}>Open dialog</button>
      <button id="outside-after">After dialog</button>
      <div {...api().getPositionerProps()}>
        <div {...api().getBackdropProps()} />
        <section {...api().getContentProps()}>
          <h2 {...api().getTitleProps()}>Edit profile</h2>
          <p {...api().getDescriptionProps()}>Update your display name.</p>
          <input aria-label="Display name" />
          <button id="dialog-save" tabIndex={0}>
            Save
          </button>
          <button tabIndex={0} {...api().getCloseTriggerProps()}>
            Close dialog
          </button>
        </section>
      </div>
    </div>
  )
}

function PopoverFixture(): JSX.Element {
  const popover = createPopover(() => ({
    id: 'fixture-popover',
    defaultOpen: false,
    portalled: false,
    autoFocus: true,
  }))
  const api = popover.api
  return (
    <div>
      <button id="before-popover">Before popover</button>
      <div {...api().getAnchorProps()}>
        <button {...api().getTriggerProps()}>Open details</button>
      </div>
      <div {...api().getPositionerProps()}>
        <section {...api().getContentProps()}>
          <h2 {...api().getTitleProps()}>Details</h2>
          <p {...api().getDescriptionProps()}>Additional information.</p>
          <input aria-label="Search details" />
          <button {...api().getCloseTriggerProps()}>Close details</button>
        </section>
      </div>
    </div>
  )
}

function TooltipFixture(): JSX.Element {
  const tooltip = createTooltip(() => ({
    id: 'fixture-tooltip',
    openDelay: 0,
    closeDelay: 0,
  }))
  const api = tooltip.api
  return (
    <div>
      <button tabIndex={0} {...api().getTriggerProps()}>
        Help
      </button>
      <div {...api().getPositionerProps()}>
        <div {...api().getContentProps()}>Information about this setting.</div>
      </div>
    </div>
  )
}

function MenuFixture(): JSX.Element {
  const menu = createMenu(() => ({
    id: 'fixture-menu',
    'aria-label': 'File actions',
    defaultOpen: false,
    loopFocus: true,
    typeahead: true,
  }))
  const api = menu.api
  return (
    <div>
      <button id="before-menu">Before menu</button>
      <button {...api().getTriggerProps()}>File actions</button>
      <div {...api().getPositionerProps()}>
        <div {...api().getContentProps()}>
          <div {...api().getItemProps({ value: 'alpha' })}>Alpha</div>
          <div {...api().getItemProps({ value: 'bravo' })}>Bravo</div>
          <div {...api().getItemProps({ value: 'charlie' })}>Charlie</div>
        </div>
      </div>
      <button id="after-menu" tabIndex={0}>
        After menu
      </button>
    </div>
  )
}

function ToastFixture(): JSX.Element {
  const store = createStore()
  const group = new VanillaMachine(toastGroup.machine, () => ({
    id: 'fixture-toast-group',
    store,
  }))
  group.start()
  onCleanup(() => group.stop())
  const toast = createToast(() => ({
    id: 'fixture-toast',
    parent: group.service,
    type: 'success',
    title: 'Saved',
    description: 'Your changes were saved.',
    duration: Infinity,
    removeDelay: 0,
    closable: true,
  }))
  const api = toast.api
  return (
    <div>
      <button id="before-toast">Continue working</button>
      <div aria-label="Notifications">
        <div {...api().getRootProps()}>
          <h2 {...api().getTitleProps()}>Saved</h2>
          <p {...api().getDescriptionProps()}>Your changes were saved.</p>
          <button {...api().getCloseTriggerProps()}>
            Dismiss notification
          </button>
        </div>
      </div>
      <button id="after-toast">Next control</button>
    </div>
  )
}

const fixtures: Record<PrimitiveName, () => JSX.Element> = {
  checkbox: CheckboxFixture,
  switch: SwitchFixture,
  'radio-group': RadioGroupFixture,
  select: SelectFixture,
  tabs: TabsFixture,
  accordion: AccordionFixture,
  dialog: DialogFixture,
  popover: PopoverFixture,
  tooltip: TooltipFixture,
  menu: MenuFixture,
  toast: ToastFixture,
}

export function renderPrimitiveFixture(
  name: PrimitiveName,
  host: Element,
): () => void {
  const Fixture = fixtures[name]
  return render(
    () => (
      <div>
        <Fixture />
        <button id="primitive-after-widget" tabIndex={0}>
          After widget
        </button>
      </div>
    ),
    host,
  )
}
