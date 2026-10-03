import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountApp } from '@/main'

describe('Benos starter', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    mountApp(document.querySelector<HTMLElement>('#app')!)
  })

  it('keeps the component mounted once while signals and keyed items update', () => {
    const rendered = () => document.querySelector('.run-number')?.textContent
    const listItems = () => Array.from(document.querySelectorAll('li'))
    expect(rendered()).toBe('1')
    expect(document.querySelector('.run-unit')?.textContent).toBe('time')
    expect(document.querySelector('.counter-value')?.textContent).toBe('0')

    document.querySelector<HTMLButtonElement>('[aria-label="Increase counter"]')!.click()
    expect(document.querySelector('.counter-value')?.textContent).toBe('1')
    expect(rendered()).toBe('1')
    expect(document.querySelector('.run-unit')?.textContent).toBe('time')

    const [add, remove, shuffle] = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.list-actions button'),
    )
    add.click()
    expect(listItems()).toHaveLength(4)
    remove.click()
    expect(listItems()).toHaveLength(3)
    const beforeShuffle = listItems().map((item) => item.textContent?.trim())
    vi.spyOn(Math, 'random').mockReturnValue(0)
    shuffle.click()
    expect(listItems()).toHaveLength(3)
    expect(listItems().map((item) => item.textContent?.trim())).not.toEqual(beforeShuffle)
    expect(rendered()).toBe('1')
  })
})
