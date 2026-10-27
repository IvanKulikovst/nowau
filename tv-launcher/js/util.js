// Общие помощники. Код намеренно на ES5: браузер webOS 3.5 основан на Chromium 38.

var APP_ID = 'com.nowau.launcher';

function $(id) {
  return document.getElementById(id);
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hasClass(el, cls) {
  return !!(el && el.classList && el.classList.contains(cls));
}

// Замена Element.closest(), которого нет в Chromium 38.
function closestWithClass(el, cls, stopAt) {
  while (el && el !== stopAt && el !== document) {
    if (hasClass(el, cls)) return el;
    el = el.parentNode;
  }
  return null;
}

var Store = {
  get: function (key, def) {
    try {
      var v = window.localStorage.getItem('tvl.' + key);
      return v === null ? def : JSON.parse(v);
    } catch (e) {
      return def;
    }
  },
  set: function (key, value) {
    try {
      window.localStorage.setItem('tvl.' + key, JSON.stringify(value));
    } catch (e) { /* хранилище недоступно — работаем без него */ }
  }
};

var RU = {
  months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
    'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  monthsNom: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль',
    'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  days: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
  daysShort: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
};

var toastTimer = null;
function toast(msg) {
  var el = $('toast');
  el.textContent = msg;
  el.className = 'toast show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    el.className = 'toast';
  }, 2500);
}
