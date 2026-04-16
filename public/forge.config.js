const path = require('path');

module.exports = {
  packagerConfig: { asar: true },
  rebuildConfig: {},
  makers: [
    { name: '@electron-forge/maker-squirrel' },
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    { name: '@electron-forge/maker-deb' },
    { name: '@electron-forge/maker-rpm' },
  ],
  plugins: [
    [
      '@electron-forge/plugin-webpack',
      {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              name: 'main_window',
              html: './public/index.html',
              js: './src/renderer.tsx',
              preload: './src/preload.ts',
            },
          ],
        },
      },
    ],
  ],
};