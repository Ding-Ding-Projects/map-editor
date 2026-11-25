// "Take a tour" on the documentation site, using the same coach-card tour as the app.
import { startTour, type TourStep } from '../ui/tour.js';

const KEY = 'map-editor-site.tour.v1';
const home: TourStep[] = [
  { target: '.brand', title: 'Home', body: 'Back to this page from anywhere on the site.' },
  { target: 'nav[aria-label=Site]', title: 'Guide, downloads and changes', body: 'Downloads go to the verified releases; Changelog and Source open the repository.' },
  { target: '.ways', title: 'Three ways to run it', body: 'On your PC, in Docker on your network, or as an appliance on a spare PC. Each card opens its article.', missing: { text: 'This part is on the home page.', label: 'Go to the home page', reveal: () => { location.href = document.querySelector<HTMLAnchorElement>('.brand')!.href + '#tour'; } } },
  { target: '.bento', title: 'What it can do', body: 'The main features, each linking to its article.', missing: { text: 'This part is on the home page.', label: 'Go to the home page', reveal: () => { location.href = document.querySelector<HTMLAnchorElement>('.brand')!.href + '#tour'; } } },
  { target: '.all, .toc', title: 'Every article', body: 'All the articles by topic. Each one ends with suggested next reads.' },
  { target: 'footer', title: 'Version', body: 'The version, update time and commit this site was built from.' },
];
const article: TourStep[] = [
  { target: '.crumb', title: 'Where you are', body: 'The topic this article belongs to; it links back to the guide.' },
  { target: '.article-body', title: 'The article', body: 'Short sections, each answering one question.' },
  { target: '.suggested', title: 'Read next', body: 'Related articles to continue with.' },
  { target: 'footer', title: 'Version', body: 'The version and commit this page was built from.' },
];
const text = { stepOf: (n: number, m: number, tour: string) => `Step ${n} of ${m} of the ${tour} tour`, back: 'Back', skip: 'Skip this step', next: 'Next', done: 'Finish', close: 'Close', notHere: 'This part is not on this page.' };

// Cantonese for every tour string; the site's language choice decides what is shown.
const YUE: Record<string, string> = {"Home": "首頁", "Back to this page from anywhere on the site.": "喺網站邊度都返到嚟呢頁。", "Guide, downloads and changes": "指南、下載同更新", "Downloads go to the verified releases; Changelog and Source open the repository.": "「下載」去已驗證嘅版本；「更新紀錄」同「原始碼」會開儲存庫。", "Three ways to run it": "三種用法", "On your PC, in Docker on your network, or as an appliance on a spare PC. Each card opens its article.": "喺你部電腦、用 Docker 喺你個網絡，或者裝落一部閒置電腦。每張卡都會開返佢篇文章。", "This part is on the home page.": "呢部分喺首頁。", "Go to the home page": "去首頁", "What it can do": "做到啲乜", "The main features, each linking to its article.": "主要功能，每樣都連去佢篇文章。", "Every article": "全部文章", "All the articles by topic. Each one ends with suggested next reads.": "所有文章按主題分好。每篇尾都有推介下一篇。", "Version": "版本", "The version, update time and commit this site was built from.": "呢個網站係由邊個版本、幾時更新、邊個 commit 建出嚟。", "Where you are": "你喺邊度", "The topic this article belongs to; it links back to the guide.": "呢篇文章屬於邊個主題；可以連返去指南。", "The article": "文章", "Short sections, each answering one question.": "一段段短文，每段答一條問題。", "Read next": "跟住睇", "Related articles to continue with.": "相關文章，可以繼續睇。", "The version and commit this page was built from.": "呢頁係由邊個版本同 commit 建出嚟。", "Back": "返回", "Skip this step": "跳過呢步", "Next": "下一步", "Finish": "完成", "Close": "關閉", "This part is not on this page.": "呢部分唔喺呢頁。"};
const loc = (en: string) => { const l = document.documentElement.dataset.lang, y = YUE[en]; return !y || !l ? en : l === 'yue' ? y : `${en} · ${y}`; };
const locSteps = (steps: TourStep[]): TourStep[] => steps.map((st) => ({ ...st, title: loc(st.title), body: loc(st.body), missing: st.missing ? { ...st.missing, text: loc(st.missing.text), label: loc(st.missing.label) } : undefined }));
function run(which: 'site' | 'page', start = 0) {
  const onArticle = which === 'page' && !!document.querySelector('.article-body');
  const yue = document.documentElement.dataset.lang === 'yue';
  const words = { ...text, stepOf: yue ? (n: number, m: number) => `第 ${n} 步，共 ${m} 步` : text.stepOf, back: loc(text.back), skip: loc(text.skip), next: loc(text.next), done: loc(text.done), close: loc(text.close), notHere: loc(text.notHere) };
  startTour(onArticle ? 'article' : 'guide', locSteps(onArticle ? article : home), words, {
    start,
    onStep: (i) => { try { localStorage.setItem(KEY, JSON.stringify({ which, i })); } catch { /* private mode */ } },
    onEnd: (done) => { try { if (done) localStorage.removeItem(KEY); } catch { /* ignore */ } },
  });
}
document.querySelectorAll<HTMLElement>('[data-tour]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); run(b.dataset.tour === 'page' ? 'page' : 'site'); }));
if (location.hash === '#tour') { let saved = { which: 'site' as 'site' | 'page', i: 0 }; try { saved = JSON.parse(localStorage.getItem(KEY) ?? '') ?? saved; } catch { /* none */ } run('site', saved.which === 'site' ? saved.i : 0); }
