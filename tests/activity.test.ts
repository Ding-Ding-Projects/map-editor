import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ActivityLog } from '../src/server/activity.js';

describe('activity record', () => {
  it('appends events as commits, newest first, cleaned to one line', async () => {
    const log = new ActivityLog(await mkdtemp(path.join(os.tmpdir(), 'me-act-')));
    expect(await log.list()).toEqual([]);
    await Promise.all([log.record('account', 'Alex', 'Signed in'), log.record('settings', 'Alex', 'Dark theme on\nand more')]);
    await log.record('world', 'Alex', 'Created flat world Test');
    const events = await log.list();
    expect(events.map((e) => [e.kind, e.message])).toEqual([['world', 'Created flat world Test'], ['settings', 'Dark theme on and more'], ['account', 'Signed in']]);
    expect(new Set(events.map((e) => e.sha)).size).toBe(3);
    expect(events.every((e) => /^[0-9a-f]{40}$/.test(e.sha!))).toBe(true);
    await expect(log.record('settings', 'Alex', '   ')).rejects.toThrow(/message/);
    await expect(log.record('nope' as never, 'Alex', 'x')).rejects.toThrow(/kind/);
  });
});
