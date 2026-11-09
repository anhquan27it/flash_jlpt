import pymupdf, sys, json, re
sys.stdout.reconfigure(encoding='utf-8')
d = pymupdf.open(sys.argv[1])


def is_kanji(c):
    return '一' <= c <= '鿿' or c in '々〆ヶ'


out = []
warns = []
for pno in range(1, d.page_count):
    page = d[pno]
    spans = []
    for b in page.get_text('rawdict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                chars = [(c['c'], c['bbox']) for c in s['chars']]
                txt = ''.join(c for c, _ in chars)
                spans.append(dict(f=s['font'], sz=s['size'], bb=s['bbox'], t=txt, ch=chars))
    header = [s for s in spans if s['f'].startswith('GenJyuuGothic-Bold') and round(s['sz']) == 18]
    htxt = ''.join(s['t'] for s in header)
    m = re.match(r'\s*(\d+)\.(\d+)', htxt)
    lesson, part = int(m.group(1)), int(m.group(2))
    content = [s for s in spans if 50 < s['bb'][1] < 800]

    # ---- kanji blocks
    big = [s for s in content if s['f'].startswith('KanjiStrokeOrders')]
    hv = [s for s in content if s['f'] == 'ProximaSoft-Bold' and s['bb'][0] < 200]
    blocks = []
    for k in big:
        kc = k['t'].strip()
        y = k['bb'][1]
        cand = [h for h in hv if y - 60 < h['bb'][1] < y + 5]
        if not cand:
            warns.append(f'p{pno+1} no hanviet for {kc}')
        hanviet = ' '.join(h['t'].strip() for h in sorted(cand, key=lambda h: h['bb'][1]))
        top = min([h['bb'][1] for h in cand] + [y])
        blocks.append(dict(kanji=kc, hanviet=hanviet, top=top, y=y, lesson=lesson, part=part, page=pno + 1))
    blocks.sort(key=lambda b: b['top'])
    for i, b in enumerate(blocks):
        b['bottom'] = blocks[i + 1]['top'] if i + 1 < len(blocks) else 800

    # ---- readings
    mono = [s for s in content if s['f'].startswith('GenJyuuGothic-Monospace')]
    for b in blocks:
        kun, on = [], []
        for s in sorted(mono, key=lambda s: (s['bb'][1], s['bb'][0])):
            if not (b['top'] < s['bb'][1] < b['bottom']):
                continue
            t = s['t'].strip()
            if t in ('訓', '音') or not t:
                continue
            (kun if s['bb'][0] < 128 else on).append(t)

        def split(lst):
            j = ''.join(lst)
            return [x.strip() for x in re.split('[、,，]', j) if x.strip() and x.strip() not in ('---', '－－－')]
        b['kun'] = split(kun)
        b['on'] = split(on)

    # ---- vocab base chars / furigana
    base = []
    fspans = []
    for s in content:
        if not s['f'].startswith('GenJyuuGothic-') or s['f'].startswith('GenJyuuGothic-Monospace'):
            continue
        if s['bb'][0] < 195:
            continue
        if s['sz'] >= 12:
            for c, bb in s['ch']:
                if c in ' 　':
                    continue
                base.append(dict(c=c, bb=bb))
        else:
            t = s['t'].strip()
            if t:
                fspans.append(dict(t=t, bb=s['bb']))
    rows = []
    for c in sorted(base, key=lambda c: (c['bb'][1], c['bb'][0])):
        cy = (c['bb'][1] + c['bb'][3]) / 2
        for r in rows:
            if abs(r['cy'] - cy) < 6:
                r['chars'].append(c)
                break
        else:
            rows.append(dict(cy=cy, chars=[c]))

    # ---- split rows into entries at bullets (handles 2-column layouts)
    segs = []
    for r in rows:
        r['chars'].sort(key=lambda c: c['bb'][0])
        cur = None
        for c in r['chars']:
            if c['c'] == '・' or cur is None:
                cur = dict(cy=r['cy'], chars=[], x0=c['bb'][0], mean=[])
                segs.append(cur)
            cur['chars'].append(c)
    for s in segs:
        nxt = [t['x0'] for t in segs if abs(t['cy'] - s['cy']) < 6 and t['x0'] > s['x0']]
        s['x1'] = min(nxt) if nxt else 9999
    # ---- meanings
    mean = [s for s in content if (s['f'] == 'ProximaSoft-SemiBoldIt' or s['f'].startswith('KozMin')) and s['bb'][0] > 270]
    for m in mean:
        cy = (m['bb'][1] + m['bb'][3]) / 2
        cand = [s for s in segs if s['x0'] < m['bb'][0] < s['x1'] and abs(s['cy'] - cy) < 18]
        if not cand:
            warns.append(f"p{pno+1} orphan meaning {m['t']}")
            continue
        min(cand, key=lambda s: abs(s['cy'] - cy))['mean'].append(m)
    for s in segs:
        lines = []
        for m in sorted(s['mean'], key=lambda m: m['bb'][1]):
            cy = (m['bb'][1] + m['bb'][3]) / 2
            for ln in lines:
                if abs(ln[0] - cy) < 5:
                    ln[1].append(m)
                    break
            else:
                lines.append([cy, [m]])
        txt = ' '.join(''.join(m['t'] for m in sorted(ln[1], key=lambda m: m['bb'][0])) for ln in lines)
        s['mean'] = [' '.join(txt.split())] if txt.strip() else []
    rows = segs

    for r in rows:
        chars = [c for c in r['chars'] if c['c'] not in '・*＊']
        if not chars:
            continue
        top = min(c['bb'][1] for c in chars)
        fs = [f for f in fspans if top - 16 < f['bb'][1] < top + 2
              and f['bb'][0] >= chars[0]['bb'][0] - 8 and f['bb'][2] <= chars[-1]['bb'][2] + 10]
        groups = []
        for f in fs:
            fx0, fx1 = f['bb'][0], f['bb'][2]
            idx = []
            for i, c in enumerate(chars):
                x0, x1 = c['bb'][0], c['bb'][2]
                ov = min(fx1, x1) - max(fx0, x0)
                if ov > 0.25 * (x1 - x0) and is_kanji(c['c']):
                    idx.append(i)
            if not idx:
                fc = (fx0 + fx1) / 2
                ks = [i for i, c in enumerate(chars) if is_kanji(c['c'])]
                if ks:
                    i = min(ks, key=lambda i: abs((chars[i]['bb'][0] + chars[i]['bb'][2]) / 2 - fc))
                    idx = [i]
                    warns.append(f'p{pno+1} furi {f["t"]} nearest-assigned in {"".join(c["c"] for c in chars)}')
                else:
                    warns.append(f'p{pno+1} furi {f["t"]} unassigned')
                    continue
            groups.append([idx, f['t'], fx0])
        groups.sort(key=lambda g: (g[0][0], g[2]))
        merged = []
        for g in groups:
            if merged and set(g[0]) & set(merged[-1][0]):
                merged[-1][0] = sorted(set(merged[-1][0]) | set(g[0]))
                merged[-1][1] += g[1]
            else:
                merged.append(g)
        tokens = []
        i = 0
        gmap = {g[0][0]: g for g in merged}
        while i < len(chars):
            if i in gmap:
                g = gmap[i]
                j = g[0][-1]
                tokens.append([''.join(c['c'] for c in chars[i:j + 1]), g[1]])
                i = j + 1
            else:
                c = chars[i]
                if is_kanji(c['c']):
                    warns.append(f'p{pno+1} kanji without furigana {c["c"]} in {"".join(x["c"] for x in chars)}')
                if tokens and tokens[-1][1] == '':
                    tokens[-1][0] += c['c']
                else:
                    tokens.append([c['c'], ''])
                i += 1
        word = ''.join(t[0] for t in tokens)
        reading = ''.join(t[1] or t[0] for t in tokens)
        for g in merged:
            if len(g[0]) > 1:
                warns.append(f'p{pno+1} multi-kanji furigana {word}: {"".join(chars[k]["c"] for k in g[0])}={g[1]}')
        blk = [b for b in blocks if b['top'] - 12 <= top]
        if not blk:
            warns.append(f'p{pno+1} row without block {word}')
            continue
        blk = blk[-1]
        if not r['mean']:
            warns.append(f'p{pno+1} no meaning for {word}')
        blk.setdefault('vocab', []).append(dict(w=word, r=reading, t=tokens, m=' '.join(r['mean']), star='*' in ''.join(c['c'] for c in r['chars'])))
    out.extend(blocks)

for b in out:
    for k in ('top', 'bottom', 'y'):
        b.pop(k)
    b.setdefault('vocab', [])
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), 'kanji', sum(len(b['vocab']) for b in out), 'vocab')
print('\n'.join(warns))
