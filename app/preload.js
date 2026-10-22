'use strict';
/* Мост между программой (index.html) и приложением. Работает в изолированном
   контексте: программе отдаются только перечисленные ниже функции. */
const { contextBridge, ipcRenderer } = require('electron');

const init = ipcRenderer.sendSync('tst:init') || {};
const call = (ch, ...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('TSTNative', {
  isNative: true,
  version: init.version || '',
  platform: init.platform || '',
  dataDir: init.dataDir || '',
  initialDb: typeof init.raw === 'string' ? init.raw : null,   // основной файл данных, прочитанный до старта программы
  recovered: init.recovered || null,                           // если файл был повреждён и взят из копии
  saveDb: raw => call('tst:db-write', raw),
  putFile: (id, meta, bytes) => call('tst:file-put', id, meta, bytes),
  getFile: id => call('tst:file-get', id),
  delFile: id => call('tst:file-del', id),
  listFiles: () => call('tst:file-list'),
  putSnapshot: (id, rec) => call('tst:snap-put', id, rec),
  listSnapshots: () => call('tst:snap-list'),
  delSnapshot: id => call('tst:snap-del', id),
  openDataDir: () => call('tst:open-dir'),
  chooseDataDir: () => call('tst:choose-dir')
});
