"""Build public/data/n4.json from the raw kanji JSON produced by parse_kanji_pdf.py.

Usage (from project root):
    python tools/parse_kanji_pdf.py kanji/ChuHanN4.pdf tools/raw_n4.json
    python tools/build_data.py tools/raw_n4.json public/data/n4.json
"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

raw = json.load(open(sys.argv[1], encoding='utf-8'))

# The same word appears under several kanji with slightly different wording in the
# source. These are merged by hand so every word has exactly one, complete meaning.
MEANING_OVERRIDES = {
    '試験|しけん': 'Kỳ thi, bài thi',
    '台所|だいどころ': 'Nhà bếp, phòng bếp',
    '住所|じゅうしょ': 'Địa chỉ, nơi ở',
    '市役所|しやくしょ': 'Tòa thị chính',
    '宅配便|たくはいびん': 'Dịch vụ chuyển phát (nhanh) tận nhà',
    '問題|もんだい': 'Vấn đề, câu hỏi',
    '予習|よしゅう': 'Chuẩn bị bài trước, soạn bài',
    '教室|きょうしつ': 'Lớp học, phòng học',
    '反対|はんたい': 'Phản đối; ngược lại',
    '作業|さぎょう': 'Công việc, thao tác',
    '写真|しゃしん': 'Tấm ảnh, bức ảnh',
}


def norm_tilde(s):
    return s.replace('~', '〜').replace('～', '〜')


def tidy_meaning(m):
    m = norm_tilde(' '.join(m.split()))
    m = m.replace('〜', ' 〜 ').strip()
    m = ' '.join(m.split())
    if m.startswith('〜'):
        return m  # "〜 trở lên" keeps the source casing
    for i, ch in enumerate(m):
        if ch.isalpha():
            return m[:i] + ch.upper() + m[i + 1:]
    return m


kanji_set = {b['kanji'] for b in raw}
hv_of = {b['kanji']: b['hanviet'] for b in raw}

words = {}
order = []
kanji_out = []
lessons = {}

for b in raw:
    ids = []
    for v in b['vocab']:
        tokens = [[norm_tilde(t[0]), t[1]] for t in v['t']]
        w = ''.join(t[0] for t in tokens)
        r = norm_tilde(v['r'])
        wid = f'{w}|{r}'
        if wid not in words:
            words[wid] = dict(
                id=wid,
                w=w,
                r=r,
                t=tokens,
                m=MEANING_OVERRIDES.get(wid, tidy_meaning(v['m'])),
                ks=[c for c in dict.fromkeys(w) if c in kanji_set],
                l=b['lesson'],
            )
            if v.get('star'):
                words[wid]['note'] = 'Chữ Hán ngoài Bảng Hán tự thông dụng'
            order.append(wid)
        if wid not in ids:
            ids.append(wid)
    kanji_out.append(dict(
        k=b['kanji'], hv=b['hanviet'], on=b['on'],
        kun=[k.replace('*', '') for k in b['kun']],
        l=b['lesson'], p=f"{b['lesson']}.{b['part']}", words=ids,
    ))
    lessons.setdefault(b['lesson'], []).append(b['kanji'])

out = dict(
    level='N4',
    source='Dũng Mori – Chữ Hán N4',
    lessons=[dict(id=l, kanji=ks) for l, ks in sorted(lessons.items())],
    kanji=kanji_out,
    words=[words[i] for i in order],
)
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f"{len(kanji_out)} kanji, {len(order)} unique words, {len(lessons)} lessons -> {sys.argv[2]}")
