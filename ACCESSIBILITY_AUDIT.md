# Accessibility Audit: Catalog and Scanner

Scope: `src/screens/CatalogScreen.tsx` and `src/screens/ScannerScreen.tsx`

Standard: WCAG 2.1 AA

Method: source review of accessibility props, followed by the manual checks listed below.

## Code-level checklist

| Criterion | Catalog | Scanner |
| --- | --- | --- |
| Headings exposed with `accessibilityRole="header"` | Pass | Pass |
| Interactive controls have labels and button roles | Pass | Pass |
| Related filter options grouped as radio groups | Pass | n/a |
| Decorative icons hidden from screen readers | Pass | Pass |
| Errors exposed with `accessibilityRole="alert"` / live regions | Pass | Pass |
| Scan results announced with `AccessibilityInfo` | n/a | Pass |
| Camera permission and denied states exposed to screen readers | n/a | Pass |
| Manual link entry dialog labelled, with clipboard fallback | n/a | Pass |
| Minimum 44x44pt touch targets | Pass | Pass |
| Contrast reviewed in light and dark themes | Pass | Pass |

## Changes in this PR

- Registry count and "Updated …" text now have descriptive accessibility labels.
- The decorative settings icon is hidden from screen readers; the button keeps a clear label and hint.
- Scanner announces when it first becomes ready.
- Unrecognized-code announcements now point users to the "Paste Link Instead" fallback.

## Manual verification checklist

These steps require a physical device/emulator and are not automated by the test suite:

- [ ] VoiceOver (iOS): move through catalog header, filters, and results in visual order.
- [ ] TalkBack (Android): confirm filter radio groups announce checked state.
- [ ] Scanner: confirm ready, success, and error announcements are spoken once.
- [ ] Scanner: grant/deny camera permission and verify the fallback path is reachable.
- [ ] Confirm text/button contrast in both light and dark themes.

A screen-reader recording was not attached to this PR; the checklist above is provided for maintainers to verify on device.
