const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// xlsx-js-style ships a .cjs build that Metro needs to resolve.
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

module.exports = config;
