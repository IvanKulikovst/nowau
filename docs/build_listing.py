"""Листинг программы КРПД в PDF: HTML с нумерацией строк → печать Chromium."""
import re, html, sys, hashlib, datetime
src_path, out_html = sys.argv[1], sys.argv[2]
src = open(src_path, encoding='utf-8').read()
sha = hashlib.sha256(src.encode('utf-8')).hexdigest()
size = len(src.encode('utf-8'))

def blob(m):
    mime, data = m.group(1), m.group(2)
    kind = {'image/jpeg': 'изображение JPEG', 'video/mp4': 'видео MP4'}.get(mime, mime)
    return f'data:{mime};base64,⟨встроенный ресурс: {kind}, {len(data):,} симв. base64 ≈ {len(data)*3//4//1024:,} КБ — опущен в листинге⟩'.replace(',', ' ')
slim = re.sub(r'data:([a-z/0-9+-]+);base64,([A-Za-z0-9+/=]{200,})', blob, src)
lines = slim.split('\n')
if lines and lines[-1] == '': lines.pop()

# разделы листинга по маркерам в исходнике
marks = []
def find(pat, title):
    for i, l in enumerate(lines):
        if re.search(pat, l): marks.append((i + 1, title)); return
find(r'^<!DOCTYPE', 'Заголовок документа и паспорт данных')
find(r'^<style>', 'Таблица стилей (CSS): оформление, темы, адаптивность, печать')
find(r'^<body>', 'Разметка: лендинг, каркас приложения, иконки')
find(r"const APP_ID = 'krpd-firewood'", 'Ядро: константы и таблицы норм № 1–4')
find(r'/\* =+ утилиты', 'Ядро: утилиты, проверка и очистка данных')
find(r'/\* =+ предметная область', 'Ядро: расчётная модель (N, C1, K, M, V)')
find(r'/\* =+ модели печатных форм', 'Ядро: модели и отрисовка форм приложений № 1–4')
find(r'/\* =+ хранилище', 'Ядро: хранилище IndexedDB / localStorage, очередь и отмена')
find(r'/\* =+ редактор расчёта', 'Ядро: редактор расчёта')
find(r'/\* =+ отрисовка =+', 'Ядро: список, итоги и графики')
find(r'/\* =+ самопроверка', 'Ядро: встроенная самопроверка и запуск')
find(r"var L=document.getElementById\('landing'\)", 'Лендинг (стартовый экран)')
find(r'^<script id="x-ref">', 'Справочник: текст приказа, формулы, таблицы, примеры')
find(r'^<script id="x-extras">', 'Расширения: разделы, меню, настройки')
find(r'нативные файлы DOCX / XLSX', 'Расширения: выгрузка DOCX и XLSX')
find(r'/\* -+ окно печати', 'Расширения: окно предпросмотра и печати')
find(r'/\* -+ справочные данные', 'Расширения: окно справочника и горячие клавиши')
marks.sort()
anchor = {n: k for k, (n, _) in enumerate(marks)}

rows = []
for i, l in enumerate(lines, 1):
    a = f' id="s{anchor[i]}"' if i in anchor else ''
    sec = f'<tr class="sec"{a}><td></td><td>{html.escape(marks[anchor[i]][1])}</td></tr>' if i in anchor else ''
    rows.append(f'{sec}<tr><td class="n">{i}</td><td class="c">{html.escape(l) or "&#8203;"}</td></tr>')

