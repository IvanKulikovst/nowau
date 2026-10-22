'use strict';
/* Файловое хранилище приложения «Регламент-ТС» (без зависимостей от Electron —
   проверяется обычными тестами Node).

   Папка данных:
     db.json            — все записи учёта (основной файл)
     db.prev.json       — предыдущая версия db.json (перед каждой записью)
     backups/           — суточные копии db.json (последние 14)
     files/<id>.bin     — вложения (содержимое) и files/<id>.json (имя, тип, размер)
     snapshots/<id>.json — точки восстановления

   Запись db.json атомарная: во временный файл с fsync, затем переименование.
   Повреждённый db.json не удаляется, а откладывается как db.corrupt-*.json;
   данные берутся из db.prev.json (теряется только последнее изменение), а если
   и он не годится — из последней исправной суточной копии. */
const fs = require('fs');
const path = require('path');

const ID_RE = /^[A-Za-z0-9_-]{4,96}$/;
const KEEP_BACKUPS = 14;

function assertId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('Недопустимый идентификатор: ' + String(id).slice(0, 40));
  return id;
}
const pad = n => String(n).padStart(2, '0');
const dayStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fullStamp = (d = new Date()) => `${dayStamp(d)}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function isValidDb(raw) {
  if (typeof raw !== 'string' || raw.length < 2 || raw[0] !== '{') return false;
  try { const o = JSON.parse(raw); return !!o && typeof o === 'object' && !Array.isArray(o); } catch (e) { return false; }
}

function createStorage(dir) {
  const P = {
    db: path.join(dir, 'db.json'),
    prev: path.join(dir, 'db.prev.json'),
    tmp: path.join(dir, 'db.json.tmp'),
    backups: path.join(dir, 'backups'),
    files: path.join(dir, 'files'),
    snaps: path.join(dir, 'snapshots')
  };
  [dir, P.backups, P.files, P.snaps].forEach(d => fs.mkdirSync(d, { recursive: true }));

  const listBackups = () => fs.readdirSync(P.backups).filter(n => /^db-.*\.json$/.test(n)).sort().reverse();

  function readValid(file) {
    try { const raw = fs.readFileSync(file, 'utf8'); return isValidDb(raw) ? raw : null; } catch (e) { return null; }
  }

  /* Прочитать базу: { raw, recovered? }. raw === null — данных ещё нет */
  function readDb() {
    const exists = fs.existsSync(P.db);
    if (exists) {
      const raw = readValid(P.db);
      if (raw) return { raw };
      // Файл есть, но повреждён: сохраняем его для разбора и берём копию
      const moved = `db.corrupt-${fullStamp()}.json`;
      try { fs.renameSync(P.db, path.join(dir, moved)); } catch (e) { /* не критично */ }
      const rec = fromBackups('повреждён');
      return rec ? Object.assign(rec, { recovered: Object.assign(rec.recovered, { corruptFile: moved }) }) : { raw: null, recovered: { reason: 'повреждён', from: null, corruptFile: moved } };
    }
    const rec = fromBackups('отсутствует');
    return rec || { raw: null };
  }
  function fromBackups(reason) {
    const candidates = [{ name: 'db.prev.json', file: P.prev }].concat(listBackups().map(n => ({ name: n, file: path.join(P.backups, n) })));
    for (const c of candidates) {
      const name = c.name;
      const raw = readValid(c.file);
      if (raw) {
        // восстановленное состояние сразу становится основным файлом
        fs.writeFileSync(P.db, raw);
        return { raw, recovered: { reason, from: name } };
      }
    }
    return null;
  }

  /* Суточная копия — перед первой записью за день */
  function rotate() {
    if (!fs.existsSync(P.db)) return;
    const name = `db-${dayStamp()}.json`;
    const dest = path.join(P.backups, name);
    if (!fs.existsSync(dest) && readValid(P.db)) fs.copyFileSync(P.db, dest);
    listBackups().slice(KEEP_BACKUPS).forEach(n => { try { fs.unlinkSync(path.join(P.backups, n)); } catch (e) { /* ок */ } });
  }

  function writeDb(raw) {
    if (!isValidDb(raw)) throw new Error('Данные для записи не являются корректным JSON-объектом');
    rotate();
    const fd = fs.openSync(P.tmp, 'w');
    try { fs.writeSync(fd, raw, null, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    // Прежняя исправная версия остаётся как db.prev.json
    if (readValid(P.db)) fs.copyFileSync(P.db, P.prev);
    fs.renameSync(P.tmp, P.db);
    return true;
  }

  /* --- вложения --- */
  function putFile(id, meta, bytes) {
    assertId(id);
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    fs.writeFileSync(path.join(P.files, id + '.bin'), buf);
    fs.writeFileSync(path.join(P.files, id + '.json'), JSON.stringify({ name: String((meta && meta.name) || ''), type: String((meta && meta.type) || ''), size: buf.length }));
    return true;
  }
  function getFile(id) {
    assertId(id);
    const bin = path.join(P.files, id + '.bin');
    if (!fs.existsSync(bin)) return null;
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(P.files, id + '.json'), 'utf8')); } catch (e) { /* без метаданных */ }
    return { meta, bytes: fs.readFileSync(bin) };
  }
  function delFile(id) {
    assertId(id);
    ['.bin', '.json'].forEach(ext => { try { fs.unlinkSync(path.join(P.files, id + ext)); } catch (e) { /* уже нет */ } });
    return true;
  }
  const listFiles = () => fs.readdirSync(P.files).filter(n => n.endsWith('.bin')).map(n => n.slice(0, -4));

  /* --- точки восстановления --- */
  function putSnapshot(id, rec) {
    assertId(id);
    fs.writeFileSync(path.join(P.snaps, id + '.json'), JSON.stringify(rec));
    return true;
  }
  function listSnapshots() {
    return fs.readdirSync(P.snaps).filter(n => n.endsWith('.json')).map(n => {
      try { return JSON.parse(fs.readFileSync(path.join(P.snaps, n), 'utf8')); } catch (e) { return null; }
    }).filter(x => x && x.id);
  }
  function delSnapshot(id) {
    assertId(id);
    try { fs.unlinkSync(path.join(P.snaps, id + '.json')); } catch (e) { /* уже нет */ }
    return true;
  }

  /* Копия всех данных в другую папку (при смене папки данных) */
  function copyAllTo(target) {
    fs.mkdirSync(target, { recursive: true });
    const copy = (from, to) => {
      fs.mkdirSync(to, { recursive: true });
      for (const n of fs.readdirSync(from)) {
        const a = path.join(from, n), b = path.join(to, n);
        if (fs.statSync(a).isDirectory()) copy(a, b); else fs.copyFileSync(a, b);
      }
    };
    copy(dir, target);
  }

  return { dir, readDb, writeDb, putFile, getFile, delFile, listFiles, putSnapshot, listSnapshots, delSnapshot, copyAllTo, isValidDb };
}

module.exports = { createStorage, ID_RE, isValidDb };
