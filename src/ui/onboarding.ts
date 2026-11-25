// First-run wizard: language and voice, comfort, theme colour, then the worlds screen.
// Every step changes the real setting immediately; progress is saved so it resumes.
import type { Key, Lang } from './i18n.js';
import { colorPicker } from './colorpicker.js';

interface Prefs { lang: Lang; funnyEn: number; funnyYue: number; dark: boolean; reduceMotion: boolean; seed: string; rainbowSpeed: number }
interface Ctx {
  tx: (k: Key, v?: Record<string, string | number>) => string;
  esc: (s: unknown) => string;
  prefs: Prefs;
  step: number;
  save: (step: number) => void;
  apply: () => void;
  relabel: () => HTMLElement;
  done: () => void;
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
      body.innerHTML = `<label class="row ob-switch"><span><b>${esc(tx('dark'))}</b></span><md-switch id="ob-dark" ${prefs.dark ? 'selected' : ''}></md-switch></label>
        <label class="row ob-switch"><span><b>${esc(tx('reduceMotion'))}</b></span><md-switch id="ob-rm" ${prefs.reduceMotion ? 'selected' : ''}></md-switch></label>`;
      body.querySelector('#ob-dark')!.addEventListener('change', (e) => { prefs.dark = (e.target as HTMLInputElement & { selected: boolean }).selected; c.apply(); });
      body.querySelector('#ob-rm')!.addEventListener('change', (e) => { prefs.reduceMotion = (e.target as HTMLInputElement & { selected: boolean }).selected; c.apply(); });
    } else if (step === 2) {
      const holder = document.createElement('div');
      body.append(holder);
      colorPicker(holder, {
        value: prefs.seed, label: tx('seed'), allowRainbow: true, rainbowSpeed: prefs.rainbowSpeed,
        surface: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface').trim() || '#10140f',
        onChange: (v) => { prefs.seed = v.length === 9 ? v.slice(0, 7) : v; c.apply(); },
        onSpeed: (lv) => { prefs.rainbowSpeed = lv; c.apply(); },
      });
    } else {
      body.innerHTML = `<p class="lead">${esc(tx('stepWorldBody'))}</p>`;
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
