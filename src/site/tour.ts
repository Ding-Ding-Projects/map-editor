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

function run(which: 'site' | 'page', start = 0) {
  const onArticle = which === 'page' && !!document.querySelector('.article-body');
  startTour(onArticle ? 'article' : 'guide', onArticle ? article : home, text, {
    start,
    onStep: (i) => { try { localStorage.setItem(KEY, JSON.stringify({ which, i })); } catch { /* private mode */ } },
    onEnd: (done) => { try { if (done) localStorage.removeItem(KEY); } catch { /* ignore */ } },
  });
}
document.querySelectorAll<HTMLElement>('[data-tour]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); run(b.dataset.tour === 'page' ? 'page' : 'site'); }));
if (location.hash === '#tour') { let saved = { which: 'site' as 'site' | 'page', i: 0 }; try { saved = JSON.parse(localStorage.getItem(KEY) ?? '') ?? saved; } catch { /* none */ } run('site', saved.which === 'site' ? saved.i : 0); }
