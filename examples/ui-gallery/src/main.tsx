import { signal } from '@benosjs/core'
import { render, Show } from '@benosjs/dom'
import type { JSX } from '@benosjs/dom'
import { Badge } from '../../../registry/source/components/badge.js'
import { Button } from '../../../registry/source/components/button.js'
import { Card } from '../../../registry/source/components/card.js'
import { Input } from '../../../registry/source/components/input.js'
import { Label } from '../../../registry/source/components/label.js'
import { Separator } from '../../../registry/source/components/separator.js'
import { Textarea } from '../../../registry/source/components/textarea.js'
import { Checkbox } from '../../../registry/source/components/checkbox.js'
import { Switch } from '../../../registry/source/components/switch.js'
import { RadioGroup } from '../../../registry/source/components/radio-group.js'
import { Select } from '../../../registry/source/components/select.js'
import { Tabs } from '../../../registry/source/components/tabs.js'
import { Accordion } from '../../../registry/source/components/accordion.js'
import { Dialog } from '../../../registry/source/components/dialog.js'
import { DropdownMenu } from '../../../registry/source/components/dropdown-menu.js'
import { Popover } from '../../../registry/source/components/popover.js'
import { Toast } from '../../../registry/source/components/toast.js'
import { Tooltip } from '../../../registry/source/components/tooltip.js'
import { SortableTable } from '../../../registry/source/components/sortable-table.js'
import type { SortableTableColumn } from '../../../registry/source/components/sortable-table.js'
import './ui.css'
import './gallery.css'

type ThemeMode = 'light' | 'dark' | 'rtl'

type ExampleRow = {
  id: string
  name: string
  region: string
  requests: number
}

const sampleTableRows: readonly ExampleRow[] = [
  { id: 'u-1', name: 'Amina Saleh', region: 'Beirut', requests: 128 },
  { id: 'u-2', name: 'Daniel Haddad', region: 'Tripoli', requests: 42 },
  {
    id: 'u-3',
    name: 'Maya Khoury with a deliberately long display name',
    region: 'Sidon',
    requests: 305,
  },
  { id: 'u-4', name: 'Omar Nasser', region: 'Byblos', requests: 87 },
  {
    id: 'u-5',
    name: 'مريم خوري مع اسم طويل للعرض',
    region: 'بيروت',
    requests: 64,
  },
]

const largeTableRows: readonly ExampleRow[] = Array.from(
  { length: 10_000 },
  (_, index) => ({
    id: `member-${index + 1}`,
    name: index === 12 ? sampleTableRows[2].name : `Member ${index + 1}`,
    region: ['Beirut', 'Tripoli', 'Sidon', 'Byblos'][index % 4],
    requests: ((index + 1) * 37) % 1_200,
  }),
)

const tableColumns: readonly SortableTableColumn<ExampleRow>[] = [
  { key: 'name', label: 'Name', value: (row) => row.name },
  { key: 'region', label: 'Region', value: (row) => row.region },
  {
    key: 'requests',
    label: 'Requests',
    type: 'number',
    value: (row) => row.requests,
  },
]

