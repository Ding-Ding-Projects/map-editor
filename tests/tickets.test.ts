import { describe, expect, it } from 'vitest';
import { contextLines, issueUrl, ISSUES_URL, ticketText, type Ticket } from '../src/ui/tickets.js';

const t: Ticket = { id: 'a', time: '2026-11-25T10:00:00.000Z', title: 'Fill stops & "hangs"', details: 'Ran Fill on a big box.\nIt never finished.',
  context: { version: '0.1.144', commit: '1b563b896b767965d4eb8c7494aa588d29cc414c', codeName: 'Har Gow', language: 'en', screen: 'editor', window: '1440 × 900', browser: 'Chrome 140', world: 'java' } };

describe('support tickets', () => {
  it('attaches only the listed facts', () => {
    expect(contextLines(t.context).map(([k]) => k)).toEqual(['Version', 'Build', 'Code name', 'Language', 'Screen', 'Window', 'Browser', 'World edition']);
    expect(contextLines({ ...t.context, codeName: undefined, world: undefined }).map(([k]) => k)).toEqual(['Version', 'Build', 'Language', 'Screen', 'Window', 'Browser']);
    expect(contextLines(t.context).find(([k]) => k === 'Build')![1]).toBe('1b563b896b76');
  });
  it('writes the ticket as Markdown', () => {
    const text = ticketText(t);
    expect(text).toContain('### What happened\n\nRan Fill on a big box.\nIt never finished.'); expect(text).toContain('- Version: 0.1.144'); expect(text).toContain('Written 2026-11-25T10:00:00.000Z');
    expect(ticketText({ ...t, details: '  ' })).toContain('(not filled in)');
  });
  it('builds a new-issue link on the project page with everything encoded, and cuts long text', () => {
    const u = new URL(issueUrl(t));
    expect(`${u.origin}${u.pathname}`).toBe(ISSUES_URL); expect(u.searchParams.get('title')).toBe('Fill stops & "hangs"'); expect(u.searchParams.get('body')).toBe(ticketText(t));
    const long = issueUrl({ ...t, details: 'x'.repeat(9000) });
    expect(new URL(long).searchParams.get('body')!.endsWith('(cut here: paste the rest from the copied ticket)')).toBe(true); expect(long.length).toBeLessThan(6500);
  });
});

describe('exporting saved reports', () => {
  it('writes one Markdown file with every report and its facts, newest first', async () => {
    const { ticketsMarkdown } = await import('../src/ui/tickets.js');
    const ctx = { version: '0.1.178', commit: 'abc1234', language: 'en', screen: 'worlds', window: '1440 × 900', browser: 'Chrome 140' };
    const md = ticketsMarkdown([
      { id: 'b', time: '2026-11-26T06:00:00.000Z', title: 'Second\nreport', details: 'It froze.', context: ctx },
      { id: 'a', time: '2026-11-25T06:00:00.000Z', title: 'First report', details: '', context: ctx },
    ], 'Saved reports');
    expect(md.startsWith('# Saved reports\n\n## Second report\n\n2026-11-26T06:00:00.000Z')).toBe(true);
    expect(md.indexOf('## Second report')).toBeLessThan(md.indexOf('## First report'));
    expect(md).toContain('It froze.');
    expect(md).toContain('0.1.178');
    expect(md.split('\n---\n').length).toBe(2);
  });
});
