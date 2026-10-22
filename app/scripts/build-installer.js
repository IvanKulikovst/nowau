'use strict';
/* Собирает установщик (NSIS) и переносной zip из dist/win-unpacked.
   Работает на Linux/macOS без Wine: makensis берётся из кэша electron-builder или из PATH.
   Порядок: npm run dist:dir  →  node scripts/build-installer.js  */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const unpacked = path.join(root, 'dist', 'win-unpacked');
if (!fs.existsSync(unpacked)) { console.error('Нет dist/win-unpacked — сначала: npm run dist:dir'); process.exit(1); }

function findMakensis() {
  if (process.env.MAKENSIS) return { bin: process.env.MAKENSIS, dir: process.env.NSISDIR };
  const base = path.join(os.homedir(), '.cache', 'electron-builder');
  try {
    for (const v of fs.readdirSync(base).filter(n => /^nsis-\d/.test(n))) for (const d of fs.readdirSync(path.join(base, v))) {
      const bin = path.join(base, v, d, process.platform === 'darwin' ? 'mac' : 'linux', 'makensis');
      if (fs.existsSync(bin)) return { bin, dir: path.join(base, v, d) };
    }
  } catch (e) { /* нет кэша */ }
  return { bin: 'makensis', dir: process.env.NSISDIR };
}

// Рабочая копия: исполняемый файл с ASCII-именем (имена с кириллицей makensis на Linux читает ненадёжно)
const stage = path.join(root, 'dist', 'stage');
fs.rmSync(stage, { recursive: true, force: true });
fs.cpSync(unpacked, stage, { recursive: true });
// Языковые файлы Chromium: оставляем русский и английский (около 45 МБ экономии)
const loc = path.join(stage, 'locales');
if (fs.existsSync(loc)) for (const n of fs.readdirSync(loc)) if (!/^(ru|en-US)\.pak$/.test(n)) fs.rmSync(path.join(loc, n));
const exeSrc = fs.readdirSync(stage).find(n => n.toLowerCase().endsWith('.exe'));
fs.renameSync(path.join(stage, exeSrc), path.join(stage, 'Reglament-TS.exe'));

const out = path.join(root, 'dist', `Reglament-TS-Setup-${pkg.version}.exe`);
const { bin, dir } = findMakensis();
const env = Object.assign({}, process.env, dir ? { NSISDIR: dir } : {});
const args = [`-DVERSION=${pkg.version}`, `-DOUTFILE=${out}`, `-DSRCDIR=${stage}`, `-DICON=${path.join(root, 'build', 'icon.ico')}`, path.join(root, 'installer', 'installer.nsi')];
const r = cp.spawnSync(bin, args, { env, stdio: 'inherit' });
if (r.status !== 0) { console.error('makensis завершился с ошибкой', r.error ? r.error.message : '', r.signal || '', 'статус:', r.status, '\nкоманда:', bin, args.join(' ')); process.exit(r.status || 1); }
console.log(`Установщик: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} МБ)`);

// Переносная версия: та же папка + метка portable.flag (данные рядом, в «Данные Регламент-ТС»)
fs.writeFileSync(path.join(stage, 'portable.flag'), 'Переносной режим: данные хранятся в папке «Данные Регламент-ТС» рядом с программой.\n');
fs.writeFileSync(path.join(stage, 'ПРОЧТИТЕ.txt'), 'Регламент-ТС — переносная версия.\r\nЗапуск: Reglament-TS.exe\r\nДанные хранятся в папке «Данные Регламент-ТС» рядом с программой; копируйте её вместе с программой.\r\n', 'utf8');
const zip = path.join(root, 'dist', `Reglament-TS-Portable-${pkg.version}.zip`);
fs.rmSync(zip, { force: true });
const z = cp.spawnSync('zip', ['-qr', zip, '.'], { cwd: stage, stdio: 'inherit' });
if (z.status === 0) console.log(`Переносная версия: ${zip} (${(fs.statSync(zip).size / 1048576).toFixed(1)} МБ)`);
else console.log('zip не найден — переносную версию соберите архиватором из dist/stage');
