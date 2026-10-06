import { render } from '@benosjs/dom'
import { signal } from '@benosjs/core'
import type { JSX } from '@benosjs/dom'
import { Accordion } from '../../registry/source/components/accordion.js'
import { Checkbox } from '../../registry/source/components/checkbox.js'
import { RadioGroup } from '../../registry/source/components/radio-group.js'
import { Select } from '../../registry/source/components/select.js'
import { Switch } from '../../registry/source/components/switch.js'
import { Tabs } from '../../registry/source/components/tabs.js'
import '../../examples/ui-gallery/src/ui.css'

type FixtureName =
  'checkbox' | 'switch' | 'radio-group' | 'select' | 'tabs' | 'accordion'

type FixtureMode = 'light' | 'dark' | 'rtl' | 'dark-rtl'

declare global {
  interface Window {
    __benosBatchTwo: {
      rootId: () => string | undefined
      hasRef: () => boolean
      dispose: () => void
    }
  }
}

const params = new URLSearchParams(location.search)
const name = (params.get('component') ?? 'checkbox') as FixtureName
const mode = (params.get('mode') ?? 'light') as FixtureMode
const controlled = params.get('controlled') === 'true'
const dark = mode === 'dark' || mode === 'dark-rtl'
const rtl = mode === 'rtl' || mode === 'dark-rtl'
document.documentElement.dataset.theme = dark ? 'dark' : 'light'
document.documentElement.dir = rtl ? 'rtl' : 'ltr'
document.documentElement.style.colorScheme = dark ? 'dark' : 'light'

const host = document.querySelector<HTMLElement>('#batch2-app')
if (!host) throw new Error('Batch 2 fixture host is missing')

let root: HTMLElement | undefined
const rootIds: Record<FixtureName, string> = {
  checkbox: 'fixture-checkbox',
  switch: 'fixture-switch',
  'radio-group': 'fixture-radio',
  select: 'fixture-select',
  tabs: 'fixture-tabs',
  accordion: 'fixture-accordion',
}

function recordRef(element: HTMLElement): void {
  root = element
}

function Fixture(): JSX.Element {
  const checkboxValue = signal(false)
  const switchValue = signal(true)
  const radioValue = signal('standard')
  const selectValue = signal<string[]>(['north'])
  const tabsValue = signal('profile')
  const accordionValue = signal<string[]>(['shipping'])
  const next = (
    <button
      class="benos-button benos-button--primary benos-button--md"
      id="batch2-after"
      tabIndex={0}
    >
      Continue
    </button>
  )
  if (name === 'checkbox') {
    return (
      <>
        <Checkbox
          id={rootIds.checkbox}
          ref={recordRef}
          checked={controlled ? checkboxValue() : undefined}
          defaultChecked={controlled ? undefined : false}
          onCheckedChange={(details) =>
            checkboxValue.set(details.checked === true)
          }
        >
          Accept terms
        </Checkbox>
        {next}
      </>
    )
  }
  if (name === 'switch') {
    return (
      <>
        <Switch
          id={rootIds.switch}
          ref={recordRef}
          checked={controlled ? switchValue() : undefined}
          defaultChecked={controlled ? undefined : true}
          onCheckedChange={(details) => switchValue.set(details.checked)}
        >
          Product updates
        </Switch>
        {next}
      </>
    )
  }
  if (name === 'radio-group') {
    return (
      <>
        <RadioGroup
          id={rootIds['radio-group']}
          ref={recordRef}
          label="Delivery speed"
          value={controlled ? radioValue() : undefined}
          defaultValue={controlled ? undefined : 'standard'}
          onValueChange={(details) => radioValue.set(details.value)}
          orientation="horizontal"
          items={[
            { value: 'standard', label: 'Standard' },
            { value: 'express', label: 'Express' },
            { value: 'overnight', label: 'Overnight' },
          ]}
        />
        {next}
      </>
    )
  }
  if (name === 'select') {
    return (
      <>
        <Select
          id={rootIds.select}
          ref={recordRef}
          label="Choose a region"
          value={controlled ? selectValue() : undefined}
          defaultValue={controlled ? undefined : ['north']}
          onValueChange={(details) => selectValue.set(details.value)}
          positioning={{ sameWidth: true }}
          items={[
            { value: 'north', label: 'North' },
            { value: 'south', label: 'South' },
            { value: 'west', label: 'West' },
          ]}
        />
        {next}
      </>
    )
  }
  if (name === 'tabs') {
    return (
      <>
        <Tabs
          id={rootIds.tabs}
          ref={recordRef}
          label="Account sections"
          value={controlled ? tabsValue() : undefined}
          defaultValue={controlled ? undefined : 'profile'}
          onValueChange={(details) => tabsValue.set(details.value)}
          items={[
            { value: 'profile', label: 'Profile', content: 'Profile details' },
            {
              value: 'security',
              label: 'Security',
              content: 'Security settings',
            },
            { value: 'billing', label: 'Billing', content: 'Billing methods' },
          ]}
        />
        {next}
      </>
    )
  }
  return (
    <>
      <Accordion
        id={rootIds.accordion}
        ref={recordRef}
        value={controlled ? accordionValue() : undefined}
        defaultValue={controlled ? undefined : ['shipping']}
        onValueChange={(details) => accordionValue.set(details.value)}
        items={[
          {
            value: 'shipping',
            title: 'Shipping',
            content: 'Delivery takes two business days.',
          },
          {
            value: 'returns',
            title: 'Returns',
            content: 'Returns are accepted within thirty days.',
          },
          {
            value: 'billing',
            title: 'Billing',
            content: 'All major cards are accepted.',
          },
        ]}
      />
      {next}
    </>
  )
}

const dispose = render(() => <Fixture />, host)
window.__benosBatchTwo = {
  rootId: () => root?.id,
  hasRef: () => Boolean(root?.isConnected),
  dispose: () => dispose?.(),
}
