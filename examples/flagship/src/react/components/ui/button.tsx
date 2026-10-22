/** A minimal stand-in with the default variant of shadcn/ui's generated `Button`. */
import type { ComponentProps } from 'react'

export function Button({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      data-slot="button"
      className={[
        'bg-primary text-primary-foreground inline-flex h-9 items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}
