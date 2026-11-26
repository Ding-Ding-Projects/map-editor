import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
const map = /const SWITCH_PREF[^=]*= \{([^}]*)\}/.exec(main)![1];
const mapped = Object.fromEntries([...map.matchAll(/(\w+): '(\w+)'/g)].map((m) => [m[1], m[2]]));
const defaults = /^const defaults: Prefs = \{(.*)\};$/m.exec(main)![1];

describe('where a setting comes from', () => {
  // Hand-written list: a new switch must be added here and to SWITCH_PREF, or this fails.
  const SWITCHES = ['dark', 'ds', 'dsched', 'elock', 'emoji', 'focus', 'llock', 'lt', 'nar', 'quiet', 'rm', 'school', 'slock', 'snd', 'tko', 'tlock'];
  it('covers every switch drawn in Settings', () => {
    const drawn = [...new Set([...main.matchAll(/sw\('([a-z0-9-]+)',/g)].map((m) => m[1]))].sort();
    expect(drawn).toEqual([...SWITCHES].sort());
    expect(Object.keys(mapped).sort()).toEqual([...SWITCHES].sort());
  });
  it('points every switch at a preference that has a built-in value', () => {
    for (const [id, key] of Object.entries(mapped)) expect(defaults, id).toMatch(new RegExp(`\\b${key}: `));
  });
  it('draws the line inside the row for every switch', () => {
    expect(main).toContain("${fromLine(id, on)}");
  });
  it('gives every value that is not a switch the same line', () => {
    // Hand-written list of the value controls in Settings.
    const VALUES = ['lang', 'funnyEn', 'funnyYue', 'darkTimes', 'seed', 'volume', 'quietTimes', 'narrateRate'];
    const table = /const VALUE_FROM: .*?\}> = \{([\s\S]*?)\n  \};/.exec(main)![1];
    expect([...table.matchAll(/^\s{4}(\w+): \{ keys/gm)].map((m) => m[1]).sort()).toEqual([...VALUES].sort());
    for (const v of VALUES) expect(main, v).toContain(`\${valFrom('${v}')}\${valMore('${v}')}`);
    const titles = /const VALUE_TITLE[^=]*= \{([^}]*)\}/.exec(main)![1];
    expect([...titles.matchAll(/(\w+): '/g)].map((m) => m[1]).sort()).toEqual([...VALUES].sort());
  });
  it('folds a full explanation under every switch', () => {
    expect(main).toContain("</md-switch>${moreAbout(id, tx(label))}</div>");
    const fn = main.slice(main.indexOf('const moreAbout = '), main.indexOf('const sw = '));
    for (const k of ['moreSaved', 'moreUndo', 'moreNoUndo', 'moreLock']) expect(fn).toContain(k);
    expect(fn).toContain('<details class="set-more"><summary');
  });
});
