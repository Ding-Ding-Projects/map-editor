// Outside editors the desktop app can hand a world folder to. Detection only looks for known
// programs in known places or on PATH; nothing is run through a shell.
import path from 'node:path';

export interface EditorChoice { id: string; name: string; command: string }
interface Known { id: string; name: string; bins: string[]; win?: string[]; mac?: string[] }

const KNOWN: Known[] = [
  { id: 'vscode', name: 'Visual Studio Code', bins: ['code'], win: ['%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe', '%ProgramFiles%\\Microsoft VS Code\\Code.exe'], mac: ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'] },
  { id: 'vscodium', name: 'VSCodium', bins: ['codium'], win: ['%LOCALAPPDATA%\\Programs\\VSCodium\\VSCodium.exe', '%ProgramFiles%\\VSCodium\\VSCodium.exe'], mac: ['/Applications/VSCodium.app/Contents/Resources/app/bin/codium'] },
  { id: 'cursor', name: 'Cursor', bins: ['cursor'], win: ['%LOCALAPPDATA%\\Programs\\cursor\\Cursor.exe'] },
  { id: 'sublime', name: 'Sublime Text', bins: ['subl'], win: ['%ProgramFiles%\\Sublime Text\\sublime_text.exe', '%ProgramFiles%\\Sublime Text 3\\sublime_text.exe'], mac: ['/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl'] },
  { id: 'notepadpp', name: 'Notepad++', bins: [], win: ['%ProgramFiles%\\Notepad++\\notepad++.exe', '%ProgramFiles(x86)%\\Notepad++\\notepad++.exe'] },
];

/** Every place a known editor could be, for this platform and environment. */
export function editorCandidates(platform: string, env: Record<string, string | undefined>): Array<{ id: string; name: string; paths: string[] }> {
  const win = platform === 'win32';
  const expand = (p: string) => p.replace(/%([^%]+)%/g, (_m, k: string) => env[k] ?? '');
  const dirs = (env.PATH ?? env.Path ?? '').split(win ? ';' : ':').filter(Boolean);
  const exts = win ? ['.cmd', '.exe', '.bat'] : [''];
  const join = win ? path.win32.join : path.posix.join;
  return KNOWN.map((k) => ({ id: k.id, name: k.name, paths: [
    ...(win ? (k.win ?? []).map(expand).filter((p) => !/^\\/.test(p)) : platform === 'darwin' ? k.mac ?? [] : []),
    ...k.bins.flatMap((b) => dirs.flatMap((d) => exts.map((x) => join(d, b + x)))),
  ] })).filter((k) => k.paths.length);
}

/** The editors that are really there. `exists` answers whether a path is a file. */
export async function detectEditors(platform: string, env: Record<string, string | undefined>, exists: (p: string) => Promise<boolean>): Promise<EditorChoice[]> {
  const found: EditorChoice[] = [];
  for (const k of editorCandidates(platform, env)) {
    for (const p of k.paths) { if (await exists(p)) { found.push({ id: k.id, name: k.name, command: p }); break; } }
  }
  return found;
}
