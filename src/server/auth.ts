// Accounts: the first person to register becomes the owner, decided by one atomic
// exclusive file create, so two simultaneous first visitors can never both win.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface User { name: string; role: 'owner' | 'member'; salt: string; hash: string; created: string }

export class Accounts {
  private sessions = new Map<string, { name: string; expires: number }>();
  constructor(private dir: string) {}

  private get ownerFile() { return path.join(this.dir, 'owner.json'); }

  async hasOwner() {
    try { await fs.access(this.ownerFile); return true; } catch { return false; }
  }

  static validate(name: string, password: string) {
    if (!/^[\p{L}\p{N} _.-]{1,40}$/u.test(name)) return 'Display name must be 1 to 40 letters, numbers, spaces, dots, dashes or underscores.';
    if (password.length < 10) return 'Password must be at least 10 characters.';
    if (password.length > 512) return 'Password is too long.';
    return undefined;
  }

  /** Returns 'created' for the winner, 'taken' when an owner already exists. */
  async registerOwner(name: string, password: string): Promise<'created' | 'taken'> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt, 64);
    const user: User = { name, role: 'owner', salt: salt.toString('base64'), hash: hash.toString('base64'), created: new Date().toISOString() };
    try {
      const fh = await fs.open(this.ownerFile, 'wx', 0o600); // atomic: fails if the file exists
      await fh.writeFile(JSON.stringify(user, null, 2));
      await fh.close();
      return 'created';
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') return 'taken';
      throw e;
    }
  }

  async verify(name: string, password: string): Promise<boolean> {
    let user: User;
    try { user = JSON.parse(await fs.readFile(this.ownerFile, 'utf8')); } catch { return false; }
    const hash = await scrypt(password, Buffer.from(user.salt, 'base64'), 64);
    const want = Buffer.from(user.hash, 'base64');
    return user.name === name && hash.length === want.length && timingSafeEqual(hash, want);
  }

  async owner(): Promise<Pick<User, 'name' | 'role'> | undefined> {
    try { const u: User = JSON.parse(await fs.readFile(this.ownerFile, 'utf8')); return { name: u.name, role: u.role }; } catch { return undefined; }
  }

  startSession(name: string) {
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(token, { name, expires: Date.now() + 1000 * 60 * 60 * 24 * 14 });
    return token;
  }
  session(token: string | undefined) {
    if (!token) return undefined;
    const s = this.sessions.get(token);
    if (!s || s.expires < Date.now()) { if (s) this.sessions.delete(token); return undefined; }
    return s;
  }
  endSession(token: string | undefined) { if (token) this.sessions.delete(token); }
}
