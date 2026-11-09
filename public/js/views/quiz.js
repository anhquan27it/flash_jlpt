// Multiple-choice / typing quiz. Wrong answers are fed back into spaced repetition.
// Keyboard: 1–4 choose · Enter next.
import { data, settings, saveSettings, wordStatus, isDue, isWeak, recordQuiz, temp, lessonWordIds } from '../store.js';
import { esc, ruby, speak, romajiToKana, normReading, shuffle } from '../util.js';
import { resolveSource, kanjiChips } from './common.js';
import { TYPES, makeQuiz, homographs } from './quizgen.js';

const COUNTS = [10, 20, 30, 50];
const FILTERS = [['all', 'Tất cả'], ['learned', 'Từ đã học'], ['due', 'Cần ôn'], ['weak', 'Hay sai']];
const DEFAULT_TYPES = ['read', 'write', 'meaning', 'word'];

const cleanupRef = { fn: null };

export function render(main, params) {
  cleanupRef.fn = null;
  const fixed = resolveSource(params.src, temp);
  if (fixed) {
    if (!fixed.ids.length) {
      main.innerHTML = `<div class="empty"><h2>Không có câu hỏi</h2><p>${esc(fixed.label)} hiện không có từ nào.</p>
        <a class="btn primary" href="#/quiz">Chọn bài khác</a></div>`;
    } else {
      cleanupRef.fn = run(main, { ids: fixed.ids, label: fixed.label });
    }
  } else {
    renderSetup(main);
  }
  return () => cleanupRef.fn && cleanupRef.fn();
}

function renderSetup(main) {
  const st = {
    lessons: new Set(settings.qzLessons?.length ? settings.qzLessons : [data.lessons[0].id]),
    filter: settings.qzFilter || 'all',
    types: new Set(settings.qzTypes || DEFAULT_TYPES),
    count: settings.qzCount || 20,
  };
  main.innerHTML = `
    <div class="page-head"><div><h1>Bài tập</h1><p>Trắc nghiệm nhiều dạng theo kiểu đề JLPT – câu hỏi luôn được xáo trộn</p></div></div>
    <div class="card setup">
      <div class="group"><div class="lbl">Bài học <span class="spacer"></span>
        <button class="btn sm ghost" type="button" id="all">Chọn tất cả</button>
        <button class="btn sm ghost" type="button" id="none">Bỏ chọn</button></div>
        <div class="chips" id="lessons">${data.lessons.map((l) => `<button class="chip" type="button" data-l="${l.id}">Bài ${l.id}</button>`).join('')}</div>
      </div>
      <div class="group"><div class="lbl">Dạng câu hỏi</div>
        <div class="checks" id="types">${Object.entries(TYPES).map(([k, t]) => `
          <label class="check"><input type="checkbox" value="${k}" ${st.types.has(k) ? 'checked' : ''}>
          <div><b>${t.name}</b><span>${t.desc}</span></div></label>`).join('')}</div>
      </div>
      <div class="grid-2">
        <div class="group"><div class="lbl">Nguồn từ</div>
          <div class="seg" id="filter">${FILTERS.map(([v, t]) => `<button type="button" data-v="${v}">${t}</button>`).join('')}</div></div>
        <div class="group"><div class="lbl">Số câu</div>
          <div class="seg" id="count">${COUNTS.map((n) => `<button type="button" data-v="${n}">${n}</button>`).join('')}</div></div>
      </div>
      <div class="group checks">
        <label class="check"><input type="checkbox" id="an" ${settings.autoNext ? 'checked' : ''}><div><b>Tự chuyển câu khi đúng</b><span>Trả lời sai sẽ dừng lại để xem giải thích</span></div></label>
      </div>
      <div class="setup-foot"><span class="muted" id="cnt"></span><span class="spacer"></span>
        <button class="btn primary" type="button" id="go">Bắt đầu</button></div>
    </div>`;

  const $ = (s) => main.querySelector(s);
  const pool = () => {
    const ids = new Set();
    for (const l of st.lessons) lessonWordIds(l).forEach((id) => ids.add(id));
    return [...ids].filter((id) => (st.filter === 'learned' ? wordStatus(id) !== 'new'
      : st.filter === 'due' ? isDue(id) : st.filter === 'weak' ? isWeak(id) : true));
  };
  function sync() {
    main.querySelectorAll('#lessons .chip').forEach((b) => b.setAttribute('aria-pressed', st.lessons.has(Number(b.dataset.l))));
    main.querySelectorAll('#filter button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === st.filter));
    main.querySelectorAll('#count button').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.v) === st.count));
    const n = pool().length;
    $('#cnt').textContent = !st.types.size ? 'Hãy chọn ít nhất một dạng câu hỏi'
      : n ? `${n} từ phù hợp` : 'Không có từ phù hợp – hãy chọn thêm bài hoặc nguồn khác';
    $('#go').disabled = !n || !st.types.size;
  }
  $('#lessons').addEventListener('click', (e) => {
    const b = e.target.closest('[data-l]'); if (!b) return;
    const l = Number(b.dataset.l);
    st.lessons.has(l) ? st.lessons.delete(l) : st.lessons.add(l);
    sync();
  });
  $('#all').onclick = () => { data.lessons.forEach((l) => st.lessons.add(l.id)); sync(); };
  $('#none').onclick = () => { st.lessons.clear(); sync(); };
  $('#types').addEventListener('change', (e) => { e.target.checked ? st.types.add(e.target.value) : st.types.delete(e.target.value); sync(); });
  $('#filter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.filter = b.dataset.v; sync(); } });
  $('#count').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.count = Number(b.dataset.v); sync(); } });
  $('#an').onchange = (e) => saveSettings({ autoNext: e.target.checked });
  $('#go').onclick = () => {
    saveSettings({ qzLessons: [...st.lessons], qzFilter: st.filter, qzTypes: [...st.types], qzCount: st.count });
    const label = st.lessons.size === data.lessons.length ? 'Tất cả bài' : `Bài ${[...st.lessons].sort((a, b) => a - b).join(', ')}`;
    main.innerHTML = '';
    cleanupRef.fn = run(main, { ids: pool(), label });
  };
  sync();
}

