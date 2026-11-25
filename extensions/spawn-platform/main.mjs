// Built-in Map Editor extension. Reads one JSON request line, answers one JSON line.
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin });
rl.once('line', (line) => {
  const req = JSON.parse(line);
  const s = req.world?.spawn;
  if (!s) { reply({ type: 'result', message: 'This world has no spawn point recorded, so nothing was built.' }); return; }
  const y = s.y - 1;
  reply({
    type: 'result',
    message: `Built a 9 by 9 stone brick platform at y ${y} under spawn (${s.x}, ${s.z}).`,
    ops: [{ op: 'fill', dimension: 'overworld', box: { x1: s.x - 4, y1: y, z1: s.z - 4, x2: s.x + 4, y2: y, z2: s.z + 4 }, block: 'minecraft:stone_bricks' }],
  });
});
function reply(obj) { process.stdout.write(`${JSON.stringify(obj)}\n`); rl.close(); }