function ComponentSamples(props: { mode: ThemeMode }): JSX.Element {
  const rtl = props.mode === 'rtl'
  const toastOpen = signal(false)
  const tableRows = signal(sampleTableRows)

  return (
    <section
      class="mode-panel"
      data-theme={rtl ? 'light' : props.mode}
      dir={rtl ? 'rtl' : 'ltr'}
      aria-labelledby={'mode-' + props.mode}
    >
      <header class="mode-heading">
        <div>
          <p class="eyebrow">Preview mode</p>
          <h2 id={'mode-' + props.mode}>
            {rtl ? 'Right to left' : props.mode === 'light' ? 'Light' : 'Dark'}
          </h2>
        </div>
        <img
          class="mode-mark"
          src={
            props.mode === 'dark'
              ? '/benos-mark-light.png'
              : '/benos-mark-navy.png'
          }
          alt=""
          width="34"
          height="34"
        />
      </header>
      <p class="mode-hint" dir={rtl ? 'ltr' : undefined}>
        Click Select to view options; hover or press Tab to preview focus
        styles.
      </p>
      {rtl && (
        <p class="rtl-sample" lang="ar">
          مرحبًا بكم في مكوّنات بينوس. صُممت هذه الواجهة لدعم اتجاه الكتابة من
          اليمين إلى اليسار.
        </p>
      )}

      <section class="sample-group" aria-labelledby={'buttons-' + props.mode}>
        <h3 id={'buttons-' + props.mode}>Button</h3>
        <div class="button-row">
          <Button id={'button-primary-' + props.mode}>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button disabled variant="danger">
            Disabled danger
          </Button>
          <Button size="sm" variant="outline">
            Small
          </Button>
          <Button size="lg" variant="secondary">
            Large
          </Button>
        </div>
      </section>

      <section class="sample-group" aria-labelledby={'fields-' + props.mode}>
        <h3 id={'fields-' + props.mode}>Input and textarea</h3>
        <div class="field-grid">
          <div class="field">
            <Label for={'email-' + props.mode}>Email address</Label>
            <Input
              id={'email-' + props.mode}
              type="email"
              placeholder="name@example.com"
            />
          </div>
          <div class="field">
            <Label for={'disabled-' + props.mode}>Disabled</Label>
            <Input id={'disabled-' + props.mode} disabled value="Unavailable" />
          </div>
          <div class="field">
            <Label for={'invalid-' + props.mode}>Invalid</Label>
            <Input
              id={'invalid-' + props.mode}
              invalid
              aria-describedby={'error-' + props.mode}
              value="not-an-email"
            />
            <span class="error-copy" dir="ltr" id={'error-' + props.mode}>
              Enter a valid email address.
            </span>
          </div>
          <div class="field">
            <Label for={'small-input-' + props.mode}>Small input</Label>
            <Input
              id={'small-input-' + props.mode}
              size="sm"
              placeholder="Compact"
            />
          </div>
          <div class="field">
            <Label for={'large-input-' + props.mode}>Large input</Label>
            <Input
              id={'large-input-' + props.mode}
              size="lg"
              placeholder="Comfortable"
            />
          </div>
          <div class="field field-wide">
            <Label for={'notes-' + props.mode}>Message</Label>
            <Textarea
              id={'notes-' + props.mode}
              rows={3}
              placeholder="Write a short note"
            />
          </div>
          <div class="field">
            <Label for={'disabled-notes-' + props.mode}>Disabled message</Label>
            <Textarea id={'disabled-notes-' + props.mode} disabled rows={2} />
          </div>
          <div class="field">
            <Label for={'invalid-notes-' + props.mode}>Invalid message</Label>
            <Textarea
              id={'invalid-notes-' + props.mode}
              invalid
              aria-describedby={'notes-error-' + props.mode}
              rows={2}
            />
            <span class="error-copy" dir="ltr" id={'notes-error-' + props.mode}>
              A message is required.
            </span>
          </div>
        </div>
      </section>

      <section class="sample-group" aria-labelledby={'surfaces-' + props.mode}>
        <h3 id={'surfaces-' + props.mode}>Card</h3>
        <div class="card-grid">
          <Card>Default surface</Card>
          <Card variant="outlined">Outlined surface</Card>
          <Card variant="raised">Raised surface</Card>
        </div>
      </section>

      <section class="sample-group" aria-labelledby={'badges-' + props.mode}>
        <h3 id={'badges-' + props.mode}>Badge</h3>
        <div class="badge-row">
          <Badge>Neutral</Badge>
          <Badge tone="brand">Brand</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
        </div>
      </section>

      <section class="sample-group" aria-labelledby={'separator-' + props.mode}>
        <h3 id={'separator-' + props.mode}>Separator</h3>
        <div class="separator-demo">
          <span>Section one</span>
          <Separator />
          <span>Section two</span>
        </div>
        <div class="vertical-demo">
          <span>Start</span>
          <Separator orientation="vertical" />
          <span>End</span>
        </div>
      </section>

      <section
        class="sample-group"
        aria-labelledby={'primitives-' + props.mode}
      >
        <h3 id={'primitives-' + props.mode}>Interactive primitives</h3>
        <div class="primitive-grid">
          <Card class="primitive-card">
            <Checkbox id={'checkbox-' + props.mode} defaultChecked>
              {rtl ? 'إرسال تحديثات البريد' : 'Email me product updates'}
            </Checkbox>
          </Card>
          <Card class="primitive-card">
            <Switch id={'switch-' + props.mode} defaultChecked>
              {rtl ? 'تفعيل التنبيهات' : 'Enable notifications'}
            </Switch>
          </Card>
          <RadioGroup
            id={'radio-' + props.mode}
            label={rtl ? 'سرعة التوصيل' : 'Delivery speed'}
            defaultValue="standard"
            orientation="horizontal"
            items={[
              { value: 'standard', label: rtl ? 'عادي' : 'Standard' },
              { value: 'express', label: rtl ? 'سريع' : 'Express' },
            ]}
          />
          <Select
            id={'select-' + props.mode}
            label={rtl ? 'المنطقة' : 'Region'}
            defaultValue={['north']}
            positioning={{ sameWidth: true }}
            items={[
              { value: 'north', label: rtl ? 'الشمال' : 'North' },
              { value: 'south', label: rtl ? 'الجنوب' : 'South' },
              { value: 'west', label: rtl ? 'الغرب' : 'West' },
            ]}
          />
          <Tabs
            id={'tabs-' + props.mode}
            label={rtl ? 'إعدادات الحساب' : 'Account settings'}
            defaultValue="profile"
            items={[
              {
                value: 'profile',
                label: rtl ? 'الملف الشخصي' : 'Profile',
                content: (
                  <p>
                    {rtl
                      ? 'حدّث بياناتك الشخصية.'
                      : 'Update your personal details.'}
                  </p>
                ),
              },
              {
                value: 'security',
                label: rtl ? 'الأمان' : 'Security',
                content: (
                  <p>
                    {rtl
                      ? 'راجع خيارات الأمان.'
                      : 'Review your security options.'}
                  </p>
                ),
              },
            ]}
          />
          <Accordion
            id={'accordion-' + props.mode}
            defaultValue={['delivery']}
            items={[
              {
                value: 'delivery',
                title: rtl ? 'متى سيصل طلبي؟' : 'When will my order arrive?',
                content: rtl
                  ? 'تصل الطلبات عادة خلال يومين.'
                  : 'Most orders arrive within two days.',
              },
              {
                value: 'returns',
                title: rtl ? 'كيف أبدأ الإرجاع؟' : 'How do I start a return?',
                content: rtl
                  ? 'تواصل مع فريق الدعم لبدء الإرجاع.'
                  : 'Contact support to start a return.',
              },
            ]}
          />
        </div>
      </section>

      <section class="sample-group" aria-labelledby={'table-' + props.mode}>
        <h3 id={'table-' + props.mode}>Sortable table</h3>
        <p class="table-note" dir={rtl ? 'rtl' : undefined}>
          {rtl
            ? 'تتيح الأعمدة القابلة للفرز إعادة ترتيب الصفوف نفسها.'
            : 'Sortable columns use native buttons; sorting reorders the same keyed rows.'}
        </p>
        <div class="table-toolbar">
          <Button
            variant="secondary"
            dir={rtl ? 'rtl' : 'ltr'}
            onClick={() =>
              tableRows.set(
                tableRows() === largeTableRows
                  ? sampleTableRows
                  : largeTableRows,
              )
            }
          >
            {tableRows() === largeTableRows
              ? rtl
                ? 'عرض الصفوف التجريبية'
                : 'Show sample rows'
              : rtl
                ? 'عرض ١٠٬٠٠٠ صف'
                : 'Show 10,000 rows'}
          </Button>
          <span aria-live="polite" dir={rtl ? 'rtl' : undefined}>
            {rtl
              ? `عدد الصفوف: ${tableRows().length.toLocaleString('ar')}`
              : `${tableRows().length.toLocaleString()} rows`}
          </span>
        </div>
        <SortableTable
          id={'members-' + props.mode}
          caption={rtl ? 'أعضاء الفريق' : 'Team members'}
          rows={tableRows()}
          rowKey={(row) => row.id}
          columns={tableColumns}
        />
      </section>

      <section class="sample-group" aria-labelledby={'overlays-' + props.mode}>
        <h3 id={'overlays-' + props.mode}>Overlays</h3>
        <p class="overlay-note" dir={rtl ? 'rtl' : undefined}>
          {rtl
            ? 'تضيف التلميحات سياقًا اختياريًا؛ أبقِ التعليمات الأساسية ظاهرة.'
            : 'Tooltips add optional context; keep essential instructions visible.'}
        </p>
        <div class="overlay-grid">
          <Dialog
            id={'dialog-' + props.mode}
            title={rtl ? 'تفاصيل الحساب' : 'Account details'}
            description={
              rtl
                ? 'حدّث تفضيلاتك في نافذة آمنة.'
                : 'Update your preferences in a focused dialog.'
            }
            trigger={rtl ? 'افتح الحوار' : 'Open dialog'}
          >
            <p>
              {rtl
                ? 'تبقى الخلفية محمية حتى إغلاق هذه النافذة.'
                : 'The page behind this dialog stays protected until it closes.'}
            </p>
            <Input aria-label="Display name" value="Alex" />
          </Dialog>
          <Popover
            id={'popover-' + props.mode}
            label={rtl ? 'معلومات إضافية' : 'More information'}
            trigger={rtl ? 'المزيد' : 'More details'}
          >
            <p>
              {rtl
                ? 'يمكنك قراءة التفاصيل أو إغلاق هذه اللوحة.'
                : 'Read the extra details or close this panel.'}
            </p>
          </Popover>
          <Tooltip
            id={'tooltip-' + props.mode}
            label={rtl ? 'معلومة مساعدة' : 'Optional help'}
            trigger={rtl ? 'مرّر أو انتقل إلى المساعدة' : 'Help'}
          >
            {rtl
              ? 'هذه المعلومة الإضافية تظهر عند التركيز أو المرور.'
              : 'This supplemental hint appears on focus or hover.'}
          </Tooltip>
          <DropdownMenu
            id={'menu-' + props.mode}
            label={rtl ? 'إجراءات الملف' : 'File actions'}
            trigger={rtl ? 'الإجراءات' : 'Actions'}
            items={[
              { value: 'rename', label: rtl ? 'إعادة التسمية' : 'Rename' },
              { value: 'duplicate', label: rtl ? 'نسخ' : 'Duplicate' },
              { value: 'archive', label: rtl ? 'أرشفة' : 'Archive' },
            ]}
          />
          <div class="toast-sample">
            <Button variant="secondary" onClick={() => toastOpen.set(true)}>
              {rtl ? 'إظهار إشعار' : 'Show toast'}
            </Button>
            <Show when={toastOpen()}>
              <Toast
                id={'toast-' + props.mode}
                type="success"
                title={rtl ? 'تم الحفظ' : 'Changes saved'}
                description={
                  rtl ? 'تم تحديث تفضيلاتك.' : 'Your preferences were updated.'
                }
                duration={Infinity}
                onStatusChange={(details) => {
                  if (details.status === 'unmounted') toastOpen.set(false)
                }}
              />
            </Show>
          </div>
        </div>
      </section>
    </section>
  )
}

