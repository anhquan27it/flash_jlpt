// Login / register, and account + display settings once logged in.
import { auth, login, logout, flush, settings, saveSettings, summary, exportProgress, importProgress } from '../store.js';
import { esc, toast, todayKey } from '../util.js';

// ---- backup to / restore from a file on this computer ----
function backupCard() {
  const s = summary();
  return `<div class="card backup" style="margin-top:16px">
    <h2>Sao lưu tiến trình</h2>
    <p class="small" style="margin:0">Tiến trình flashcard được lưu tự động trên trình duyệt này
      (đã học <b>${s.mastered + s.learning}</b> từ, đã thuộc <b>${s.mastered}</b>).
      Lưu thành file trên máy để giữ an toàn khi xoá dữ liệu trình duyệt, hoặc chuyển sang máy khác.</p>
    <div class="row">
      <button class="btn primary" type="button" id="exp">⭳ Lưu file tiến trình</button>
      <label class="btn" for="imp" style="cursor:pointer">⭱ Nhập từ file</label>
      <input type="file" id="imp" accept=".json,application/json" hidden>
    </div>
  </div>`;
}

function bindBackup(main, rerender) {
  main.querySelector('#exp')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportProgress(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flashjlpt-tien-trinh-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Đã lưu file tiến trình');
  });
  main.querySelector('#imp')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const n = importProgress(JSON.parse(await file.text()));
      toast(n ? `Đã nhập tiến trình của ${n} từ` : 'Tiến trình trên máy đã mới hơn file – không có gì thay đổi');
      rerender();
    } catch (ex) {
      toast(ex instanceof SyntaxError ? 'File không đúng định dạng JSON' : ex.message);
    }
  });
}

export function render(main) {
  if (auth.user) return renderAccount(main);
  if (!auth.available) {
    main.innerHTML = `<div class="auth"><div class="card">
      <h2>Tài khoản</h2>
      <div class="alert info">Phiên bản web tĩnh này (GitHub Pages) không có máy chủ nên chưa hỗ trợ đăng nhập.
        Tiến trình học của bạn vẫn <b>được lưu tự động trên trình duyệt này</b>.</div>
      <p class="muted small" style="margin:0">Để dùng tài khoản và đồng bộ giữa nhiều thiết bị, hãy chạy bản có máy chủ (<code>npm start</code>)
        hoặc triển khai lên dịch vụ hỗ trợ Node.js.</p>
    </div>${backupCard()}</div>`;
    bindBackup(main, () => render(main));
    return;
  }
  renderLogin(main);
}

function renderLogin(main) {
  let mode = 'login';
  main.innerHTML = `
    <div class="auth">
      <div class="card">
        <div class="seg" style="width:100%;display:grid;grid-template-columns:1fr 1fr;margin-bottom:18px" id="mode">
          <button type="button" data-v="login" aria-pressed="true">Đăng nhập</button>
          <button type="button" data-v="register" aria-pressed="false">Tạo tài khoản</button>
        </div>
        <div id="err"></div>
        <form id="f" novalidate>
          <div class="field"><label for="u">Tên đăng nhập</label>
            <input class="input" id="u" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required minlength="3" maxlength="32"></div>
          <div class="field"><label for="p">Mật khẩu</label>
            <input class="input" id="p" name="password" type="password" autocomplete="current-password" required minlength="6" maxlength="128"></div>
          <div class="field" id="p2wrap" hidden><label for="p2">Nhập lại mật khẩu</label>
            <input class="input" id="p2" type="password" autocomplete="new-password" maxlength="128"></div>
          <button class="btn primary block" type="submit" id="sub">Đăng nhập</button>
        </form>
        <p class="muted small" style="margin:14px 0 0">Tiến trình bạn đã học ở chế độ khách sẽ được tự động gộp vào tài khoản.</p>
      </div>
      ${backupCard()}
    </div>`;
  const $ = (s) => main.querySelector(s);
  bindBackup(main, () => render(main));
  $('#mode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.v;
    main.querySelectorAll('#mode button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $('#p2wrap').hidden = mode !== 'register';
    $('#sub').textContent = mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập';
    $('#p').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('#err').innerHTML = '';
  });
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('#u').value.trim(), p = $('#p').value;
    const err = (m) => { $('#err').innerHTML = `<div class="alert error" role="alert">${esc(m)}</div>`; };
    if (!u || !p) return err('Vui lòng nhập tên đăng nhập và mật khẩu');
    if (mode === 'register') {
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(u)) return err('Tên đăng nhập 3–32 ký tự, chỉ gồm chữ không dấu, số và . _ -');
      if (p.length < 6) return err('Mật khẩu cần ít nhất 6 ký tự');
      if (p !== $('#p2').value) return err('Mật khẩu nhập lại không khớp');
    }
    $('#sub').disabled = true;
    try {
      await login(u, p, mode === 'register');
      toast(mode === 'register' ? 'Tạo tài khoản thành công!' : 'Đăng nhập thành công!');
      location.hash = '#/';
    } catch (ex) {
      err(ex.message === 'Failed to fetch' ? 'Không kết nối được máy chủ' : ex.message);
    } finally {
      $('#sub').disabled = false;
    }
  });
}

