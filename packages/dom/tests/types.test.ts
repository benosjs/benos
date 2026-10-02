import { expectTypeOf } from 'expect-type'
import {
  Dynamic,
  ErrorBoundary,
  For,
  Match,
  Portal,
  Show,
  Switch,
  children,
  mergeProps,
  splitProps,
} from '../src/index.js'
import type {
  Child,
  DynamicProps,
  ErrorBoundaryProps,
  ForProps,
  JSX,
  MatchProps,
  PortalProps,
  ShowProps,
  SwitchProps,
} from '../src/index.js'

type Element = JSX.Element

expectTypeOf(children(() => 'ready')).toEqualTypeOf<() => Child>()
expectTypeOf(mergeProps({ a: 1 }, { b: 'two' })).toMatchTypeOf<
  {
    a: number
  } & { b: string }
>()

const splitInput = { title: 'Dashboard', count: 5, enabled: true }
const [splitTitle, splitRest] = splitProps(splitInput, ['title'] as const)
expectTypeOf(splitTitle).toEqualTypeOf<{ title: string }>()
expectTypeOf(splitRest).toEqualTypeOf<{ count: number; enabled: boolean }>()

const htmlProps: JSX.IntrinsicElements['div'] = {
  class: 'card',
  'aria-label': 'card',
  onDblClick: (event) => event.currentTarget,
}
const svgProps: JSX.IntrinsicElements['svg'] = { viewBox: '0 0 10 10' }
const mathProps: JSX.IntrinsicElements['math'] = { dir: 'ltr' }
const outputProps: JSX.IntrinsicElements['output'] = { for: 'amount' }
void htmlProps
void svgProps
void mathProps
void outputProps

expectTypeOf(Show).toMatchTypeOf<<T>(props: ShowProps<T>) => Element>()
expectTypeOf(For).toMatchTypeOf<<T>(props: ForProps<T>) => Element>()
expectTypeOf(Switch).toMatchTypeOf<(props: SwitchProps) => Element>()
expectTypeOf(Match).toMatchTypeOf<<T>(props: MatchProps<T>) => Element>()
expectTypeOf(Dynamic).toMatchTypeOf<
  <P extends object>(props: DynamicProps<P>) => Element
>()
expectTypeOf(Portal).toMatchTypeOf<(props: PortalProps) => Element>()
expectTypeOf(ErrorBoundary).toMatchTypeOf<
  (props: ErrorBoundaryProps) => Element
>()
