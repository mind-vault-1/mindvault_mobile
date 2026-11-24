// Mutation-testing baseline for the money and signing helpers (issue #420).
// Run with `npm run test:mutation`. Results go to reports/mutation/ (git-ignored).
// `break` is null on purpose: this is a baseline, not a gate. Raise it once the score is known.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "jest",
  jest: { projectType: "custom", configFile: "jest.config.js" },
  mutate: [
    "src/utils/requestSignature.ts",
    "src/utils/validateStellarSecret.ts",
    "src/utils/priceRange.ts",
    "src/api/payment.ts",
  ],
  coverageAnalysis: "perTest",
  ignoreStatic: true,
  reporters: ["clear-text", "progress", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  thresholds: { high: 80, low: 60, break: null },
  tempDirName: ".stryker-tmp",
};
