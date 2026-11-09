// Vocabulary list with search (Japanese, kana, romaji, Vietnamese without accents) and filters.
import { data, wordStatus, isDue, isWeak, temp } from '../store.js';
import { normVi, romajiToKana, kataToHira } from '../util.js';
import { wordRow, bindSpeak, lessonOptions } from './common.js';

export function render(main, params) {
  main.innerHTML = `
    <div class="page-head">
      <div><h1>Từ vựng N4</h1><p>${data.words.length} từ lấy từ các hán tự N4</p></div>
    </div>
    <div class="toolbar">
      <div class="search"><input class="input" id="vq" type="search" placeholder="Tìm: 動物, どうぶつ, doubutsu, động vật…" aria-label="Tìm từ vựng"></div>
      <select class="input" id="vl" style="width:auto" aria-label="Lọc theo bài">${lessonOptions(params.l || '')}</select>
      <select class="input" id="vs" style="width:auto" aria-label="Lọc theo trạng thái">
        <option value="">Mọi trạng thái</option><option value="new">Chưa học</option><option value="learning">Đang học</option>
        <option value="mastered">Đã thuộc</option><option value="due">Cần ôn</option><option value="weak">Hay sai</option>
      </select>
    </div>
    <div class="row" style="margin-bottom:12px">
      <span class="muted" id="vcount"></span><span class="spacer"></span>
      <button class="btn sm" id="vfc" type="button">Flashcard danh sách này</button>
      <button class="btn sm" id="vqz" type="button">Bài tập danh sách này</button>
    </div>
    <div class="card" style="padding:4px 8px"><ul class="wlist" id="vlist"></ul></div>`;

  const q = main.querySelector('#vq');
  const sl = main.querySelector('#vl');
  const ss = main.querySelector('#vs');
  const list = main.querySelector('#vlist');
  const count = main.querySelector('#vcount');
  let current = [];

  // words are listed in lesson order; build lesson membership from the kanji lists
  const lessonOf = new Map();
  for (const k of data.kanji) for (const id of k.words) {
    if (!lessonOf.has(id)) lessonOf.set(id, new Set());
    lessonOf.get(id).add(k.l);
  }

  function draw() {
    const term = q.value.trim();
    const tv = normVi(term);
    const kana = kataToHira(romajiToKana(term, true));
    const lf = sl.value ? Number(sl.value) : null;
    const sf = ss.value;
    current = data.words.filter((w) => {
      if (lf && !lessonOf.get(w.id)?.has(lf)) return false;
      if (sf === 'due' && !isDue(w.id)) return false;
      if (sf === 'weak' && !isWeak(w.id)) return false;
      if (sf && sf !== 'due' && sf !== 'weak' && wordStatus(w.id) !== sf) return false;
      if (!term) return true;
      return w.w.includes(term) || w.r.includes(kana) || normVi(w.m).includes(tv)
        || w.ks.some((c) => normVi(data.kanjiByChar.get(c).hv) === tv);
    });
    count.textContent = `${current.length} từ`;
    list.innerHTML = current.length ? current.map((w) => wordRow(w)).join('')
      : '<li class="empty">Không có từ phù hợp.</li>';
  }

  function useList(target) {
    if (!current.length) return;
    temp.deck = { ids: current.map((w) => w.id), label: 'Danh sách từ đã lọc' };
    location.hash = `#/${target}?src=custom`;
  }
  q.addEventListener('input', draw);
  sl.addEventListener('change', draw);
  ss.addEventListener('change', draw);
  main.querySelector('#vfc').addEventListener('click', () => useList('flashcard'));
  main.querySelector('#vqz').addEventListener('click', () => useList('quiz'));
  bindSpeak(main);
  draw();
}
