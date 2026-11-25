// Tools screen: small converters that run entirely in this page. Nothing is uploaded or saved.
//  - Base64: text or a file to Base64 and back.
//  - JSON to TypeScript: types for a JSON sample (the kind of job quicktype does).
//  - Coordinates: block, chunk, region file and Nether/Overworld positions.

import { readNbt, TagType, type Tag } from '../core/nbt.js';

export type ToolsText = (k: string, v?: Record<string, string | number>) => string;

/** Base64 for any Unicode text (btoa only takes Latin-1). */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function fromBase64(b64: string): string {
  const clean = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('That is not Base64.');
  const bin = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, '='));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const pascal = (s: string) => (s.replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toUpperCase()) || 'Item').replace(/^(\d)/, '_$1');

/** TypeScript interfaces for a JSON value. Arrays merge their items; keys missing from some items become optional. */
export function jsonToTypeScript(json: string, rootName = 'Root'): string {
  const value = JSON.parse(json) as unknown;
  const out: string[] = [];
  const names = new Set<string>();
  const unique = (base: string) => { let n = base, i = 2; while (names.has(n)) n = `${base}${i++}`; names.add(n); return n; };
  const typeOf = (v: unknown, hint: string): string => {
    if (v === null) return 'null';
    if (Array.isArray(v)) {
      if (!v.length) return 'unknown[]';
      if (v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) return `${objectType(v as Record<string, unknown>[], hint)}[]`;
      const kinds = [...new Set(v.map((x) => typeOf(x, hint)))];
      return kinds.length === 1 ? `${kinds[0]}[]` : `(${kinds.join(' | ')})[]`;
    }
    if (typeof v === 'object') return objectType([v as Record<string, unknown>], hint);
    return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? typeof v : 'unknown';
  };
  const objectType = (items: Record<string, unknown>[], hint: string): string => {
    const name = unique(pascal(hint));
    const keys = [...new Set(items.flatMap((o) => Object.keys(o)))];
    const lines = keys.map((k) => {
      const present = items.filter((o) => k in o);
      const kinds = [...new Set(present.map((o) => typeOf(o[k], k.endsWith('s') && k.length > 3 ? k.slice(0, -1) : k)))];
      const optional = present.length < items.length ? '?' : '';
      return `  ${IDENT.test(k) ? k : JSON.stringify(k)}${optional}: ${kinds.join(' | ')};`;
    });
    out.unshift(`export interface ${name} {\n${lines.join('\n')}\n}`);
    return name;
  };
  const top = typeOf(value, rootName);
  if (!value || typeof value !== 'object' || Array.isArray(value)) out.push(`export type ${pascal(rootName)} = ${top};`);
  return out.join('\n\n') + '\n';
}

/** NBT (as in level.dat or .nbt structure files) to plain JSON, keeping number kinds readable. */
export function nbtToJson(tag: Tag): unknown {
  switch (tag.type) {
    case TagType.Compound: return Object.fromEntries([...tag.value].map(([k, v]) => [k, nbtToJson(v)]));
    case TagType.List: return tag.value.map(nbtToJson);
    case TagType.Long: return `${tag.value}L`;
    case TagType.ByteArray: case TagType.IntArray: return Array.from(tag.value as ArrayLike<number>);
    case TagType.LongArray: return Array.from(tag.value as BigInt64Array, (v) => `${v}L`);
    default: return tag.value;
  }
}

/** Read an NBT file, gzip-compressed or not, as the browser receives it. */
export async function readNbtFile(bytes: Uint8Array): Promise<unknown> {
  let raw = bytes;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const ds = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'));
    raw = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  const root = readNbt(raw);
  return nbtToJson(root.tag);
}

/** Block, chunk, region and dimension-scaled positions for one x, z. */
export function coordinates(x: number, z: number) {
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  return {
    chunk: [cx, cz] as const,
    inChunk: [((x % 16) + 16) % 16, ((z % 16) + 16) % 16] as const,
    region: `r.${Math.floor(cx / 32)}.${Math.floor(cz / 32)}.mca`,
    nether: [Math.floor(x / 8), Math.floor(z / 8)] as const,
    overworldFromNether: [x * 8, z * 8] as const,
  };
}

