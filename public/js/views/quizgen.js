// Question generation for the quiz. Distractors are built so that exactly one option is correct:
// - readings: JLPT-style traps (long/short vowel, voiced/unvoiced, small っ) + real readings of similar words
// - kanji spelling: swap one kanji for another N4 kanji with the same On reading (classic 表記 trap);
//   kun-reading kanji are only swapped for kanji that can NOT be read that way
// - meanings: never two options that share a meaning (使います / 使用します both "Sử dụng")
import { data } from '../store.js';
import { shuffle, normVi, kataToHira, readingsOf } from '../util.js';

export const TYPES = {
  read: { name: 'Cách đọc', desc: 'Chữ Hán → chọn hiragana đúng' },
  write: { name: 'Chữ Hán', desc: 'Hiragana → chọn cách viết đúng' },
  meaning: { name: 'Nghĩa của từ', desc: 'Tiếng Nhật → chọn nghĩa' },
  word: { name: 'Từ theo nghĩa', desc: 'Nghĩa → chọn từ tiếng Nhật' },
  hv: { name: 'Âm Hán Việt', desc: 'Chữ Hán → chọn âm Hán Việt' },
  type: { name: 'Gõ cách đọc', desc: 'Tự gõ hiragana (gõ romaji cũng được)' },
};

// real words that a kanji swap could accidentally produce (they would be "correct" too)
const REAL_WORD_BLOCKLIST = new Set(['試用', '仕合', '私用', '市場', '仕様', '始動', '指導', '私動', '公開', '後悔', '工業', '公業', '正方', '政府']);

const isKanji = (c) => /[一-鿿々]/.test(c);
const stem = (w) => w.w.replace(/(します|する|ます)$/, '');
const meaningParts = (m) => normVi(m).replace(/\(.*?\)/g, '').split(/[,;/]/).map((s) => s.trim()).filter(Boolean);

function wordClass(w) {
  if (/(ます|する)$/.test(w.w)) return 'verb';
  const last = w.t[w.t.length - 1];
  if (!last[1] && /い$/.test(last[0])) return 'adj';
  return 'noun';
}

/** True if b cannot be offered as a wrong answer for a (same meaning / same word). */
function conflicts(a, b) {
  if (a.id === b.id || stem(a) === stem(b) || a.w === b.w) return true;
  const pa = meaningParts(a.m), pb = meaningParts(b.m);
  return pa.some((p) => pb.includes(p));
}

function similarity(a, b) {
  let s = 0;
  if (wordClass(a) === wordClass(b)) s += 4;
  const la = [...a.r].length, lb = [...b.r].length;
  s += Math.max(0, 3 - Math.abs(la - lb));
  if (a.w.length === b.w.length) s += 1;
  if (b.ks.some((c) => a.ks.includes(c))) s += 2;
  return s + Math.random() * 3;
}

function rankedOthers(word, filter = () => true) {
  return data.words
    .filter((b) => !conflicts(word, b) && filter(b))
    .map((b) => [similarity(word, b), b])
    .sort((x, y) => y[0] - x[0])
    .map(([, b]) => b);
}

// ---------------- reading traps ----------------
const DAKU = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const UNDAKU = Object.fromEntries(Object.entries(DAKU).map(([a, b]) => [b, a]));
Object.assign(UNDAKU, { ぱ: 'は', ぴ: 'ひ', ぷ: 'ふ', ぺ: 'へ', ぽ: 'ほ' });
const O_ROW = 'おこごそぞとどのほぼぽもよろょ';
const U_ROW = 'うくぐすずつづぬふぶぷむゆるゅ';

function mutateReading(s) {
  const out = new Set();
  const chars = [...s];
  // long ↔ short vowel
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === 'う' && i > 0 && (O_ROW + U_ROW).includes(chars[i - 1])) out.add(chars.slice(0, i).join('') + chars.slice(i + 1).join(''));
    if (i === chars.length - 1 && chars[i] !== 'う' && (O_ROW + U_ROW).includes(chars[i]) && !(i > 0 && chars[i - 1] === 'う')) out.add(s + 'う');
  }
  // voiced ↔ unvoiced
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const sw = DAKU[c] || UNDAKU[c];
    if (sw && (i === 0 || i === chars.length - 1 || Math.random() < 0.5)) {
      out.add(chars.slice(0, i).join('') + sw + chars.slice(i + 1).join(''));
    }
  }
  // small っ
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === 'っ') { out.add(chars.slice(0, i).join('') + 'つ' + chars.slice(i + 1).join('')); out.add(chars.slice(0, i).join('') + 'く' + chars.slice(i + 1).join('')); }
  }
  // しゅう ↔ しょう (small ゅ / ょ swap)
  for (let i = 0; i < chars.length; i++) {
    const sw = { ゅ: 'ょ', ょ: 'ゅ' }[chars[i]];
    if (sw) out.add(chars.slice(0, i).join('') + sw + chars.slice(i + 1).join(''));
  }
  out.delete(s);
  return [...out];
}

/** Other words written exactly the same way (降ります = おります / ふります). */
export const homographs = (word) => data.words.filter((b) => b.w === word.w && b.id !== word.id);

