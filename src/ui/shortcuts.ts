/**
 * Every keyboard shortcut of the app, in one table. The key handler reads it to decide what a key press does,
 * and menus, tooltips and the command palette read it to show the key, so what is shown is what is registered.
 * Combos are written the Windows way ("Ctrl+Shift+F"); `shownKey` writes them for the machine in front of the user.
 */
export const TOOL_KEYS = { fill: 'F', replace: 'R', delete: 'D', clone: 'C', waterlog: 'W', biome: 'B' } as const;
export const MAP_MODE_KEYS = { pan: 'H', select: 'S', pick: 'I', measure: 'M', goto: 'G' } as const;
export const UNDO_KEY = 'Ctrl+Z';
export const PALETTE_KEY = 'Ctrl+Shift+F';

/** id → combo, for checks and for a list of every shortcut. */
export const SHORTCUTS: Record<string, string> = {
  palette: PALETTE_KEY, undo: UNDO_KEY,
  ...Object.fromEntries(Object.entries(TOOL_KEYS).map(([k, v]) => [`tool-${k}`, v])),
  ...Object.fromEntries(Object.entries(MAP_MODE_KEYS).map(([k, v]) => [`map-${k}`, v])),
};

type Press = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

/** Does this key press match the combo? Ctrl and the Mac Command key count as the same modifier. */
export function hitKey(e: Press, combo: string): boolean {
  const parts = combo.split('+'); const key = parts[parts.length - 1].toLowerCase();
  return e.key.toLowerCase() === key && (e.ctrlKey || e.metaKey) === parts.includes('Ctrl') && e.shiftKey === parts.includes('Shift') && e.altKey === parts.includes('Alt');
}

export const isMac = (platform = typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent): boolean => /Mac|iPhone|iPad/i.test(platform);

/** The combo as this machine writes it: "Ctrl+Shift+F" on Windows and Linux, "⇧⌘F" on a Mac. */
export function shownKey(combo: string, mac = isMac()): string {
  if (!mac) return combo;
  const parts = combo.split('+'); const key = parts.pop() as string;
  const order: [string, string][] = [['Alt', '⌥'], ['Shift', '⇧'], ['Ctrl', '⌘']];
  return order.filter(([n]) => parts.includes(n)).map(([, s]) => s).join('') + key;
}

/** The value for `aria-keyshortcuts`, which has its own spelling for modifiers. */
export const ariaKey = (combo: string, mac = isMac()): string => combo.replace(/Ctrl/g, mac ? 'Meta' : 'Control');

/** Help text names keys the Windows way; on a Mac every combo in a sentence is rewritten the Mac way. */
export function keysInText(text: string, mac = isMac()): string {
  return mac ? text.replace(/\b(?:(?:Ctrl|Shift|Alt)\+)+[A-Z0-9]\b/g, (c) => shownKey(c, true)) : text;
}
