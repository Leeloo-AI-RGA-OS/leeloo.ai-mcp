# -*- coding: utf-8 -*-
"""Перевірка дошки Miro, зібраної за фундаментом маркетингу.

Використання:
  python3 board_audit.py <read1.json|.svg> [<read2> ...] [--tunnel tunnel.json] [--forbid "Viber,долар"]
                         [--version 2.10] [--fix-svg covered_fix.svg] [--report report.md]

Вхід: збережені результати canvas_read_as_svg (JSON з полем svg або сам SVG). Дошка більша за 500 віджетів
читається смугами по x, тому файлів кілька; перевірки рахують по всіх разом.

Що шукає:
  1. Текст під фоном: textArea, над якою лежить пізніше створений залитий rect чи image. У Miro порядок шарів
     дорівнює порядку створення, тому оновлення фону його не змінює, а перестворення фону ховає текст.
     Для кожного випадку пише в --fix-svg пару «видалити старий текст + створити такий самий»: новий ляже зверху.
  2. Порожня картка: залитий rect від 300x120 без жодного тексту всередині.
  3. Текст вилазить за картку (за data-rendered-bounds або висотою textArea).
  4. Картки накладаються одна на одну, і жодна не містить іншу.
  5. Пояснення без привʼязки: група з «ЧОМУ ТАК» без жодного конектора і без «↳» у заголовку.
  6. Службовий код у тексті: <p>, &lt;, {{, undefined, null.
  7. Заборонені слова (--forbid), наприклад месенджер, від якого відмовились.
  8. З --tunnel: кожен блок тунелю є на дошці («БЛОК N»), кожна кнопка має пігулку з тим самим підписом,
     кожен текст повідомлення є на дошці дослівно (порівняння без пробілів і розділових знаків).
  9. З --version: номер версії документа стоїть на дошці.
Нічого на дошці не змінює.
"""
import json, re, html, sys, argparse
from collections import defaultdict, Counter

ap = argparse.ArgumentParser()
ap.add_argument('reads', nargs='+')
ap.add_argument('--tunnel'); ap.add_argument('--forbid', default='')
ap.add_argument('--version'); ap.add_argument('--fix-svg'); ap.add_argument('--report')
ap.add_argument('--frame-id', default=None)
ap.add_argument('--ignore-text', default='рішення з документа', help='текст зразків у легенді, які не перевіряються як пояснення')
a = ap.parse_args()

def load(p):
    t = open(p, encoding='utf-8').read()
    try:
        return json.loads(t)['svg']
    except Exception:
        return t

EL = re.compile(r'<(rect|textArea|image|line)\b([^>]*?)(/>|>(.*?)</\1>)', re.S)
def attr(attrs, k):
    m = re.search(r'(?:^|\s)' + re.escape(k) + r'="([^"]*)"', attrs)
    return m.group(1) if m else None

def plain(s):
    s = html.unescape(html.unescape(s or ''))
    s = re.sub(r'<br\s*/?>', '\n', s); s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'[ \t]+', ' ', s).strip()

els, order, conns, frame_ids = {}, [], [], set()
for ri, p in enumerate(a.reads):
    svg = load(p)
    for m in EL.finditer(svg):
        kind, attrs, _, body = m.groups()
        mid = attr(attrs, 'data-miro-id')
        if kind == 'line':
            s, e = attr(attrs, 'data-start'), attr(attrs, 'data-end')
            if s and e:
                conns.append((s.lstrip('m'), e.lstrip('m')))
            continue
        if not mid:
            continue
        if attr(attrs, 'data-type') == 'frame':
            frame_ids.add(mid); continue
        x, y, w, h = [float(attr(attrs, k) or 0) for k in ('x', 'y', 'width', 'height')]
        rb = attr(attrs, 'data-rendered-bounds')
        if rb:
            rx, ry, rw, rh = [float(v) for v in rb.split()]
        else:
            rx, ry, rw, rh = x, y, w, h
        raw_text = body if kind == 'textArea' else attr(attrs, 'data-content')
        # Miro при читанні екранує {{ як {<!-- -->{; на дошці людина бачить звичайні {{, тож повертаємо як було
        raw_text = (raw_text or '').replace('{&lt;!-- --&gt;{', '{{').replace('{&amp;lt;!-- --&amp;gt;{', '{{')
        e = dict(id=mid, kind=kind, x=x, y=y, w=w, h=h, rx=rx, ry=ry, rw=rw, rh=rh,
                 fill=attr(attrs, 'fill'), grp=attr(attrs, 'data-group'),
                 text=plain(raw_text), raw_text=raw_text or '', raw=m.group(0), z=(ri, len(order)))
        if mid not in els:
            els[mid] = e; order.append(mid)

def filled(e):
    return e['kind'] in ('rect', 'image') and (e['kind'] == 'image' or (e['fill'] not in (None, 'none', 'transparent')))
