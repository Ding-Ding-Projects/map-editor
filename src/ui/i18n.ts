// English, Hong Kong Cantonese and bilingual copy. Funny level 1 (serious) to 5 (playful)
// changes tone only; every number and fact is passed in and printed identically.
export type Lang = 'en' | 'yue' | 'both';

type Entry = { en: string; yue: string; en5?: string; yue5?: string };

const S = {
  appName: { en: 'Map Editor', yue: '地圖編輯器' },
  version: { en: 'Version {v} · updated {t}', yue: '版本 {v} · 更新於 {t}' },
  provenanceMissing: { en: 'Version details unavailable for this build', yue: '呢個版本冇提供版本資料' },
  signIn: { en: 'Sign in', yue: '登入' },
  createOwner: { en: 'Create the owner account', yue: '建立擁有者帳戶' },
  ownerNote: { en: 'You are the first person here, so you become the owner.', yue: '你係第一位到嘅人，所以你會成為擁有者。' },
  displayName: { en: 'Display name', yue: '顯示名稱' },
  password: { en: 'Password (10 or more characters)', yue: '密碼（最少 10 個字元）' },
  worlds: { en: 'Worlds', yue: '世界' },
  editor: { en: 'Editor', yue: '編輯器' },
  history: { en: 'History', yue: '歷史' },
  settings: { en: 'Settings', yue: '設定' },
  about: { en: 'About', yue: '關於' },
  open: { en: 'Open', yue: '打開' },
  close: { en: 'Close', yue: '關閉' },
  openEveryTab: { en: 'Open every tab', yue: '打開所有分頁' },
  noWorlds: { en: 'No worlds found in {roots}.', yue: '喺 {roots} 搵唔到世界。' },
  run: { en: 'Run {op}', yue: '執行{op}' },
  block: { en: 'Block', yue: '方塊' },
  from: { en: 'Replace this block', yue: '要換走嘅方塊' },
  to: { en: 'With this block', yue: '換成呢個方塊' },
  dest: { en: 'Destination corner (x, y, z)', yue: '目的地角落（x, y, z）' },
  fill: { en: 'Fill', yue: '填充' }, replace: { en: 'Replace', yue: '替換' }, delete: { en: 'Delete blocks', yue: '刪除方塊' },
  clone: { en: 'Clone', yue: '複製' }, waterlog: { en: 'Waterlog', yue: '加水' },
  selection: { en: 'Selection: {n} blocks', yue: '已選：{n} 個方塊' },
  opDone: {
    en: '{op} finished: {n} blocks changed in {ms} ms. Saved to history.',
    en5: '{op} done: {n} blocks changed in {ms} ms. History has it, so you can always take it back.',
    yue: '{op}完成：改咗 {n} 個方塊，用咗 {ms} 毫秒。已記錄喺歷史。',
    yue5: '{op}搞掂：改咗 {n} 個方塊，{ms} 毫秒。歷史記住晒，隨時可以還原。',
  },
  opSkipped: { en: '{n} blocks were in chunks that do not exist yet and were skipped.', yue: '有 {n} 個方塊喺未生成嘅區塊，已略過。' },
  rollBack: { en: 'Roll back here', yue: '還原到呢度' },
  restored: { en: 'Restored. This is a new history point, so you can undo it.', yue: '已還原。呢個係新嘅歷史點，可以再撤銷。' },
  historyNote: { en: 'Every edit is recorded in a private Git repository kept in the app data folder, never inside your world.', yue: '每次修改都會記錄喺應用程式資料夾入面嘅私人 Git 儲存庫，唔會放入你嘅世界。' },
  language: { en: 'Language', yue: '語言' },
  funnyEn: { en: 'English funny level', yue: '英文搞笑程度' },
  funnyYue: { en: 'Cantonese funny level', yue: '廣東話搞笑程度' },
  funnyNote: { en: 'Changes wording only. Facts and warnings stay the same.', yue: '只會改用字，事實同警告唔變。' },
  dark: { en: 'Dark theme', yue: '深色主題' },
  reduceMotion: { en: 'Reduce motion', yue: '減少動畫' },
  errorTitle: { en: 'That did not work', yue: '做唔到' },
  notes: { en: 'Notes', yue: '筆記' },
  seed: { en: 'Theme colour', yue: '主題顏色' },
  rainbow: { en: 'Animated rainbow', yue: '動態彩虹' },
  reset: { en: 'Reset', yue: '重設' },
  notesSaved: { en: 'Notes saved.', yue: '筆記已儲存。' },
  signedOut: { en: 'Sign in first.', yue: '請先登入。' },
} satisfies Record<string, Entry>;

export type Key = keyof typeof S;

export interface I18nState { lang: Lang; funnyEn: number; funnyYue: number }

function pick(e: Entry, which: 'en' | 'yue', funny: number) {
  if (funny >= 4) return (which === 'en' ? e.en5 : e.yue5) ?? e[which];
  return e[which];
}

function fill(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function t(state: I18nState, key: Key, vars: Record<string, string | number> = {}): string {
  const e = S[key] as Entry;
  const en = fill(pick(e, 'en', state.funnyEn), vars);
  const yue = fill(pick(e, 'yue', state.funnyYue), vars);
  if (state.lang === 'en') return en;
  if (state.lang === 'yue') return yue;
  return `${en} · ${yue}`;
}

export const ALL_KEYS = Object.keys(S) as Key[];
export const STRINGS = S as Record<Key, Entry>;
