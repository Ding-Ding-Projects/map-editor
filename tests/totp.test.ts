import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Authenticator, base32, checkCode, fromBase32, totp } from '../src/server/totp.js';

describe('authenticator codes', () => {
  it('matches the RFC 6238 test vectors (SHA-1, 6 digits)', () => {
    const key = Buffer.from('12345678901234567890');
    expect(totp(key, 59)).toBe('287082');
    expect(totp(key, 1111111109)).toBe('081804');
    expect(totp(key, 2000000000)).toBe('279037');
    expect(fromBase32(base32(key))).toEqual(key);
  });
  it('allows one step of drift but never the same step twice', () => {
    const key = Buffer.from('12345678901234567890');
    const now = 1111111109;
    const step = checkCode(key, totp(key, now - 30), 0, now);
    expect(step).toBe(Math.floor(now / 30) - 1);
    expect(checkCode(key, totp(key, now - 30), step!, now)).toBeUndefined();
    expect(checkCode(key, '12345', 0, now)).toBeUndefined();
  });
  it('turns on only after a correct code, then guards sign-in and turning off', async () => {
    const a = new Authenticator(await mkdtemp(path.join(os.tmpdir(), 'me-totp-')));
    expect(await a.verify('000000')).toBe(true); // off: no code needed
    const { secret, uri } = await a.begin('Alex');
    expect(uri).toContain('otpauth://totp/Map%20Editor%3AAlex?secret=');
    await expect(a.confirm('000000')).rejects.toThrow(/does not match/);
    await a.confirm(totp(fromBase32(secret)));
    expect(await a.enabled()).toBe(true);
    expect(await a.verify('000000')).toBe(false);
    await expect(a.disable('000000')).rejects.toThrow(/stays on/);
    await a.disable(totp(fromBase32(secret), Date.now() / 1000 + 30));
    expect(await a.enabled()).toBe(false);
  });
});
