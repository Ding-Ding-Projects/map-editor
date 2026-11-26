// What is read aloud for a message: exactly the words shown, in the voice language of the chosen
// language mode, at the chosen speed. Kept apart from the speech engine so it can be checked.
export interface Spoken { text: string; lang: 'en' | 'zh-HK'; rate: number }

/** The words, language and speed for one message. `rate10` is the setting, ten times the speed. */
export function spokenFor(text: string, lang: 'en' | 'yue' | 'both', rate10: number): Spoken {
  const rate = Math.min(2, Math.max(0.5, (Number(rate10) || 10) / 10));
  return { text: String(text).replace(/\s+/g, ' ').trim().slice(0, 600), lang: lang === 'yue' ? 'zh-HK' : 'en', rate };
}
