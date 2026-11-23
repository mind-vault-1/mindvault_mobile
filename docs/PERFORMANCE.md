# Catalog performance

The catalog uses a `FlatList` so resource cards outside the active render
window are not mounted. Keep it virtualized: do not replace it with a
`ScrollView` containing every card.

## Current list tuning

`CatalogScreen` starts with eight cards, renders at most eight more per batch,
waits 50 ms between batches, and keeps a seven-viewport render window. Clipped
off-screen views are removed where the platform supports it. The item renderer
is memoized so parent state changes do not create a new render callback.

Resource cards have content-dependent heights (titles, metadata and images can
wrap or load asynchronously), so do not provide a fixed `getItemLayout`.
Incorrect offsets make `scrollToIndex` and virtualization less reliable. A
fixed 120 px `getItemLayout` was trialled for #352 and reverted for this reason;
the profile below remains the baseline (no new device measurements were taken
for that trial).

The catalog also follows the API's `nextOffset` pagination value and appends
only unseen resource IDs. Keep this paging behavior when changing filters or
refreshing; a stale page must not be appended to a newer result set.

## 500-item profile snapshot

A local profile with 500 mock resources (mixed title lengths and thumbnails,
fast fling on an Android emulator, release build) showed the effect of the
current tuning:

| Run | Median FPS | JS thread (ms/frame) |
| --- | ---: | ---: |
| Before list tuning | 44 | 22.7 |
| After list tuning | 58 | 11.9 |

Re-run the same profile on target devices before shipping changes that affect
the list; these numbers are a regression baseline, not a guarantee for every
device or dataset.

## Profiling changes

Check long-catalog behavior on both iOS and Android with a production-like
resource count, including rows with long titles and thumbnails. Look for blank
gaps during fast flings, repeated rendering of off-screen cards, dropped frames,
and memory growth while scrolling. Compare the same device, build type, and
dataset before and after a tuning change.

Change one list setting at a time. Raising `initialNumToRender` or
`maxToRenderPerBatch` can reduce blank areas but increases startup work and
memory; raising `windowSize` keeps more cards mounted. Preserve pull-to-refresh,
pagination, keyboard interaction, accessibility labels, and current card
actions while tuning.
