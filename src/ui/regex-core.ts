// Pure regex evaluation shared by the worker and the tests. Engine: the JavaScript RegExp of the
// browser or Electron runtime (ECMAScript), the same engine every search in the app uses.

export const LIMITS = { pattern: 512, sample: 10_000, texts: 5_000, textLength: 2_000, matches: 500, timeoutMs: 250 } as const;
export const FLAGS = ['i', 'm', 's', 'u'] as const;
export type Flag = typeof FLAGS[number];

export interface RegexRequest { pattern: string; flags: string; texts?: string[]; sample?: string }
export interface Match { index: number; text: string; groups: Array<string | undefined>; named: Record<string, string | undefined> }
export type RegexResult =
  | { status: 'ok'; hits?: boolean[]; matches?: Match[]; truncated: boolean; groupCount: number }
  | { status: 'invalid' | 'limit'; error: string };

export function cleanFlags(flags: string): string {
  return FLAGS.filter((f) => flags.includes(f)).join('');
}

export function evaluate(req: RegexRequest): RegexResult {
  if (req.pattern.length > LIMITS.pattern) return { status: 'limit', error: `Patterns are limited to ${LIMITS.pattern} characters.` };
  if ((req.sample?.length ?? 0) > LIMITS.sample) return { status: 'limit', error: `Sample text is limited to ${LIMITS.sample} characters.` };
  if ((req.texts?.length ?? 0) > LIMITS.texts) return { status: 'limit', error: `At most ${LIMITS.texts} items can be searched at once.` };
  const flags = cleanFlags(req.flags);
  let re: RegExp;
  try { re = new RegExp(req.pattern, flags); } catch (e) { return { status: 'invalid', error: (e as Error).message.replace(/^Invalid regular expression: /, '').replace(/^\/.*\/[a-z]*: /s, '') }; }
  const groupCount = new RegExp(`${req.pattern}|`, flags).exec('')!.length - 1;
  const hits = req.texts?.map((t) => { re.lastIndex = 0; return re.test(t.slice(0, LIMITS.textLength)); });
  let matches: Match[] | undefined;
  let truncated = false;
  if (req.sample !== undefined) {
    matches = [];
    const g = new RegExp(req.pattern, `${flags}g`);
    let m: RegExpExecArray | null;
    while ((m = g.exec(req.sample)) !== null) {
      if (matches.length >= LIMITS.matches) { truncated = true; break; }
      matches.push({ index: m.index, text: m[0], groups: m.slice(1), named: { ...(m.groups ?? {}) } });
      // A zero-width match would match again at the same place forever: step past it
      // (by a whole code point in Unicode mode).
      if (m[0] === '') g.lastIndex += flags.includes('u') && (req.sample.codePointAt(m.index) ?? 0) > 0xffff ? 2 : 1;
    }
  }
  return { status: 'ok', hits, matches, truncated, groupCount };
}

/** Plain-text search: case-insensitive "contains", the default for every search field. */
export function plainHits(query: string, texts: string[]): boolean[] {
  const q = query.trim().toLowerCase();
  return texts.map((t) => !q || t.toLowerCase().includes(q));
}