export function toolsView(view: HTMLElement, t: ToolsText, esc: (s: unknown) => string, notify: (text: string, error?: boolean) => void) {
  view.innerHTML = `<div class="tools-grid">
    <section class="card tool-card" aria-labelledby="tb64"><h2 id="tb64">${esc(t('toolBase64'))}</h2><p class="muted">${esc(t('toolBase64Note'))}</p>
      <label class="tool-field">${esc(t('toolInput'))}<textarea id="b64-in" rows="5" spellcheck="false"></textarea></label>
      <div class="row-actions"><md-filled-tonal-button id="b64-enc">${esc(t('toolEncode'))}</md-filled-tonal-button><md-outlined-button id="b64-dec">${esc(t('toolDecode'))}</md-outlined-button>
        <md-outlined-button id="b64-file">${esc(t('toolFile'))}</md-outlined-button><input type="file" id="b64-file-in" hidden></div>
      <label class="tool-field">${esc(t('toolOutput'))}<textarea id="b64-out" rows="5" readonly spellcheck="false"></textarea></label>
      <div class="row-actions"><md-text-button data-copy="b64-out">${esc(t('toolCopy'))}</md-text-button></div></section>
    <section class="card tool-card" aria-labelledby="tts"><h2 id="tts">${esc(t('toolTypes'))}</h2><p class="muted">${esc(t('toolTypesNote'))}</p>
      <label class="tool-field">${esc(t('toolJson'))}<textarea id="ts-in" rows="7" spellcheck="false">{ "name": "Survival", "spawn": { "x": 0, "y": 64, "z": 0 }, "players": [{ "name": "Alex", "op": true }, { "name": "Sam" }] }</textarea></label>
      <md-outlined-text-field id="ts-name" label="${esc(t('toolTypeName'))}" value="World"></md-outlined-text-field>
      <div class="row-actions"><md-filled-tonal-button id="ts-go">${esc(t('toolMakeTypes'))}</md-filled-tonal-button><md-text-button data-copy="ts-out">${esc(t('toolCopy'))}</md-text-button></div>
      <pre class="tool-pre" id="ts-out" aria-live="polite"></pre></section>
    <section class="card tool-card" aria-labelledby="tcv"><h2 id="tcv">${esc(t('toolConvert'))}</h2><p class="muted">${esc(t('toolConvertNote'))}</p>
      <div class="row-actions"><md-outlined-button id="cv-pick">${esc(t('toolConvertPick'))}</md-outlined-button><input type="file" id="cv-file" hidden>
        <label class="tool-inline">${esc(t('toolConvertTo'))} <select id="cv-to"><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option><option value="json">JSON (NBT)</option></select></label></div>
      <p class="muted" id="cv-info" aria-live="polite"></p><pre class="tool-pre" id="cv-out" hidden></pre>
      <div class="row-actions"><md-text-button id="cv-save" disabled>${esc(t('toolConvertSave'))}</md-text-button></div></section>
    <section class="card tool-card" aria-labelledby="tco"><h2 id="tco">${esc(t('toolCoords'))}</h2><p class="muted">${esc(t('toolCoordsNote'))}</p>
      <div class="row-actions"><md-outlined-text-field id="co-x" type="number" label="x" value="1234"></md-outlined-text-field><md-outlined-text-field id="co-z" type="number" label="z" value="-567"></md-outlined-text-field></div>
      <dl class="tool-dl" id="co-out" aria-live="polite"></dl></section>
  </div>`;
  const $ = <T extends HTMLElement>(id: string) => view.querySelector<T>(`#${id}`)!;
  const b64in = $<HTMLTextAreaElement>('b64-in'), b64out = $<HTMLTextAreaElement>('b64-out');
  $('b64-enc').addEventListener('click', () => { b64out.value = toBase64(b64in.value); });
  $('b64-dec').addEventListener('click', () => { try { b64out.value = fromBase64(b64in.value); } catch (e) { notify(t('toolBadBase64', { e: (e as Error).message }), true); } });
  const fileIn = $<HTMLInputElement>('b64-file-in');
  $('b64-file').addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files?.[0]; fileIn.value = ''; if (!f) return;
    if (f.size > 20 * 1024 * 1024) { notify(t('toolTooBig'), true); return; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    b64out.value = btoa(bin);
    notify(t('toolFileDone', { name: f.name, n: bytes.length.toLocaleString('en') }));
  });
  const tsGo = () => {
    try { $('ts-out').textContent = jsonToTypeScript($<HTMLTextAreaElement>('ts-in').value, ($<HTMLInputElement>('ts-name').value || 'Root').trim()); }
    catch (e) { $('ts-out').textContent = t('toolBadJson', { e: (e as Error).message }); }
  };
  $('ts-go').addEventListener('click', tsGo);
  tsGo();
  const co = () => {
    const x = Math.trunc(Number($<HTMLInputElement>('co-x').value) || 0), z = Math.trunc(Number($<HTMLInputElement>('co-z').value) || 0);
    const c = coordinates(x, z);
    $('co-out').innerHTML = [[t('toolChunk'), `${c.chunk[0]}, ${c.chunk[1]}`], [t('toolInChunk'), `${c.inChunk[0]}, ${c.inChunk[1]}`], [t('toolRegion'), c.region], [t('toolNether'), `${c.nether[0]}, ${c.nether[1]}`], [t('toolFromNether'), `${c.overworldFromNether[0]}, ${c.overworldFromNether[1]}`]]
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd><code>${esc(v)}</code></dd>`).join('');
  };
  $('co-x').addEventListener('input', co); $('co-z').addEventListener('input', co); co();
  // Converter: pictures between PNG, JPEG and WebP through a canvas; NBT files (level.dat, .nbt, .dat) to JSON.
  const cvIn = $<HTMLInputElement>('cv-file'), cvOut = $<HTMLPreElement>('cv-out'), cvInfo = $('cv-info'), cvSave = $<HTMLElement & { disabled: boolean }>('cv-save');
  let result: { blob: Blob; name: string } | undefined;
  $('cv-pick').addEventListener('click', () => cvIn.click());
  cvIn.addEventListener('change', async () => {
    const f = cvIn.files?.[0]; cvIn.value = ''; if (!f) return;
    result = undefined; cvSave.disabled = true; cvOut.hidden = true;
    const to = $<HTMLSelectElement>('cv-to').value;
    const base = f.name.replace(/\.[^.]+$/, '');
    try {
      if (f.size > 50 * 1024 * 1024) throw new Error(t('toolTooBig'));
      if (to === 'json') {
        const json = JSON.stringify(await readNbtFile(new Uint8Array(await f.arrayBuffer())), null, 2);
        cvOut.textContent = json.length > 200_000 ? `${json.slice(0, 200_000)}\n…` : json; cvOut.hidden = false;
        result = { blob: new Blob([json], { type: 'application/json' }), name: `${base}.json` };
      } else {
        const bmp = await createImageBitmap(f);
        const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext('2d')!;
        if (to === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); } // JPEG has no transparency
        ctx.drawImage(bmp, 0, 0);
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, to, 0.92));
        if (!blob) throw new Error(t('toolConvertUnsupported'));
        result = { blob, name: `${base}.${to.split('/')[1].replace('jpeg', 'jpg')}` };
      }
      cvInfo.textContent = t('toolConvertDone', { from: f.name, to: result.name, n: result.blob.size.toLocaleString('en') });
      cvSave.disabled = false;
    } catch (e) { cvInfo.textContent = t('toolConvertFail', { e: (e as Error).message }); }
  });
  cvSave.addEventListener('click', () => {
    if (!result) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(result.blob); a.download = result.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  view.querySelectorAll<HTMLElement>('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const el = $(b.dataset.copy!) as HTMLTextAreaElement | HTMLElement;
    navigator.clipboard?.writeText('value' in el ? (el as HTMLTextAreaElement).value : el.textContent ?? '').then(() => notify(t('copied')), () => notify(t('toolCopyFail'), true));
  }));
}
