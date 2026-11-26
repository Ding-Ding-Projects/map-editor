// First-run wizard: language and voice, comfort, theme colour, then the worlds screen.
// Every step changes the real setting immediately; progress is saved so it resumes.
import type { Key, Lang } from './i18n.js';
import { colorPicker } from './colorpicker.js';

interface Prefs { lang: Lang; funnyEn: number; funnyYue: number; dark: boolean; reduceMotion: boolean; largeText: boolean; focusMode: boolean; sounds: boolean; takeovers: boolean; seed: string; rainbowSpeed: number }

/** The comfort step: switch id, the preference it sets, its label and its note. Each one changes the real setting at once. */
export const COMFORT: [id: string, pref: 'dark' | 'reduceMotion' | 'largeText' | 'focusMode' | 'sounds' | 'takeovers', label: Key, note: Key][] = [
  ['ob-dark', 'dark', 'dark', 'darkNote'], ['ob-rm', 'reduceMotion', 'reduceMotion', 'reduceMotionNote'], ['ob-lt', 'largeText', 'largeText', 'largeTextNote'],
  ['ob-focus', 'focusMode', 'focusMode', 'focusModeNote'], ['ob-snd', 'sounds', 'soundEffects', 'soundEffectsNote'], ['ob-tko', 'takeovers', 'takeovers', 'takeoversNote'],
];
interface Ctx {
  tx: (k: Key, v?: Record<string, string | number>) => string;
  /** The colour picker's fixed phrases in the chosen language. */
  pickerText?: (english: string) => string;
  esc: (s: unknown) => string;
  prefs: Prefs;
  step: number;
  save: (step: number) => void;
  apply: () => void;
  relabel: () => HTMLElement;
  done: () => void;
  /** Talks to the server, for the last step's real setup action. */
  api?: <T = any>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
}

const STEPS: Key[] = ['stepLanguage', 'stepComfort', 'stepTheme', 'stepWorld'];