toc = ''.join(f'<tr><td>{k+1}.</td><td>{html.escape(t)}</td><td class="r">строка {n}</td></tr>' for k, (n, t) in enumerate(marks))
today = datetime.date.today().strftime('%d.%m.%Y')
doc = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>КРПД — исходный код</title><style>
@page {{ size: A4 portrait; margin: 14mm 12mm 16mm 16mm;
  @bottom-center {{ content: "КРПД — исходный код программы · стр. " counter(page) " из " counter(pages); font: 8pt "Liberation Serif", serif; color: #555; }} }}
@page :first {{ @bottom-center {{ content: none; }} }}
body {{ margin: 0; font-family: "Liberation Serif", "Times New Roman", serif; color: #000; }}
.title {{ height: 255mm; display: flex; flex-direction: column; justify-content: center; text-align: center; break-after: page; }}
.title h1 {{ font-size: 26pt; margin: 0 0 6mm; letter-spacing: 1pt; }}
.title h2 {{ font-size: 15pt; font-weight: 400; margin: 0 0 18mm; line-height: 1.4; }}
.title .meta {{ font-size: 11pt; line-height: 1.7; text-align: left; margin: 0 auto; }}
.title .meta td {{ padding: 1mm 4mm; vertical-align: top; }}
.title .meta td:first-child {{ color: #444; white-space: nowrap; }}
.title .hash {{ font-family: "DejaVu Sans Mono", monospace; font-size: 8pt; word-break: break-all; }}
.toc {{ break-after: page; }}
.toc h2 {{ font-size: 16pt; margin: 0 0 6mm; }}
.toc p {{ font-size: 11pt; line-height: 1.5; text-align: justify; margin: 0 0 3mm; }}
.toc table {{ width: 100%; border-collapse: collapse; font-size: 11pt; margin-top: 4mm; }}
.toc td {{ padding: 1.4mm 2mm; border-bottom: 0.3pt solid #bbb; }}
.toc td.r {{ text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }}
table.code {{ width: 100%; border-collapse: collapse; table-layout: fixed; font-family: "DejaVu Sans Mono", monospace; font-size: 6.6pt; line-height: 1.32; }}
table.code col.n {{ width: 9mm; }}
td.n {{ text-align: right; color: #888; padding: 0 2mm 0 0; vertical-align: top; border-right: 0.4pt solid #bbb; user-select: none; }}
td.c {{ white-space: pre-wrap; word-break: break-all; overflow-wrap: anywhere; padding: 0 0 0 2mm; vertical-align: top; }}
tr {{ break-inside: avoid; }}
tr.sec td {{ font-family: "Liberation Sans", sans-serif; font-weight: 700; font-size: 8.5pt; padding: 3mm 0 1.2mm 2mm; color: #000; border-bottom: 0.6pt solid #000; break-after: avoid; }}
</style></head><body>
<section class="title">
  <h1>КРПД</h1>
  <h2>Программа расчёта потребления дров<br>по приказу Росгвардии от 14.07.2025 № 270<br><br><b>Исходный код программы</b></h2>
  <table class="meta">
    <tr><td>Файл</td><td>krpd-standalone.html</td></tr>
    <tr><td>Размер</td><td>{size:,} байт, {len(lines):,} строк</td></tr>
    <tr><td>Языки</td><td>HTML5, CSS3, JavaScript (ECMAScript 2020)</td></tr>
    <tr><td>Среда выполнения</td><td>современный веб-браузер, без сервера и подключения к интернету</td></tr>
    <tr><td>Контрольная сумма SHA-256</td><td class="hash">{sha}</td></tr>
    <tr><td>Дата листинга</td><td>{today}</td></tr>
  </table>
</section>
<section class="toc">
  <h2>Состав листинга</h2>
  <p>Программа поставляется одним HTML-файлом, который содержит разметку, таблицу стилей и шесть встроенных скриптов. Ниже приведён полный текст файла с нумерацией строк. Номера строк совпадают с исходным файлом.</p>
  <p>Встроенные медиаресурсы (фоновое видео и изображения стартового экрана и интерфейса) хранятся в файле в кодировке base64 и составляют около 94 % его объёма. В листинге они заменены пометками «⟨встроенный ресурс…⟩» с указанием типа и размера. Остальной текст приведён без изменений.</p>
  <table>{toc}</table>
</section>
<table class="code"><colgroup><col class="n"><col></colgroup><tbody>
{''.join(rows)}
</tbody></table>
</body></html>'''
open(out_html, 'w', encoding='utf-8').write(doc)
print('lines', len(lines), 'sections', len(marks))
