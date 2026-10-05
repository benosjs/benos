# Adapter note: default direction reflected in connected props

**Target:** `chakra-ui/zag`, machine adapters used by `@zag-js/*` 1.44.0

**Status:** Investigation note; not filed. The observed `dir="ltr"` came from
Benos passing its computed direction into a machine and Zag returning that value
in connected DOM props. This note records the interop lesson rather than
claiming that Zag itself selects LTR when `dir` is absent.

## Observation

The `dir` option is optional in Zag machine prop types. Connected props include
`dir: prop("dir")`, so an adapter that supplies a default direction causes that
direction to be reflected into every generated part. This can override an
inherited RTL subtree when the adapter has only looked at the document root.

Benos now reads computed direction from the primitive's host element and passes
it to the machine for keyboard and placement behavior. It removes the
connected `dir` property from DOM props unless the application explicitly
passed `dir`, allowing markup to inherit direction naturally. A portaled host
copies the component's effective direction because it no longer has that
ancestor.

## Reproduction

Place a machine-backed component under a local `<section dir="rtl">` while the
document root is `dir="ltr"`. Pass `dir="rtl"` to the machine for its behavior,
then spread Zag's connected props onto the widget. A direct spread emits
`dir="rtl"` on each machine part; a defaulting adapter that always passes LTR
instead emits `dir="ltr"` and reverses the inherited local context.

## Interop question

Could the framework adapter guide explicitly call out that adapters should
resolve the effective direction from their host element and avoid reflecting a
default direction into generated DOM props when direction is meant to inherit?
This may already be an adapter responsibility; the request is to clarify the
guidance, not change machine behavior.
