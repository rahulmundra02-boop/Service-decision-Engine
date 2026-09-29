const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

function copyIcon(config, sourceName, night) {
  return withDangerousMod(config, ['android', async config => {
    const projectRoot = config.modRequest.projectRoot;
    const androidRoot = config.modRequest.platformProjectRoot;
    const source = path.join(projectRoot, 'assets', sourceName);
    for (const density of densities) {
      const folder = path.join(androidRoot, 'app', 'src', 'main', 'res', `mipmap-${night ? 'night-' : ''}${density}`);
      fs.mkdirSync(folder, { recursive: true });
      fs.copyFileSync(source, path.join(folder, 'ic_launcher.webp'));
      fs.copyFileSync(source, path.join(folder, 'ic_launcher_round.webp'));
    }
    return config;
  }]);
}

module.exports = function withThemeIcons(config) {
  config = withAndroidManifest(config, config => {
    const app = config.modResults.manifest.application?.[0];
    if (app) {
      app.$ = app.$ || {};
      app.$['android:icon'] = '@mipmap/ic_launcher';
      app.$['android:roundIcon'] = '@mipmap/ic_launcher_round';
    }
    return config;
  });

  config = copyIcon(config, 'icon-light.webp', false);
  config = copyIcon(config, 'icon-dark.webp', true);

  config = withDangerousMod(config, ['android', async config => {
    const androidRoot = config.modRequest.platformProjectRoot;
    const anydpi = path.join(androidRoot, 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26');
    for (const file of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const target = path.join(anydpi, file);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    return config;
  }]);

  return config;
};
