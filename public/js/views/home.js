// Dashboard: one clear "next step", a compact progress summary and the lesson grid.
import { data, summary, streak, dayCount, auth, lessonWordIds, loadFcSession } from '../store.js';
import { esc, todayKey } from '../util.js';
import { resumeBanner, bindResumeBanner } from './flashcard.js';

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const GUEST_NOTE_KEY = 'fj_hide_guest_note';

export function render(main) {
  const all = summary();
  const lessons = data.lessons.map((l) => ({ l, s: summary(lessonWordIds(l.id)) }));
  const current = lessons.find(({ s }) => s.mastered < s.total) || null;
  const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);
  const pm = pct(all.mastered, all.total);
  const pl = pct(all.learning, all.total);

  // ---- main call to action
  let title, sub, actions;
  if (current && current.s.new > 0) {
    title = `Học tiếp Bài ${current.l.id}`;
    sub = `<p class="ks">${esc(current.l.kanji.slice(0, 8).join(''))}${current.l.kanji.length > 8 ? '…' : ''}<small>${current.s.new} từ mới</small></p>`;
    actions = `<a class="btn primary" href="#/flashcard?src=lesson:${current.l.id}">Học flashcard</a>
      <a class="btn" href="#/kanji?l=${current.l.id}">Xem hán tự</a>`;
  } else if (current) {
    title = `Củng cố Bài ${current.l.id}`;
    sub = `<p class="ks">${esc(current.l.kanji.slice(0, 8).join(''))}<small>${current.s.total - current.s.mastered} từ chưa thuộc</small></p>`;
    actions = `<a class="btn primary" href="#/quiz?src=lesson:${current.l.id}">Làm bài tập</a>
      <a class="btn" href="#/flashcard?src=lesson:${current.l.id}">Flashcard</a>`;
  } else {
    title = 'Bạn đã thuộc toàn bộ N4!';
    sub = '<p class="ks"><small>Ôn định kỳ để giữ vững kiến thức.</small></p>';
    actions = '<a class="btn primary" href="#/quiz">Làm bài tập</a>';
  }

  // ---- last 7 days
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const c = dayCount(todayKey(d));
    week.push(`<div class="${i === 0 ? 'today' : ''}" title="${d.toLocaleDateString('vi-VN')}: ${c} lượt">
      <span class="${c ? 'on' : ''}"></span>${i === 0 ? 'Nay' : DAY_NAMES[d.getDay()]}</div>`);
  }
  const st = streak();
  const showGuest = !auth.user && auth.available && !safeGet(GUEST_NOTE_KEY);

  main.innerHTML = `
    <section class="dash">
      <div class="ring" style="--m:${pm};--l:${pl}" role="img" aria-label="Đã thuộc ${pm}% từ vựng N4">
        <div><b>${pm}%</b><small>đã thuộc</small></div>
      </div>
      <div>
        <div class="eyebrow">JLPT N4 · ${data.kanji.length} hán tự · ${all.total} từ</div>
        <h1>${title}</h1>
        ${sub}
        <div class="row">${actions}</div>
      </div>
      <div class="dash-side">
        <div class="kv">
          <div><i style="background:var(--good)"></i><span>Đã thuộc</span><b>${all.mastered}</b></div>
          <div><i style="background:var(--warn)"></i><span>Đang học</span><b>${all.learning}</b></div>
          <div><i style="background:var(--surface-3)"></i><span>Chưa học</span><b>${all.new}</b></div>
        </div>
        <div>
          <div class="streak" style="margin-bottom:8px">${st ? `🔥 ${st} ngày liên tiếp` : 'Bắt đầu chuỗi ngày học'}</div>
          <div class="week">${week.join('')}</div>
        </div>
      </div>
    </section>

    ${resumeBanner(loadFcSession())}
    ${all.due ? `<div class="due-chip"><span><b>${all.due} từ</b> đã đến hạn ôn tập</span><span class="spacer"></span>
      <a class="btn sm primary" href="#/flashcard?src=due">Ôn ngay</a><a class="btn sm" href="#/quiz?src=due">Bài tập</a></div>` : ''}
    ${all.weak ? `<div class="note-line"><span>Có ${all.weak} từ bạn hay sai · <a href="#/flashcard?src=weak">Ôn lại</a></span></div>` : ''}
    ${showGuest ? `<div class="note-line" id="guest"><span>Đang học ở chế độ khách – <a href="#/account">đăng nhập</a> để lưu tiến trình trên mọi thiết bị.</span>
      <button type="button" aria-label="Ẩn thông báo" title="Ẩn">✕</button></div>` : ''}

    <div class="sec-head"><h2>Bài học</h2><span class="muted small">Bài ${data.lessons[0].id}–${data.lessons[data.lessons.length - 1].id}</span></div>
    <div class="llist" style="--rows:${Math.ceil(lessons.length / 2)}">${lessons.map(({ l, s }) => {
      const m = pct(s.mastered, s.total);
      const isCur = current && current.l.id === l.id;
      return `<a class="lrow${isCur ? ' current' : ''}${m === 100 ? ' done' : ''}" href="#/kanji?l=${l.id}"
          aria-label="Bài ${l.id}: ${l.kanji.length} chữ, ${s.total} từ, đã thuộc ${s.mastered}">
        <span class="lring" style="--m:${m};--l:${pct(s.learning, s.total)}"><span>${m === 100 ? '✓' : l.id}</span></span>
        <span class="lbody">
          <span class="lt">Bài ${l.id}${isCur ? '<em>Đang học</em>' : ''}</span>
          <span class="lk" lang="ja">${esc(l.kanji.join(''))}</span>
        </span>
        <span class="lmeta" title="Đã thuộc ${s.mastered}/${s.total} từ">${s.mastered || s.learning ? `<b>${s.mastered}</b>/${s.total}` : `${s.total} từ`}</span>
        <span class="chev" aria-hidden="true">›</span>
      </a>`;
    }).join('')}</div>`;

  bindResumeBanner(main);
  main.querySelector('#guest button')?.addEventListener('click', () => {
    try { localStorage.setItem(GUEST_NOTE_KEY, '1'); } catch { /* ignore */ }
    main.querySelector('#guest').remove();
  });
}

function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
