// Metro config for the pnpm monorepo: watch workspace packages, resolve hoisted modules.
const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

/**
 * pnpm gives every package its own node_modules, so expo-router and friends
 * would resolve the React hoisted for the web app (19) while the app itself
 * uses 18 — two Reacts, one crash. Resolve these from the app's copy, always.
 */
const SINGLETONS = [
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  'expo',
  'expo-router',
  'react-native-safe-area-context',
  'react-native-screens',
];
const fromApp = (context) => ({ ...context, originModulePath: path.join(projectRoot, 'index.js') });

/**
 * Three things Metro does not do on its own:
 *  - dedupe the singletons above;
 *  - workspace packages import each other with explicit `.js` extensions (the
 *    API is NodeNext) while the files are `.ts`: retry without the extension;
 *  - `@bazar/utils/money`-style subpaths only exist in the package's `exports`
 *    map (Metro's own exports support breaks `react` under pnpm): read the map.
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SINGLETONS.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))) {
    return context.resolveRequest(fromApp(context), moduleName, platform);
  }
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, moduleName, platform);
    } catch {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    }
  }
  const sub = moduleName.match(/^(@bazar\/[^/]+)\/(.+)$/);
  if (sub) {
    const pkgDir = path.join(projectRoot, 'node_modules', sub[1]);
    const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    const target = manifest.exports?.[`./${sub[2]}`];
    if (typeof target === 'string')
      return { type: 'sourceFile', filePath: path.join(pkgDir, target) };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