export function onboarding(view: HTMLElement, c: Ctx) {
  let step = Math.min(Math.max(0, c.step), STEPS.length - 1);
  const { tx, esc, prefs } = c;

  function draw(host: HTMLElement) {
    host.innerHTML = `<section class="onboarding" aria-labelledby="ob-title">
      <aside class="ob-rail"><h1 id="ob-title" class="ob-welcome">${esc(tx('welcome'))}</h1>
        <ol>${STEPS.map((k, i) => `<li><button class="ob-step${i === step ? ' current' : ''}${i < step ? ' done' : ''}" data-step="${i}" ${i === step ? 'aria-current="step"' : ''}><span class="ob-dot">${i < step ? '✓' : i + 1}</span>${esc(tx(k))}</button></li>`).join('')}</ol>
        <md-linear-progress value="${step / (STEPS.length - 1)}" aria-label="${esc(tx('loading'))}"></md-linear-progress>
        <p class="muted">${esc(tx('progressSaved'))}</p></aside>
      <main class="ob-main"><h2 class="display-sm">${esc(tx(STEPS[step]))}</h2><div id="ob-body" class="stack"></div>
        <div class="ob-nav"><md-outlined-button id="ob-back" ${step === 0 ? 'disabled' : ''}>${esc(tx('back'))}</md-outlined-button>
          ${step < STEPS.length - 1 ? `<md-text-button id="ob-skip">${esc(tx('skip'))}</md-text-button>` : ''}
          <span class="spacer"></span><md-filled-button id="ob-next">${esc(step === STEPS.length - 1 ? tx('finish') : tx('next'))}</md-filled-button></div></main></section>`;
    const body = host.querySelector<HTMLElement>('#ob-body')!;
    if (step === 0) {
      body.innerHTML = `<div class="ob-langs" role="radiogroup" aria-label="${esc(tx('language'))}">${([['en', 'English', 'Every label in English'], ['yue', '粵語', '香港風格廣東話'], ['both', 'EN + 粵', 'English first, 粵 below']] as const)
        .map(([id, big, small]) => `<button role="radio" aria-checked="${prefs.lang === id}" class="ob-lang${prefs.lang === id ? ' on' : ''}" data-lang="${id}"><b>${big}</b><span>${small}</span></button>`).join('')}</div>
        <label class="row"><span>${esc(tx('funnyEn'))}</span><md-slider id="ob-fen" min="1" max="5" step="1" ticks labeled value="${prefs.funnyEn}"></md-slider></label>
        <label class="row"><span>${esc(tx('funnyYue'))}</span><md-slider id="ob-fyue" min="1" max="5" step="1" ticks labeled value="${prefs.funnyYue}"></md-slider></label>
        <p class="muted">${esc(tx('funnyNote'))}</p>`;
      body.querySelectorAll<HTMLElement>('[data-lang]').forEach((b) => b.addEventListener('click', () => { prefs.lang = b.dataset.lang as Lang; c.apply(); draw(c.relabel()); }));
      body.querySelector('#ob-fen')!.addEventListener('change', (e) => { prefs.funnyEn = Number((e.target as HTMLInputElement).value); c.apply(); });
      body.querySelector('#ob-fyue')!.addEventListener('change', (e) => { prefs.funnyYue = Number((e.target as HTMLInputElement).value); c.apply(); });
    } else if (step === 1) {
      body.innerHTML = `<p class="muted">${esc(tx('obComfortLead'))}</p>` + COMFORT.map(([id, pref, label, note]) => `<label class="row ob-switch"><span><b>${esc(tx(label))}</b><small>${esc(tx(note))}</small></span><md-switch id="${id}" ${prefs[pref] ? 'selected' : ''} aria-label="${esc(tx(label))}"></md-switch></label>`).join('');
      for (const [id, pref] of COMFORT) body.querySelector('#' + id)!.addEventListener('change', (e) => { prefs[pref] = (e.target as HTMLInputElement & { selected: boolean }).selected; c.apply(); });
    } else if (step === 2) {
      const holder = document.createElement('div');
      body.append(holder);
      colorPicker(holder, {
        value: prefs.seed, label: tx('seed'), allowRainbow: true, rainbowSpeed: prefs.rainbowSpeed,
        text: c.pickerText,
        surface: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface').trim() || '#10140f',
        onChange: (v) => { prefs.seed = v.length === 9 ? v.slice(0, 7) : v; c.apply(); },
        onSpeed: (lv) => { prefs.rainbowSpeed = lv; c.apply(); },
      });
    } else {
      // A real setup action with its result: look at what worlds are there, and make a practice one if wanted.
      body.innerHTML = `<p class="lead">${esc(tx('stepWorldBody'))}</p>
        <p id="ob-found" class="muted" role="status">${esc(tx('loading'))}</p>
        <div class="row-actions"><md-filled-tonal-button id="ob-make">${esc(tx('obMakePractice'))}</md-filled-tonal-button></div>
        <p id="ob-made" role="status" aria-live="polite"></p>`;
      const found = body.querySelector<HTMLElement>('#ob-found')!, made = body.querySelector<HTMLElement>('#ob-made')!, make = body.querySelector<HTMLElement & { disabled: boolean }>('#ob-make')!;
      const look = async () => {
        if (!c.api) { found.textContent = ''; make.hidden = true; return; }
        try { const r = await c.api<{ worlds: unknown[]; roots: string[] }>('/api/worlds'); if (found.isConnected) found.textContent = tx(r.worlds.length ? 'obWorldsFound' : 'obWorldsNone', { n: r.worlds.length, roots: r.roots.join(', ') }); }
        catch (e) { if (found.isConnected) found.textContent = tx('obWorldsFailed', { e: (e as Error).message }); }
      };
      void look();
      make.addEventListener('click', async () => {
        if (!c.api || make.disabled) return;
        make.disabled = true; made.className = ''; made.textContent = tx('obMaking');
        try { const r = await c.api<{ name: string }>('/api/worlds/new', { method: 'POST', body: { name: tx('obPracticeName'), preset: 'classic', size: 4 } }); made.className = 'ob-ok'; made.textContent = tx('obMade', { name: r.name }); await look(); }
        catch (e) { made.className = 'ob-bad'; made.textContent = tx('obMakeFailed', { e: (e as Error).message }); make.disabled = false; }
      });
    }
    host.querySelectorAll<HTMLElement>('[data-step]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.step))));
    host.querySelector('#ob-back')!.addEventListener('click', () => go(step - 1));
    host.querySelector('#ob-skip')?.addEventListener('click', () => go(step + 1));
    host.querySelector('#ob-next')!.addEventListener('click', () => (step === STEPS.length - 1 ? c.done() : go(step + 1)));
    (host.querySelector('#ob-next') as HTMLElement).focus?.();
  }
  function go(n: number) {
    step = Math.min(Math.max(0, n), STEPS.length - 1);
    c.save(step);
    draw(view.isConnected ? view : c.relabel());
  }
  draw(view);
}
