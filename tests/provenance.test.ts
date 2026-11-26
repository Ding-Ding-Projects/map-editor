import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

// Every surface says which build it is on its first screen. These checks fail if that line is taken out.
const read = (f: string) => fs.readFileSync(f, 'utf8');

describe('version and build time on the first screen', () => {
  it('the app header carries the provenance line and prints version, date, time and time zone', () => {
    const src = read('src/ui/main.ts');
    expect(src).toMatch(/<header class="top">[\s\S]{0,900}id="prov">\$\{esc\(provenance\(\)\)\}/);
    const fn = src.slice(src.indexOf('function provenance()'), src.indexOf('function provenance()') + 900);
    for (const part of ['health.version', 'getFullYear', 'getSeconds', 'getTimezoneOffset']) expect(fn, part).toContain(part);
  });
  it('the deploy app header fills its provenance line with version, build time and commit', () => {
    const src = read('src/deploy/ui.ts');
    expect(src).toMatch(/<header class="top">[\s\S]{0,700}id="prov"/);
    expect(src).toMatch(/#prov'\);[\s\S]{0,200}Version \$\{b\.version\} · updated \$\{b\.builtAt[\s\S]{0,200}b\.commit/);
  });
  it('the site shows version and build time on the first screen and in the footer, and localises the time', () => {
    const src = read('site/build.mjs');
    const pill = src.slice(src.indexOf('<span class="pill">'), src.indexOf('<span class="pill">') + 500);
    expect(pill).toContain('pkg.version'); expect(pill).toContain('class="when"');
    expect(src).toMatch(/<footer>[\s\S]{0,200}pkg\.version[\s\S]{0,120}class="when"[\s\S]{0,200}commit/);
    expect(src).toContain("document.querySelectorAll('time.when')");
  });
});
