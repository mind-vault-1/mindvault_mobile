# Performance

## Startup budget and profiling

Startup time is measured by the app and profiled by `scripts/profile-startup.ts`.

### Methodology

- Build a release app for each platform.
- Force-stop the app before every run (cold start).
- Run at least 5 launches per platform on the same device/simulator and OS build.
- Record `p90` of first interactive frame; compare only same build type/device.
- The app emits `[startup] first interactive frame {"platform":"ios|android","durationMs":...}` when navigation is ready and two animation frames have elapsed. This is a JS-side first-interactive proxy, not native process start.

### Budget

| Platform | Warning (p90) | Hard limit (p90) |
| --- | ---: | ---: |
| iOS | 2500 ms | 4000 ms |
| Android | 3000 ms | 4500 ms |

CI/profile runs should warn above the warning threshold and fail above the hard limit.

### Run the profiler

```bash
npx ts-node scripts/profile-startup.ts --platform ios --runs 5 --warn-ms 2500 --hard-ms 4000
npx ts-node scripts/profile-startup.ts --platform android --runs 5 --warn-ms 3000 --hard-ms 4500
```

The report prints median/p90 and `slowestTasks` sorted by duration descending. Capture platform logs after launching a release build so the script can read startup markers.

## Catalog performance

The catalog uses a `FlatList` so resource cards outside the active render
window are not mounted. Keep it virtualized: do not replace it with a
`ScrollView` containing every card.

### Current list tuning

`CatalogScreen` starts with eight cards, renders at most eight more per batch,
waits 50 ms between batches, and keeps a seven-viewport render window. Clipped
off-screen views are removed where the platform supports it. The item renderer
is memoized so parent state changes do not create a new render callback.

Resource cards have content-dependent heights (titles, metadata and images can
wrap or load asynchronously), so do not provide a fixed `getItemLayout`.
Incorrect offsets make `scrollToIndex` and virtualization less reliable.

### Profiling changes

Check long-catalog behavior on both iOS and Android with a production-like
resource count. Look for blank gaps during fast flings, repeated rendering of
off-screen cards, dropped frames, and memory growth while scrolling. Compare the
same device, build type, and dataset before and after a tuning change.
