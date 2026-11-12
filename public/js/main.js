// App shell: header controls, hash router, global shortcuts.
import { settings, saveSettings, loadLevel, initAuth, onAuthChange, auth } from './store.js';
import { toast } from './util.js';
import * as home from './views/home.js';
import * as kanji from './views/kanji.js';
import * as vocab from './views/vocab.js';
import * as flashcard from './views/flashcard.js';
import * as quiz from './views/quiz.js';
import * as account from './views/account.js';

const main = document.getElementById('main');
const root = document.documentElement;

// ---------- furigana toggle ----------
const furi = document.getElementById('furiToggle');
function applyFuri() {
  root.classList.toggle('no-furi', !settings.furigana);
  furi.checked = settings.furigana;
}
function toggleFuri() {
  saveSettings({ furigana: !settings.furigana });
  applyFuri();
  toast(settings.furigana ? 'Đã bật furigana' : 'Đã tắt furigana', 1400);
}
furi.addEventListener('change', () => { saveSettings({ furigana: furi.checked }); applyFuri(); });
applyFuri();

// ---------- theme ----------
const themeBtn = document.getElementById('themeBtn');
const THEMES = ['auto', 'light', 'dark'];
const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };
const THEME_LABEL = { auto: 'Tự động theo hệ thống', light: 'Sáng', dark: 'Tối' };
function applyTheme() {
  if (settings.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = settings.theme;
  themeBtn.textContent = THEME_ICON[settings.theme];
  themeBtn.title = `Giao diện: ${THEME_LABEL[settings.theme]}`;
}
themeBtn.addEventListener('click', () => {
  saveSettings({ theme: THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length] });
  applyTheme();
  toast(`Giao diện: ${THEME_LABEL[settings.theme]}`, 1400);
});
applyTheme();

// ---------- account button ----------
const userBtn = document.getElementById('userBtn');
function renderUser() {
  if (auth.user) {
    userBtn.textContent = auth.user.username;
    userBtn.classList.add('logged');
    userBtn.title = auth.syncing ? 'Đang đồng bộ…' : (auth.error ? `Chưa đồng bộ: ${auth.error}` : 'Đã đồng bộ tiến trình');
  } else if (!auth.available) {
    userBtn.textContent = 'Tài khoản';
    userBtn.classList.remove('logged');
    userBtn.title = 'Bản web tĩnh: tiến trình lưu trên trình duyệt này';
  } else {
    userBtn.textContent = 'Đăng nhập';
    userBtn.classList.remove('logged');
    userBtn.title = 'Đăng nhập để lưu tiến trình';
  }
}
onAuthChange(renderUser);

// ---------- router ----------
const ROUTES = [
  [/^\/?$/, home, 'home'],
  [/^\/kanji\/(.+)$/, kanji, 'kanji', 'detail'],
  [/^\/kanji$/, kanji, 'kanji'],
  [/^\/vocab$/, vocab, 'vocab'],
  [/^\/flashcard$/, flashcard, 'flashcard'],
  [/^\/quiz$/, quiz, 'quiz'],
  [/^\/account$/, account, 'account'],
];
let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: decodeURIComponent(path), params: Object.fromEntries(new URLSearchParams(qs)) };
}

function route() {
  const { path, params } = parseHash();
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  for (const [re, view, nav, sub] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
    main.innerHTML = '';
    cleanup = view.render(main, { ...params, match: m, sub });
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/';
}

// A link to the page you are already on (e.g. "Thiết lập khác" → #/quiz while a quiz started from
// #/quiz is showing) does not fire hashchange, so re-render the page ourselves.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const norm = (h) => { try { return decodeURIComponent(h.replace(/^#/, '') || '/'); } catch { return h; } };
  if (norm(a.getAttribute('href')) === norm(location.hash)) {
    e.preventDefault();
    route();
  }
});

// ---------- global shortcuts ----------
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFuri(); }
});

// ---------- boot ----------
(async function boot() {
  main.innerHTML = '<div class="empty">Đang tải dữ liệu…</div>';
  try {
    await loadLevel(settings.level);
  } catch (e) {
    main.innerHTML = `<div class="empty">Không tải được dữ liệu học. Vui lòng tải lại trang.<br><small>${e.message}</small></div>`;
    return;
  }
  renderUser();
  await initAuth();
  renderUser();
  window.addEventListener('hashchange', route);
  route();
})();
