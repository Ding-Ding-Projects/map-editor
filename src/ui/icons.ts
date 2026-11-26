// Every button gets an icon. Icons are chosen from the button's own words, so new buttons get one
// without any extra work, and a label that changes later keeps its icon.
const P: Record<string, string> = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  download: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 16V5"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  undo: '<path d="M8 5 4 9l4 4"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  open: '<path d="M14 5h5v5"/><path d="M19 5 10 14"/><path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  back: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  next: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.700l1-1"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9"/><path d="m16 7 3 3"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.5 1-2 2.5-2H18a3 3 0 0 0 3-3c0-6-4-11-9-11z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="11" r="1"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5V4.500a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.3-2.500L3.5 14a1.5 1.5 0 0 1 2.5-1.5z"/>',
  select: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M12 4v0M12 20v0M4 12v0M20 12v0"/>',
  pipette: '<path d="m14 6 4 4"/><path d="m12 8 4 4-7 7H5v-4z"/><path d="m15 5 1.5-1.5a2.1 2.1 0 0 1 3 3L18 8"/>',
  ruler: '<rect x="2" y="9" width="20" height="7" rx="1.5"/><path d="M6 9v3M10 9v2M14 9v3M18 9v2"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  disk: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="16.5" cy="14.5" r="1.2"/><path d="M3 10h18"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6v0M4 12v0M4 18v0"/>',
  sound: '<path d="M4 10v4h4l5 4V6l-5 4z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>',
  rocket: '<path d="M5 15c-1 1-1.5 4-1.5 4s3-.500 4-1.5"/><path d="M9 15l-1-1c1-5 5-10 11-10 0 6-5 10-10 11z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
  cube: '<path d="m12 3 8 4.500v9L12 21l-8-4.500v-9z"/><path d="m4 7.5 8 4.5 8-4.500M12 12v9"/>',
  docker: '<rect x="3" y="11" width="18" height="7" rx="2"/><path d="M6 11V8h3v3M10 11V8h3v3M10 8V5h3v3M14 11V8h3v3"/>',
  remote: '<rect x="3" y="4" width="12" height="9" rx="1.5"/><path d="M6 17h6M9 13v4"/><path d="M18 8a5 5 0 0 1 0 8M20.5 6a8 8 0 0 1 0 12"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9h16M9 9v11"/>',
  layers: '<path d="m12 4 9 5-9 5-9-5z"/><path d="m3 14 9 5 9-5"/>',
  usb: '<path d="M12 21V7"/><path d="m9 7 3-4 3 4z"/><path d="M12 17 7 14v-3M12 14l5-2.500V9"/><circle cx="7" cy="10" r="1"/><rect x="16" y="7" width="2" height="2"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  wrench: '<path d="M14.5 6a4 4 0 0 0 5 5L11 19.5a2.1 2.1 0 0 1-3-3z"/><path d="m16 4 1.5 2.500L20 8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v0"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M9 9h6M9 13h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  braces: '<path d="M9 4c-2 0-3 1-3 3v2c0 1.5-1 3-2 3 1 0 2 1.5 2 3v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1.5 1 3 2 3-1 0-2 1.5-2 3v2c0 2-1 3-3 3"/>',
  swap: '<path d="M4 8h14"/><path d="m14 4 4 4-4 4"/><path d="M20 16H6"/><path d="m10 12-4 4 4 4"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5v0M7 16.500v0"/>',
  spark: '<path d="M12 3l1.8 5.200L19 10l-5.2 1.800L12 17l-1.8-5.200L5 10l5.2-1.800z"/><path d="M19 16l.700 2.300L22 19l-2.3.700L19 22l-.700-2.300L16 19l2.3-.700z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
};

