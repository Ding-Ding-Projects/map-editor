// dockview workspace for the editor: panels can be docked, tabbed together, floated and rearranged.
// The layout is saved per browser and restored next time.
import { createDockview, type DockviewApi } from 'dockview-core/dist/dockview-core.js';

const LAYOUT_KEY = 'map-editor.layout.v1';
// On a phone every panel is one tab in a single group, so nothing is squeezed side by side.
export const PHONE = '(max-width: 720px)';
let api: DockviewApi | undefined;

export function mountWorkspace(host: HTMLElement, panels: Record<string, HTMLElement>, titles: Record<string, string>, dark: boolean) {
  api?.dispose();
  host.classList.add('dockview-theme-m3');
  api = createDockview(host, {
    theme: { name: 'material', className: 'dockview-theme-m3', colorScheme: dark ? 'dark' : 'light', gap: 8, dndTabIndicator: 'fill' },
    createComponent: ({ name }) => {
      const element = panels[name] ?? Object.assign(document.createElement('div'), { textContent: name });
      return { element, init: () => undefined };
    },
  });
  const phone = matchMedia(PHONE).matches;
  const key = phone ? `${LAYOUT_KEY}.phone` : LAYOUT_KEY;
  host.classList.toggle('phone-dock', phone);
  let restored = false;
  try {
    const saved = localStorage.getItem(key);
    if (saved) { api.fromJSON(JSON.parse(saved)); restored = Object.keys(panels).every((id) => api!.getPanel(id)); }
  } catch { restored = false; }
  if (!restored) {
    api.clear();
    api.addPanel({ id: 'map', component: 'map', title: titles.map });
    api.addPanel({ id: 'tool', component: 'tool', title: titles.tool, position: phone ? { referencePanel: 'map', direction: 'within' } : { referencePanel: 'map', direction: 'right' }, initialWidth: phone ? undefined : 380 });
    api.addPanel({ id: 'history', component: 'history', title: titles.history, position: { referencePanel: 'tool', direction: 'within' } });
    api.addPanel({ id: 'notes', component: 'notes', title: titles.notes, position: { referencePanel: 'tool', direction: 'within' } });
    api.getPanel(phone ? 'map' : 'tool')?.api.setActive();
  }
  for (const id of Object.keys(titles)) api.getPanel(id)?.api.setTitle(titles[id]);
  api.onDidLayoutChange(() => { try { localStorage.setItem(key, JSON.stringify(api!.toJSON())); } catch { /* storage blocked */ } });
  return api;
}

export function resetLayout() { try { localStorage.removeItem(LAYOUT_KEY); localStorage.removeItem(`${LAYOUT_KEY}.phone`); } catch { /* ignore */ } }
