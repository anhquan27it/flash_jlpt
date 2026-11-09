// Kanji list (grouped by lesson) and kanji detail page — the detail page focuses on the
// vocabulary that uses the kanji, which is what matters most for the exam.
import { data, summary, lessonWordIds } from '../store.js';
import { esc, normVi, kataToHira } from '../util.js';
import { wordRow, bindSpeak, kanjiStatus, lessonOptions, progressBar } from './common.js';

export function render(main, params) {
  if (params.sub === 'detail') return renderDetail(main, decodeURIComponent(params.match[1]));
  return renderList(main, params);
}

function renderList(main, params) {
  const lesson = params.l ? Number(params.l) : '';
  main.innerHTML = `
    <div class="page-head">
      <div><h1>Hán tự N4</h1><p>${data.kanji.length} chữ · bấm vào chữ để xem từ vựng của chữ đó</p></div>
    </div>
    <div class="toolbar">
      <div class="search"><input class="input" id="kq" type="search" placeholder="Tìm chữ, âm Hán Việt (vd: dong), cách đọc…" aria-label="Tìm hán tự"></div>
      <select class="input" id="kl" style="width:auto" aria-label="Lọc theo bài">${lessonOptions(lesson)}</select>
    </div>
    <div class="legend" style="margin:-6px 0 16px"><span><i style="background:var(--good)"></i>Đã thuộc hết từ</span>
      <span><i style="background:var(--warn)"></i>Đang học</span><span><i style="background:var(--surface-3)"></i>Chưa học</span></div>
    <div id="klist"></div>`;

  const q = main.querySelector('#kq');
  const sel = main.querySelector('#kl');
  const list = main.querySelector('#klist');

  function draw() {
    const term = q.value.trim();
    const tv = normVi(term);
    const th = kataToHira(term);
    const lf = sel.value ? Number(sel.value) : null;
    const match = (k) => !term || k.k === term || normVi(k.hv).includes(tv)
      || k.on.some((r) => kataToHira(r).includes(th)) || k.kun.some((r) => r.replace('・', '').includes(th))
      || k.words.some((id) => id.includes(term));
    const blocks = data.lessons.filter((l) => !lf || l.id === lf).map((l) => {
      const ks = l.kanji.map((c) => data.kanjiByChar.get(c)).filter(match);
      if (!ks.length) return '';
      const s = summary(lessonWordIds(l.id));
      return `<section class="lesson-block">
        <h2>Bài ${l.id} <span class="muted small" style="font-weight:500">${l.kanji.length} chữ · ${s.total} từ · đã thuộc ${s.mastered}</span>
          <span class="spacer"></span>
          <a class="btn sm" href="#/flashcard?src=lesson:${l.id}">Flashcard</a>
          <a class="btn sm" href="#/quiz?src=lesson:${l.id}">Bài tập</a></h2>
        ${lf ? `<div style="margin:-4px 0 12px">${progressBar(s)}</div>` : ''}
        <div class="kgrid">${ks.map((k) => `
          <a class="ktile" href="#/kanji/${encodeURIComponent(k.k)}" title="${esc(k.hv)} – ${k.words.length} từ">
            <span class="dot s-${kanjiStatus(k)}"></span>
            <span class="k">${esc(k.k)}</span><span class="h">${esc(k.hv)}</span></a>`).join('')}</div>
      </section>`;
    }).join('');
    list.innerHTML = blocks || '<div class="empty">Không tìm thấy hán tự phù hợp.</div>';
  }
  q.addEventListener('input', draw);
  sel.addEventListener('change', () => {
    history.replaceState(null, '', sel.value ? `#/kanji?l=${sel.value}` : '#/kanji');
    draw();
  });
  draw();
}

function renderDetail(main, char) {
  const k = data.kanjiByChar.get(char);
  if (!k) {
    main.innerHTML = '<div class="empty">Không tìm thấy hán tự này. <a href="#/kanji">Về danh sách</a></div>';
    return;
  }
  const prev = data.kanji[k.index - 1];
  const next = data.kanji[k.index + 1];
  const words = k.words.map((id) => data.wordById.get(id));
  const fmt = (arr) => (arr.length ? arr.map((r) => `<span>${esc(r)}</span>`).join('') : '<span class="muted">—</span>');

  main.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <a class="btn ghost sm" href="#/kanji?l=${k.l}">← Bài ${k.l}</a>
    </div>
    <div class="kdetail">
      <aside class="card kcard">
        <div class="muted small">Bài ${esc(k.p)}</div>
        <div class="big" lang="ja">${esc(k.k)}</div>
        <div class="hv">${esc(k.hv)}</div>
        <dl class="readings">
          <dt>Âm On<br><span class="jp">音</span></dt><dd>${fmt(k.on)}</dd>
          <dt>Âm Kun<br><span class="jp">訓</span></dt><dd>${fmt(k.kun)}</dd>
        </dl>
        <div class="row" style="margin-top:16px">
          <a class="btn primary" style="flex:1" href="#/flashcard?src=kanji:${encodeURIComponent(k.k)}">Flashcard</a>
          <a class="btn" style="flex:1" href="#/quiz?src=kanji:${encodeURIComponent(k.k)}">Bài tập</a>
        </div>
      </aside>
      <section class="card" style="padding:6px 8px">
        <h2 style="padding:12px 10px 4px">Từ vựng chứa chữ <span class="jp">${esc(k.k)}</span> <span class="muted small">(${words.length})</span></h2>
        <ul class="wlist">${words.map((w) => wordRow(w, { showReading: true })).join('')}</ul>
      </section>
    </div>
    <div class="pager">
      ${prev ? `<a class="btn" href="#/kanji/${encodeURIComponent(prev.k)}">← <span class="jp">${esc(prev.k)}</span> ${esc(prev.hv)}</a>` : '<span></span>'}
      ${next ? `<a class="btn" href="#/kanji/${encodeURIComponent(next.k)}"><span class="jp">${esc(next.k)}</span> ${esc(next.hv)} →</a>` : '<span></span>'}
    </div>`;
  bindSpeak(main);

  const onKey = (e) => {
    if (e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowLeft' && prev) location.hash = `#/kanji/${encodeURIComponent(prev.k)}`;
    if (e.key === 'ArrowRight' && next) location.hash = `#/kanji/${encodeURIComponent(next.k)}`;
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
