import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Passkeys, originFor } from '../src/server/passkeys.js';

describe('passkeys', () => {
  it('derives the relying party from the Host header or a configured origin', () => {
    expect(originFor('localhost:8420', false)).toEqual({ rpID: 'localhost', origin: 'http://localhost:8420' });
    expect(originFor('editor.example.com', true)).toEqual({ rpID: 'editor.example.com', origin: 'https://editor.example.com' });
    expect(originFor('anything', false, 'https://maps.example.org')).toEqual({ rpID: 'maps.example.org', origin: 'https://maps.example.org' });
    expect(() => originFor('evil.com/x?', false)).toThrow(/Host/);
  });
  it('offers registration, refuses sign-in without passkeys, and uses each ticket once', async () => {
    const pk = new Passkeys(await mkdtemp(path.join(os.tmpdir(), 'me-pk-')));
    const at = originFor('localhost:8420', false);
    const { options, ticket } = await pk.registrationOptions('Alex', at);
    expect(options.rp).toEqual({ name: 'Map Editor', id: 'localhost' });
    expect(options.user.name).toBe('Alex');
    await expect(pk.loginOptions(at)).rejects.toThrow(/No passkeys/);
    const bogus = { id: 'x', rawId: 'x', type: 'public-key', response: { clientDataJSON: 'e30', attestationObject: 'e30' }, clientExtensionResults: {} } as never;
    await expect(pk.register('Sam', ticket, bogus, 'Laptop')).rejects.toThrow(/another sign-in/);
    await expect(pk.register('Alex', ticket, bogus, 'Laptop')).rejects.toThrow(/expired/); // already used
    const second = await pk.registrationOptions('Alex', at);
    await expect(pk.register('Alex', second.ticket, bogus, 'Laptop')).rejects.toThrow();
    expect(await pk.list()).toEqual([]);
    await expect(pk.remove('nope')).rejects.toThrow(/No such passkey/);
  });
});
