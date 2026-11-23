// Coverage ratcheting is enforced against main by .github/workflows/coverage.yml.
// PRs may regress by at most one percentage point per reported metric.
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  resetMocks: false,
  clearMocks: false,
  // expo-modules-core is not hoisted to the workspace root; jest-expo's setup.js
  // references several src/* subpaths that aren't exported. Map them to their
  // compiled equivalents in the nested package so Jest can resolve them.
  // Map expo/src/winter to its non-native build so the native fetch polyfill
  // (which requires ExpoFetchModule, a native module absent in Jest) is not installed.
  // Map react-native/unstable-internals-do-not-use to a no-op (module not present in RN 0.76).
  moduleNameMapper: {
    "^expo-modules-core/src/Refs$":
      "<rootDir>/node_modules/expo/node_modules/expo-modules-core/build/Refs.js",
    "^expo-modules-core/src/uuid/uuid\\.web$":
      "<rootDir>/node_modules/expo/node_modules/expo-modules-core/build/uuid/index.web.js",
    "^expo-modules-core/src/web/index\\.web$":
      "<rootDir>/node_modules/expo/node_modules/expo-modules-core/build/polyfill/index.web.js",
    "^expo/src/winter$":
      "<rootDir>/node_modules/server-only/empty.js",
  },
  collectCoverage: false,
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/__tests__/**",
    "!src/**/*.d.ts",
    "!src/**/__generated__/**",
    "!src/**/*.generated.{ts,tsx}",
    "!src/**/config.{ts,tsx}",
    "!src/**/constants.{ts,tsx}",
    "!src/**/index.{ts,tsx}"
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "json-summary", "lcov"],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/coverage/",
    "\\.d\\.ts$",
    "/__generated__/",
    "\\.generated\\."
  ],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)"
  ]
};