// ---------------- running a quiz ----------------
function run(main, deck, preset) {
  const types = (settings.qzTypes || DEFAULT_TYPES).filter((t) => TYPES[t]);
  const questions = preset || makeQuiz(deck.ids, types.length ? types : DEFAULT_TYPES, settings.qzCount || 20);
  const answers = []; // {q, ok, given}
  let i = 0;
  let locked = false;
  let timer = null;

  main.innerHTML = `
    <div class="study">
      <div class="study-top">
        <a class="btn ghost sm" href="#/quiz" title="Thoát">✕</a>
        <span class="count" id="count"></span>
        <div class="bar"><span class="done" id="bar"></span></div>
        <span class="muted small" id="score"></span>
      </div>
      <div class="muted small" style="margin:-4px 0 10px">${esc(deck.label)}</div>
      <div id="stage"></div>
    </div>`;
  const stage = main.querySelector('#stage');

  function prompt(q) {
    const w = q.word;
    switch (q.type) {
      case 'read':
      case 'type':
        return `<div class="jp-big furi-never" lang="ja"><span class="u">${esc(w.w)}</span></div>
          ${homographs(w).length ? `<div class="qsub">Nghĩa: ${esc(w.m)}</div>` : ''}
          <div class="qsub">${q.type === 'type' ? 'Gõ cách đọc bằng hiragana (hoặc romaji)' : 'Chọn cách đọc đúng'}</div>`;
      case 'write':
        return `<div class="jp-big" lang="ja">${esc(w.r.replace('/', '／'))}</div><div class="qsub">Nghĩa: ${esc(w.m)}</div>`;
      case 'meaning':
        return `<div class="jp-big furi-space" lang="ja">${ruby(w.t)}</div><div class="qsub">Chọn nghĩa đúng</div>`;
      case 'word':
        return `<div class="vi-big">${esc(w.m)}</div><div class="qsub">Chọn từ tiếng Nhật đúng</div>`;
      case 'hv':
        return `<div class="kanji-big" lang="ja">${esc(q.kanji.k)}</div><div class="qsub">Âm Hán Việt của chữ này là?</div>`;
      default: return '';
    }
  }

  function optionHtml(q, o) {
    if (q.type === 'word') return `<span class="tx jp" lang="ja">${ruby(o.t)}</span>`;
    if (q.type === 'read' || q.type === 'write') return `<span class="tx jp" lang="ja">${esc(o)}</span>`;
    return `<span class="tx">${esc(o)}</span>`;
  }

  function draw() {
    if (i >= questions.length) return finish();
    locked = false;
    const q = questions[i];
    main.querySelector('#count').textContent = `${i + 1}/${questions.length}`;
    main.querySelector('#bar').style.width = `${(i / questions.length) * 100}%`;
    main.querySelector('#score').textContent = `✓ ${answers.filter((a) => a.ok).length}`;
    stage.innerHTML = `
      <div class="card qbox">
        <div class="qtype">${TYPES[q.type].name}</div>
        <div class="qprompt">${prompt(q)}</div>
        ${q.type === 'type'
          ? `<form class="typein" id="tf" autocomplete="off"><input class="input" id="ti" lang="ja" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ひらがな / romaji" aria-label="Cách đọc">
             <button class="btn primary" type="submit">Kiểm tra</button></form>`
          : `<div class="options">${q.options.map((o, k) => `<button class="opt" type="button" data-k="${k}"><span class="n">${k + 1}</span>${optionHtml(q, o)}</button>`).join('')}</div>`}
        <div id="fb"></div>
      </div>`;
    if (q.type === 'type') {
      const inp = stage.querySelector('#ti');
      inp.focus();
      inp.addEventListener('input', () => {
        const pos = inp.value.length;
        const conv = romajiToKana(inp.value, false);
        if (conv !== inp.value) { inp.value = conv; inp.setSelectionRange(pos, pos); inp.setSelectionRange(conv.length, conv.length); }
      });
      stage.querySelector('#tf').addEventListener('submit', (e) => {
        e.preventDefault();
        if (locked) return next();
        const given = normReading(inp.value);
        if (!given) return;
        const ok = q.accept.some((r) => normReading(r) === given);
        inp.classList.add(ok ? 'ok' : 'no');
        inp.readOnly = true;
        answer(ok, inp.value);
      });
    }
  }

  function answer(ok, given) {
    locked = true;
    const q = questions[i];
    answers.push({ q, ok, given });
    if (q.type !== 'hv') recordQuiz(q.word.id, ok);
    const w = q.word;
    const extra = q.type === 'hv' ? `<b class="jp">${esc(q.kanji.k)}</b> = <b>${esc(q.kanji.hv)}</b> · ` : '';
    stage.querySelector('#fb').innerHTML = `
      <div class="feedback ${ok ? 'ok' : 'no'}">
        <span class="res">${ok ? '✓ Chính xác' : '✗ Chưa đúng'}</span>
        <span class="fw furi-always" lang="ja">${ruby(w.t)}</span>
        <button class="speak" type="button" data-act="speak" title="Nghe">🔊</button>
        <span class="spacer"></span>
        <button class="btn primary sm" type="button" data-act="next">Tiếp <kbd>Enter</kbd></button>
        <div class="fm">${extra}${esc(w.r)} – ${esc(w.m)}<div style="margin-top:4px">${kanjiChips(w)}</div></div>
      </div>`;
    if (ok && settings.autoNext) timer = setTimeout(next, 1100);
    else stage.querySelector('[data-act="next"]').focus({ preventScroll: true });
  }

  function choose(k) {
    if (locked) return;
    const q = questions[i];
    if (q.type === 'type' || k >= q.options.length) return;
    const ok = k === q.answer;
    stage.querySelectorAll('.opt').forEach((b, idx) => {
      b.disabled = true;
      if (idx === q.answer) b.classList.add('correct');
      else if (idx === k) b.classList.add('wrong');
    });
    const o = q.options[k];
    answer(ok, typeof o === 'object' ? o.w : o);
  }

  function next() {
    clearTimeout(timer);
    if (!locked) return;
    i++;
    draw();
  }

  stage.addEventListener('click', (e) => {
    const opt = e.target.closest('.opt');
    if (opt) return choose(Number(opt.dataset.k));
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'next') next();
    if (act === 'speak') speak(questions[i]?.word || answers[answers.length - 1].q.word);
  });

  function finish() {
    clearTimeout(timer);
    const right = answers.filter((a) => a.ok).length;
    const wrong = answers.filter((a) => !a.ok);
    const pct = answers.length ? Math.round((right / answers.length) * 100) : 0;
    main.querySelector('#bar').style.width = '100%';
    main.querySelector('#count').textContent = `${answers.length}/${questions.length}`;
    stage.innerHTML = `
      <div class="card summary">
        <h2>${pct >= 80 ? 'Rất tốt!' : pct >= 50 ? 'Khá lắm, cố thêm chút nữa!' : 'Cần ôn thêm nhé!'}</h2>
        <div class="big-num">${right}/${answers.length}</div>
        <p class="muted">${pct}% câu trả lời đúng</p>
        ${wrong.length ? `<div style="text-align:left;margin-top:14px"><b>Các câu sai (${wrong.length}):</b>
          <ul class="wlist review-list">${wrong.map((a) => `<li class="witem" style="grid-template-columns:1fr 1.5fr">
            <div class="w furi-always">${ruby(a.q.word.t)}</div>
            <div class="m"><span class="muted small">${TYPES[a.q.type].name}</span><br>${a.q.type === 'hv' ? `<b class="jp">${esc(a.q.kanji.k)}</b> = ${esc(a.q.kanji.hv)} · ` : ''}${esc(a.q.word.r)} – ${esc(a.q.word.m)}
            <span class="your">Bạn chọn: ${esc(a.given)}</span></div></li>`).join('')}</ul></div>` : ''}
        <div class="row" style="justify-content:center;margin-top:16px">
          ${wrong.length ? '<button class="btn primary" type="button" data-fin="retry">Làm lại câu sai</button>' : ''}
          <button class="btn ${wrong.length ? '' : 'primary'}" type="button" data-fin="new">Bài mới (xáo trộn)</button>
          ${wrong.length ? '<button class="btn" type="button" data-fin="fc">Flashcard từ sai</button>' : ''}
          <a class="btn ghost" href="#/quiz">Thiết lập khác</a>
        </div>
      </div>`;
    stage.querySelector('.summary').addEventListener('click', (e) => {
      const a = e.target.closest('[data-fin]')?.dataset.fin;
      if (!a) return;
      e.stopPropagation();
      document.removeEventListener('keydown', onKey);
      if (a === 'retry') {
        // same question types again, freshly generated options, new order
        const redo = shuffle(wrong.map((x) => x.q)).map((q) => {
          if (!q.options) return q;
          const correct = q.options[q.answer];
          const options = shuffle([...q.options]);
          return { ...q, options, answer: options.indexOf(correct) };
        });
        main.innerHTML = '';
        cleanupRef.fn = run(main, { ids: deck.ids, label: `${deck.label} – làm lại câu sai` }, redo);
      } else if (a === 'new') {
        main.innerHTML = '';
        cleanupRef.fn = run(main, deck);
      } else if (a === 'fc') {
        temp.deck = { ids: [...new Set(wrong.map((x) => x.q.word.id))], label: 'Từ làm sai' };
        location.hash = '#/flashcard?src=custom';
      }
    });
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.tagName === 'INPUT') return;
    if (i >= questions.length) return;
    if (/^[1-4]$/.test(e.key)) { e.preventDefault(); choose(Number(e.key) - 1); }
    else if (e.key === 'Enter' && locked) { e.preventDefault(); next(); }
  }
  document.addEventListener('keydown', onKey);
  draw();
  return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); };
}
