'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { createStorage } = require('./storage');

app.setAppUserModelId('ru.reglament.ts');
/* Переносной режим: рядом с программой лежит файл portable.flag (или запуск из portable-exe
   electron-builder). Данные и профиль приложения хранятся рядом — переносятся вместе с флешкой */
const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR || fs.existsSync(path.join(exeDir, 'portable.flag'));
const PORTABLE_DIR = path.join(exeDir, 'Данные Регламент-ТС');
if (PORTABLE) app.setPath('userData', path.join(PORTABLE_DIR, 'profile'));
if (process.env.TST_USER_DATA) app.setPath('userData', process.env.TST_USER_DATA);   // для автотестов
if (process.env.TST_TEST) app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const WWW = path.join(__dirname, 'www', 'index.html');
const WWW_URL = pathToFileURL(WWW).href;

/* --- настройки приложения (папка данных) --- */
const cfgPath = () => path.join(app.getPath('userData'), 'config.json');
const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch (e) { return {}; } };
const writeCfg = c => { fs.mkdirSync(path.dirname(cfgPath()), { recursive: true }); fs.writeFileSync(cfgPath(), JSON.stringify(c, null, 1)); };
function defaultDataDir() {
  if (PORTABLE) return path.join(PORTABLE_DIR, 'db');
  return path.join(app.getPath('documents'), 'Регламент-ТС');
}
const resolveDataDir = () => process.env.TST_DATA_DIR || readCfg().dataDir || defaultDataDir();

let storage = null, win = null, dataDir = '';

/* Принимаем запросы только от нашей страницы */
const trusted = e => { try { return !!e.senderFrame && e.senderFrame.url.startsWith(WWW_URL.split('#')[0]); } catch (x) { return false; } };
const guard = fn => (e, ...a) => { if (!trusted(e)) throw new Error('Запрос отклонён'); return fn(e, ...a); };

function registerIpc() {
  ipcMain.on('tst:init', e => {
    if (!trusted(e)) { e.returnValue = null; return; }
    let r = { raw: null };
    try { r = storage.readDb(); } catch (err) { r = { raw: null, error: String(err && err.message || err) }; }
    e.returnValue = Object.assign({ version: app.getVersion(), platform: process.platform, dataDir }, r);
  });
  ipcMain.handle('tst:db-write', guard((e, raw) => storage.writeDb(raw)));
  ipcMain.handle('tst:file-put', guard((e, id, meta, bytes) => storage.putFile(id, meta, bytes)));
  ipcMain.handle('tst:file-get', guard((e, id) => storage.getFile(id)));
  ipcMain.handle('tst:file-del', guard((e, id) => storage.delFile(id)));
  ipcMain.handle('tst:file-list', guard(() => storage.listFiles()));
  ipcMain.handle('tst:snap-put', guard((e, id, rec) => storage.putSnapshot(id, rec)));
  ipcMain.handle('tst:snap-list', guard(() => storage.listSnapshots()));
  ipcMain.handle('tst:snap-del', guard((e, id) => storage.delSnapshot(id)));
  ipcMain.handle('tst:open-dir', guard(() => shell.openPath(dataDir)));
  ipcMain.handle('tst:choose-dir', guard(async () => {
    if (process.env.TST_DATA_DIR) return { ok: false, error: 'Папка задана переменной окружения' };
    const r = await dialog.showOpenDialog(win, { title: 'Папка данных «Регламент-ТС»', defaultPath: dataDir, properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const target = r.filePaths[0];
    if (path.resolve(target) === path.resolve(dataDir)) return { ok: false, canceled: true };
    // Если в выбранной папке уже есть данные — используем их; иначе переносим текущие
    const hasData = fs.existsSync(path.join(target, 'db.json'));
    if (!hasData) storage.copyAllTo(target);
    writeCfg(Object.assign(readCfg(), { dataDir: target }));
    setTimeout(() => { app.relaunch(); app.exit(0); }, 300);
    return { ok: true, dir: target, copied: !hasData };
  }));
}

function buildMenu() {
  const template = [
    { label: 'Файл', submenu: [
      { label: 'Открыть папку данных', click: () => shell.openPath(dataDir) },
      { type: 'separator' },
      { label: 'Выход', role: 'quit' }] },
    { label: 'Правка', submenu: [
      { role: 'undo', label: 'Отменить' }, { role: 'redo', label: 'Повторить' }, { type: 'separator' },
      { role: 'cut', label: 'Вырезать' }, { role: 'copy', label: 'Копировать' }, { role: 'paste', label: 'Вставить' },
      { role: 'selectAll', label: 'Выделить всё' }] },
    { label: 'Вид', submenu: [
      { role: 'resetZoom', label: 'Обычный масштаб' }, { role: 'zoomIn', label: 'Увеличить' }, { role: 'zoomOut', label: 'Уменьшить' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Во весь экран' }].concat(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Инструменты разработчика' }]) },
    { label: 'Справка', submenu: [
      { label: 'О программе', click: () => dialog.showMessageBox(win, { type: 'info', title: 'О программе', message: 'Регламент-ТС ' + app.getVersion(),
          detail: 'Автоматизированная система учёта и контроля технических средств тыла.\nРаботает без интернета.\n\nПапка данных:\n' + dataDir, buttons: ['Закрыть'] }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const bounds = readCfg().bounds || {};
  win = new BrowserWindow({
    width: bounds.width || 1440, height: bounds.height || 900, minWidth: 1000, minHeight: 640,
    show: false, autoHideMenuBar: true, backgroundColor: '#0b0b0d', title: 'Регламент-ТС',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  if (bounds.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => {
    try { const b = win.getNormalBounds(); writeCfg(Object.assign(readCfg(), { bounds: { width: b.width, height: b.height, maximized: win.isMaximized() } })); } catch (e) { /* не критично */ }
  });
  // Внешние ссылки (mailto, https) открываются в системе; сама страница никуда не уходит
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(mailto:|https:)/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(WWW_URL.split('#')[0])) { e.preventDefault(); if (/^(mailto:|https:)/i.test(url)) shell.openExternal(url); }
  });
  win.loadFile(WWW);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(() => {
  dataDir = resolveDataDir();
  try { storage = createStorage(dataDir); }
  catch (e) {
    dialog.showErrorBox('Папка данных недоступна', `Не удалось открыть папку данных:\n${dataDir}\n\n${e.message}\n\nПроверьте путь или удалите настройку в ${cfgPath()}.`);
    app.exit(1); return;
  }
  // Камера нужна только для сканирования QR-кодов; остальные разрешения запрещены
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media');
  if (process.env.TST_DOWNLOAD_DIR) session.defaultSession.on('will-download', (e, item) => item.setSavePath(path.join(process.env.TST_DOWNLOAD_DIR, item.getFilename())));
  registerIpc();
  buildMenu();
  createWindow();
});
