import {
  Dynamic,
  ErrorBoundary,
  For,
  Match,
  Portal,
  Show,
  Switch,
  children,
  component,
  dynamicChild,
  instantiate,
  jsx,
  jsxDEV,
  jsxs,
  mergeProps,
  render,
  splitProps,
  template,
} from '@benosjs/dom'
import type { Child, Component, JSX, TemplateScope } from '@benosjs/dom'

type Item = { id: string; label: string }

const items: Item[] = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
]
const portalHost = document.createElement('aside')
portalHost.id = 'consumer-portal'
document.body.append(portalHost)

function Card(props: { title: string; children?: Child }): JSX.Element {
  const [titleProps, rest] = splitProps(props, ['title'] as const)
  const merged = mergeProps({ class: 'card' }, rest)
  const title = children(() => titleProps.title)
  return (
    <section {...merged}>
      <h1>{title()}</h1>
      {props.children}
    </section>
  )
}

const itemView: Component<{ item: Item }> = (props) => (
  <li>{props.item.label}</li>
)
const plan = template({
  id: 'consumer-template',
  nodes: [{ op: 'text', slot: 0 }],
})
const instantiated = instantiate(plan, (scope: TemplateScope) => {
  scope.text(0, () => 'template helper')
})
const directElement = jsx('span', { children: 'jsx helper' })
const directElements = jsxs('span', { children: 'jsxs helper' })
const developmentElement = jsxDEV('span', { children: 'jsxDEV helper' })
const directComponent = component(itemView, {
  item: items[0] ?? { id: 'fallback', label: 'Fallback' },
})
const dynamic = dynamicChild(() => 'dynamic child helper')

function App(): JSX.Element {
  return (
    <Card title="Consumer">
      <Show when={true} fallback={<span>show fallback</span>}>
        <span id="show">show</span>
      </Show>
      <For
        each={items}
        by={(item) => item.id}
        fallback={<span>for fallback</span>}
      >
        {(item) => <span>{item().label}</span>}
      </For>
      <Switch fallback={<span>switch fallback</span>}>
        <Match when={false}>no match</Match>
        <Match when={true}>match</Match>
      </Switch>
      <Dynamic component="strong">dynamic</Dynamic>
      <Portal mount={portalHost}>portal</Portal>
      <ErrorBoundary
        fallback={(error, retry) => (
          <button onClick={retry}>{String(error)}</button>
        )}
      >
        boundary
      </ErrorBoundary>
      {[
        instantiated,
        directElement,
        directElements,
        developmentElement,
        directComponent,
        dynamic,
      ]}
    </Card>
  )
}

const host = document.getElementById('app')
if (!host) throw new Error('consumer fixture host missing')
render(() => <App />, host)
if (!document.querySelector('#show'))
  throw new Error('consumer fixture did not run')
