// Coverage ratcheting is enforced against main by .github/workflows/coverage.yml.
// PRs may regress by at most one percentage point per reported metric.
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  resetMocks: false,
  clearMocks: false,
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
