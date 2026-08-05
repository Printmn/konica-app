// Expo SDK 50+ resolves tsconfig `paths` natively through Metro,
// so no babel-plugin-module-resolver is required.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
