import { expectTypeOf } from 'expect-type'
import { expect, it } from 'vitest'
import { resource } from '../src/index.js'
import type { ResourceState } from '../src/index.js'

function checkResourceTypes(key: () => string): void {
  const uninitialized = resource(key, async (value) => value.length)
  const initialized = resource(key, async (value) => value.length, {
    initialValue: 0,
  })

  expectTypeOf(uninitialized.read()).toEqualTypeOf<number | undefined>()
  expectTypeOf(uninitialized.value()).toEqualTypeOf<number | undefined>()
  expectTypeOf(initialized.read()).toEqualTypeOf<number>()
  expectTypeOf(initialized.value()).toEqualTypeOf<number>()
  expectTypeOf(uninitialized.state()).toEqualTypeOf<ResourceState>()
  expectTypeOf(uninitialized.refresh()).toEqualTypeOf<
    Promise<number | undefined>
  >()
}
void checkResourceTypes

it('compiles the initialized and uninitialized public overloads', () => {
  expect(typeof resource).toBe('function')
})
