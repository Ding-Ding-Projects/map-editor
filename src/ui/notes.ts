// Rich text notes for the open world, edited with TinyMCE (self-hosted, GPL licence key).
type Api = <T = any>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
interface Opts { api: Api; notify: (text: string, error?: boolean) => void; dark: boolean; label: string; saved: string }

let loading: Promise<any> | undefined;
function loadTiny(): Promise<any> {
  const w = window as unknown as { tinymce?: any };
  if (w.tinymce) return Promise.resolve(w.tinymce);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'tinymce/tinymce.min.js';
    s.onload = () => resolve(w.tinymce);
    s.onerror = () => reject(new Error('The rich text editor could not load.'));
    document.head.append(s);
  });
  return loading;
}

export async function notesPanel(el: HTMLElement, o: Opts) {
  el.innerHTML = `<div class="notes"><textarea aria-label="${o.label}"></textarea></div>`;
  const area = el.querySelector('textarea')!;
  try {
    const [{ html }, tinymce] = await Promise.all([o.api<{ html: string }>('/api/notes'), loadTiny()]);
    area.value = html;
    tinymce.remove(area);
    let timer: number | undefined;
    await tinymce.init({
      target: area, license_key: 'gpl', base_url: new URL('tinymce', location.href).pathname, suffix: '.min',
      skin: o.dark ? 'oxide-dark' : 'oxide', content_css: o.dark ? 'dark' : 'default',
      content_style: o.dark ? 'body { background: #0B0F0A; color: #E0E4DA; font-family: Roboto Flex, Roboto, system-ui, sans-serif; } a { color: #8FD88A; }' : 'body { background: #FFFFFF; color: #181D17; font-family: Roboto Flex, Roboto, system-ui, sans-serif; } a { color: #2E6B2C; }',
      menubar: false, branding: false, promotion: false, height: '100%', resize: false,
      plugins: 'lists link table autolink',
      toolbar: 'undo redo | blocks | bold italic underline | bullist numlist | link table',
      setup: (ed: any) => {
        // While its panel is not showing, the editor's frame has no window; its own resize handler would fail, so stop the event first.
        ed.on('ResizeWindow', (e: { stopImmediatePropagation: () => void }) => { if (!ed.getContentAreaContainer?.()?.isConnected || !ed.getWin?.()) e.stopImmediatePropagation(); }, true);
        ed.on('input change', () => {
        clearTimeout(timer);
        timer = window.setTimeout(async () => {
          try { await o.api('/api/notes', { method: 'PUT', body: { html: ed.getContent() } }); }
          catch (e) { o.notify((e as Error).message, true); }
        }, 800);
        });
      },
    });
  } catch (e) { o.notify((e as Error).message, true); }
}
