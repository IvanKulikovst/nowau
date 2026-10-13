#!/usr/bin/env python3
"""Сборка: подставляет src/*.css|js в index.html (между маркерами /*@@...*/ ... /*@@END*/),
затем формирует krpd-standalone.html со встроенными видео и картинками (base64)."""
import base64, mimetypes, re
s = open('index.html', encoding='utf-8').read()
def inject(s, marker, path):
    body = open(path, encoding='utf-8').read().replace('\\', '\\\\')
    pat = re.compile(r'/\*@@' + marker + r'\*/.*?/\*@@END\*/', re.S)
    assert pat.search(s), marker
    return pat.sub(lambda m: '/*@@' + marker + '*/\n' + body.replace('\\\\', '\\') + '\n/*@@END*/', s, count=1)
s = inject(s, 'EXTRAS-CSS', 'src/extras.css')
s = inject(s, 'REF', 'src/reference.js')
s = inject(s, 'EXTRAS', 'src/extras.js')
open('index.html', 'w', encoding='utf-8').write(s)
def uri(path):
    mime = mimetypes.guess_type(path)[0]
    return 'data:%s;base64,%s' % (mime, base64.b64encode(open(path, 'rb').read()).decode())
for f in ('assets/hero.mp4', 'assets/poster.jpg', 'assets/bg.jpg'):
    s = s.replace(f, uri(f))
open('krpd-standalone.html', 'w', encoding='utf-8').write(s)
