// FlashJLPT server — static files + accounts + progress sync.
// Zero dependencies: uses Node's built-in http, crypto and sqlite (Node >= 22.13).
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'db');
const SESSION_DAYS = 60;
const COOKIE = 'fj_session';
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'flashjlpt.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated INTEGER NOT NULL,
    PRIMARY KEY (user_id, item_id)
  );
  CREATE TABLE IF NOT EXISTS activity (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (user_id, day)
  );
`);
db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  insertUser: db.prepare('INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)'),
  sessionUser: db.prepare(`SELECT u.id, u.username, u.settings FROM sessions s JOIN users u ON u.id = s.user_id
                           WHERE s.token_hash = ? AND s.expires > ?`),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  allProgress: db.prepare('SELECT item_id, data FROM progress WHERE user_id = ?'),
  getProgress: db.prepare('SELECT updated FROM progress WHERE user_id = ? AND item_id = ?'),
  upsertProgress: db.prepare(`INSERT INTO progress (user_id, item_id, data, updated) VALUES (?, ?, ?, ?)
                              ON CONFLICT(user_id, item_id) DO UPDATE SET data = excluded.data, updated = excluded.updated`),
  allActivity: db.prepare('SELECT day, count FROM activity WHERE user_id = ?'),
  upsertActivity: db.prepare(`INSERT INTO activity (user_id, day, count) VALUES (?, ?, ?)
                              ON CONFLICT(user_id, day) DO UPDATE SET count = MAX(count, excluded.count)`),
  setSettings: db.prepare('UPDATE users SET settings = ? WHERE id = ?'),
};

// ---------- helpers ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key.toString('hex'))));
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

function readJson(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) {
      return reject(Object.assign(new Error('Content-Type phải là application/json'), { status: 415 }));
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Dữ liệu quá lớn'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('JSON không hợp lệ'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(token, maxAgeSec) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${SECURE_COOKIE ? '; Secure' : ''}`;
}

function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  return q.sessionUser.get(sha256(token), Date.now()) || null;
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  q.insertSession.run(sha256(token), userId, Date.now() + SESSION_DAYS * 864e5);
  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_DAYS * 86400));
}

// simple in-memory rate limit for auth endpoints
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { n: 0, t: now };
  if (now - rec.t > 10 * 60e3) { rec.n = 0; rec.t = now; }
  rec.n++;
  attempts.set(ip, rec);
  return rec.n > 20;
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- API ----------
async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;
  const ip = req.socket.remoteAddress || '';

  if (route === 'POST /api/auth/register' || route === 'POST /api/auth/login') {
    if (rateLimited(ip)) return send(res, 429, { error: 'Thử quá nhiều lần, vui lòng đợi vài phút.' });
    const { username = '', password = '' } = await readJson(req, 10_000);
    if (typeof username !== 'string' || typeof password !== 'string') return send(res, 400, { error: 'Dữ liệu không hợp lệ' });
    const name = username.trim();

    if (route === 'POST /api/auth/register') {
      if (!USERNAME_RE.test(name)) return send(res, 400, { error: 'Tên đăng nhập 3–32 ký tự, chỉ gồm chữ không dấu, số và . _ -' });
      if (password.length < 6 || password.length > 128) return send(res, 400, { error: 'Mật khẩu cần từ 6 đến 128 ký tự' });
      if (q.userByName.get(name)) return send(res, 409, { error: 'Tên đăng nhập đã tồn tại' });
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await hashPassword(password, salt);
      const info = q.insertUser.run(name, hash, salt, Date.now());
      startSession(res, Number(info.lastInsertRowid));
      return send(res, 201, { user: { username: name } });
    }

    const user = q.userByName.get(name);
    const hash = await hashPassword(password, user ? user.salt : 'x'.repeat(32));
    if (!user || !crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.pass_hash, 'hex'))) {
      return send(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    startSession(res, user.id);
    return send(res, 200, { user: { username: user.username } });
  }

  if (route === 'POST /api/auth/logout') {
    const token = parseCookies(req)[COOKIE];
    if (token) q.deleteSession.run(sha256(token));
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    return send(res, 200, { ok: true });
  }

  const user = currentUser(req);

  if (route === 'GET /api/auth/me') {
    return send(res, 200, { user: user ? { username: user.username } : null });
  }

  if (!user) return send(res, 401, { error: 'Bạn chưa đăng nhập' });

  if (route === 'GET /api/progress') {
    const items = {};
    for (const row of q.allProgress.all(user.id)) {
      try { items[row.item_id] = JSON.parse(row.data); } catch { /* skip corrupt row */ }
    }
    const days = {};
    for (const row of q.allActivity.all(user.id)) days[row.day] = row.count;
    let settings = {};
    try { settings = JSON.parse(user.settings); } catch { /* default */ }
    return send(res, 200, { items, days, settings });
  }

  if (route === 'POST /api/progress') {
    const body = await readJson(req);
    const items = body.items && typeof body.items === 'object' ? body.items : {};
    const days = body.days && typeof body.days === 'object' ? body.days : {};
    const entries = Object.entries(items);
    if (entries.length > 20000) return send(res, 413, { error: 'Quá nhiều mục' });
    db.exec('BEGIN');
    try {
      for (const [id, data] of entries) {
        if (typeof id !== 'string' || id.length > 200 || !data || typeof data !== 'object') continue;
        const updated = Number(data.u) || 0;
        const existing = q.getProgress.get(user.id, id);
        if (existing && existing.updated >= updated) continue; // last write wins
        q.upsertProgress.run(user.id, id, JSON.stringify(data).slice(0, 2000), updated);
      }
      for (const [day, count] of Object.entries(days)) {
        if (DAY_RE.test(day) && Number.isFinite(count)) q.upsertActivity.run(user.id, day, Math.max(0, Math.floor(count)));
      }
      if (body.settings && typeof body.settings === 'object') {
        q.setSettings.run(JSON.stringify(body.settings).slice(0, 5000), user.id);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Không tìm thấy' });
}

// ---------- static files ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // SPA fallback
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    serveStatic(req, res, url);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Lỗi máy chủ' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FlashJLPT đang chạy:  http://localhost:${PORT}`);
  for (const ni of Object.values(os.networkInterfaces()).flat()) {
    if (ni && ni.family === 'IPv4' && !ni.internal) console.log(`  Trên điện thoại (cùng Wi-Fi): http://${ni.address}:${PORT}`);
  }
});
