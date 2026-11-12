// Flashcards with spaced repetition.
// - every session is shuffled; a "Xáo trộn" button reshuffles the remaining cards
// - grade: Chưa nhớ (card comes back later in the session) / Nhớ / Dễ
// - keyboard: Space/Enter flip · 1 2 3 grade · Z undo · S shuffle · P speak
// - touch: tap to flip, swipe right = Nhớ, swipe left = Chưa nhớ
// - an unfinished session is saved on this device after every card and can be resumed later
import {
  data, settings, saveSettings, wordStatus, isDue, isWeak, gradeCard, restoreItem, getItem, temp, lessonWordIds, INTERVALS,
  loadFcSession, saveFcSession, clearFcSession,
} from '../store.js';
import { esc, ruby, shuffle, speak, toast } from '../util.js';
import { kanjiChips, resolveSource } from './common.js';

const FILTERS = [
  ['all', 'Tất cả', ''],
  ['new', 'Từ mới', 'chưa học lần nào'],
  ['due', 'Cần ôn', 'đến hạn ôn tập'],
  ['notmastered', 'Chưa thuộc', 'mới + đang học'],
  ['weak', 'Hay sai', 'quên nhiều / làm sai'],
];
const SIZES = [10, 20, 30, 50, 0];

const cleanupRef = { fn: null };

export function render(main, params) {
  cleanupRef.fn = null;
  const saved = loadFcSession();
  if (params.resume && saved) {
    cleanupRef.fn = startSession(main, saved, saved);
    return () => cleanupRef.fn && cleanupRef.fn();
  }
  const fixed = resolveSource(params.src, temp);
  // opening the same deck again continues where you left off
  if (fixed && saved && saved.label === fixed.label && sameSet(saved.ids, fixed.ids)) {
    toast(`Tiếp tục phiên đang học dở (${saved.pos}/${saved.queue.length} thẻ)`);
    cleanupRef.fn = startSession(main, saved, saved);
    return () => cleanupRef.fn && cleanupRef.fn();
  }
  if (fixed) {
    if (!fixed.ids.length) {
      main.innerHTML = `<div class="empty"><h2>Không có thẻ nào</h2><p>${esc(fixed.label)} hiện không có từ nào.</p>
        <a class="btn primary" href="#/flashcard">Chọn bộ thẻ khác</a></div>`;
      return;
    }
    cleanupRef.fn = startSession(main, { ids: fixed.ids, label: fixed.label });
  } else {
    renderSetup(main, saved);
  }
  return () => cleanupRef.fn && cleanupRef.fn();
}

const sameSet = (a, b) => a.length === b.length && b.every((id) => a.includes(id));

