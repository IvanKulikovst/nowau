'use strict';
/* Кладёт программу (index.html из корня репозитория) в app/www/ для упаковки */
const fs = require('fs'), path = require('path');
const src = path.resolve(__dirname, '..', '..', 'index.html');
const dst = path.resolve(__dirname, '..', 'www', 'index.html');
if (!fs.existsSync(src)) { console.error('Не найден ' + src); process.exit(1); }
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log('www/index.html: ' + (fs.statSync(dst).size / 1048576).toFixed(1) + ' МБ');
