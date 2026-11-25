const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
const emptyModule = path.resolve(__dirname, "metro.empty.js");

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  http: emptyModule,
  https: emptyModule,
};

config.transformer.minifierConfig = {
  ...(config.transformer.minifierConfig ?? {}),
  compress: {
    ...(config.transformer.minifierConfig?.compress ?? {}),
    dead_code: true,
    unused: true,
  },
  mangle: {
    ...(config.transformer.minifierConfig?.mangle ?? {}),
    toplevel: true,
  },
};

config.transformer.getTransformOptions = async () => ({
  transform: {
    inlineRequires: true,
  },
});

module.exports = config;
