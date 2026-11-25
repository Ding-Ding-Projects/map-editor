// Built-in Map Editor extension: read-only, never changes the world.
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin });
rl.once('line', (line) => {
  const { selection, world } = JSON.parse(line);
  if (!selection) { reply('Select an area first.'); return; }
  const b = selection.box;
  const dx = Math.abs(b.x2 - b.x1) + 1, dy = Math.abs(b.y2 - b.y1) + 1, dz = Math.abs(b.z2 - b.z1) + 1;
  const low = Math.min(b.y1, b.y2), high = Math.max(b.y1, b.y2);
  const notes = [];
  if (low < -64 || high > 319) notes.push('part of it is outside the build height (-64 to 319)');
  reply(`${dx} × ${dy} × ${dz} = ${(dx * dy * dz).toLocaleString('en')} blocks in the ${selection.dimension} of ${world?.name ?? 'this world'}, from y ${low} to ${high}${notes.length ? `; ${notes.join('; ')}` : ''}.`);
});
function reply(message) { process.stdout.write(`${JSON.stringify({ type: 'result', message })}\n`); rl.close(); }
