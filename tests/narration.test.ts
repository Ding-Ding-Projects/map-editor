import { describe, expect, it } from 'vitest';
import { spokenFor } from '../src/ui/narration.js';
import { setVocabulary, setWords, t } from '../src/ui/i18n.js';

describe('what is read aloud', () => {
  it('is the message as shown, so personal wording is spoken too', () => {
    const s = { lang: 'en' as const, funnyEn: 1, funnyYue: 1 };
    const plain = t(s, 'narrateSample');
    expect(spokenFor(plain, 'en', 10)).toEqual({ text: plain, lang: 'en', rate: 1 });
    setWords({ 'blocks changed': 'cubes swapped' });
    const own = t(s, 'narrateSample');
    expect(own).toContain('cubes swapped');
    expect(spokenFor(own, 'en', 10).text).toBe(own);
    setWords({});
    setVocabulary({ narrateSample: { en: 'All done here.' } });
    expect(spokenFor(t(s, 'narrateSample'), 'en', 10).text).toBe('All done here.');
    setVocabulary({});
    expect(spokenFor(t(s, 'narrateSample'), 'en', 10).text).toBe(plain);
  });
  it('picks the voice language from the language mode and keeps the speed in range', () => {
    expect(spokenFor('x', 'yue', 10).lang).toBe('zh-HK');
    expect(spokenFor('x', 'both', 10).lang).toBe('en');
    expect(spokenFor('x', 'en', 5).rate).toBe(0.5);
    expect(spokenFor('x', 'en', 99).rate).toBe(2);
    expect(spokenFor('x', 'en', 0).rate).toBe(1);
    expect(spokenFor('  two\n lines  ', 'en', 10).text).toBe('two lines');
    expect(spokenFor('y'.repeat(900), 'en', 10).text.length).toBe(600);
  });
});
