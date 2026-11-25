// Passkeys (WebAuthn) for the owner account: added after signing in with the password, then usable
// to sign in instead of it. Browsers only offer passkeys on a secure origin (https, or localhost),
// so on a plain-http network address the password stays the way in.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server';

export interface StoredPasskey { id: string; publicKey: string; counter: number; transports?: string[]; name: string; created: string; lastUsed?: string }
export interface PasskeyInfo { id: string; name: string; created: string; lastUsed?: string }
export interface Origin { rpID: string; origin: string }

const CHALLENGE_MS = 5 * 60_000;
const MAX_KEYS = 20;

/** The relying party for a request: its host name and origin, from the Host header unless configured. */
export function originFor(host: string | undefined, secure: boolean, configured?: string): Origin {
  if (configured) { const u = new URL(configured); return { rpID: u.hostname, origin: u.origin }; }
  const h = (host ?? 'localhost').trim();
  if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-fA-F:]+\](:\d{1,5})?$/.test(h)) throw new Error('Unexpected Host header');
  const u = new URL(`${secure ? 'https' : 'http'}://${h}`);
  return { rpID: u.hostname.replace(/^\[|\]$/g, ''), origin: u.origin };
}

export class Passkeys {
  private pending = new Map<string, { challenge: string; kind: 'register' | 'login'; user?: string; expires: number; at: Origin }>();
  constructor(private dir: string) {}

  private get file() { return path.join(this.dir, 'passkeys.json'); }

  async all(): Promise<StoredPasskey[]> {
    try { return JSON.parse(await fs.readFile(this.file, 'utf8')); } catch { return []; }
  }

  private async save(list: StoredPasskey[]) {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.file);
  }

  async list(): Promise<PasskeyInfo[]> {
    return (await this.all()).map(({ id, name, created, lastUsed }) => ({ id, name, created, lastUsed }));
  }

  private remember(kind: 'register' | 'login', challenge: string, at: Origin, user?: string) {
    const now = Date.now();
    for (const [k, v] of this.pending) if (v.expires < now) this.pending.delete(k);
    const ticket = randomBytes(18).toString('base64url');
    this.pending.set(ticket, { challenge, kind, user, at, expires: now + CHALLENGE_MS });
    return ticket;
  }

  private take(ticket: string, kind: 'register' | 'login') {
    const p = this.pending.get(ticket);
    this.pending.delete(ticket); // a ticket works once
    if (!p || p.kind !== kind || p.expires < Date.now()) throw new Error('That passkey request has expired. Try again.');
    return p;
  }

  async registrationOptions(user: string, at: Origin) {
    const existing = await this.all();
    if (existing.length >= MAX_KEYS) throw new Error(`An account can have up to ${MAX_KEYS} passkeys.`);
    const options = await generateRegistrationOptions({
      rpName: 'Map Editor', rpID: at.rpID, userName: user, userDisplayName: user, attestationType: 'none',
      excludeCredentials: existing.map((k) => ({ id: k.id, transports: k.transports })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    return { options, ticket: this.remember('register', options.challenge, at, user) };
  }

  async register(user: string, ticket: string, response: RegistrationResponseJSON, name: string): Promise<PasskeyInfo> {
    const p = this.take(ticket, 'register');
    if (p.user !== user) throw new Error('That passkey request belongs to another sign-in.');
    const v = await verifyRegistrationResponse({ response, expectedChallenge: p.challenge, expectedOrigin: p.at.origin, expectedRPID: p.at.rpID, requireUserVerification: false });
    if (!v.verified) throw new Error('The passkey could not be verified.');
    const c = v.registrationInfo.credential;
    const list = await this.all();
    if (list.some((k) => k.id === c.id)) throw new Error('That passkey is already added.');
    const key: StoredPasskey = { id: c.id, publicKey: Buffer.from(c.publicKey).toString('base64url'), counter: c.counter, transports: c.transports, name: name.trim().slice(0, 60) || 'Passkey', created: new Date().toISOString() };
    await this.save([...list, key]);
    return { id: key.id, name: key.name, created: key.created };
  }

  async loginOptions(at: Origin) {
    const list = await this.all();
    if (!list.length) throw new Error('No passkeys have been added yet. Sign in with the password.');
    const options = await generateAuthenticationOptions({ rpID: at.rpID, allowCredentials: list.map((k) => ({ id: k.id, transports: k.transports as never })), userVerification: 'preferred' });
    return { options, ticket: this.remember('login', options.challenge, at) };
  }

  /** Verify a sign-in; returns the passkey used. The signature counter must move forward when the authenticator keeps one. */
  async login(ticket: string, response: AuthenticationResponseJSON): Promise<PasskeyInfo> {
    const p = this.take(ticket, 'login');
    const list = await this.all();
    const key = list.find((k) => k.id === response.id);
    if (!key) throw new Error('That passkey is not added to this Map Editor.');
    const v = await verifyAuthenticationResponse({
      response, expectedChallenge: p.challenge, expectedOrigin: p.at.origin, expectedRPID: p.at.rpID, requireUserVerification: false,
      credential: { id: key.id, publicKey: Buffer.from(key.publicKey, 'base64url'), counter: key.counter, transports: key.transports },
    });
    if (!v.verified) throw new Error('The passkey could not be verified.');
    key.counter = v.authenticationInfo.newCounter;
    key.lastUsed = new Date().toISOString();
    await this.save(list);
    return { id: key.id, name: key.name, created: key.created, lastUsed: key.lastUsed };
  }

  async remove(id: string) {
    const list = await this.all();
    const next = list.filter((k) => k.id !== id);
    if (next.length === list.length) throw new Error('No such passkey.');
    await this.save(next);
  }

  async rename(id: string, name: string) {
    const list = await this.all();
    const key = list.find((k) => k.id === id);
    if (!key) throw new Error('No such passkey.');
    key.name = name.trim().slice(0, 60) || key.name;
    await this.save(list);
  }
}
