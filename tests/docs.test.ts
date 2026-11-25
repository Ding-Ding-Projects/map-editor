import { describe, expect, it } from 'vitest';
import { ARTICLES, docTitle, pick } from '../src/ui/docs.js';
// @ts-expect-error plain module shared with the site build
import { features } from '../site/content.mjs';
import yue from '../site/content.yue.json' with { type: 'json' };

describe('in-app guide', () => {
  it('bundles every site article with its sections', () => {
    expect(ARTICLES.map((a) => a.slug)).toEqual((features as Array<{ slug: string }>).map((f) => f.slug));
    for (const a of ARTICLES) { expect(a.body.length).toBeGreaterThan(0); for (const [h, t] of a.body) { expect(h).toBeTruthy(); expect(t).toBeTruthy(); } }
  });
  it('has a Cantonese text for every article and section', () => {
    const y = yue as unknown as Record<string, { title: string; body: unknown[] }>;
    for (const a of ARTICLES) { expect(y[a.slug]?.title, a.slug).toBeTruthy(); expect(y[a.slug].body.length, a.slug).toBe(a.body.length); }
  });
  it('resolves every related link to a bundled article', () => {
    const slugs = new Set(ARTICLES.map((a) => a.slug));
    for (const a of ARTICLES) for (const r of a.related) expect(slugs.has(r), `${a.slug} -> ${r}`).toBe(true);
  });
  it('picks text by language', () => {
    expect(pick('en', 'a', 'b')).toEqual(['a']); expect(pick('yue', 'a', 'b')).toEqual(['b']); expect(pick('both', 'a', 'b')).toEqual(['a', 'b']); expect(pick('yue', 'a')).toEqual(['a']);
    expect(docTitle(ARTICLES[0], 'both')).toContain(' · ');
  });
});
