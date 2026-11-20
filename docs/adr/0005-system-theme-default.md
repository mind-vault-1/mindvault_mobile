# ADR 0005: Follow System Theme by Default

**Status:** Accepted  
**Date:** 2026-11-20  
**Author(s):** DeborahOlaboye

## Context

MindVault Mobile supports both light and dark themes. The question is: what should the default be?

Options:
1. Force light theme
2. Force dark theme
3. Follow the device's system theme setting
4. Default to system, but allow user override

Most modern apps respect system preferences; forcing a single theme frustrates users who prefer their device's setting.

## Decision

By default, the app **follows the device's system theme** (via `useColorScheme()` from React Native). Users can optionally override this in Settings (via a future feature).

## Rationale

### Pros
- **Respects user preference:** System settings are intentional; users expect apps to follow them.
- **Accessibility:** Users with contrast sensitivity rely on system theme settings.
- **Battery life:** Dark mode on OLED devices reduces power consumption; don't override user choice.
- **Standard pattern:** Almost all modern apps do this.

### Cons
- **Less control:** App can't enforce brand colors (but this is good; UX > branding).
- **Testing complexity:** Need to test both themes.

### Alternatives Considered
- **Force light:** Breaks accessibility for dark-mode users.
- **Force dark:** Breaks accessibility for light-mode users.
- **User choice always:** More friction; most users are happy with system default.

## Consequences

1. **Theme provider reads `useColorScheme()`** on startup in `src/theme/ThemeProvider.tsx`.
2. **All colors defined with theme awareness** (light and dark variants).
3. **Tests verify both themes** in component snapshots.
4. **User override stored in Secure Store** when implemented (future ADR).
5. **Dynamic theme switching** when device theme changes (or user override is set).

## Related Issues & PRs

- Mentioned in Issue #292 (Saved searches); theme preferences can be bundled with saved search settings.

## See Also

- [ADR 0003: Store Sensitive Data with Expo Secure Store](0003-use-async-storage.md) for user preference storage
- [src/theme/ThemeProvider.tsx](../../src/theme/ThemeProvider.tsx)
