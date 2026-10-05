import { signal } from '@benosjs/core'
import { render, Show } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'
import { Dialog } from '../../registry/source/components/dialog.js'
import { DropdownMenu } from '../../registry/source/components/dropdown-menu.js'
import { Popover } from '../../registry/source/components/popover.js'
import { Toast } from '../../registry/source/components/toast.js'
import { Tooltip } from '../../registry/source/components/tooltip.js'
import { Button } from '../../registry/source/components/button.js'
import '../../examples/ui-gallery/src/ui.css'
import './batch3.css'

type OverlayName = 'dialog' | 'popover' | 'tooltip' | 'dropdown-menu' | 'toast'

declare global {
  interface Window {
    __benosBatchThree: {
      dispose: () => void
    }
  }
}

const parameters = new URLSearchParams(location.search)
const name = (parameters.get('component') ?? 'dialog') as OverlayName
const mode = parameters.get('mode') ?? 'light'
const scopedDirection = parameters.get('scope') === 'rtl'
const requestedDirection = parameters.get('callerDir')
const callerDir =
  requestedDirection === 'ltr' || requestedDirection === 'rtl'
    ? requestedDirection
    : undefined
const requestedTheme = parameters.get('scopeTheme')
const controlled = parameters.get('controlled') === 'true'
const dark = mode === 'dark' || mode === 'dark-rtl'
const rtl = mode === 'rtl' || mode === 'dark-rtl'
document.documentElement.dataset.theme = dark ? 'dark' : 'light'
document.documentElement.dir = rtl ? 'rtl' : 'ltr'
document.documentElement.style.colorScheme = dark ? 'dark' : 'light'

const host = document.querySelector<HTMLElement>('#batch3-app')
if (!host) throw new Error('Batch 3 fixture host is missing')
if (requestedTheme === 'light' || requestedTheme === 'dark')
  host.dataset.theme = requestedTheme

function Fixture(): JSX.Element {
  const toastOpen = signal(false)
  const overlayOpen = signal(false)
  return (
    <div
      id="overlay-background"
      class="batch3-fixture"
      dir={scopedDirection ? 'rtl' : undefined}
    >
      <p id="background-content">Background content stays behind overlays.</p>
      <p id="essential-information">
        Essential setup instructions stay visible on the page.
      </p>
      {name === 'dialog' && (
        <Dialog
          id="fixture-dialog"
          title="Edit profile"
          description="Update your display name."
          trigger="Open dialog"
          dir={callerDir}
          open={controlled ? overlayOpen() : undefined}
          onOpenChange={(details) => {
            if (controlled) overlayOpen.set(details.open)
          }}
        >
          <label for="dialog-name">Display name</label>
          <input id="dialog-name" />
          <Button id="dialog-save" tabIndex={0}>
            Save
          </Button>
        </Dialog>
      )}
      {name === 'popover' && (
        <div class="edge-trigger">
          <Popover
            id="fixture-popover"
            label="More details"
            trigger="Open details"
            dir={callerDir}
            open={controlled ? overlayOpen() : undefined}
            onOpenChange={(details) => {
              if (controlled) overlayOpen.set(details.open)
            }}
          >
            <p>
              This panel has enough content to exercise viewport collision
              handling close to the lower corner of the screen.
            </p>
            <button>Continue</button>
          </Popover>
        </div>
      )}
      {name === 'tooltip' && (
        <div class="edge-trigger">
          <Tooltip
            id="fixture-tooltip"
            label="Optional help"
            openDelay={0}
            closeDelay={0}
            trigger="Help"
            dir={callerDir}
            open={controlled ? overlayOpen() : undefined}
            onOpenChange={(details) => {
              if (controlled) overlayOpen.set(details.open)
            }}
          >
            Supplemental instructions are available on focus and hover.
          </Tooltip>
        </div>
      )}
      {name === 'dropdown-menu' && (
        <div class="edge-trigger">
          <DropdownMenu
            id="fixture-menu"
            label="File actions"
            trigger="Actions"
            dir={callerDir}
            open={controlled ? overlayOpen() : undefined}
            onOpenChange={(details) => {
              if (controlled) overlayOpen.set(details.open)
            }}
            items={[
              { value: 'rename', label: 'Rename' },
              { value: 'duplicate', label: 'Duplicate' },
              { value: 'archive', label: 'Archive' },
            ]}
          />
        </div>
      )}
      {name === 'toast' && (
        <>
          <button
            id="toast-trigger"
            tabIndex={0}
            onClick={() => toastOpen.set(true)}
          >
            Show notification
          </button>
          <Show when={toastOpen()}>
            <Toast
              id="fixture-toast"
              type="success"
              title="Saved"
              dir={callerDir}
              description="Your changes were saved."
              duration={Infinity}
              onStatusChange={(details) => {
                if (details.status === 'unmounted') toastOpen.set(false)
              }}
            />
          </Show>
        </>
      )}
      <button id="background-action" tabIndex={0}>
        Background action
      </button>
    </div>
  )
}

const dispose = render(() => <Fixture />, host)
window.__benosBatchThree = { dispose }
