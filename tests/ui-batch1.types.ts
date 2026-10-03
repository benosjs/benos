import { expectTypeOf } from 'expect-type'
import type { JSX } from '@benosjs/dom'
import type {
  BadgeProps,
  BadgeTone,
} from '../registry/source/components/badge.js'
import type {
  ButtonProps,
  ButtonSize,
  ButtonVariant,
} from '../registry/source/components/button.js'
import type {
  CardProps,
  CardVariant,
} from '../registry/source/components/card.js'
import type {
  InputProps,
  InputSize,
  InputType,
} from '../registry/source/components/input.js'
import type { LabelProps } from '../registry/source/components/label.js'
import type {
  SeparatorOrientation,
  SeparatorProps,
} from '../registry/source/components/separator.js'
import type {
  TextareaProps,
  TextareaSize,
} from '../registry/source/components/textarea.js'
import { Badge } from '../registry/source/components/badge.js'
import { Button } from '../registry/source/components/button.js'
import { Card } from '../registry/source/components/card.js'
import { Input } from '../registry/source/components/input.js'
import { Label } from '../registry/source/components/label.js'
import { Separator } from '../registry/source/components/separator.js'
import { Textarea } from '../registry/source/components/textarea.js'

type IsAny<T> = 0 extends 1 & T ? true : false
type Assert<T extends true> = T

expectTypeOf<ButtonProps['variant']>().toEqualTypeOf<
  ButtonVariant | undefined
>()
expectTypeOf<ButtonProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<ButtonProps['size']>().toEqualTypeOf<ButtonSize | undefined>()
expectTypeOf<ButtonProps['ref']>().toEqualTypeOf<
  ((element: HTMLButtonElement) => void) | undefined
>()
expectTypeOf<InputProps['size']>().toEqualTypeOf<InputSize | undefined>()
expectTypeOf<InputProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<InputProps['type']>().toEqualTypeOf<InputType | undefined>()
expectTypeOf<InputProps['ref']>().toEqualTypeOf<
  ((element: HTMLInputElement) => void) | undefined
>()
expectTypeOf<TextareaProps['size']>().toEqualTypeOf<TextareaSize | undefined>()
expectTypeOf<TextareaProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<TextareaProps['ref']>().toEqualTypeOf<
  ((element: HTMLTextAreaElement) => void) | undefined
>()
expectTypeOf<LabelProps['for']>().toEqualTypeOf<string | undefined>()
expectTypeOf<LabelProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<LabelProps['ref']>().toEqualTypeOf<
  ((element: HTMLLabelElement) => void) | undefined
>()
expectTypeOf<CardProps['variant']>().toEqualTypeOf<CardVariant | undefined>()
expectTypeOf<CardProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<BadgeProps['tone']>().toEqualTypeOf<BadgeTone | undefined>()
expectTypeOf<BadgeProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<BadgeProps['ref']>().toEqualTypeOf<
  ((element: HTMLSpanElement) => void) | undefined
>()
expectTypeOf<SeparatorProps['orientation']>().toEqualTypeOf<
  SeparatorOrientation | undefined
>()
expectTypeOf<SeparatorProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<SeparatorProps['ref']>().toEqualTypeOf<
  ((element: HTMLDivElement) => void) | undefined
>()
expectTypeOf<
  Parameters<NonNullable<CardProps['ref']>>[0]
>().toEqualTypeOf<HTMLDivElement>()
expectTypeOf<typeof Button>().toEqualTypeOf<
  (props: ButtonProps) => JSX.Element
>()
expectTypeOf<typeof Input>().toEqualTypeOf<(props: InputProps) => JSX.Element>()
expectTypeOf<typeof Textarea>().toEqualTypeOf<
  (props: TextareaProps) => JSX.Element
>()
expectTypeOf<typeof Label>().toEqualTypeOf<(props: LabelProps) => JSX.Element>()
expectTypeOf<typeof Card>().toEqualTypeOf<(props: CardProps) => JSX.Element>()
expectTypeOf<typeof Badge>().toEqualTypeOf<(props: BadgeProps) => JSX.Element>()
expectTypeOf<typeof Separator>().toEqualTypeOf<
  (props: SeparatorProps) => JSX.Element
>()

const validButton: ButtonProps = {
  id: 'save',
  variant: 'primary',
  type: 'submit',
  onClick: (event) => event.currentTarget,
}
const validInput: InputProps = {
  id: 'email',
  type: 'email',
  invalid: true,
  ref: (element) => element.select(),
}
const validTextarea: TextareaProps = {
  id: 'notes',
  rows: 4,
  onInput: (event) => event.currentTarget.value,
}
const validLabel: LabelProps = { for: 'email', children: 'Email address' }
const validCard: CardProps = { variant: 'raised', children: 'Content' }
const validBadge: BadgeProps = { tone: 'success', children: 'Ready' }
const validSeparator: SeparatorProps = { orientation: 'vertical' }
const omitIds: [
  ButtonProps,
  InputProps,
  TextareaProps,
  LabelProps,
  CardProps,
  BadgeProps,
  SeparatorProps,
] = [{}, {}, {}, {}, {}, {}, {}]
void [
  validButton,
  validInput,
  validTextarea,
  validLabel,
  validCard,
  validBadge,
  validSeparator,
]
void omitIds

// @ts-expect-error Benos JSX uses class, not className.
const invalidButton: ButtonProps = { className: 'wrong' }
// @ts-expect-error Only the documented Button variants are accepted.
const invalidVariant: ButtonProps = { variant: 'tertiary' }
// @ts-expect-error Label uses the standard Benos for attribute.
const invalidLabel: LabelProps = { htmlFor: 'email' }
void [invalidButton, invalidVariant, invalidLabel]
type PublicElement = JSX.Element
type PropsAreNotAny = Assert<
  IsAny<
    | ButtonProps
    | InputProps
    | TextareaProps
    | LabelProps
    | CardProps
    | BadgeProps
    | SeparatorProps
  > extends false
    ? true
    : false
>

export type BatchOneTypeChecks = [
  PropsAreNotAny,
  typeof invalidButton,
  typeof invalidVariant,
  typeof invalidLabel,
  PublicElement,
]
