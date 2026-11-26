import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// Every button, heading, table heading and label written straight into a design board must be wording the
// app, the deploy app or the site really uses. The few board-only items are listed by hand below.
const SOURCES = ['src/ui/i18n.ts', 'src/ui/main.ts', 'src/ui/worlds.ts', 'src/deploy/ui.ts', 'src/ui/tools.ts', 'src/ui/docs.ts', 'src/ui/tickets.ts', 'site/build.mjs', 'site/content.mjs', 'src/ui/sketch.ts', 'src/ui/regex.ts', 'src/ui/palette.ts', 'src/ui/tour.ts', 'src/ui/colorpicker.ts', 'src/ui/onboarding.ts'];
const BOARD_ONLY: Record<string, string[]> = {
  FirstRun: ['Try it failing'],                       // a control of the board that shows the failure result
  History: ['From 2026-11-16 · To 2026-11-23'],       // the app's From and To fields, drawn with example dates
  Phone: ['Run Fill'],                                 // the app writes "Run {op}" with the tool's name filled in
};
const root = new URL('../', import.meta.url);
const norm = (s: string) => s.toLowerCase().replace(/’/g, "'");

describe('design board labels', () => {
  const app = norm(SOURCES.filter((f) => existsSync(new URL(f, root))).map((f) => readFileSync(new URL(f, root), 'utf8')).join('\n'));
  const boards = readdirSync(new URL('design/canvas/', root)).filter((f) => f.endsWith('.dc.html'));
  it('covers every board', () => { expect(boards.length).toBeGreaterThanOrEqual(23); });
  it('shows host names, never a private network address', () => {
    for (const file of boards) expect(readFileSync(new URL(`design/canvas/${file}`, root), 'utf8'), file).not.toMatch(/\b(192\.168|10\.\d+|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+/);
  });
  it('lists only release jobs that exist on the update tile', () => {
    const palette = readFileSync(new URL('design/canvas/Palette.dc.html', root), 'utf8');
    expect(palette).not.toMatch(/Tests · /);
    for (const job of ['Docker image', 'Desktop installers', 'Appliance image', 'Raspberry Pi image']) expect(palette).toContain(job);
  });
  for (const file of boards) {
    const name = file.replace('.dc.html', '');
    it(`${name} uses the app's own wording`, () => {
      const s = readFileSync(new URL(`design/canvas/${file}`, root), 'utf8');
      const body = s.slice(s.indexOf('</helmet>'), s.indexOf('<script type="text/x-dc"'));
      const labels = new Set([...body.matchAll(/<(button|h1|h2|h3|th|label)[^>]*>([^<{]{3,40})</g)].map((m) => m[2].trim()).filter(Boolean));
      const unknown = [...labels].filter((l) => !app.includes(norm(l).replace(/…$/, '')) && !(BOARD_ONLY[name] ?? []).includes(l));
      expect(unknown).toEqual([]);
    });
  }
});
