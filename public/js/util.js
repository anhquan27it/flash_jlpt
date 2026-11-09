// Shared helpers: escaping, furigana rendering, shuffling, text normalisation, TTS, romaji→kana.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Render word tokens [[text, furigana], …] as <ruby>. */
export function ruby(tokens) {
  return tokens.map(([text, furi]) => (furi
    ? `<ruby>${esc(text)}<rt>${esc(furi.replace('/', '・'))}</rt></ruby>`
    : esc(text))).join('');
}

/** Fisher–Yates shuffle (in place, returns the array). */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Lowercase + strip Vietnamese diacritics for forgiving search. */
export function normVi(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();
}

export function kataToHira(s) {
  return String(s).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** All accepted readings of a word ("いえ/うち" → ["いえ","うち"]), without 〜. */
export function readingsOf(word) {
  return word.r.split('/').map((r) => r.replace(/〜/g, '').trim());
}

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- text-to-speech (reads the kana reading, so it is always pronounced correctly) ----------
let jaVoice = null;
function loadVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  jaVoice = voices.find((v) => v.lang === 'ja-JP' && /google|kyoko|haruka|nanami|ayumi/i.test(v.name))
    || voices.find((v) => v.lang && v.lang.replace('_', '-').startsWith('ja')) || null;
}
if ('speechSynthesis' in window) {
  loadVoice();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoice);
}
let warnedVoice = false;
export function speak(word) {
  if (!('speechSynthesis' in window)) { toast('Trình duyệt không hỗ trợ đọc phát âm'); return; }
  const text = readingsOf(word)[0];
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = 0.85;
  if (jaVoice) u.voice = jaVoice;
  else if (!warnedVoice) { warnedVoice = true; toast('Thiết bị có thể chưa cài giọng đọc tiếng Nhật'); }
  speechSynthesis.speak(u);
}

// ---------- romaji → hiragana (for typing answers without a Japanese keyboard) ----------
const R2K = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ', za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と', da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ', ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ', ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ', ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', la: 'ら', li: 'り', lu: 'る', le: 'れ', lo: 'ろ',
  wa: 'わ', wo: 'を', we: 'うぇ', wi: 'うぃ', "n'": 'ん', nn: 'ん', xn: 'ん',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  sha: 'しゃ', shu: 'しゅ', sho: 'しょ', she: 'しぇ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ', je: 'じぇ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ', zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', che: 'ちぇ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ', cya: 'ちゃ', cyu: 'ちゅ', cyo: 'ちょ',
  dya: 'ぢゃ', dyu: 'ぢゅ', dyo: 'ぢょ', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', bya: 'びゃ', byu: 'びゅ', byo: 'びょ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ', rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', thi: 'てぃ', dhi: 'でぃ', tsa: 'つぁ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ', xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ', ltu: 'っ', ltsu: 'っ',
  '-': 'ー',
};
const CONSONANTS = 'bcdfghjklmpqrstvwxyz';

/**
 * Convert romaji to hiragana. With `final` = false a trailing lone "n" is kept so the
 * user can still type "na", "ni", …; with `final` = true it becomes "ん".
 */
export function romajiToKana(input, final = false) {
  let s = kataToHira(String(input).toLowerCase());
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (!/[a-z'\-]/.test(c)) { out += c; i++; continue; }
    // small tsu: doubled consonant (except n)
    if (c !== 'n' && CONSONANTS.includes(c) && s[i + 1] === c) { out += 'っ'; i++; continue; }
    // n before a consonant (not y) or apostrophe → ん
    if (c === 'n') {
      const n1 = s[i + 1];
      if (n1 === undefined) { out += final ? 'ん' : 'n'; i++; continue; }
      if (n1 === 'n') { out += 'ん'; i += 2; continue; }
      if (n1 === "'") { out += 'ん'; i += 2; continue; }
      if (CONSONANTS.includes(n1) && n1 !== 'y') { out += 'ん'; i++; continue; }
    }
    let matched = false;
    for (const len of [4, 3, 2, 1]) {
      const chunk = s.slice(i, i + len);
      if (chunk.length === len && R2K[chunk]) {
        out += R2K[chunk]; i += len; matched = true; break;
      }
    }
    if (!matched) { out += c; i++; }
  }
  return out;
}

/** Normalise a typed reading for comparison. */
export function normReading(s) {
  return kataToHira(romajiToKana(String(s), true)).replace(/[\s　〜~・.。、,]/g, '');
}
