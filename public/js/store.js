// Data loading, settings, spaced-repetition progress and server sync.
import { todayKey, toast } from './util.js';

// ====================== settings ======================
const SETTINGS_KEY = 'fj_settings';
const DEFAULT_SETTINGS = {
  theme: 'auto', furigana: true, level: 'N4',
  autoSpeak: false, hvHint: false, autoNext: true,
};
export const settings = { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_KEY, {}) };
export function saveSettings(patch) {
  Object.assign(settings, patch);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

// ====================== learning data ======================
export const data = {
  level: null, lessons: [], kanji: [], words: [],
  wordById: new Map(), kanjiByChar: new Map(),
};

export async function loadLevel(level = 'N4') {
  const res = await fetch(`data/${level.toLowerCase()}.json`);
  if (!res.ok) throw new Error('Không tải được dữ liệu ' + level);
  const d = await res.json();
  data.level = d.level;
  data.source = d.source;
  data.lessons = d.lessons;
  data.kanji = d.kanji;
  data.words = d.words;
  data.wordById = new Map(d.words.map((w) => [w.id, w]));
  data.kanjiByChar = new Map(d.kanji.map((k) => [k.k, k]));
  data.kanji.forEach((k, i) => { k.index = i; });
}

/** Words of a lesson = every word listed under the lesson's kanji (no duplicates). */
export function lessonWordIds(lessonId) {
  const lesson = data.lessons.find((l) => l.id === Number(lessonId));
  if (!lesson) return [];
  const ids = new Set();
  for (const k of lesson.kanji) for (const id of data.kanjiByChar.get(k).words) ids.add(id);
  return [...ids];
}

// ====================== spaced repetition ======================
// Level → interval in days. "Mastered" = level ≥ 4 (next review ≥ 2 weeks away).
export const INTERVALS = [0, 1, 3, 7, 14, 30, 60, 120, 240];
export const MASTERED_LEVEL = 4;
const MIN = 60e3, DAY = 864e5;

let progress = { items: {}, days: {} };
let progressKey = 'fj_p_guest';

export const getItem = (id) => progress.items[id];

export function wordStatus(id) {
  const it = progress.items[id];
  if (!it || !it.n) return 'new';
  if (it.lv >= MASTERED_LEVEL) return 'mastered';
  return 'learning';
}
export const isDue = (id, now = Date.now()) => {
  const it = progress.items[id];
  return !!it && it.n > 0 && it.due <= now;
};
export const isWeak = (id) => {
  const it = progress.items[id];
  return !!it && (it.weak || (it.lapses || 0) >= 3);
};

export const STATUS_LABEL = { new: 'Chưa học', learning: 'Đang học', mastered: 'Đã thuộc', due: 'Cần ôn' };

function blank() { return { lv: 0, due: 0, n: 0, lapses: 0, qn: 0, qw: 0, weak: false, u: 0 }; }

/** Flashcard grade: 0 = chưa nhớ, 1 = nhớ, 2 = dễ. Returns the previous state for undo. */
export function gradeCard(id, g) {
  const prev = progress.items[id] ? { ...progress.items[id] } : null;
  const it = { ...blank(), ...prev };
  const now = Date.now();
  it.n += 1;
  if (g === 0) {
    if (it.n > 1) it.lapses += 1;
    it.lv = 0;
    it.due = now + 10 * MIN;
    it.weak = it.lapses >= 2 || it.weak;
  } else {
    it.lv = Math.min(INTERVALS.length - 1, it.lv + (g === 2 ? 2 : 1));
    it.due = now + INTERVALS[it.lv] * DAY;
    it.weak = false;
  }
  it.last = now;
  put(id, it);
  bumpDay();
  return prev;
}

/** Quiz answer feeds back into SRS: a wrong answer demotes the word and marks it weak. */
export function recordQuiz(id, correct) {
  const it = { ...blank(), ...progress.items[id] };
  const now = Date.now();
  it.qn += 1;
  if (correct) {
    it.weak = false;
  } else {
    it.qw += 1;
    it.weak = true;
    if (it.n > 0) { it.lv = Math.min(it.lv, 1); it.due = now; }
    else { it.n = 1; it.lv = 0; it.due = now; } // brings the word into review
  }
  it.last = now;
  put(id, it);
  bumpDay();
}

export function restoreItem(id, prev) {
  if (prev) put(id, { ...prev, u: Date.now() });
  else put(id, { ...blank(), u: Date.now() });
}

function put(id, it) {
  it.u = Date.now();
  progress.items[id] = it;
  dirty.add(id);
  persist();
}

function bumpDay() {
  const k = todayKey();
  progress.days[k] = (progress.days[k] || 0) + 1;
  dirtyDays = true;
}

export function streak() {
  let n = 0;
  const d = new Date();
  if (!progress.days[todayKey(d)]) d.setDate(d.getDate() - 1); // today not studied yet: count up to yesterday
  while (progress.days[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export const dayCount = (key) => progress.days[key] || 0;

export function summary(ids = data.words.map((w) => w.id)) {
  const now = Date.now();
  const s = { total: ids.length, new: 0, learning: 0, mastered: 0, due: 0, weak: 0 };
  for (const id of ids) {
    s[wordStatus(id)]++;
    if (isDue(id, now)) s.due++;
    if (isWeak(id)) s.weak++;
  }
  return s;
}

// ====================== persistence & sync ======================
const dirty = new Set();
let dirtyDays = false;
let syncTimer = null;
// available = false on static hosting (GitHub Pages): no server, so progress stays in the browser
export const auth = { user: null, available: true, syncing: false, lastSync: 0, error: null };

function persist() {
  try { localStorage.setItem(progressKey, JSON.stringify(progress)); } catch { /* quota */ }
  if (auth.user) scheduleSync();
}

function loadLocal(key) {
  const p = readJSON(key, null);
  return p && p.items ? { items: p.items, days: p.days || {} } : { items: {}, days: {} };
}

function merge(into, from) {
  let changed = false;
  for (const [id, it] of Object.entries(from.items || {})) {
    if (!into.items[id] || (it.u || 0) > (into.items[id].u || 0)) { into.items[id] = it; changed = true; }
  }
  for (const [d, c] of Object.entries(from.days || {})) {
    if ((into.days[d] || 0) < c) { into.days[d] = c; changed = true; }
  }
  return changed;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    ...opts,
  });
  let body = {};
  try { body = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw Object.assign(new Error(body.error || `Lỗi ${res.status}`), { status: res.status });
  return body;
}

/** Called once at start-up. */
export async function initAuth() {
  progress = loadLocal(progressKey);
  try {
    const res = await fetch('api/auth/me', { credentials: 'same-origin' });
    const body = res.ok && (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
    if (!body) { auth.available = false; return; }
    if (body.user) await enterAccount(body.user, false);
  } catch {
    auth.available = false; // offline or static hosting: keep working in guest mode
  }
}

async function enterAccount(user, mergeGuest) {
  auth.user = user;
  progressKey = `fj_p_user:${user.username.toLowerCase()}`;
  const local = loadLocal(progressKey);
  let guestMerged = 0;
  if (mergeGuest) {
    const guest = loadLocal('fj_p_guest');
    guestMerged = Object.keys(guest.items).length;
    merge(local, guest);
  }
  progress = local;
  try {
    const server = await api('api/progress');
    merge(progress, server);
    // everything local that the server may not have yet
    for (const id of Object.keys(progress.items)) dirty.add(id);
    dirtyDays = true;
    auth.lastSync = Date.now();
  } catch (e) {
    auth.error = e.message;
  }
  persist();
  await flush();
  if (guestMerged) {
    localStorage.removeItem('fj_p_guest');
    toast(`Đã gộp ${guestMerged} từ đã học thử vào tài khoản`);
  }
  emit();
}

export async function login(username, password, register = false) {
  await flush();
  const { user } = await api(register ? 'api/auth/register' : 'api/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  });
  await enterAccount(user, true);
  return user;
}

export async function logout() {
  await flush();
  try { await api('api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  auth.user = null;
  progressKey = 'fj_p_guest';
  progress = loadLocal(progressKey);
  dirty.clear();
  emit();
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flush, 1500);
}

export async function flush(keepalive = false) {
  clearTimeout(syncTimer);
  if (!auth.user || (!dirty.size && !dirtyDays)) return;
  const ids = [...dirty];
  const body = { items: Object.fromEntries(ids.map((id) => [id, progress.items[id]])), days: progress.days };
  dirty.clear();
  dirtyDays = false;
  auth.syncing = true;
  emit();
  try {
    await api('api/progress', { method: 'POST', body: JSON.stringify(body), keepalive });
    auth.lastSync = Date.now();
    auth.error = null;
  } catch (e) {
    ids.forEach((id) => dirty.add(id));
    dirtyDays = true;
    auth.error = e.message;
    if (e.status === 401) { auth.user = null; toast('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại'); }
  } finally {
    auth.syncing = false;
    emit();
  }
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
window.addEventListener('online', () => flush());

// tiny event bus so the header can show login/sync state
const listeners = new Set();
export const onAuthChange = (fn) => listeners.add(fn);
function emit() { listeners.forEach((fn) => fn(auth)); }

// temporary deck passed between views (e.g. "flashcard these filtered words")
export const temp = { deck: null };

// ====================== unfinished flashcard session (kept on this device) ======================
const sessionKey = () => `fj_fc_session:${progressKey}`;

/** The unfinished flashcard session, or null. Cards that no longer exist in the data are dropped. */
export function loadFcSession() {
  const s = readJSON(sessionKey(), null);
  if (!s || s.v !== 1 || !Array.isArray(s.queue)) return null;
  const known = (id) => data.wordById.has(id);
  const done = s.queue.slice(0, s.pos).filter(known);
  const rest = s.queue.slice(s.pos).filter(known);
  if (!rest.length) return null;
  return {
    ...s,
    queue: [...done, ...rest],
    pos: done.length,
    ids: (s.ids || []).filter(known),
    firstGrade: (s.firstGrade || []).filter(([id]) => known(id)),
  };
}
export function saveFcSession(s) {
  try { localStorage.setItem(sessionKey(), JSON.stringify({ v: 1, ...s, savedAt: Date.now() })); } catch { /* quota */ }
}
export function clearFcSession() {
  try { localStorage.removeItem(sessionKey()); } catch { /* ignore */ }
}

// ====================== backup file (export / import) ======================
export function exportProgress() {
  return {
    app: 'FlashJLPT', version: 1, exportedAt: new Date().toISOString(),
    items: progress.items, days: progress.days,
  };
}

/** Merge a backup into the current progress (newer entries win). Returns the number of words changed. */
export function importProgress(backup) {
  if (!backup || backup.app !== 'FlashJLPT' || typeof backup.items !== 'object' || !backup.items) {
    throw new Error('File không phải bản sao lưu FlashJLPT');
  }
  const items = {};
  for (const [id, it] of Object.entries(backup.items)) {
    if (data.wordById.has(id) && it && typeof it === 'object' && Number.isFinite(it.lv) && Number.isFinite(it.due)) items[id] = it;
  }
  const days = {};
  for (const [d, c] of Object.entries(backup.days || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(c)) days[d] = c;
  }
  const newer = Object.keys(items).filter((id) => !progress.items[id] || (items[id].u || 0) > (progress.items[id].u || 0));
  merge(progress, { items, days });
  newer.forEach((id) => dirty.add(id));
  dirtyDays = true;
  persist();
  return newer.length;
}
