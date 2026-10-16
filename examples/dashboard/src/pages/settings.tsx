/** @jsxImportSource @benosjs/dom */

import { computed, signal } from '@benosjs/core'
import { Button } from '../../../../registry/source/components/button.js'
import { Card } from '../../../../registry/source/components/card.js'
import { Input } from '../../../../registry/source/components/input.js'

export default function SettingsPage() {
  const name = signal('Ada Lovelace')
  const email = signal('ada@example.test')
  const submitted = signal(false)
  const errors = computed(() => ({
    name: name().trim().length < 2 ? 'Name needs at least two characters.' : '',
    email: email().includes('@') ? '' : 'Enter a valid email address.',
  }))
  const status = computed(() => {
    if (!submitted()) return 'Changes stay in this local demo.'
    return errors().name || errors().email
      ? 'Please correct the highlighted fields.'
      : 'Profile saved locally.'
  })
  return (
    <>
      <p class="eyebrow">Workspace settings</p>
      <h1>Profile</h1>
      <p class="page-intro">
        A small validated form using controlled signal values.
      </p>
      <Card>
        <form
          class="form-stack"
          onSubmit={(event) => {
            event.preventDefault()
            submitted.set(true)
          }}
        >
          <label class="form-field">
            Name
            <Input
              value={name()}
              aria-invalid={errors().name ? 'true' : 'false'}
              onInput={(event) => name.set(event.currentTarget.value)}
            />
            <span class="form-error">{errors().name}</span>
          </label>
          <label class="form-field">
            Email
            <Input
              type="email"
              value={email()}
              aria-invalid={errors().email ? 'true' : 'false'}
              onInput={(event) => email.set(event.currentTarget.value)}
            />
            <span class="form-error">{errors().email}</span>
          </label>
          <div>
            <Button type="submit">Save profile</Button>
          </div>
          <p class="form-status" role="status">
            {status()}
          </p>
        </form>
      </Card>
    </>
  )
}
