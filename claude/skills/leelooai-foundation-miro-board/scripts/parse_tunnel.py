# -*- coding: utf-8 -*-
"""Розбір креслення тунелю з фундаменту маркетингу (скіл marketing-foundation-builder v5) у JSON.

Використання:
  python3 parse_tunnel.py <фундамент.md> <вихід.json> [--section "Шлях клієнта"] [--exclude 145-148]

Шукає розділ, заголовок якого починається з «## N. Шлях клієнта» (або з тексту з --section),
і бере з нього кожен блок, оформлений як «**Блок N. Тип. Назва**» чи «**Блоки N, M. Тип:** …».
Для блоку зберігає дослівний текст повідомлень (вміст кодових блоків), кнопки з напрямками,
переходи «так/ні», «Не натиснув нічого», загальні «→ Блок N», медіа і сирий текст.
Наприкінці друкує лічильники і перевірки: кнопки без цілі, цілі, яких немає серед блоків, дублі.
Тексти не скорочуються і не переписуються: дошка має показувати їх 1 в 1.
"""
import json, re, sys, argparse
from collections import Counter

ap = argparse.ArgumentParser()
ap.add_argument('doc'); ap.add_argument('out')
ap.add_argument('--section', default='Шлях клієнта')
ap.add_argument('--exclude', default='', help='діапазони блоків, яких не буде на дошці, напр. 145-148,1400')
a = ap.parse_args()

src = open(a.doc, encoding='utf-8').read()
m = re.search(r'^## \d+\.\s*' + re.escape(a.section) + r'.*$', src, re.M)
if not m:
    sys.exit(f'Не знайдено розділ «{a.section}»')
nxt = re.search(r'^## ', src[m.end():], re.M)
sec = src[m.end(): m.end() + nxt.start()] if nxt else src[m.end():]

excl = set()
for part in filter(None, a.exclude.split(',')):
    if '-' in part:
        x, y = part.split('-'); excl.update(str(i) for i in range(int(x), int(y) + 1))
    else:
        excl.add(part.strip())

HEAD = re.compile(r'^\*\*Бло(?:к|ки)\s+([0-9a-zA-Z][0-9a-zA-Z ,–\-]*?)\.\s*(.*?)\*\*(.*)$', re.M)
heads = list(HEAD.finditer(sec))

def expand(ids):
    out = []
    for p in re.split(r'\s*,\s*', ids.strip()):
        r = re.match(r'^(\d+)\s*[–-]\s*(\d+)$', p)
        if r:
            out += [str(i) for i in range(int(r.group(1)), int(r.group(2)) + 1)]
        elif p:
            out.append(p)
    return out

TYPES = ['Повідомлення', 'Затримка', 'Фільтр', 'Дія', 'Примітка', 'Запит відповіді', 'Тригер', 'Статичне меню']
def btype(title):
    for t in TYPES:
        if title.startswith(t):
            return t
    return title.split('.')[0].strip()

ARROW = re.compile(r'→\s*Бло(?:к|ки)\s+([0-9a-zA-Z]+)')
blocks = []
for i, h in enumerate(heads):
    end = heads[i + 1].start() if i + 1 < len(heads) else len(sec)
    # тіло блоку не повинно залазити в наступний підрозділ
    body = sec[h.end(): end]
    sub = re.search(r'^#{2,4} ', body, re.M)
    if sub:
        body = body[: sub.start()]
    ids = expand(h.group(1))
    title = (h.group(2) or '').strip().rstrip(':').strip()
    tail = (h.group(3) or '').strip()
    full = tail + '\n' + body
    texts = [t.strip('\n') for t in re.findall(r'```[a-z]*\n(.*?)\n```', body, re.S)]
    buttons = []
    for line in re.findall(r'^Кнопки?:\s*(.*)$', body, re.M):
        for lab, tgt in re.findall(r'«([^»]+)»\s*(?:\([^)]*\)\s*)?→\s*Бло(?:к|ки)\s+([0-9a-zA-Z]+)', line):
            buttons.append({'label': lab, 'target': tgt})
        for lab in re.findall(r'«([^»]+)»\s*\(([^)]*посилан[^)]*)\)', line):
            buttons.append({'label': lab[0], 'target': None, 'link': lab[1]})
    no_click = re.findall(r'Не натиснув(?: нічого)?\s*→\s*Блок\s+([0-9a-zA-Z]+)', full)
    yes = re.findall(r'\bтак\s*→\s*Блок\s+([0-9a-zA-Z]+)', full)
    no = re.findall(r'\bні\s*→\s*Блок\s+([0-9a-zA-Z]+)', full)
    used = set(b['target'] for b in buttons) | set(no_click) | set(yes) | set(no)
    nexts = [t for t in ARROW.findall(full) if t not in used]
    media = re.findall(r'^Медіа:\s*(.*)$', body, re.M)
    blocks.append({
        'ids': ids, 'type': btype(title), 'title': title,
        'texts': texts, 'buttons': buttons, 'no_click': no_click,
        'yes': yes, 'no': no, 'next': list(dict.fromkeys(nexts)), 'media': media,
        'excluded': any(x in excl for x in ids),
        'raw': (h.group(0) + body).strip(),
    })

allids = [x for b in blocks for x in b['ids']]
idset = set(allids)
dups = [k for k, v in Counter(allids).items() if v > 1]
live = [b for b in blocks if not b['excluded']]
msgs = [b for b in live if b['type'] in ('Повідомлення', 'Запит відповіді')]
btns = [x for b in live for x in b['buttons']]
missing = sorted({t for b in live for t in [x['target'] for x in b['buttons']] + b['no_click'] + b['yes'] + b['no'] + b['next'] if t and t not in idset})

json.dump({'section': a.section, 'blocks': blocks}, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'заголовків блоків: {len(heads)}; блоків з розгортанням: {len(allids)}; виключено: {len(blocks) - len(live)}')
print('за типами:', dict(Counter(b["type"] for b in live)))
print(f'повідомлень і запитів: {len(msgs)}; з текстом: {sum(1 for b in msgs if b["texts"])}; кнопок: {len(btns)}')
print('повідомлення без тексту (перевір, чи це альбом або файл):', [b['ids'][0] for b in msgs if not b['texts']])
print('дублі номерів:', dups)
print('цілі, яких немає серед блоків (можуть бути діапазони або LGT):', missing)
