import { Button } from '../../../../../registry/source/components/button.js'
import { Input } from '../../../../../registry/source/components/input.js'
import { projectForm } from '../routes/refs.js'

// #region flagship
export default function ProjectEditor() {
  const form = projectForm()
  return (
    <form onSubmit={form.submit}>
      <form.Field name="name" component={Input} label="Name" />
      <form.Field name="ownerEmail" component={Input} label="Owner email" />
      <p role="alert">{form.error()}</p>
      <Button type="submit" disabled={form.submitting()}>
        Save
      </Button>
    </form>
  )
}
// #endregion
