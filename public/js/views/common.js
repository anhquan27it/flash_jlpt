// Small render helpers shared by several views.
import { data, wordStatus, isDue, isWeak, STATUS_LABEL } from '../store.js';
import { esc, ruby, speak } from '../util.js';

export function statusBadge(id) {
  if (isDue(id)) return `<span class="badge s-due">${STATUS_LABEL.due}</span>`;
  const s = wordStatus(id);
  return `<span class="badge s-${s}">${STATUS_LABEL[s]}</span>`;
}

/** Links to the N4 kanji contained in a word, with their Hán Việt reading. */
export function kanjiChips(word, { link = true } = {}) {
  return word.ks.map((c) => {
    const k = data.kanjiByChar.get(c);
    const inner = `<b>${esc(c)}</b>${esc(k.hv)}`;
    return link ? `<a class="kchip" href="#/kanji/${encodeURIComponent(c)}">${inner}</a>` : `<span class="kchip">${inner}</span>`;
  }).join('');
}

export function speakBtn(word) {
  return `<button class="speak" type="button" data-speak="${esc(word.id)}" aria-label="Nghe phát âm ${esc(word.r)}" title="Nghe phát âm">🔊</button>`;
}

/** One vocabulary row (word with furigana, reading, meaning, kanji, status). */
export function wordRow(word, { showReading = false, extra = '' } = {}) {
  return `<li class="witem">
    <div class="w">${ruby(word.t)}${showReading ? `<span class="rd">${esc(word.r)}</span>` : ''}</div>
    <div class="m">${esc(word.m)}${word.note ? ` <span class="muted small">(${esc(word.note)})</span>` : ''}
      <span class="ks">${kanjiChips(word)}</span>${extra}</div>
    <div class="acts">${statusBadge(word.id)}${speakBtn(word)}</div>
  </li>`;
}

/** Delegated click handler for [data-speak] buttons inside `root`. */
export function bindSpeak(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-speak]');
    if (!b) return;
    e.stopPropagation();
    const w = data.wordById.get(b.dataset.speak);
    if (w) speak(w);
  });
}

export function progressBar(s) {
  const pct = (n) => (s.total ? (n / s.total) * 100 : 0);
  return `<div class="bar" role="img" aria-label="Đã thuộc ${s.mastered}, đang học ${s.learning} trên ${s.total} từ">
    <span class="m" style="width:${pct(s.mastered)}%"></span><span class="l" style="width:${pct(s.learning)}%"></span></div>`;
}

export function lessonOptions(selected) {
  return `<option value="">Tất cả bài</option>` + data.lessons.map((l) =>
    `<option value="${l.id}" ${String(selected) === String(l.id) ? 'selected' : ''}>Bài ${l.id}</option>`).join('');
}

export function kanjiStatus(k) {
  let mastered = 0, started = 0;
  for (const id of k.words) {
    const s = wordStatus(id);
    if (s === 'mastered') mastered++;
    if (s !== 'new') started++;
  }
  if (k.words.length && mastered === k.words.length) return 'mastered';
  return started ? 'learning' : 'new';
}

/** Resolve a deck "source" string into word ids and a human label. */
export function resolveSource(src, temp) {
  if (!src) return null;
  const [kind, val] = src.split(':');
  if (kind === 'kanji') {
    const k = data.kanjiByChar.get(val);
    return k ? { ids: [...k.words], label: `Chữ ${k.k} (${k.hv})` } : null;
  }
  if (kind === 'lesson') {
    const l = data.lessons.find((x) => x.id === Number(val));
    if (!l) return null;
    const ids = new Set();
    for (const c of l.kanji) data.kanjiByChar.get(c).words.forEach((id) => ids.add(id));
    return { ids: [...ids], label: `Bài ${l.id}` };
  }
  if (kind === 'due') return { ids: data.words.map((w) => w.id).filter((id) => isDue(id)), label: 'Từ cần ôn hôm nay' };
  if (kind === 'weak') return { ids: data.words.map((w) => w.id).filter((id) => isWeak(id)), label: 'Từ hay sai' };
  if (kind === 'custom' && temp?.deck) return { ids: [...temp.deck.ids], label: temp.deck.label };
  return null;
}
