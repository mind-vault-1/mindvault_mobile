const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
const emptyModule = path.resolve(__dirname, "metro.empty.js");

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  http: emptyModule,
  https: emptyModule,
};

module.exports = config;
