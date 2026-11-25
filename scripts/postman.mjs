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

const AREAS = [['Sign-in and accounts', /^\/api\/(auth|passkeys|authenticator|me|health)/], ['Worlds', /^\/api\/worlds?/], ['Editing and views', /^\/api\/(op|undo|render|top|slice|volume|blocks|structure)/],
  ['History and activity', /^\/api\/(history|activity)/], ['Extensions', /^\/api\/extensions/], ['Tools', /^\/api\/(ollama|notes)/]];

export function collection() {
  const groups = new Map(AREAS.map(([name]) => [name, []])); groups.set('Other', []);
  for (const r of routes()) {
    const area = AREAS.find(([, re]) => re.test(r.path))?.[0] ?? 'Other';
    const item = { name: `${r.method} ${r.path}`, request: { method: r.method, header: r.method === 'GET' ? [] : [{ key: 'Content-Type', value: 'application/json' }], url: { raw: `{{baseUrl}}${r.path}`, host: ['{{baseUrl}}'], path: r.path.split('/').filter(Boolean) } } };
    if (r.method !== 'GET') item.request.body = { mode: 'raw', raw: '{}' };
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
