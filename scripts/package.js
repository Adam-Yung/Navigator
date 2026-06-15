const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const VERSION = require(path.join(ROOT, 'package.json')).version;

const targets = ['chromium', 'firefox'];

for (const target of targets) {
  const dir = path.join(DIST, target);
  if (!fs.existsSync(dir)) {
    console.error(`ERROR: ${dir} does not exist. Run the build first.`);
    process.exit(1);
  }

  const zipName = `navigator-${VERSION}-${target}.zip`;
  const zipPath = path.join(DIST, zipName);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  execSync(`cd "${dir}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
  console.log(`✓ ${zipName}`);
}
