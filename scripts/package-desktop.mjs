// Packages the desktop app and the deploy wizard, then builds unsigned Squirrel.Windows installers.
import { packager } from '@electron/packager';
import { createWindowsInstaller } from 'electron-winstaller';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.env.APP_VERSION || pkg.version;
const apps = [
  { id: 'MapEditor', name: 'Map Editor', main: 'dist/desktop/main.cjs' },
  { id: 'MapEditorDeploy', name: 'Map Editor Deploy', main: 'dist/deploy/main.cjs' },
];
// The icon is drawn by scripts/make-icon.py from the same mark as the favicon and committed, so this build needs no extra tool.
const icon = path.join(root, 'assets', 'icon.ico');
for (const a of apps) {
  const stage = path.join(root, 'out', 'stage', a.id);
  mkdirSync(stage, { recursive: true });
  cpSync(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
  writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: a.id.toLowerCase(), productName: a.name, version: version, main: a.main, description: pkg.description, author: 'Ding-Ding-Projects' }, null, 2));
  const [dir] = await packager({ dir: stage, name: a.id, out: path.join(root, 'out', 'packaged'), platform: 'win32', arch: 'x64', asar: true, overwrite: true, electronVersion: pkg.devDependencies.electron, icon });
  await createWindowsInstaller({
    appDirectory: dir, outputDirectory: path.join(root, 'out', 'installers', a.id), exe: `${a.id}.exe`,
    name: a.id, title: a.name, authors: 'Ding-Ding-Projects', description: pkg.description, version: version,
    setupIcon: icon, iconUrl: 'https://raw.githubusercontent.com/Ding-Ding-Projects/map-editor/main/assets/icon.ico', // the app's own mark on the installer, the program and its entry in Windows settings
    noMsi: true, // Squirrel Setup.exe, RELEASES and .nupkg only; deliberately unsigned (no certificate inputs).
  });
  console.log(`Packaged ${a.name} ${version}`);
}
