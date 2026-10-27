#!/usr/bin/env node
// Собирает tv-launcher/photos/list.js из картинок в папке tv-launcher/photos/.
// Запуск из корня репозитория: node tools/make-photo-list.js

var fs = require('fs');
var path = require('path');

var dir = path.join(__dirname, '..', 'tv-launcher', 'photos');
var exts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

var files = fs.readdirSync(dir).filter(function (name) {
  return exts.indexOf(path.extname(name).toLowerCase()) >= 0;
}).sort();

var list = files.map(function (name) {
  return 'photos/' + encodeURIComponent(name);
});

var out = '// Сгенерировано tools/make-photo-list.js — не редактируйте вручную.\n' +
  'var LOCAL_PHOTOS = ' + JSON.stringify(list, null, 2) + ';\n';
fs.writeFileSync(path.join(dir, 'list.js'), out);

var bytes = files.reduce(function (sum, name) {
  return sum + fs.statSync(path.join(dir, name)).size;
}, 0);
console.log('Фото в заставке: ' + files.length + ', общий размер ' + (bytes / 1048576).toFixed(1) + ' МБ');
if (bytes > 200 * 1048576) {
  console.log('Внимание: больше 200 МБ. Уменьшите фото до 1920×1080, иначе установка может не пройти.');
}