function readingDistractors(word, n = 3) {
  const correct = new Set([word, ...homographs(word)].flatMap(readingsOf));
  const opts = new Set();
  // mutate one kanji token at a time, keep the okurigana
  const fakes = [];
  word.t.forEach(([text, furi], i) => {
    if (!furi || furi.includes('/')) return;
    for (const m of mutateReading(furi)) {
      fakes.push(word.t.map(([tx, f], j) => (j === i ? m : (f || tx))).join('').replace(/〜/g, ''));
    }
  });
  for (const f of shuffle(fakes)) { if (opts.size >= 2) break; if (!correct.has(f)) opts.add(f); }
  for (const b of rankedOthers(word)) {
    if (opts.size >= n) break;
    const r = readingsOf(b)[0];
    if (!correct.has(r)) opts.add(r);
  }
  return [...opts].slice(0, n);
}

// ---------------- kanji spelling traps ----------------
function onReadings(k) { return k.on.map((r) => kataToHira(r)); }
// 発(はつ) is written はっ in 発見 — treat that as the same On reading
const onMatch = (r, f) => r === f || (f.endsWith('っ') && r.length >= 2 && r.slice(0, -1) === f.slice(0, -1));
function kunStems(k) { return k.kun.map((r) => r.split('・')[0].replace(/[^぀-ゟ]/g, '')); }

function spellingDistractors(word, n = 3) {
  const realSpellings = new Set(data.words.filter((b) => readingsOf(b).some((r) => readingsOf(word).includes(r))).map((b) => b.w));
  const fakes = new Set();
  const kanjiTokens = word.t.map((tk, i) => [tk, i]).filter(([[tx, f]]) => f && [...tx].length === 1 && isKanji(tx));
  // N4 kanji first: they have known On readings, so they give real "same sound" traps
  const ordered = shuffle(kanjiTokens).sort((a, b) => Number(data.kanjiByChar.has(b[0][0])) - Number(data.kanjiByChar.has(a[0][0])));
  for (const [[tx, f], i] of ordered) {
    const sameOn = data.kanji.filter((k) => k.k !== tx && onReadings(k).some((r) => onMatch(r, f)));
    const isOnToken = onReadings(data.kanjiByChar.get(tx) || { on: [] }).some((r) => onMatch(r, f));
    let pool;
    if (isOnToken && sameOn.length) pool = sameOn;
    else {
      // kun token: any other kanji that cannot be read with this kun reading
      pool = data.kanji.filter((k) => k.k !== tx && !kunStems(k).includes(f) && !onReadings(k).includes(f));
    }
    for (const k of shuffle([...pool])) {
      if (word.w.includes(k.k)) continue; // avoid 地地 / 化化
      const w = word.t.map(([t2], j) => (j === i ? k.k : t2)).join('');
      if (!realSpellings.has(w) && !REAL_WORD_BLOCKLIST.has(w)) fakes.add(w);
      if (fakes.size >= n) break;
    }
    if (fakes.size >= n) break;
  }
  const out = [...fakes].slice(0, n);
  for (const b of rankedOthers(word, (b) => !realSpellings.has(b.w))) {
    if (out.length >= n) break;
    if (!out.includes(b.w)) out.push(b.w);
  }
  return out;
}

// ---------------- builders ----------------
function mc(type, word, correct, wrong, extra = {}) {
  const options = shuffle([correct, ...wrong]);
  return { type, word, options, answer: options.indexOf(correct), ...extra };
}

function build(type, word, usedKanji = new Set()) {
  switch (type) {
    case 'read': {
      const correct = readingsOf(word).join('／');
      return mc('read', word, correct, readingDistractors(word));
    }
    case 'write': return mc('write', word, word.w, spellingDistractors(word));
    case 'meaning': return mc('meaning', word, word.m, rankedOthers(word).slice(0, 3).map((b) => b.m));
    case 'word': {
      const others = rankedOthers(word).slice(0, 3);
      const q = mc('word', word, word.id, others.map((b) => b.id));
      q.options = q.options.map((id) => data.wordById.get(id));
      return q;
    }
    case 'hv': {
      const free = word.ks.filter((c) => !usedKanji.has(c));
      if (!free.length) return null; // each kanji is asked only once per quiz
      const c = free[Math.floor(Math.random() * free.length)];
      usedKanji.add(c);
      const k = data.kanjiByChar.get(c);
      const used = new Set([normVi(k.hv)]);
      const wrong = [];
      for (const o of shuffle(data.kanji.filter((x) => x.k !== c))) {
        if (used.has(normVi(o.hv))) continue;
        used.add(normVi(o.hv));
        wrong.push(o.hv);
        if (wrong.length === 3) break;
      }
      return mc('hv', word, k.hv, wrong, { kanji: k });
    }
    case 'type': return { type: 'type', word, accept: readingsOf(word) };
    default: return null;
  }
}

/** Build `count` questions from word ids, cycling through the chosen types. */
export function makeQuiz(ids, types, count) {
  const words = shuffle(ids.map((id) => data.wordById.get(id)).filter(Boolean));
  if (!words.length || !types.length) return [];
  const max = words.length * types.length;
  const n = Math.min(count || max, max);
  const questions = [];
  const seen = new Set();
  const usedKanji = new Set();
  let round = 0;
  while (questions.length < n && round < types.length * 2) {
    const ts = shuffle([...types]);
    for (let i = 0; i < words.length && questions.length < n; i++) {
      const w = words[i];
      const type = ts[(i + round) % ts.length];
      const key = `${w.id}|${type}`;
      if (seen.has(key) || (type === 'hv' && !w.ks.some((c) => !usedKanji.has(c)))) continue;
      seen.add(key);
      const q = build(type, w, usedKanji);
      if (q && (q.type === 'type' || q.options.length >= 2)) questions.push(q);
    }
    round++;
  }
  return shuffle(questions);
}
