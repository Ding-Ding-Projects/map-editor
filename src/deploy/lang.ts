// Language modes for the deploy app: English, Cantonese, or both. The screens are written in English;
// this swaps each known phrase as it appears and swaps it back when the mode changes. Phrases that carry
// a name or a number stay as written.
import { YUE } from './yue.js';
import { makeReplacer, readWordsCache } from '../ui/vocabfile.js';

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

// Personal wording: a checked wording-to-replacement map kept in this app, swapped in as text is shown.
const WORDS_KEY = 'map-editor-deploy.words.v1';
let words: Record<string, string> = {};
let reword: (s: string) => string = (s) => s;
export const wordCount = () => Object.keys(words).length;
export function setWords(entries: Record<string, string>) {
  words = entries; reword = makeReplacer(entries);
  try { if (wordCount()) localStorage.setItem(WORDS_KEY, JSON.stringify({ schemaVersion: 1, entries })); else localStorage.removeItem(WORDS_KEY); } catch { /* storage blocked */ }
  if (document.body) walk(document.body);
}

function render(en: string): string {
  const y = YUE[en];
  const base = !y || lang === 'en' ? en : lang === 'yue' ? y : y === en ? en : `${en} · ${y}`;
  const out = reword(base);
  if (out !== en) shownToEnglish.set(out, en);
  return out;
}
const handled = (en: string) => !!YUE[en] || wordCount() > 0;

// What this module last wrote into a node or attribute. Anything else found there was put by the app,
// so it is taken as fresh English; comparing with the last written text (not the current rendering)
// keeps that true when the language or the personal wording has just changed.
const written = new WeakMap<Node, string>();
function textNode(n: Text) {
  const now = n.nodeValue ?? '';
  let en = original.get(n);
  if (en === undefined || (norm(now) !== written.get(n) && norm(now) !== en)) { en = norm(now); original.set(n, en); } // new or rewritten by the app
  if (!en) return;
  if (!handled(en)) { if (written.has(n) && norm(now) !== en) n.nodeValue = now.replace(now.trim(), en); written.delete(n); return; } // put back what was swapped
  const want = render(en);
  written.set(n, norm(want));
  if (norm(now) !== want) n.nodeValue = now.replace(now.trim(), want);
}

const attrOriginal = new WeakMap<Element, Record<string, string>>();
const attrWritten = new WeakMap<Element, Record<string, string>>();
function attributes(el: Element) {
  for (const a of ATTRS) {
    const now = el.getAttribute(a); if (now === null) continue;
    const store = attrOriginal.get(el) ?? {}; attrOriginal.set(el, store);
    const wrote = attrWritten.get(el) ?? {}; attrWritten.set(el, wrote);
    if (store[a] === undefined || (now !== wrote[a] && now !== store[a])) store[a] = norm(now);
    if (!handled(store[a])) { if (wrote[a] !== undefined && now !== store[a]) el.setAttribute(a, store[a]); delete wrote[a]; continue; }
    const want = render(store[a]);
    wrote[a] = want;
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
  try { words = readWordsCache(localStorage.getItem(WORDS_KEY)); reword = makeReplacer(words); } catch { /* built-in wording */ }
  // Our own rewrites come back through here too; they already match, so they are left alone and nothing loops.
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') walk(m.target);
      else if (m.type === 'attributes') { if (m.target instanceof Element) attributes(m.target); }
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  setLang(lang);
}

/** The switch for the header. */
export const langSwitch = () => `<div class="lang-switch" role="group" aria-label="Language">${([['en', 'English'], ['yue', '粵語'], ['both', 'EN + 粵']] as const).map(([k, t]) => `<button type="button" data-set-lang="${k}" aria-pressed="${k === lang}">${t}</button>`).join('')}</div>`;
