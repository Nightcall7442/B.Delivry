module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // TODO: module-resolver alias '@' → './src' if not handled by tsconfig paths
  };
};
