import { describe, expect, it } from 'vitest';
import { detectEditors, editorCandidates } from '../src/desktop/editors.js';

describe('outside editors', () => {
  it('looks in the usual Windows places and on PATH', () => {
    const c = editorCandidates('win32', { LOCALAPPDATA: 'C:\\Users\\alex\\AppData\\Local', ProgramFiles: 'C:\\Program Files', PATH: 'C:\\tools;C:\\bin' });
    const code = c.find((x) => x.id === 'vscode')!;
    expect(code.paths).toContain('C:\\Users\\alex\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe');
    expect(code.paths).toContain('C:\\tools\\code.cmd');
  });
  it('drops a place whose folder variable is not set', () => {
    const c = editorCandidates('win32', { PATH: '' });
    for (const k of c) for (const p of k.paths) expect(p.startsWith('\\')).toBe(false);
  });
  it('uses PATH on Linux and finds only what exists', async () => {
    const env = { PATH: '/usr/bin:/snap/bin' };
    expect(editorCandidates('linux', env).find((x) => x.id === 'vscode')!.paths).toEqual(['/usr/bin/code', '/snap/bin/code']);
    const found = await detectEditors('linux', env, async (p) => p === '/snap/bin/code');
    expect(found).toEqual([{ id: 'vscode', name: 'Visual Studio Code', command: '/snap/bin/code' }]);
    expect(await detectEditors('linux', env, async () => false)).toEqual([]);
  });
});
