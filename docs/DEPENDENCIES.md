# Dependency Management Guide

This document describes how dependencies are managed, validated, and updated in MindVault Mobile.

## Expo SDK Alignment

MindVault Mobile is built on Expo. Packages that include native modules or integrate closely with the Expo runtime must be pinned to versions compatible with the current Expo SDK release.

### Adding or Updating Dependencies

Always install Expo packages and React Native libraries using `npx expo install`:

```bash
# Correct:
npx expo install <package-name>

# Avoid plain npm install for native/Expo modules:
npm i <package-name> # (Do NOT use for Expo/RN libraries)
```

`npx expo install` resolves the package version verified against the project's installed Expo SDK.

### Validating Dependencies

After adding or updating packages, always run dependency validation:

```bash
npx expo install --check
# or project validator if configured
npm run validate-deps
```

Ensure no conflicting or mismatched peer dependencies exist before submitting a pull request.

## Automated Dependency Updates (Dependabot)

Dependabot is configured in [`.github/dependabot.yml`](../.github/dependabot.yml) with the following rules:

- **Schedule**: Weekly runs (Mondays) with an open pull request limit of 5.
- **Expo SDK Locking**: Major version upgrades for `expo`, `expo-*`, and `react-native` are ignored by Dependabot because SDK upgrades require coordinated migrations (e.g. testing native build outputs and EAS profiles).
- **Grouped Updates**: Expo-related and React-related packages are grouped into single PRs to minimize build churn.
