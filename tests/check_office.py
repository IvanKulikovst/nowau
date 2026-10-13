"""Проверка выгруженных DOCX/XLSX: открываются библиотеками python-docx/openpyxl, таблицы и итоги на месте."""
import sys, zipfile, glob, os
import docx, openpyxl
ok = True
for p in sorted(glob.glob(os.path.join(sys.argv[1], '*.docx'))):
    try:
        zipfile.ZipFile(p).testzip()
        d = docx.Document(p)
        t = d.tables
        text = '\n'.join(par.text for par in d.paragraphs)
        cells = sum(len(r.cells) for tb in t for r in tb.rows)
        itogo = any('ИТОГО' in c.text for tb in t for r in tb.rows for c in r.cells)
        print('DOCX OK ', os.path.basename(p), 'таблиц', len(t), 'ячеек', cells, 'ИТОГО' if itogo else 'нет ИТОГО', '|', text.split('\n')[0][:60])
        ok &= len(t) > 0 and itogo
    except Exception as e:
        ok = False; print('DOCX FAIL', p, e)
for p in sorted(glob.glob(os.path.join(sys.argv[1], '*.xlsx'))):
    try:
        wb = openpyxl.load_workbook(p); ws = wb.active
        vals = [c.value for row in ws.iter_rows() for c in row if c.value is not None]
        print('XLSX OK ', os.path.basename(p), 'лист', ws.title, 'строк', ws.max_row, 'объединений', len(ws.merged_cells.ranges), '|', str(vals[0])[:60])
        ok &= len(vals) > 5
    except Exception as e:
        ok = False; print('XLSX FAIL', p, e)
print('ALL OK' if ok else 'PROBLEMS')
sys.exit(0 if ok else 1)
