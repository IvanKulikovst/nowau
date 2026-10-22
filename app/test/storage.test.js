'use strict';
/* Проверка файлового хранилища без Electron: node test/storage.test.js */
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { createStorage } = require('../storage');
let n = 0, failed = 0;
const t = (name, fn) => { try { fn(); n++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ' — ' + e.message); } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tst-storage-'));
const db = v => JSON.stringify({ version: 2, vehicles: [{ id: 'v_aaaa_0001', name: v }] });

t('Пустая папка: данных нет', () => { const s = createStorage(tmp()); assert.strictEqual(s.readDb().raw, null); });
t('Запись и чтение базы, русский текст не портится', () => {
  const s = createStorage(tmp()); s.writeDb(db('Кухня КА-220 «№1»')); assert.strictEqual(s.readDb().raw, db('Кухня КА-220 «№1»'));
});
t('Временный файл не остаётся после записи', () => { const d = tmp(); createStorage(d).writeDb(db('x')); assert.ok(!fs.existsSync(path.join(d, 'db.json.tmp'))); });
t('Некорректные данные не записываются, прежний файл цел', () => {
  const s = createStorage(tmp()); s.writeDb(db('ok'));
  assert.throws(() => s.writeDb('не json')); assert.throws(() => s.writeDb('[1,2]')); assert.throws(() => s.writeDb(undefined));
  assert.strictEqual(s.readDb().raw, db('ok'));
});
t('Суточная копия создаётся перед первой записью за день', () => {
  const d = tmp(), s = createStorage(d); s.writeDb(db('v1')); s.writeDb(db('v2'));
  const b = fs.readdirSync(path.join(d, 'backups'));
  assert.strictEqual(b.length, 1); assert.strictEqual(fs.readFileSync(path.join(d, 'backups', b[0]), 'utf8'), db('v1'));
});
t('Хранится не больше 14 суточных копий', () => {
  const d = tmp(), s = createStorage(d); s.writeDb(db('a'));
  for (let i = 1; i <= 20; i++) fs.writeFileSync(path.join(d, 'backups', `db-2020-01-${String(i).padStart(2, '0')}.json`), db('old' + i));
  s.writeDb(db('b'));
  assert.ok(fs.readdirSync(path.join(d, 'backups')).length <= 14);
});
t('Повреждённый db.json: берётся копия, повреждённый файл сохранён отдельно', () => {
  const d = tmp(), s = createStorage(d); s.writeDb(db('v1')); s.writeDb(db('v2'));
  fs.writeFileSync(path.join(d, 'db.json'), '{"version":2,"vehicles":[{"id":');   // оборван на середине записи
  const r = createStorage(d).readDb();
  assert.strictEqual(r.raw, db('v1')); assert.ok(r.recovered && r.recovered.reason === 'повреждён' && r.recovered.from === 'db.prev.json');
  assert.ok(fs.readdirSync(d).some(n => n.startsWith('db.corrupt-')));
  assert.strictEqual(createStorage(d).readDb().raw, db('v1'));   // восстановленное стало основным
});
t('Файл удалён, копии есть: данные восстанавливаются', () => {
  const d = tmp(), s = createStorage(d); s.writeDb(db('v1')); s.writeDb(db('v2')); fs.unlinkSync(path.join(d, 'db.json'));
  const r = createStorage(d).readDb(); assert.strictEqual(r.raw, db('v1')); assert.strictEqual(r.recovered.reason, 'отсутствует');
});
t('Предыдущая версия теряет только последнее изменение', () => {
  const d = tmp(), s = createStorage(d); s.writeDb(db('v1')); s.writeDb(db('v2')); s.writeDb(db('v3'));
  fs.writeFileSync(path.join(d, 'db.json'), '{');
  assert.strictEqual(createStorage(d).readDb().raw, db('v2'));
});
t('Повреждены db.json и db.prev.json: берётся суточная копия', () => {
  const d = tmp(), s = createStorage(d); s.writeDb(db('v1')); s.writeDb(db('v2')); s.writeDb(db('v3'));
  fs.writeFileSync(path.join(d, 'db.json'), '{'); fs.writeFileSync(path.join(d, 'db.prev.json'), 'мусор');
  const r = createStorage(d).readDb(); assert.strictEqual(r.raw, db('v1')); assert.ok(/^db-/.test(r.recovered.from));
});
t('Повреждены и файл, и копии: данных нет, но файлы не потеряны', () => {
  const d = tmp(), s = createStorage(d); s.writeDb(db('v1')); s.writeDb(db('v2'));
  fs.readdirSync(path.join(d, 'backups')).forEach(n => fs.writeFileSync(path.join(d, 'backups', n), 'мусор'));
  fs.writeFileSync(path.join(d, 'db.json'), 'мусор');
  fs.writeFileSync(path.join(d, 'db.prev.json'), 'мусор');
  const r = createStorage(d).readDb(); assert.strictEqual(r.raw, null); assert.ok(r.recovered && r.recovered.corruptFile);
});
t('Вложения: запись, чтение, список, удаление', () => {
  const s = createStorage(tmp()); const bytes = Buffer.from([0, 1, 2, 250, 255]);
  s.putFile('file_abc_123', { name: 'Акт №1.pdf', type: 'application/pdf' }, bytes);
  const g = s.getFile('file_abc_123'); assert.deepStrictEqual([...g.bytes], [...bytes]); assert.strictEqual(g.meta.name, 'Акт №1.pdf'); assert.strictEqual(g.meta.size, 5);
  assert.deepStrictEqual(s.listFiles(), ['file_abc_123']); s.delFile('file_abc_123'); assert.strictEqual(s.getFile('file_abc_123'), null);
});
t('Недопустимые идентификаторы (выход за папку) отклоняются', () => {
  const s = createStorage(tmp());
  ['../x', '..\\x', 'a/b', '', 'ab', 'x'.repeat(200), null, 'file/../../db'].forEach(id => {
    assert.throws(() => s.putFile(id, {}, Buffer.alloc(1)), /идентификатор/i); assert.throws(() => s.getFile(id)); assert.throws(() => s.delFile(id)); assert.throws(() => s.putSnapshot(id, {}));
  });
});
t('Точки восстановления: запись, список, удаление', () => {
  const s = createStorage(tmp()); s.putSnapshot('s_1111_aaaa', { id: 's_1111_aaaa', at: 'x', data: db('s') }); s.putSnapshot('s_2222_bbbb', { id: 's_2222_bbbb', data: '{}' });
  assert.strictEqual(s.listSnapshots().length, 2); s.delSnapshot('s_1111_aaaa'); assert.deepStrictEqual(s.listSnapshots().map(x => x.id), ['s_2222_bbbb']);
});
t('Копирование всех данных в другую папку', () => {
  const d = tmp(), s = createStorage(d); s.writeDb(db('v1')); s.putFile('file_abc_123', { name: 'a' }, Buffer.from('z')); s.putSnapshot('s_1111_aaaa', { id: 's_1111_aaaa' });
  const target = path.join(tmp(), 'новая папка'); s.copyAllTo(target);
  const s2 = createStorage(target); assert.strictEqual(s2.readDb().raw, db('v1')); assert.ok(s2.getFile('file_abc_123')); assert.strictEqual(s2.listSnapshots().length, 1);
});
t('Большая база (10 МБ) пишется и читается целиком', () => {
  const big = JSON.stringify({ version: 2, vehicles: Array.from({ length: 40000 }, (_, i) => ({ id: 'v_' + i + '_abcd', name: 'Машина ' + i, note: 'я'.repeat(200) })) });
  const s = createStorage(tmp()); s.writeDb(big); assert.strictEqual(s.readDb().raw, big); assert.ok(big.length > 8e6);
});
console.log(`ИТОГ: ${n} из ${n + failed}`); process.exit(failed ? 1 : 0);
