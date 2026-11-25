// Language modes for the deploy app: English, Cantonese, or both. The screens are written in English;
// this swaps each known phrase as it appears and swaps it back when the mode changes. Phrases that carry
// a name or a number stay as written.
import { YUE } from './yue.js';

export type Lang = 'en' | 'yue' | 'both';
const KEY = 'map-editor-deploy.lang';
const ATTRS = ['label', 'aria-label', 'placeholder', 'title', 'supporting-text'];
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const original = new WeakMap<Node, string>(); // the English a text node or attribute started with
const shownToEnglish = new Map<string, string>();
let lang: Lang = 'en';

export const currentLang = () => lang;
/** The English behind a label as shown, so icons are chosen the same way in every mode. */
export const englishOf = (shown: string) => shownToEnglish.get(norm(shown));

function render(en: string): string {
  const y = YUE[en];
  if (!y || lang === 'en') return en;
  const out = lang === 'yue' ? y : y === en ? en : `${en} · ${y}`;
  shownToEnglish.set(out, en);
  return out;
}

function textNode(n: Text) {
  const now = n.nodeValue ?? '';
  let en = original.get(n);
  if (en === undefined || (norm(now) !== norm(render(en)) && norm(now) !== en)) { en = norm(now); original.set(n, en); } // new or rewritten by the app
  if (!en || !YUE[en]) return;
  const want = render(en);
  if (norm(now) !== want) n.nodeValue = now.replace(now.trim(), want);
}

const attrOriginal = new WeakMap<Element, Record<string, string>>();
function attributes(el: Element) {
  for (const a of ATTRS) {
    const now = el.getAttribute(a); if (now === null) continue;
    const store = attrOriginal.get(el) ?? {}; attrOriginal.set(el, store);
    if (store[a] === undefined || (now !== render(store[a]) && now !== store[a])) store[a] = norm(now);
    if (!YUE[store[a]]) continue;
    const want = render(store[a]);
    if (now !== want) el.setAttribute(a, want);
  }
}

function walk(root: Node) {
  if (root.nodeType === 3) { textNode(root as Text); return; }
  if (!(root instanceof Element) || root.closest('script, style, code, pre, .log, input, textarea')) return;
  attributes(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) { if (!(n.parentElement?.closest('script, style, code, pre, .log'))) textNode(n as Text); }
    else attributes(n as Element);
  }
}

export function setLang(next: Lang) {
  lang = next;
  try { next === 'en' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
  document.documentElement.lang = next === 'yue' ? 'yue-Hant-HK' : 'en';
  walk(document.body);
  document.querySelectorAll<HTMLElement>('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === lang)));
}

export function initLang() {
  try { const v = localStorage.getItem(KEY); if (v === 'yue' || v === 'both') lang = v; } catch { /* default */ }
  let busy = false;
  new MutationObserver((ms) => {
    if (busy) return; busy = true;
    try {
      for (const m of ms) {
        if (m.type === 'characterData') walk(m.target);
        else if (m.type === 'attributes') { if (m.target instanceof Element) attributes(m.target); }
        else m.addedNodes.forEach(walk);
      }
    } finally { queueMicrotask(() => { busy = false; }); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  setLang(lang);
}

/** The switch for the header. */
export const langSwitch = () => `<div class="lang-switch" role="group" aria-label="Language">${([['en', 'English'], ['yue', '粵語'], ['both', 'EN + 粵']] as const).map(([k, t]) => `<button type="button" data-set-lang="${k}" aria-pressed="${k === lang}">${t}</button>`).join('')}</div>`;
