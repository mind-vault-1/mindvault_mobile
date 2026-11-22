// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  root: true,
  extends: "expo",
  ignorePatterns: ["/node_modules", "/android", "/ios", "/dist", "/web-build", "/.expo"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "no-console": "error",
  },
  overrides: [
    {
      files: ["jest.setup.js", "**/*.test.ts", "**/*.test.tsx"],
      env: { jest: true },
    },
    {
      files: ["src/utils/errorLogger.ts"],
      rules: { "no-console": "off" },
    },
  ],
};
