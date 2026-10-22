/**
 * Minimal app-local stand-ins with the props of shadcn/ui's generated `Field`,
 * `FieldLabel`, and `FieldError` (https://ui.shadcn.com/docs/components/field).
 * Like the Benos registry components, their implementation is not counted.
 */
import type { ComponentProps } from 'react'

export function Field({
  className,
  ...props
}: ComponentProps<'div'> & { 'data-invalid'?: boolean }) {
  return (
    <div
      role="group"
      data-slot="field"
      className={['group/field flex w-full flex-col gap-3', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}

export function FieldLabel({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      data-slot="field-label"
      className={['flex w-fit gap-2 text-sm font-medium', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}

export function FieldError({
  errors,
  className,
  ...props
}: ComponentProps<'div'> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const messages = [
    ...new Set((errors ?? []).flatMap((error) => error?.message ?? [])),
  ]
  if (messages.length === 0) return null
  return (
    <div
      role="alert"
      data-slot="field-error"
      className={['text-destructive text-sm font-normal', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {messages.length === 1 ? (
        messages[0]
      ) : (
        <ul className="ml-4 flex list-disc flex-col gap-1">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
