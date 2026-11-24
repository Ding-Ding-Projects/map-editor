// Packages the desktop app and the deploy wizard, then builds unsigned Squirrel.Windows installers.
import { packager } from '@electron/packager';
import { createWindowsInstaller } from 'electron-winstaller';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const apps = [
  { id: 'MapEditor', name: 'Map Editor', main: 'dist/desktop/main.cjs' },
  { id: 'MapEditorDeploy', name: 'Map Editor Deploy', main: 'dist/deploy/main.cjs' },
];
for (const a of apps) {
  const stage = path.join(root, 'out', 'stage', a.id);
  mkdirSync(stage, { recursive: true });
  cpSync(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
  writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: a.id.toLowerCase(), productName: a.name, version: pkg.version, main: a.main, description: pkg.description, author: 'Ding-Ding-Projects' }, null, 2));
  const [dir] = await packager({ dir: stage, name: a.id, out: path.join(root, 'out', 'packaged'), platform: 'win32', arch: 'x64', asar: true, overwrite: true, electronVersion: pkg.devDependencies.electron });
  await createWindowsInstaller({
    appDirectory: dir, outputDirectory: path.join(root, 'out', 'installers', a.id), exe: `${a.id}.exe`,
    name: a.id, title: a.name, authors: 'Ding-Ding-Projects', description: pkg.description, version: pkg.version,
    noMsi: true, // Squirrel Setup.exe, RELEASES and .nupkg only; deliberately unsigned (no certificate inputs).
  });
  console.log(`Packaged ${a.name} ${pkg.version}`);
}
