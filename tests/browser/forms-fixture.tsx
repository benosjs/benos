import { render } from '@benosjs/dom'
import { mutation } from '@benosjs/query'
import { checked, choice, formModel, select } from '@benosjs/forms'
import type { StandardIssue, StandardSchemaV1 } from '@benosjs/forms'
import { Button } from '../../registry/source/components/button.js'
import { Checkbox } from '../../registry/source/components/checkbox.js'
import { Input } from '../../registry/source/components/input.js'
import { RadioGroup } from '../../registry/source/components/radio-group.js'
import { Select } from '../../registry/source/components/select.js'
import { Switch } from '../../registry/source/components/switch.js'
import { Textarea } from '../../registry/source/components/textarea.js'
import '../../examples/ui-gallery/src/ui.css'
import '../../registry/source/css/field.css'

interface Settings {
  name: string
  bio: string
  agree: boolean
  notify: boolean
  plan: string | null
  region: string | null
}

const mode = new URLSearchParams(location.search).get('mode') ?? 'light'
const dark = mode === 'dark' || mode === 'dark-rtl'
document.documentElement.dataset.theme = dark ? 'dark' : 'light'
document.documentElement.dir = mode.endsWith('rtl') ? 'rtl' : 'ltr'
document.documentElement.style.colorScheme = dark ? 'dark' : 'light'

/** A hand-written Standard Schema, so the fixture needs no validation library. */
const schema: StandardSchemaV1<Settings> = {
  '~standard': {
    version: 1,
    vendor: 'fixture',
    validate: (input) => {
      const value = input as Settings
      const issues: StandardIssue[] = []
      if (value.name.trim().length < 2)
        issues.push({
          path: ['name'],
          message: 'Enter at least two characters.',
        })
      if (!value.bio)
        issues.push({ path: ['bio'], message: 'Add a short bio.' })
      if (!value.agree)
        issues.push({
          path: ['agree'],
          message: 'Accept the terms to continue.',
        })
      if (!value.plan)
        issues.push({ path: ['plan'], message: 'Choose a plan.' })
      if (!value.region)
        issues.push({ path: ['region'], message: 'Choose a region.' })
      return issues.length ? { issues } : { value }
    },
  },
}

const saved: Settings[] = []
const save = mutation({
  run: (values: Settings) => {
    saved.push(values)
    return values
  },
})
const settingsForm = formModel({
  initial: (): Settings => ({
    name: '',
    bio: '',
    agree: false,
    notify: true,
    plan: null,
    region: null,
  }),
  schema,
  save,
})

declare global {
  interface Window {
    __benosForms: { saved: () => Settings[] }
  }
}
window.__benosForms = { saved: () => saved }

function SettingsEditor() {
  const form = settingsForm()
  return (
    <form id="settings" noValidate onSubmit={form.submit}>
      <form.Field
        name="name"
        component={Input}
        label="Display name"
        description="Shown to your team."
      />
      <form.Field name="bio" component={Textarea} label="Bio" rows={3} />
      <form.Field
        name="agree"
        component={Checkbox}
        bind={checked}
        label="I accept the terms"
      />
      <form.Field
        name="notify"
        component={Switch}
        bind={checked}
        label="Email notifications"
        description="A weekly summary."
      />
      <form.Field
        name="plan"
        component={RadioGroup}
        bind={choice}
        label="Plan"
        items={[
          { value: 'free', label: 'Free' },
          { value: 'team', label: 'Team' },
        ]}
      />
      <form.Field
        name="region"
        component={Select}
        bind={select}
        label="Region"
        items={[
          { value: 'eu', label: 'Europe' },
          { value: 'us', label: 'United States' },
        ]}
      />
      <p role="alert">{form.error()}</p>
      <Button type="submit" disabled={form.submitting()}>
        Save
      </Button>
    </form>
  )
}

const host = document.querySelector<HTMLElement>('#forms-app')
if (!host) throw new Error('Forms fixture host is missing')
render(() => <SettingsEditor />, host)
