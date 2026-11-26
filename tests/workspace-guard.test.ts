import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Panels are split, resized and docked by the one docking library. These checks fail if a hand-made
// splitter or a second layout library appears.
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]);

describe('docked workspace', () => {
  it('has no hand-made splitter in the source', () => {
    const hits = files('src').filter((f) => /\.(ts|css|html)$/.test(f)).filter((f) => /(col|row|ew|ns)-resize|class="[^"]*\b(splitter|gutter)\b|\.(splitter|gutter)\b/.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('uses the docking library for every docked screen and no other layout library', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps).toContain('dockview-core');
    expect(deps.filter((d) => /golden-layout|split\.js|^split-|allotment|react-mosaic|flexlayout|lumino|rc-dock/i.test(d))).toEqual([]);
    const ws = fs.readFileSync('src/ui/workspace.ts', 'utf8');
    expect(ws).toMatch(/dockview-core/);
    const main = fs.readFileSync('src/ui/main.ts', 'utf8');
    expect((main.match(/mountWorkspace\(/g) ?? []).length).toBeGreaterThanOrEqual(4); // editor, history (two forms), about
  });
});
