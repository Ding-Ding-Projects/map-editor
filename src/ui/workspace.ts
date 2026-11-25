// dockview workspaces: panels can be docked, tabbed together, floated and rearranged.
// Each screen has its own layout, saved per browser and restored next time.
import { createDockview, type DockviewApi } from 'dockview-core/dist/dockview-core.js';

const LAYOUT_KEY = 'map-editor.layout.v1';
// On a phone every panel is one tab in a single group, so nothing is squeezed side by side.
export const PHONE = '(max-width: 720px)';
/** Wide enough for a floating group to sit over the map without covering the tools. */
export const WIDE = '(min-width: 1600px)';
const live = new Map<HTMLElement, DockviewApi>();

/** Default arrangement: each entry is [panel id, position relative to an earlier panel, size]. */
export type Arrangement = Array<[string, { ref: string; dir: 'right' | 'below' | 'within' }?, number?]>;

export function mountWorkspace(host: HTMLElement, panels: Record<string, HTMLElement>, titles: Record<string, string>, dark: boolean, screen?: { key: string; arrange: Arrangement; active?: string }) {
  // Several workspaces can be on screen at once (a panel may hold another screen), so each host
  // keeps its own; ones whose host has left the page are cleaned up here.
  for (const [h, a] of live) if (h === host || !h.isConnected) { a.dispose(); live.delete(h); }
  host.classList.add('dockview-theme-m3');
  const api = createDockview(host, {
    theme: { name: 'material', className: 'dockview-theme-m3', colorScheme: dark ? 'dark' : 'light', gap: 8, dndTabIndicator: 'fill' },
    createComponent: ({ name }) => {
      const element = panels[name] ?? Object.assign(document.createElement('div'), { textContent: name });
      return { element, init: () => undefined };
    },
  });
  const phone = matchMedia(PHONE).matches;
  const base = screen ? `map-editor.layout.${screen.key}.v1` : LAYOUT_KEY;
  const key = phone ? `${base}.phone` : base;
  host.classList.toggle('phone-dock', phone);
  let restored = false;
  try {
    const saved = localStorage.getItem(key);
    if (saved) { api.fromJSON(JSON.parse(saved)); restored = Object.keys(panels).every((id) => api.getPanel(id)); }
  } catch { restored = false; }
  if (!restored && screen) {
    api.clear();
    for (const [id, pos, size] of screen.arrange) {
      const dir = phone ? 'within' : pos?.dir;
      api.addPanel({ id, component: id, title: titles[id], ...(pos ? { position: { referencePanel: pos.ref, direction: dir === 'right' ? 'right' : dir === 'below' ? 'below' : 'within' } } : {}), ...(size && !phone && dir === 'right' ? { initialWidth: size } : {}), ...(size && !phone && dir === 'below' ? { initialHeight: size } : {}) });
    }
    api.getPanel(screen.active ?? screen.arrange[0][0])?.api.setActive();
  } else if (!restored) {
    api.clear();
    api.addPanel({ id: 'map', component: 'map', title: titles.map });
    api.addPanel({ id: 'tool', component: 'tool', title: titles.tool, position: phone ? { referencePanel: 'map', direction: 'within' } : { referencePanel: 'map', direction: 'right' }, initialWidth: phone ? undefined : 380 });
    api.addPanel({ id: 'history', component: 'history', title: titles.history, position: { referencePanel: 'tool', direction: 'within' } });
    api.addPanel({ id: 'notes', component: 'notes', title: titles.notes, position: { referencePanel: 'tool', direction: 'within' } });
    // Wide screens: notes start as a floating group in the lower left of the map, so the tools keep their full height.
    if (!phone && matchMedia(WIDE).matches) {
      const notes = api.getPanel('notes');
      if (notes) api.addFloatingGroup(notes, { x: 24, y: Math.max(80, host.clientHeight - 360), width: 420, height: 320 });
    }
    api.getPanel(phone ? 'map' : 'tool')?.api.setActive();
  }
  for (const id of Object.keys(titles)) api.getPanel(id)?.api.setTitle(titles[id]);
  api.onDidLayoutChange(() => { try { localStorage.setItem(key, JSON.stringify(api.toJSON())); } catch { /* storage blocked */ } });
  live.set(host, api);
  return api;
}

export function resetLayout() { try { for (const k of Object.keys(localStorage)) if (k.startsWith('map-editor.layout.')) localStorage.removeItem(k); } catch { /* ignore */ } }
