# Good First Issues

New to MindVault Mobile? Start here. Each issue below is scoped for learning, with clear acceptance criteria and a natural entry point into the codebase.

## Finding an Issue to Work On

Good first issues are labeled `good-first-issue` in the [GitHub issues](https://github.com/mind-vault-1/mindvault_mobile/issues?q=is%3Aopen+label%3Agood-first-issue). Before you start:

1. Check if the issue is **already assigned** to someone else.
2. **Comment on the issue** to express interest, or apply through the **Drips Wave** app.
3. **Wait for assignment** before you start coding. We close PRs from unassigned contributors.

## Expected Setup Time

You should be able to set up the development environment in **under 15 minutes**. If something takes longer, [let us know](#troubleshooting-setup).

```bash
# Clone your fork
git clone https://github.com/<your-username>/mindvault_mobile
cd mindvault_mobile

# Add upstream remote
git remote add upstream https://github.com/mind-vault-1/mindvault_mobile.git

# Install dependencies
npm ci

# Verify everything works
npm run typecheck && npm run lint && npm test
```

If you're stuck, see the [Troubleshooting](#troubleshooting-setup) section at the end of this guide.

## Suggested Issues

### [Error Handling in Search History](https://github.com/mind-vault-1/mindvault_mobile/issues/XXX)
**What:** Add error logging and recovery when saving search history fails.  
**Why:** Users see silent failures when their device runs out of storage.  
**Files:** `src/services/searchHistory.ts`, `src/services/searchHistory.test.ts`  
**Skills:** TypeScript, error handling, testing  
**Complexity:** Low · **Time:** 2–3 hours  

**How to approach:**
1. Read `src/services/searchHistory.ts` to understand the current implementation.
2. Add a try–catch block around the `AsyncStorage.setItem()` call.
3. Log errors with context (what search, what storage limit).
4. Write a test that simulates storage failure.
5. Run `npm test` to verify your test passes.

**Review focus:** Defensive coding, test coverage, error messages that help users recover.

### [Add Copy-to-Clipboard to Resource Links](https://github.com/mind-vault-1/mindvault_mobile/issues/XXX)
**What:** Let users copy a resource's link to their clipboard from a detail screen.  
**Why:** Sharing a specific resource with a friend should be one tap.  
**Files:** `src/screens/ResourceDetailScreen.tsx`, `src/components/LinkButton.tsx`  
**Skills:** React Native, clipboard integration  
**Complexity:** Low · **Time:** 2–4 hours  

**How to approach:**
1. Import `expo-clipboard` (already in `package.json`).
2. Add a "Copy Link" button near existing actions in the resource detail header.
3. Use `Clipboard.setStringAsync()` to copy the resource URL.
4. Show a toast confirmation: "Link copied to clipboard".
5. Test on both iOS and Android simulators.

**Review focus:** Accessibility (button labels, keyboard support), platform consistency.

### [Dark Mode Toggle in Settings](https://github.com/mind-vault-1/mindvault_mobile/issues/XXX)
**What:** Add a user-facing toggle to switch between light and dark themes.  
**Why:** Users currently can only follow system theme; some prefer overrides.  
**Files:** `src/screens/SettingsScreen.tsx`, `src/theme/ThemeProvider.tsx`  
**Skills:** React, state management, theme systems  
**Complexity:** Low · **Time:** 3–4 hours  

**How to approach:**
1. Read `src/theme/ThemeProvider.tsx` to see how theming works.
2. Add `useAppTheme()` hook to `SettingsScreen.tsx`.
3. Create a new state for theme preference: `'light' | 'dark' | 'system'`.
4. Persist the user's choice to `AsyncStorage` under `STORAGE_KEYS.themePreference`.
5. Update `ThemeProvider` to respect the saved preference.
6. Add a segmented control (or three buttons) in settings.
7. Test: toggle the setting and reload the app to verify persistence.

**Review focus:** Persistence, accessibility of control, consistency with system preference fallback.

---

## Review Process

Once you submit your PR:

1. A maintainer will review your code within 2–3 business days.
2. Expect feedback on **correctness, tests, accessibility, and naming**.
3. We'll ask for changes directly in the PR; push them to the same branch.
4. When the review is green, a maintainer merges your work and thanks you publicly.

## Code Style

Before every commit, run:
```bash
npm run typecheck && npm run lint && npm test
```

All three commands must pass locally **and in CI** before merge. No exceptions.

### Type Safety
- Always add type annotations to function parameters and return types.
- Avoid `any` and `unknown` unless absolutely necessary.
- Let TypeScript infer types for variables initialized with literals.

### Naming
- Use camelCase for functions, variables, and object properties.
- Use PascalCase for components and classes.
- Use UPPER_SNAKE_CASE for constants.
- Choose names that describe intent: `isLoading` over `load`, `fetchUserProfile` over `get`.

### Testing
- Write one test per behavior, not one test per function.
- Test the **user-facing behavior**, not implementation details.
- Use descriptive test names: `should show error when payment fails` not `test payment failure`.
- Aim for 70%+ coverage on new code; prioritize critical paths.

---

## Troubleshooting Setup

### "npm: command not found"
You need Node.js 18+. Install it from [nodejs.org](https://nodejs.org) or use a version manager:
```bash
# Using Homebrew on macOS
brew install node

# Using nvm (Node Version Manager)
nvm install 18
nvm use 18
```

Then verify: `node --version` should show 18.x or higher.

### "Cannot find module '@react-native-async-storage/async-storage'"
This likely means dependencies didn't install. Try:
```bash
rm -rf node_modules package-lock.json
npm ci
```

### "ERESOLVE unable to resolve dependency tree"
This error means your lockfile is out of sync. Run:
```bash
npm ci  # Uses the lockfile exactly as written
```

Do NOT run `npm install` without `ci`—it may change dependencies in ways the CI doesn't expect.

### "Command 'tsc' not found after npm ci"
Ensure you're in the project root (where `package.json` is). You should use:
```bash
npx tsc --version  # Runs the local TypeScript
```

### "Port 3000 is already in use"
If `npm start` says the port is in use, another process (Expo Dev Server or another app) is running on it. Either:
1. Kill the process: `lsof -ti:3000 | xargs kill -9`
2. Or use a different port: `npm start -- --port 3001`

### "iOS simulator won't start"
Ensure Xcode is installed:
```bash
xcode-select --install
open -a Simulator  # Manually launch the simulator
```

Then start the dev server:
```bash
npm start
press i  # In the Expo CLI
```

### "Android emulator won't connect"
Ensure Android Studio is installed and the emulator is running. Check the connection:
```bash
adb devices  # Lists connected devices/emulators
```

If not listed, restart the emulator and reload Expo.

---

## Next Steps After Merge

Congratulations! Your first contribution is merged. Here's what comes next:

- **Join the conversation** in the [GitHub Discussions](https://github.com/mind-vault-1/mindvault_mobile/discussions).
- **Look at medium-difficulty issues** next—the same process applies.
- **Review others' PRs** to learn patterns and help the project.
- **Share what you learned** by updating this guide if you found something unclear.

Questions? Open an issue or ask in Discussions. We're here to help.
