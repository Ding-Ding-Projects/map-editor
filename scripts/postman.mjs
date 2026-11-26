// Writes the master Postman collection from the routes the server actually answers, grouped by area,
// so the collection cannot drift from the code. Run: node scripts/postman.mjs  (add --check to verify only).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'postman', 'map-editor.postman_collection.json');

export function routes() {
  const src = readFileSync(path.join(root, 'src', 'server', 'server.ts'), 'utf8');
  const found = new Map();
  for (const m of src.matchAll(/p === '(\/api\/[^']+)'(?:[^\n]*?req\.method === '([A-Z]+)')?/g)) found.set(`${m[2] ?? 'GET'} ${m[1]}`, { method: m[2] ?? 'GET', path: m[1] });
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** The fields each state-changing route reads from its JSON body, taken from the server's own code. */
export function bodyFields() {
  const src = readFileSync(path.join(root, 'src', 'server', 'server.ts'), 'utf8');
  const marks = [...src.matchAll(/p === '(\/api\/[^']+)'(?:[^\n]*?req\.method === '([A-Z]+)')?/g)].map((m) => ({ i: m.index, key: `${m[2] ?? 'GET'} ${m[1]}` }));
  const out = new Map();
  marks.forEach((a, n) => {
    if (a.key.startsWith('GET') || out.has(a.key) && out.get(a.key).length) return;
    const seg = src.slice(a.i, marks[n + 1]?.i ?? src.length);
    const m = /const \{([^}]*)\} = await body\(req\)/.exec(seg);
    out.set(a.key, m ? m[1].split(',').map((f) => f.trim().split(':')[0].trim()).filter(Boolean) : []);
  });
  return out;
}

/** Routes that take a file as the raw body instead of JSON. */
export const UPLOADS = new Set(['POST /api/worlds/upload', 'POST /api/extensions/upload', 'POST /api/structure/place']);
/** Bodies written by hand where the server reads a whole object. */
const WHOLE = { 'POST /api/op': { op: 'fill', dimension: 'overworld', box: { x1: 0, y1: 64, z1: 0, x2: 7, y2: 64, z2: 7 }, block: 'minecraft:stone' } };
/**
 * An example value for every field name a route reads. Hand-written: a field the server starts reading
 * that is not listed here fails the test, so no request is published with a made-up placeholder.
 */
export const EXAMPLES = {
  name: 'Alex', password: 'correct horse battery', code: '123456', ticket: '<ticket from the options request>', response: {}, id: '<id from the list request>',
  model: 'llama3.2', prompt: 'How do I fill an area with stone?', kind: 'settings', message: 'Dark theme switched on', preset: 'classic', size: 4,
  paths: ['/srv/minecraft/worlds/Practice'], root: '/srv/minecraft/worlds', path: '/srv/minecraft/worlds/Practice', replace: false,
  url: 'https://example.com/extension.zip', sha256: '<sha256 of the file, 64 hex characters>', on: true, enabled: true, permissionKey: '<permissionKey from the extension list>',
  command: '<command id from the extension list>', selection: { x1: 0, y1: 64, z1: 0, x2: 7, y2: 64, z2: 7 }, sha: '<sha from the history list>',
};

export function bodyFor(key) {
  if (WHOLE[key]) return WHOLE[key];
  return Object.fromEntries((bodyFields().get(key) ?? []).map((f) => [f, EXAMPLES[f]]));
}

const AREAS = [['Sign-in and accounts', /^\/api\/(auth|passkeys|authenticator|me|health)/], ['Worlds', /^\/api\/worlds?/], ['Editing and views', /^\/api\/(op|undo|render|top|slice|volume|blocks|structure)/],
  ['History and activity', /^\/api\/(history|activity)/], ['Extensions', /^\/api\/extensions/], ['Tools', /^\/api\/(ollama|notes)/]];

export function collection() {
  const groups = new Map(AREAS.map(([name]) => [name, []])); groups.set('Other', []);
  for (const r of routes()) {
    const area = AREAS.find(([, re]) => re.test(r.path))?.[0] ?? 'Other';
    const item = { name: `${r.method} ${r.path}`, request: { method: r.method, header: r.method === 'GET' ? [] : [{ key: 'Content-Type', value: 'application/json' }], url: { raw: `{{baseUrl}}${r.path}`, host: ['{{baseUrl}}'], path: r.path.split('/').filter(Boolean) } } };
    const key = `${r.method} ${r.path}`;
    if (UPLOADS.has(key)) {
      item.request.header = [{ key: 'X-Map-Editor', value: '1' }];
      item.request.body = { mode: 'file', file: { src: '' } };
      item.request.description = 'Send the file itself as the request body (choose it under Body, binary). The X-Map-Editor header is required.';
    } else if (r.method !== 'GET') {
      const example = bodyFor(key); const fields = Object.keys(example);
      item.request.body = { mode: 'raw', raw: JSON.stringify(example, null, 2), options: { raw: { language: 'json' } } };
      item.request.description = fields.length ? `Reads: ${fields.join(', ')}. Values in angle brackets come from an earlier request.` : 'Takes no fields; send an empty JSON object.';
    }
    groups.get(area).push(item);
  }
  return {
    info: { name: 'Map Editor API', description: 'Every HTTP route the Map Editor server answers, grouped by area. Sign in first (POST /api/auth/login) so the session cookie is kept; state-changing requests must send JSON. Set baseUrl to your server, for example http://localhost:8420.', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    variable: [{ key: 'baseUrl', value: 'http://localhost:8420' }],
    item: [...groups].filter(([, items]) => items.length).map(([name, item]) => ({ name, item })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = JSON.stringify(collection(), null, 2) + '\n';
  if (process.argv.includes('--check')) { if (readFileSync(out, 'utf8') !== text) { console.error('docs/postman is out of date: run node scripts/postman.mjs'); process.exit(1); } console.log('Postman collection is current.'); }
  else { mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, text); console.log(`Wrote ${path.relative(root, out)} with ${routes().length} routes.`); }
}
