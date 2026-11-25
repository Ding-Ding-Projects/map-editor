import { describe, expect, it } from 'vitest';
import { exportRows } from '../src/ui/exporter.js';

const rows = [{ time: '2026-11-25T10:00:00Z', message: 'Fill 8×1×8, with "glass"', who: '=HYPERLINK("x")' }, { time: 't2', message: 'a|b\nc', who: 'Alex' }];
const cols = ['time', 'message', 'who'];

describe('exports', () => {
  it('writes CSV with quoting and neutralised formulas', () => {
    const { body, ext } = exportRows(rows, cols, 'csv', 'T');
    expect(ext).toBe('csv');
    expect(body.split('\r\n')[0]).toBe('time,message,who');
    expect(body).toContain('"Fill 8×1×8, with ""glass"""');
    expect(body).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it('writes JSON, Markdown and HTML', () => {
    expect(JSON.parse(exportRows(rows, cols, 'json', 'T').body)[1].who).toBe('Alex');
    expect(exportRows(rows, cols, 'md', 'T').body).toContain('| t2 | a\\|b c | Alex |');
    const html = exportRows(rows, cols, 'html', 'T & U').body;
    expect(html).toContain('<title>T &amp; U</title>');
    expect(html).toContain('&quot;glass&quot;');
  });
});
