/** A minimal stand-in with the props of shadcn/ui's generated `Input`. */
import type { ComponentProps } from 'react'

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={[
        'border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs aria-invalid:border-destructive',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}
