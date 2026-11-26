import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const skill = readFileSync(new URL('.claude/skills/map-editor-operations/SKILL.md', root), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

describe('operations skill', () => {
  it('has a name and a description that says when to use it', () => {
    const head = /^---\nname: ([a-z-]+)\ndescription: (.+)\n---\n/.exec(skill)!;
    expect(head[1]).toBe('map-editor-operations');
    expect(head[2]).toMatch(/Use when/);
    expect(head[2].length).toBeLessThan(1024);
  });
  it('names only files and scripts that exist', () => {
    const files = [...skill.matchAll(/`((?:scripts|site|\.github\/workflows|docs\/features)\/[\w./-]+\.(?:mjs|yml|md))`|`(build\.bat|build\.sh|compose\.yaml|local-checks\.json)`/g)].map((m) => m[1] ?? m[2]);
    expect(files.length).toBeGreaterThan(5);
    for (const f of new Set(files)) expect(existsSync(new URL(f, root)), f).toBe(true);
    for (const m of skill.matchAll(/node (scripts\/[\w-]+\.mjs|site\/build\.mjs)/g)) expect(existsSync(new URL(m[1], root)), m[1]).toBe(true);
    for (const m of skill.matchAll(/npm run ([\w:]+)/g)) expect(pkg.scripts, m[1]).toHaveProperty(m[1]);
  });
  it('covers every route a later reader needs', () => {
    for (const h of ['## Build', '## Run for a look', '## Drive the screens and take screenshots', '## Check before committing', '## Release', '## Recover']) expect(skill).toContain(h);
  });
  it('uses the environment names the server reads', () => {
    const server = readFileSync(new URL('src/server/server.ts', root), 'utf8');
    for (const m of skill.matchAll(/MAP_EDITOR_[A-Z]+/g)) expect(server, m[0]).toContain(`process.env.${m[0]}`);
  });
});