function renderAccount(main) {
  const s = summary();
  const fmt = (t) => (t ? new Date(t).toLocaleString('vi-VN') : 'chưa');
  main.innerHTML = `
    <div class="page-head"><div><h1>Tài khoản</h1><p>Xin chào, <b>${esc(auth.user.username)}</b></p></div></div>
    <div class="grid-2">
      <div class="card">
        <h2>Đồng bộ tiến trình</h2>
        <p>Tiến trình được lưu tự động lên máy chủ sau mỗi lượt học.</p>
        <p class="muted small" id="sync">Lần đồng bộ gần nhất: ${fmt(auth.lastSync)}${auth.error ? ` · <span style="color:var(--bad)">Lỗi: ${esc(auth.error)}</span>` : ''}</p>
        <p>Đã thuộc <b>${s.mastered}</b> · đang học <b>${s.learning}</b> · chưa học <b>${s.new}</b> / ${s.total} từ</p>
        <div class="row"><button class="btn" type="button" id="syncBtn">Đồng bộ ngay</button>
          <button class="btn bad" type="button" id="out">Đăng xuất</button></div>
      </div>
      <div class="card setup">
        <h2>Hiển thị & học tập</h2>
        <div class="group"><div class="lbl">Giao diện</div>
          <div class="seg" id="theme"><button type="button" data-v="auto">Tự động</button><button type="button" data-v="light">Sáng</button><button type="button" data-v="dark">Tối</button></div></div>
        <div class="checks">
          <label class="check"><input type="checkbox" data-k="furigana" ${settings.furigana ? 'checked' : ''}><div><b>Furigana</b><span>Hiện hiragana trên chữ Hán (phím F)</span></div></label>
          <label class="check"><input type="checkbox" data-k="autoSpeak" ${settings.autoSpeak ? 'checked' : ''}><div><b>Tự đọc khi lật thẻ</b><span>Flashcard</span></div></label>
          <label class="check"><input type="checkbox" data-k="hvHint" ${settings.hvHint ? 'checked' : ''}><div><b>Gợi ý Hán Việt</b><span>Mặt trước flashcard</span></div></label>
          <label class="check"><input type="checkbox" data-k="autoNext" ${settings.autoNext ? 'checked' : ''}><div><b>Tự chuyển câu khi đúng</b><span>Bài tập</span></div></label>
        </div>
      </div>
    </div>
    ${backupCard()}`;
  const $ = (q) => main.querySelector(q);
  bindBackup(main, () => render(main));
  const markTheme = () => main.querySelectorAll('#theme button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === settings.theme));
  markTheme();
  $('#theme').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    saveSettings({ theme: b.dataset.v });
    if (b.dataset.v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = b.dataset.v;
    document.getElementById('themeBtn').textContent = { auto: '◐', light: '☀', dark: '☾' }[b.dataset.v];
    markTheme();
  });
  main.querySelectorAll('[data-k]').forEach((cb) => cb.addEventListener('change', () => {
    saveSettings({ [cb.dataset.k]: cb.checked });
    if (cb.dataset.k === 'furigana') {
      document.documentElement.classList.toggle('no-furi', !cb.checked);
      document.getElementById('furiToggle').checked = cb.checked;
    }
  }));
  $('#syncBtn').onclick = async () => { await flush(); toast(auth.error ? `Lỗi đồng bộ: ${auth.error}` : 'Đã đồng bộ'); render(main); };
  $('#out').onclick = async () => { await logout(); toast('Đã đăng xuất'); location.hash = '#/'; };
}