def inside(px, py, r, pad=0):
    return r['x'] - pad <= px <= r['x'] + r['w'] + pad and r['y'] - pad <= py <= r['y'] + r['h'] + pad
BIG = 20000 * 2000
rep = []
def out(s=''):
    rep.append(s); print(s)

E = [els[i] for i in order]
cards = [e for e in E if filled(e) and e['w'] * e['h'] < BIG]
texts = [e for e in E if e['kind'] == 'textArea']

# 1 текст під фоном (порівнюємо тільки в межах одного файла читання, там порядок надійний)
covered = []
for t in texts:
    cx, cy = t['x'] + t['w'] / 2, t['y'] + min(t['h'], 40) / 2
    for r in cards:
        if r['z'][0] == t['z'][0] and r['z'][1] > t['z'][1] and inside(cx, cy, r) and r['w'] * r['h'] > t['w'] * min(t['h'], 40) * 0.5:
            covered.append((t, r)); break
out(f'## 1. Текст під фоном: {len(covered)}')
for t, r in covered:
    out(f'- {t["id"]} ({int(t["x"])}, {int(t["y"])}) під {r["id"]}: «{t["text"][:70]}»')
if a.fix_svg and covered:
    fid = a.frame_id or (sorted(frame_ids)[0] if frame_ids else None)
    parts = []
    for t, r in covered:
        parts.append(f'<textArea data-miro-id="{t["id"]}" data-deleted="true" />')
        parts.append(re.sub(r'\s(?:id|data-miro-id|data-group|data-rendered-bounds)="[^"]*"', '', t['raw']))
    head = f'<g id="m{fid}" data-miro-id="{fid}" transform="translate(0,0)">\n' if fid else ''
    tail = '\n</g>' if fid else ''
    open(a.fix_svg, 'w', encoding='utf-8').write('<svg viewBox="0 0 3840 2160" xmlns="http://www.w3.org/2000/svg">\n' + head + '\n'.join(parts) + tail + '\n</svg>')
    out(f'  виправлення записано в {a.fix_svg}: надіслати через canvas_update_from_svg')

# 2 порожні картки
empty = []
for r in cards:
    if r['kind'] != 'rect' or r['w'] < 300 or r['h'] < 120 or r['text']:
        continue
    has = any(t is not r and t['text'] and inside(t['x'] + t['w'] / 2, t['y'] + min(t['h'], 30) / 2, r) for t in E)
    if not has:
        empty.append(r)
out(f'\n## 2. Порожні картки: {len(empty)}')
for r in empty:
    out(f'- {r["id"]} ({int(r["x"])}, {int(r["y"])}, {int(r["w"])}x{int(r["h"])})')

# 3 текст вилазить за картку
over = []
for t in texts:
    host = [r for r in cards if r['kind'] == 'rect' and inside(t['x'] + 2, t['y'] + 2, r) and r['w'] * r['h'] > t['w'] * 20]
    if not host:
        continue
    r = min(host, key=lambda r: r['w'] * r['h'])
    if t['ry'] + t['rh'] > r['y'] + r['h'] + 4 or t['rx'] + t['rw'] > r['x'] + r['w'] + 4:
        over.append((t, r))
out(f'\n## 3. Текст вилазить за картку: {len(over)}')
for t, r in over:
    out(f'- {t["id"]} низ {int(t["ry"] + t["rh"])} > низ картки {int(r["y"] + r["h"])} ({r["id"]}): «{t["text"][:50]}»')

# 4 картки накладаються
big = [r for r in cards if r['kind'] == 'rect' and r['w'] >= 200 and r['h'] >= 80]
ov = []
for i in range(len(big)):
    p = big[i]
    for q in big[i + 1:]:
        ix = min(p['x'] + p['w'], q['x'] + q['w']) - max(p['x'], q['x'])
        iy = min(p['y'] + p['h'], q['y'] + q['h']) - max(p['y'], q['y'])
        if ix <= 0 or iy <= 0:
            continue
        cont = lambda A, B: A['x'] <= B['x'] and A['y'] <= B['y'] and A['x'] + A['w'] >= B['x'] + B['w'] and A['y'] + A['h'] >= B['y'] + B['h']
        if cont(p, q) or cont(q, p):
            continue
        if ix * iy > 0.05 * min(p['w'] * p['h'], q['w'] * q['h']):
            ov.append((p, q))
out(f'\n## 4. Картки накладаються: {len(ov)}')
for p, q in ov[:60]:
    out(f'- {p["id"]} ({int(p["x"])},{int(p["y"])}) і {q["id"]} ({int(q["x"])},{int(q["y"])})')

# 5 пояснення без привʼязки
deg = Counter()
for s, e in conns:
    deg[s] += 1; deg[e] += 1
groups = defaultdict(list)
for e in E:
    groups[e['grp'] or e['id']].append(e)
