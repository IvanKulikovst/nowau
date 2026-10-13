#!/usr/bin/env python3
"""Собирает krpd-standalone.html: index.html + встроенные видео и картинки (base64)."""
import base64, mimetypes
s = open('index.html', encoding='utf-8').read()
def uri(path):
    mime = mimetypes.guess_type(path)[0]
    return 'data:%s;base64,%s' % (mime, base64.b64encode(open(path, 'rb').read()).decode())
for f in ('assets/hero.mp4', 'assets/poster.jpg', 'assets/bg.jpg'):
    s = s.replace(f, uri(f))
open('krpd-standalone.html', 'w', encoding='utf-8').write(s)
