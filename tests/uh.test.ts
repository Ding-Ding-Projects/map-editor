import { describe, it, expect } from 'vitest';
import { qrMatrix, qrSvg, otpauthParts, vocabHeadline } from '../src/ui/uh.js';

describe('authenticator pairing QR', () => {
  const uri = 'otpauth://totp/Map%20Editor:Alex?secret=JBSWY3DPEHPK3PXP&issuer=Map%20Editor&algorithm=SHA1&digits=6&period=30';
  it('draws a real QR symbol: square, with the three finder patterns', () => {
    const m = qrMatrix(uri); const n = m.length;
    expect(n).toBeGreaterThanOrEqual(21); expect((n - 17) % 4).toBe(0); expect(m.every((r) => r.length === n)).toBe(true);
    const finder = (r0: number, c0: number) => { for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) { const want = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4); if (m[r0 + r][c0 + c] !== want) return false; } return true; };
    expect(finder(0, 0) && finder(0, n - 7) && finder(n - 7, 0)).toBe(true);
  });
  it('is black on white with a four-module quiet zone, and never shows the secret as text', () => {
    const svg = qrSvg(uri, 'QR code'); const n = qrMatrix(uri).length;
    expect(svg).toContain(`viewBox="0 0 ${n + 8} ${n + 8}"`); expect(svg).toContain('fill="#fff"'); expect(svg).toContain('fill="#000"');
    expect(svg).not.toContain('JBSWY3DPEHPK3PXP'); expect(svg).toContain('aria-label="QR code"');
    expect(svg).not.toMatch(/M[0-3] |M\d+ [0-3]h/); // nothing drawn inside the quiet zone
  });
  it('reads the parameters shown beside the code from the same link', () => {
    expect(otpauthParts(uri)).toEqual({ secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: '6', period: '30', issuer: 'Map Editor', account: 'Alex' });
  });
});

describe('dropped vocabulary headline', () => {
  it('uses the name inside the file and nothing else from it', () => {
    expect(vocabHeadline({ $name: 'Club words', open: 'Launch' }, 'Personal wording applied')).toBe('Club words');
    expect(vocabHeadline({ name: '  Mine ' }, 'x')).toBe('Mine');
    expect(vocabHeadline({ open: 'Launch' }, 'Personal wording applied')).toBe('Personal wording applied');
    expect(vocabHeadline({ name: 'a'.repeat(61) }, 'neutral')).toBe('neutral');
    expect(vocabHeadline(null, 'neutral')).toBe('neutral');
  });
});