// First match wins, tried on the English wording of the label.
const RULES: Array<[RegExp, string]> = [
  [/\bcopy\b|duplicate|clone/i, 'copy'], [/tour|walk-through/i, 'compass'],
  [/download|export|save\b|template/i, 'download'], [/upload|import|add from|\.zip|\.nbt|place a|choose (appliance|a file)|open server|own logo|attach/i, 'upload'],
  [/virtual disk/i, 'disk'], [/every tab|find tabs|\ball\b.*tabs/i, 'list'],
  [/refresh|reload|retry|try again|restart|check for|update/i, 'refresh'],
  [/\bnew\b|create|\badd\b|set up|install/i, 'plus'], [/turn off|switch off/i, 'power'], [/detach/i, 'unlock'], [/delete|remove|erase/i, 'trash'],
  [/undo|roll back|restore|reset|\blater\b/i, 'undo'],
  [/unlock/i, 'unlock'], [/\block\b/i, 'lock'], [/rename|edit\b/i, 'pencil'], [/passkey|sign in|sign out|account|authenticator/i, 'key'],
  [/folder|browse|choose/i, 'folder'], [/\bopen\b|manage|show\b|view\b|history/i, 'open'], [/search|find/i, 'search'],
  [/pause|stop\b/i, 'pause'], [/sound|voice|narrat|listen/i, 'sound'], [/rainbow|colou?r|theme/i, 'palette'],
  [/deploy|flash|write the/i, 'rocket'], [/\bpan\b/i, 'hand'], [/pick/i, 'pipette'], [/\b3d\b|block/i, 'cube'], [/dismiss selected/i, 'x'], [/move to bin|^bin \(/i, 'trash'], [/^put back/i, 'undo'], [/^start selected/i, 'play'], [/^stop selected/i, 'pause'], [/^restart selected/i, 'refresh'], [/download selected/i, 'download'], [/selection|select/i, 'select'],
  [/measure/i, 'ruler'], [/go to|jump|centre|center/i, 'target'],
  [/\brun\b|start|\btry\b|test|play|encode|decode|convert|make|ask\b|\bgo\b/i, 'play'],
  [/\bback\b|previous/i, 'back'], [/next|continue|skip/i, 'next'],
  [/close|cancel|dismiss|hide|\bno\b/i, 'x'], [/\bok\b|turn on|allow|confirm|done|finish|apply|yes|use\b|got it/i, 'check'],
  [/setting|layout|option/i, 'sliders'],
];

export function iconName(english: string): string {
  for (const [re, name] of RULES) if (re.test(english)) return name;
  return 'next';
}
export const iconSvg = (name: string, size = 18) => `<svg class="btn-ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? P.next}</svg>`;
export const ICON_NAMES = Object.keys(P);

const MD = 'md-filled-button, md-filled-tonal-button, md-outlined-button, md-text-button';
const PLAIN = '.fold-toggle, .sc-key, .sc-exit, .map-toolbar [data-mode], .ctx-list button, .help-menu button, .select-button, .btn-primary, .sb-actions button, .export-menu button';

/**
 * Give every button an icon, now and whenever buttons are added or relabelled.
 * `english` turns a label as shown (any language mode) back into its English wording, when it can.
 */
export function initButtonIcons(english: (label: string) => string | undefined = () => undefined) {
  const label = (b: Element) => Array.from(b.childNodes).filter((n) => n.nodeType === 3 || (n instanceof HTMLElement && !n.matches('svg, input, [slot=icon]'))).map((n) => n.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
  const dress = (b: Element) => {
    if (b.querySelector(':scope > svg, :scope > [slot=icon]')) return;
    const text = label(b); if (!text) return;
    const name = (b as HTMLElement).dataset.icon ?? iconName(english(text) ?? text);
    const t = document.createElement('template'); t.innerHTML = iconSvg(name);
    const svg = t.content.firstElementChild!;
    if (b.matches(MD)) svg.setAttribute('slot', 'icon');
    b.prepend(svg);
  };
  const all = (root: ParentNode) => root.querySelectorAll(`${MD}, ${PLAIN}`).forEach(dress);
  all(document);
  new MutationObserver((ms) => {
    for (const m of ms) {
      const host = m.target instanceof Element ? m.target.closest(`${MD}, ${PLAIN}`) : m.target.parentElement?.closest(`${MD}, ${PLAIN}`);
      if (host) dress(host);
      m.addedNodes.forEach((n) => { if (n instanceof Element) { if (n.matches(`${MD}, ${PLAIN}`)) dress(n); all(n); } });
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
