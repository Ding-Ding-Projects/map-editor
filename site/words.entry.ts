// Your own words on the documentation site: one local JSON file, checked whole by the same checker the
// apps use, kept in this browser only and swapped into the page text. Without this script the site is
// unchanged; code samples, commands and links are never touched.
import { makeReplacer, readVocabFile, readWordsCache, VocabError, VOCAB_LIMITS } from '../src/ui/vocabfile.js';

const KEY = 'map-editor-site.words.v1';
const two = (en: string, yue: string) => `<span data-l="en" lang="en">${en}</span><span data-l="yue" lang="yue-Hant-HK">${yue}</span>`;
const SKIP = 'script, style, code, pre, kbd, samp, textarea, input, .words-dialog';
const original = new WeakMap<Text, string>(), written = new WeakMap<Text, string>();
let words: Record<string, string> = {};
let reword = makeReplacer(words);
let refused = '';

function node(n: Text) {
  if (n.parentElement?.closest(SKIP)) return;
  const now = n.nodeValue ?? '';
  if (!original.has(n) || (now !== written.get(n) && now !== original.get(n))) original.set(n, now);
  const want = reword(original.get(n)!);
  written.set(n, want);
  if (now !== want) n.nodeValue = want;
}
function walk(root: Node) {
  if (root.nodeType === 3) { node(root as Text); return; }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) node(n as Text);
}
function use(entries: Record<string, string>) {
  words = entries; reword = makeReplacer(entries);
  try { if (Object.keys(entries).length) localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 1, entries })); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  walk(document.body);
}

const FAULT: Record<string, [string, string]> = {
  size: ['the file is over 256 KiB. Use a smaller file.', '個檔大過 256 KiB。用細啲嘅檔。'],
  json: ['it is not valid JSON. Check brackets, commas and quotes.', '唔係啱格式嘅 JSON。睇吓括號、逗號同引號。'],
  duplicate: ['the same key is written twice. Keep each key once.', '同一個鍵寫咗兩次。每個鍵留一次。'],
  depth: ['it nests deeper than 8 levels. Flatten it.', '巢狀深過 8 層。整平佢。'],
  shape: ['the shape is not the one in the template. It needs exactly schemaVersion and entries.', '格式同範本唔同。只可以有 schemaVersion 同 entries。'],
  version: ['this schema version is not supported. Use schemaVersion 1.', '唔支援呢個 schema 版本。用 schemaVersion 1。'],
  key: ['a key is empty, longer than 160 characters or not allowed.', '有個鍵係空嘅、長過 160 字，或者唔准用。'],
  value: ['a replacement is not text, is empty or is longer than 1,000 characters.', '有個替換唔係文字、係空嘅，或者長過 1,000 字。'],
  count: ['it has more than 5,000 entries.', '多過 5,000 項。'],
  empty: ['it has no entries.', '入面冇任何項目。'],
};

function open() {
  document.querySelector('.words-dialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.className = 'words-dialog'; dlg.setAttribute('aria-labelledby', 'words-title');
  const paint = () => {
    const n = Object.keys(words).length;
    const state = refused ? two('The last file was refused; nothing changed.', '上一個檔唔收；乜都冇改。') : n ? two(`Your wording is on: ${n} entries.`, `用緊你嘅用字：${n} 項。`) : two('No file loaded; built-in wording.', '未載入檔案；用緊內置用字。');
    const fault = FAULT[refused];
    dlg.innerHTML = `<h2 id="words-title">${two('Your own words', '自己嘅用字')}</h2>
      <p>${two('Upload a JSON file to change wording on this site, in this browser only. The file is checked whole first: if any part is wrong, nothing changes.', '上載 JSON 檔，改呢個網站嘅用字，只限呢個瀏覽器。成個檔會先驗晒：有一處唔啱，就乜都唔改。')}</p>
      <p class="words-state${refused ? ' bad' : ''}" role="status">${state}</p>
      ${fault ? `<p class="words-fault" role="alert">${two(`That file could not be used: ${fault[0]}`, `用唔到呢個檔：${fault[1]}`)}</p>` : ''}
      <div class="words-actions"><button type="button" class="words-up primary">${n ? two('Replace with another file…', '換過另一個檔…') : two('Upload words…', '上載用字…')}</button>
        <button type="button" class="words-template">${two('Download the template', '下載範本')}</button>
        ${n ? `<button type="button" class="words-reset">${two('Back to the built-in words', '還原內置用字')}</button>` : ''}
        <input type="file" accept=".json,application/json" hidden></div>
      <div class="words-end"><button type="button" class="words-close">${two('Close', '關閉')}</button></div>`;
    const file = dlg.querySelector<HTMLInputElement>('input[type=file]')!;
    dlg.querySelector('.words-up')!.addEventListener('click', () => file.click());
    dlg.querySelector('.words-close')!.addEventListener('click', () => dlg.close());
    dlg.querySelector('.words-reset')?.addEventListener('click', () => { use({}); refused = ''; paint(); });
    dlg.querySelector('.words-template')!.addEventListener('click', () => {
      const entries = { Guide: 'Guide', Downloads: 'Downloads', 指南: '指南', 下載: '下載' };
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, entries }, null, 2)], { type: 'application/json' })); a.download = 'map-editor-site-words.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    file.addEventListener('change', async () => {
      const f = file.files?.[0]; if (!f) return;
      try {
        if (f.size > VOCAB_LIMITS.bytes) throw new VocabError('size');
        const got = readVocabFile(await f.text(), new Set());
        if (got.kind !== 'words') throw new VocabError('shape');
        refused = ''; use(got.entries);
      } catch (err) { refused = err instanceof VocabError && FAULT[err.problem] ? err.problem : 'json'; } // the kind of fault only
      paint();
      dlg.querySelector<HTMLElement>('.words-up')?.focus();
    });
  };
  paint();
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

function start() {
  try { words = readWordsCache(localStorage.getItem(KEY)); } catch { words = {}; }
  reword = makeReplacer(words);
  if (Object.keys(words).length) walk(document.body);
  new MutationObserver((ms) => { if (!Object.keys(words).length) return; for (const m of ms) m.addedNodes.forEach(walk); }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-own-words]')) { e.preventDefault(); open(); } });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