export function mountGallery(host: HTMLElement): () => void {
  return render(
    () => (
      <main class="gallery-shell">
        <header class="site-header">
          <a class="brand" href="https://github.com/benosjs/benos">
            <picture>
              <source
                media="(prefers-color-scheme: dark)"
                srcset="/benos-mark-light.png"
              />
              <img
                src="/benos-mark-navy.png"
                alt="Benos home"
                width="42"
                height="42"
              />
            </picture>
            <span>Benos UI</span>
          </a>
          <nav aria-label="Project links">
            <a href="https://github.com/benosjs/benos">GitHub</a>
            <a href="https://github.com/benosjs/benos/tree/main/docs/architecture">
              UI design
            </a>
          </nav>
        </header>

        <section class="intro">
          <p class="eyebrow">Source-owned components · Batches 1–4</p>
          <h1>Small building blocks, in your hands.</h1>
          <p>
            Native HTML, Benos getter-backed props, and a quiet navy palette.
            Try each mode, then use the keyboard to inspect focus.
          </p>
          <div
            class="component-list"
            aria-label="Components in batches 1, 2, 3, and 4"
          >
            <span>Button</span>
            <span>Input</span>
            <span>Textarea</span>
            <span>Label</span>
            <span>Card</span>
            <span>Badge</span>
            <span>Separator</span>
            <span>Checkbox</span>
            <span>Switch</span>
            <span>Radio group</span>
            <span>Select</span>
            <span>Tabs</span>
            <span>Accordion</span>
            <span>Dialog</span>
            <span>Popover</span>
            <span>Tooltip</span>
            <span>Dropdown menu</span>
            <span>Toast</span>
            <span>Sortable table</span>
          </div>
        </section>

        <div class="mode-grid">
          <ComponentSamples mode="light" />
          <ComponentSamples mode="dark" />
          <ComponentSamples mode="rtl" />
        </div>

        <footer class="site-footer">
          <span>Batches 1–4 · source-owned styled components</span>
          <span>Colors follow the Benos navy and light marks.</span>
        </footer>
      </main>
    ),
    host,
  )
}

const host = document.querySelector<HTMLElement>('#app')
if (host) mountGallery(host)