/** "Continue where you left off" banner (also used on the home page). */
export function resumeBanner(saved) {
  if (!saved) return '';
  const left = saved.queue.length - saved.pos;
  const when = new Date(saved.savedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  return `<div class="due-chip resume">
    <span><b>Phiên đang học dở:</b> ${esc(saved.label)} · đã học ${saved.pos}/${saved.queue.length} thẻ, còn ${left} thẻ
      <span class="muted small">· lưu lúc ${when}</span></span>
    <span class="spacer"></span>
    <a class="btn sm primary" href="#/flashcard?resume=1">Tiếp tục</a>
    <button class="btn sm ghost" type="button" data-discard>Bỏ phiên</button>
  </div>`;
}
export function bindResumeBanner(root) {
  root.querySelector('[data-discard]')?.addEventListener('click', (e) => {
    clearFcSession();
    e.target.closest('.resume').remove();
    toast('Đã bỏ phiên đang học dở');
  });
}

// ---------------- setup ----------------
function renderSetup(main, saved) {
  const st = {
    lessons: new Set(settings.fcLessons?.length ? settings.fcLessons : [data.lessons[0].id]),
    filter: settings.fcFilter || 'all',
    size: settings.fcSize ?? 20,
    dir: settings.fcDir || 'jp',
  };

  main.innerHTML = `
    <div class="page-head"><div><h1>Flashcard</h1><p>Chọn bài và kiểu thẻ – mỗi phiên đều được xáo trộn ngẫu nhiên</p></div></div>
    ${saved ? `<div style="margin-bottom:14px">${resumeBanner(saved)}</div>` : ''}
    <div class="card setup">
      <div class="group"><div class="lbl">Bài học <span class="spacer"></span>
        <button class="btn sm ghost" type="button" id="all">Chọn tất cả</button>
        <button class="btn sm ghost" type="button" id="none">Bỏ chọn</button></div>
        <div class="chips" id="lessons">${data.lessons.map((l) => `<button class="chip" type="button" data-l="${l.id}">Bài ${l.id}</button>`).join('')}</div>
      </div>
      <div class="group"><div class="lbl">Loại thẻ</div>
        <div class="seg" id="filter">${FILTERS.map(([v, t, d]) => `<button type="button" data-v="${v}" title="${d}">${t}</button>`).join('')}</div>
      </div>
      <div class="grid-2">
        <div class="group"><div class="lbl">Mặt trước</div>
          <div class="seg" id="dir"><button type="button" data-v="jp">Tiếng Nhật → Nghĩa</button><button type="button" data-v="vi">Nghĩa → Tiếng Nhật</button></div>
        </div>
        <div class="group"><div class="lbl">Số thẻ mỗi phiên</div>
          <div class="seg" id="size">${SIZES.map((n) => `<button type="button" data-v="${n}">${n || 'Tất cả'}</button>`).join('')}</div>
        </div>
      </div>
      <div class="group checks">
        <label class="check"><input type="checkbox" id="hv" ${settings.hvHint ? 'checked' : ''}><div><b>Gợi ý âm Hán Việt</b><span>Hiện âm Hán Việt ở mặt trước</span></div></label>
        <label class="check"><input type="checkbox" id="sp" ${settings.autoSpeak ? 'checked' : ''}><div><b>Tự đọc phát âm</b><span>Phát âm khi lật thẻ</span></div></label>
      </div>
      <div class="setup-foot">
        <span id="cnt" class="muted"></span><span class="spacer"></span>
        <button class="btn primary" type="button" id="go">Bắt đầu học</button>
      </div>
    </div>
    <p class="muted small" style="margin-top:12px">Mẹo: furigana trên thẻ theo nút <b>ふりがな</b> ở đầu trang – tắt đi để tự luyện cách đọc.</p>`;

  const $ = (s) => main.querySelector(s);
  bindResumeBanner(main);
  const pool = () => {
    const ids = new Set();
    for (const l of st.lessons) lessonWordIds(l).forEach((id) => ids.add(id));
    return [...ids].filter((id) => {
      switch (st.filter) {
        case 'new': return wordStatus(id) === 'new';
        case 'due': return isDue(id);
        case 'notmastered': return wordStatus(id) !== 'mastered';
        case 'weak': return isWeak(id);
        default: return true;
      }
    });
  };
  function sync() {
    main.querySelectorAll('#lessons .chip').forEach((b) => b.setAttribute('aria-pressed', st.lessons.has(Number(b.dataset.l))));
    for (const [id, v] of [['filter', st.filter], ['dir', st.dir], ['size', String(st.size)]]) {
      main.querySelectorAll(`#${id} button`).forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v));
    }
    const n = pool().length;
    const take = st.size ? Math.min(st.size, n) : n;
    $('#cnt').textContent = n ? `${n} thẻ phù hợp · phiên này học ${take} thẻ` : 'Không có thẻ phù hợp – hãy chọn thêm bài hoặc loại thẻ khác';
    $('#go').disabled = !n;
  }
  $('#lessons').addEventListener('click', (e) => {
    const b = e.target.closest('[data-l]'); if (!b) return;
    const l = Number(b.dataset.l);
    st.lessons.has(l) ? st.lessons.delete(l) : st.lessons.add(l);
    sync();
  });
  $('#all').onclick = () => { data.lessons.forEach((l) => st.lessons.add(l.id)); sync(); };
  $('#none').onclick = () => { st.lessons.clear(); sync(); };
  for (const key of ['filter', 'dir', 'size']) {
    $(`#${key}`).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      st[key] = key === 'size' ? Number(b.dataset.v) : b.dataset.v;
      sync();
    });
  }
  $('#hv').onchange = (e) => saveSettings({ hvHint: e.target.checked });
  $('#sp').onchange = (e) => saveSettings({ autoSpeak: e.target.checked });
  $('#go').onclick = () => {
    saveSettings({ fcLessons: [...st.lessons], fcFilter: st.filter, fcSize: st.size, fcDir: st.dir });
    let ids = shuffle(pool());
    if (st.size) ids = ids.slice(0, st.size);
    const label = st.lessons.size === data.lessons.length ? 'Tất cả bài' : `Bài ${[...st.lessons].sort((a, b) => a - b).join(', ')}`;
    main.innerHTML = '';
    cleanupRef.fn = startSession(main, { ids, label });
  };
  sync();
}

