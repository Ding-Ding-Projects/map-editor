// Sample Map Editor extension. "node" in manifest.json runs the Node.js that runs Map Editor.
let input = '';
process.stdin.on('data', (d) => {
  input += d;
  const nl = input.indexOf('\n');
  if (nl < 0) return;
  const req = JSON.parse(input.slice(0, nl));
  process.stdout.write(`${JSON.stringify({ type: 'result', message: `Hello, ${req.world?.name ?? 'world'}! You ran ${req.command}.` })}\n`);
  process.exit(0);
});
