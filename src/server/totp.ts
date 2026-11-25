// Authenticator app codes (TOTP, RFC 6238: HMAC-SHA1, 30-second steps, 6 digits) as a second step after
// the password. Passkey sign-in already proves two things, so it does not ask for a code.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += ALPHA[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHA[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = ALPHA.indexOf(c);
    if (i < 0) throw new Error('Not a base32 secret');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** The 6-digit code for a secret at a time (seconds). */
export function totp(secret: Buffer, at = Date.now() / 1000, step = 30): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / step)));
  const h = createHmac('sha1', secret).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

/** Accept the code for now or one step either side (clock drift), never the same step twice. */
export function checkCode(secret: Buffer, code: string, lastStep: number, at = Date.now() / 1000): number | undefined {
  if (!/^\d{6}$/.test(code)) return undefined;
  for (const d of [0, -1, 1]) {
    const step = Math.floor(at / 30) + d;
    if (step <= lastStep) continue;
    const want = Buffer.from(totp(secret, step * 30)), got = Buffer.from(code);
    if (timingSafeEqual(want, got)) return step;
  }
  return undefined;
}

interface Stored { secret: string; enabled: boolean; lastStep: number; pending?: string }

export class Authenticator {
  constructor(private dir: string) {}
  private get file() { return path.join(this.dir, 'authenticator.json'); }
  private async read(): Promise<Stored | undefined> { try { return JSON.parse(await fs.readFile(this.file, 'utf8')); } catch { return undefined; } }
  private async write(s: Stored | undefined) {
    if (!s) { await fs.rm(this.file, { force: true }); return; }
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(`${this.file}.tmp`, JSON.stringify(s), { mode: 0o600 });
    await fs.rename(`${this.file}.tmp`, this.file);
  }

  async enabled() { return Boolean((await this.read())?.enabled); }

  /** Start setup: a new secret, kept pending until a code from the app confirms it. */
  async begin(account: string) {
    const cur = await this.read();
    const secret = base32(randomBytes(20));
    await this.write({ secret: cur?.secret ?? '', enabled: cur?.enabled ?? false, lastStep: cur?.lastStep ?? 0, pending: secret });
    const label = encodeURIComponent(`Map Editor:${account}`);
    return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=Map%20Editor&algorithm=SHA1&digits=6&period=30` };
  }

  async confirm(code: string) {
    const cur = await this.read();
    if (!cur?.pending) throw new Error('Start setting up the authenticator first.');
    const step = checkCode(fromBase32(cur.pending), code, 0);
    if (step === undefined) throw new Error('That code does not match. Check the time on the phone and try the newest code.');
    await this.write({ secret: cur.pending, enabled: true, lastStep: step });
  }

  /** Check a sign-in code; each code works once. */
  async verify(code: string): Promise<boolean> {
    const cur = await this.read();
    if (!cur?.enabled) return true;
    const step = checkCode(fromBase32(cur.secret), String(code ?? ''), cur.lastStep);
    if (step === undefined) return false;
    await this.write({ ...cur, lastStep: step });
    return true;
  }

  async disable(code: string) {
    if (!(await this.verify(code))) throw new Error('That code does not match, so the authenticator stays on.');
    await this.write(undefined);
  }
}