orph = []
ign = [s.strip().lower() for s in a.ignore_text.split(',') if s.strip()]
def under_card(mem):
    # пояснення стоїть одразу під карткою, яку пояснює: верх у межах 80 px від низу картки, перекриття по x від половини
    x = min(m['x'] for m in mem); y = min(m['y'] for m in mem); X = max(m['x'] + m['w'] for m in mem)
    ids = {m['id'] for m in mem}
    for r in cards:
        if r['id'] in ids or r['kind'] != 'rect' or r['w'] < 200:
            continue
        gap = y - (r['y'] + r['h'])
        ovx = min(X, r['x'] + r['w']) - max(x, r['x'])
        if 0 <= gap <= 80 and ovx >= 0.5 * (X - x):
            return True
    return False
for g, mem in groups.items():
    joined = ' '.join(m['text'] for m in mem)
    if any(s in joined.lower() for s in ign):
        continue
    if 'ЧОМУ ТАК' in joined.upper() and not any(deg[m['id']] for m in mem) and '↳' not in joined and not under_card(mem):
        orph.append((g, mem))
out(f'\n## 5. Пояснення «Чому так» без привʼязки: {len(orph)}')
for g, mem in orph:
    title = next((m['text'] for m in mem if m['text'] and m['text'].upper() != 'ЧОМУ ТАК'), '')
    x = min(m['x'] for m in mem); y = min(m['y'] for m in mem)
    out(f'- група {g} ({int(x)}, {int(y)}): «{title[:60]}»')
out('  Конектори, у яких один кінець потрапив в іншу смугу читання, сюди не входять: перевір такі групи очима.')

# 6 службовий код
def is_junk(e):
    raw = e['raw_text'] or ''
    # у textArea справжні теги пишуться як <b>, тож &lt; у тілі означає, що тег видно як текст;
    # у data-content теги екрановані один раз, тож видимий тег це &amp;lt;
    lit = '&lt;' in raw if e['kind'] == 'textArea' else '&amp;lt;' in raw
    plain_t = e['text'] or ''
    other = re.search(r'\{\{(?!\s*(campaign|ad|adset)\.)|\bundefined\b|\bnull\b|\[object', plain_t)
    return lit or bool(other)
junk = [e for e in E if is_junk(e)]
out(f'\n## 6. Службовий код у тексті: {len(junk)}')
for e in junk:
    out(f'- {e["id"]} ({int(e["x"])}, {int(e["y"])}): «{e["text"][:60]}»')

# 7 заборонені слова
words = [w.strip() for w in a.forbid.split(',') if w.strip()]
fb = [(w, e) for w in words for e in E if w.lower() in (e['text'] or '').lower()]
out(f'\n## 7. Заборонені слова ({", ".join(words) or "не задано"}): {len(fb)}')
for w, e in fb:
    out(f'- «{w}» у {e["id"]} ({int(e["x"])}, {int(e["y"])}): «{e["text"][:60]}»')

# 8 тунель
if a.tunnel:
    tj = json.load(open(a.tunnel, encoding='utf-8'))
    norm = lambda s: re.sub(r'[\W_]+', '', html.unescape(s or '').lower())
    alltext = norm(' '.join(e['text'] for e in E))
    upper = ' '.join(e['text'] for e in E).upper()
    pills = Counter(e['text'].strip() for e in E if e['kind'] == 'rect')
    miss_blocks, miss_text, miss_btn = [], [], []
    for b in tj['blocks']:
        if b.get('excluded'):
            continue
        for i in b['ids']:
            if not re.search(r'(БЛОК|БЛОКИ)\s+[\d, ]*\b' + re.escape(i) + r'\b', upper) and not re.search(r'(?<![\d→])\b' + re.escape(i) + r'\s*(·|СТОП|ЗАТРИМКА|ФІЛЬТР|ДІЯ|ПРИМІТКА|КІНЕЦЬ)', upper):
                miss_blocks.append(i)
        for t in b['texts']:
            if norm(t) and norm(t) not in alltext:
                miss_text.append(b['ids'][0])
        for btn in b['buttons']:
            if not any(btn['label'] in k for k in pills):
                miss_btn.append(f'{b["ids"][0]}: «{btn["label"]}»')
    out(f'\n## 8. Тунель проти дошки')
    out(f'- блоків без картки чи позначки: {len(miss_blocks)} {miss_blocks[:30]}')
    out(f'- повідомлень, текст яких не знайдено дослівно: {len(miss_text)} {miss_text[:30]}')
    out(f'- кнопок без пігулки з тим самим підписом: {len(miss_btn)} {miss_btn[:30]}')

# 9 версія
if a.version:
    found = any(re.search(r'\b' + re.escape(a.version) + r'\b', e['text'] or '') for e in E)
    out(f'\n## 9. Версія {a.version} на дошці: {"є" if found else "НЕМАЄ: онови шапку дошки"}')

out(f'\nЕлементів прочитано: {len(E)}, конекторів у читанні: {len(conns)}')
if a.report:
    open(a.report, 'w', encoding='utf-8').write('\n'.join(rep) + '\n')
