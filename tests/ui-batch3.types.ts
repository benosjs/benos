import { expectTypeOf } from 'expect-type'
import type { DialogProps } from '../registry/source/components/dialog.js'
import type { DropdownMenuProps } from '../registry/source/components/dropdown-menu.js'
import type { PopoverProps } from '../registry/source/components/popover.js'
import type { ToastProps } from '../registry/source/components/toast.js'
import type { TooltipProps } from '../registry/source/components/tooltip.js'
import type { Child } from '@benosjs/dom'

expectTypeOf<DialogProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<DialogProps['dir']>().toEqualTypeOf<'ltr' | 'rtl' | undefined>()
expectTypeOf<DialogProps['children']>().toMatchTypeOf<Child>()

expectTypeOf<PopoverProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<PopoverProps['open']>().toEqualTypeOf<boolean | undefined>()
expectTypeOf<PopoverProps['children']>().toMatchTypeOf<Child>()

expectTypeOf<TooltipProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<TooltipProps['label']>().toEqualTypeOf<string>()
expectTypeOf<TooltipProps['trigger']>().toMatchTypeOf<Child>()

expectTypeOf<DropdownMenuProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<
  DropdownMenuProps['items'][number]['value']
>().toEqualTypeOf<string>()
expectTypeOf<DropdownMenuProps['items'][number]['disabled']>().toEqualTypeOf<
  boolean | undefined
>()

expectTypeOf<ToastProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<ToastProps['title']>().toMatchTypeOf<Child | undefined>()

const toastWithoutType: ToastProps = { title: 'Saved' }
const toastWithType: ToastProps = { title: 'Saved', type: 'success' }
void toastWithoutType
void toastWithType
