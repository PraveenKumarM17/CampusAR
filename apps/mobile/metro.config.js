const fs = require('fs');
const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const rootNodeModules = path.resolve(workspaceRoot, 'node_modules');
const mobileNodeModules = path.resolve(projectRoot, 'node_modules');

/** Hoisted root peers can be newer than apps/mobile; always use the mobile workspace copy. */
const mobilePinnedPackages = new Set([
  'react-native-screens',
  'react-native-gesture-handler',
]);

function resolveRequest(context, moduleName, platform) {
  if (mobilePinnedPackages.has(moduleName)) {
    const pkgDir = path.join(mobileNodeModules, moduleName);
    if (fs.existsSync(path.join(pkgDir, 'package.json'))) {
      try {
        return context.resolveRequest(
          {
            ...context,
            originModulePath: path.join(pkgDir, 'package.json'),
            nodeModulesPaths: [mobileNodeModules, rootNodeModules],
          },
          moduleName,
          platform,
        );
      } catch {
        // fall through
      }
    }
  }

  return context.resolveRequest(context, moduleName, platform);
}

/**
 * Monorepo: resolve @campusar/shared and hoisted deps from workspace root.
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  projectRoot,
  watchFolders: [workspaceRoot],
  resolver: {
    extraNodeModules: {
      'react-native-screens': path.join(mobileNodeModules, 'react-native-screens'),
      'react-native-gesture-handler': path.join(
        mobileNodeModules,
        'react-native-gesture-handler',
      ),
    },
    nodeModulesPaths: [mobileNodeModules, rootNodeModules],
    // Must stay false so packages resolve relative imports (e.g. @react-navigation/core/useNavigation.js).
    disableHierarchicalLookup: false,
    unstable_enableSymlinks: true,
    resolveRequest,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