// ---------------- session ----------------
function startSession(main, deck, saved = null) {
  const dir = saved?.dir || settings.fcDir || 'jp';
  const queue = saved ? [...saved.queue] : shuffle([...deck.ids]);
  const firstGrade = new Map(saved?.firstGrade || []); // id → first grade in this session (for the summary)
  const history = [];
  let pos = saved?.pos || 0;
  let flipped = false;

  const save = () => saveFcSession({
    label: deck.label, ids: deck.ids, dir, queue, pos, firstGrade: [...firstGrade],
  });
  if (!saved) save(); // a new session replaces any older unfinished one

  main.innerHTML = `
    <div class="study">
      <div class="study-top">
        <a class="btn ghost sm" href="#/flashcard" title="Thoát – phiên được lưu, có thể tiếp tục sau">✕</a>
        <span class="count" id="count"></span>
        <div class="bar"><span class="done" id="bar"></span></div>
        <button class="btn ghost sm" type="button" id="shuf" title="Xáo trộn các thẻ còn lại (S)">⤮ Xáo trộn</button>
      </div>
      <div class="muted small" style="margin:-4px 0 10px">${esc(deck.label)} · ${dir === 'jp' ? 'Nhật → Việt' : 'Việt → Nhật'}</div>
      <div id="stage"></div>
    </div>`;
  const stage = main.querySelector('#stage');
  const $count = main.querySelector('#count');
  const $bar = main.querySelector('#bar');
  main.querySelector('#shuf').onclick = reshuffle;

  function reshuffle() {
    if (pos >= queue.length) return;
    const rest = shuffle(queue.splice(pos));
    queue.push(...rest);
    flipped = false;
    save();
    draw();
  }

  function front(w) {
    if (dir === 'vi') {
      return `<div class="meaning-front">${esc(w.m)}</div>
        ${settings.hvHint ? `<div class="kinfo">${kanjiChips(w, { link: false })}</div>` : ''}`;
    }
    return `<div class="word${w.w.length > 5 ? ' long' : ''} furi-space" lang="ja">${ruby(w.t)}</div>
      ${settings.hvHint ? `<div class="kinfo">${kanjiChips(w, { link: false })}</div>` : ''}`;
  }
  function back(w) {
    return `<div class="back-word furi-always" lang="ja">${ruby(w.t)}</div>
      <div class="reading" lang="ja">${esc(w.r.replace('/', ' / '))}</div>
      <div class="meaning">${esc(w.m)}</div>
      ${w.note ? `<div class="note">* ${esc(w.note)}</div>` : ''}
      <div class="kinfo">${kanjiChips(w, { link: false })}</div>`;
  }

  function draw() {
    const done = pos;
    $count.textContent = `${Math.min(pos + 1, queue.length)}/${queue.length}`;
    $bar.style.width = `${(done / queue.length) * 100}%`;
    if (pos >= queue.length) return finish();
    const w = data.wordById.get(queue[pos]);
    stage.innerHTML = `
      <div class="fc-wrap"><div class="fc${flipped ? ' flipped' : ''}" id="card" tabindex="0" role="button" aria-label="Thẻ – bấm để lật">
        <div class="fc-face fc-front">
          <span class="corner">${statusText(w.id)}</span>
          <span class="corner-r"><button class="speak" type="button" data-act="speak" title="Nghe (P)">🔊</button></span>
          ${front(w)}
          <div class="hint">Chạm hoặc nhấn <kbd>Space</kbd> để lật</div>
        </div>
        <div class="fc-face fc-back">
          <span class="corner-r"><button class="speak" type="button" data-act="speak" title="Nghe (P)">🔊</button></span>
          ${back(w)}
        </div>
      </div></div>
      <div id="actions">${actions()}</div>
      <div class="study-tools">
        <button class="btn ghost sm" type="button" data-act="undo" ${history.length ? '' : 'disabled'}>↶ Hoàn tác <kbd>Z</kbd></button>
        <a class="btn ghost sm" href="#/kanji/${encodeURIComponent(w.ks[0] || '')}" ${w.ks.length ? '' : 'hidden'}>Xem hán tự</a>
      </div>`;
    bindCard();
  }

  function actions() {
    if (!flipped) return `<div class="flip-row"><button class="btn primary block" type="button" data-act="flip" style="min-height:56px">Lật thẻ <kbd>Space</kbd></button></div>`;
    return `<div class="grade">
      <button class="btn bad" type="button" data-g="0">Chưa nhớ<small>ôn lại ngay · <kbd>1</kbd></small></button>
      <button class="btn good" type="button" data-g="1">Nhớ<small>${nextLabel(1)} · <kbd>2</kbd></small></button>
      <button class="btn" type="button" data-g="2">Dễ<small>${nextLabel(2)} · <kbd>3</kbd></small></button>
    </div>`;
  }

  function nextLabel(g) {
    const cur = getItem(queue[pos])?.lv || 0;
    const lv = Math.min(INTERVALS.length - 1, cur + (g === 2 ? 2 : 1));
    return `ôn sau ${INTERVALS[lv]} ngày`;
  }

  function flip() {
    flipped = !flipped;
    const card = stage.querySelector('#card');
    card.classList.toggle('flipped', flipped);
    stage.querySelector('#actions').innerHTML = actions();
    if (flipped && settings.autoSpeak) speak(data.wordById.get(queue[pos]));
  }

  function grade(g) {
    if (!flipped || pos >= queue.length) return;
    const id = queue[pos];
    const prev = gradeCard(id, g);
    const isFirst = !firstGrade.has(id);
    if (isFirst) firstGrade.set(id, g);
    const requeued = g === 0;
    if (requeued) queue.push(id);
    history.push({ id, prev, requeued, isFirst });
    pos++;
    flipped = false;
    save();
    draw();
  }

  function undo() {
    const h = history.pop();
    if (!h) return;
    restoreItem(h.id, h.prev);
    if (h.requeued) queue.pop();
    if (h.isFirst) firstGrade.delete(h.id);
    pos--;
    flipped = true;
    save();
    draw();
  }

  function bindCard() {
    const card = stage.querySelector('#card');
    stage.onclick = (e) => {
      const a = e.target.closest('[data-act]');
      const g = e.target.closest('[data-g]');
      if (a?.dataset.act === 'speak') { e.stopPropagation(); speak(data.wordById.get(queue[pos])); return; }
      if (a?.dataset.act === 'undo') return undo();
      if (a?.dataset.act === 'flip') return flip();
      if (g) return grade(Number(g.dataset.g));
      if (e.target.closest('#card') && !dragMoved) flip();
    };
    // swipe gestures
    let x0 = null, y0 = null, dragMoved = false;
    card.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('button')) return;
      x0 = e.clientX; y0 = e.clientY; dragMoved = false;
    });
    card.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        dragMoved = true;
        card.classList.add('dragging');
        card.style.transform = `${flipped ? 'rotateY(180deg) ' : ''}translateX(${flipped ? -dx : dx}px) rotate(${dx / 30}deg)`;
        card.classList.toggle('swipe-good', flipped && dx > 70);
        card.classList.toggle('swipe-bad', flipped && dx < -70);
      }
    });
    const end = (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      card.classList.remove('dragging', 'swipe-good', 'swipe-bad');
      card.style.transform = '';
      if (!dragMoved) return;
      setTimeout(() => { dragMoved = false; }, 0);
      if (!flipped) { if (Math.abs(dx) > 70) flip(); return; }
      if (dx > 90) grade(1); else if (dx < -90) grade(0);
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  function finish() {
    clearFcSession();
    const ids = [...firstGrade.keys()];
    const again = ids.filter((id) => firstGrade.get(id) === 0);
    const good = ids.length - again.length;
    stage.innerHTML = `
      <div class="card summary">
        <h2>Hoàn thành phiên học!</h2>
        <div class="big-num">${good}/${ids.length}</div>
        <p class="muted">thẻ nhớ ngay lần đầu</p>
        ${again.length ? `<div style="text-align:left;margin:14px 0"><b>Cần ôn thêm (${again.length}):</b>
          <ul class="wlist">${again.map((id) => { const w = data.wordById.get(id); return `<li class="witem" style="grid-template-columns:1fr 1.4fr">
            <div class="w">${ruby(w.t)}</div><div class="m">${esc(w.m)}</div></li>`; }).join('')}</ul></div>` : ''}
        <div class="row" style="justify-content:center;margin-top:12px">
          ${again.length ? '<button class="btn primary" type="button" data-act="again">Học lại thẻ chưa nhớ</button>' : ''}
          <button class="btn ${again.length ? '' : 'primary'}" type="button" data-act="restart">Học lại cả bộ (xáo trộn)</button>
          <button class="btn" type="button" data-act="quiz">Làm bài tập bộ này</button>
          <a class="btn ghost" href="#/flashcard">Chọn bộ khác</a>
        </div>
      </div>`;
    stage.onclick = (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'again') restart(again, `${deck.label} – thẻ chưa nhớ`);
      if (a === 'restart') restart(deck.ids, deck.label);
      if (a === 'quiz') { temp.deck = { ids: [...deck.ids], label: deck.label }; location.hash = '#/quiz?src=custom'; }
    };
  }

  function restart(ids, label) {
    document.removeEventListener('keydown', onKey);
    main.innerHTML = '';
    cleanupRef.fn = startSession(main, { ids, label });
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.tagName === 'INPUT') return;
    if (pos >= queue.length) { // summary screen: Enter = main button
      if (e.key === 'Enter' && !e.target.closest?.('button, a')) { e.preventDefault(); stage.querySelector('.summary .btn.primary')?.click(); }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') { e.preventDefault(); flip(); }
    else if (flipped && (k === '1' || k === 'arrowleft')) grade(0);
    else if (flipped && (k === '2' || k === 'arrowright')) grade(1);
    else if (flipped && k === '3') grade(2);
    else if (k === 'z') undo();
    else if (k === 's') reshuffle();
    else if (k === 'p') speak(data.wordById.get(queue[pos]));
  }
  document.addEventListener('keydown', onKey);
  draw();
  return () => document.removeEventListener('keydown', onKey);
}

function statusText(id) {
  if (isDue(id)) return 'Cần ôn';
  return { new: 'Từ mới', learning: 'Đang học', mastered: 'Đã thuộc' }[wordStatus(id)];
}
