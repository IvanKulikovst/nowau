// Заставка: слайд-шоу фото с плавной сменой, медленным наездом камеры
// и часами с погодой поверх. Включается после простоя или синей кнопкой.

var Screensaver = (function () {
  var TIMEOUTS = [0, 1, 3, 5, 10, 15, 30]; // минуты, 0 — выкл
  var INTERVALS = [10, 15, 30, 60]; // секунды на одно фото
  var FADE_MS = 1500;
  var LOAD_TIMEOUT_MS = 20000;

  var cfg = Store.get('saver', null) || {};
  if (cfg.timeout === undefined) cfg.timeout = 5;
  if (!cfg.interval) cfg.interval = 15;
  if (!cfg.source) cfg.source = window.LOCAL_PHOTOS && LOCAL_PHOTOS.length ? 'local' : 'nature';
  if (cfg.listUrl === undefined) cfg.listUrl = '';

  var active = false;
  var startedAt = 0;
  var mouseOrigin = null;
  var idleTimer = null, slideTimer = null, clockTimer = null;
  var layers = [], front = 0;
  var queue = [], qi = 0;
  var fails = 0;
  var token = 0;
  var corner = 0;
  var lastFocus = null;

  function save() {
    Store.set('saver', cfg);
  }

  function localPhotos() {
    return window.LOCAL_PHOTOS && LOCAL_PHOTOS.length ? LOCAL_PHOTOS : [];
  }

  function sources() {
    var list = [];
    if (localPhotos().length) list.push({ id: 'local', name: 'мои (' + localPhotos().length + ' шт.)' });
    list.push({ id: 'nature', name: 'из интернета' });
    list.push({ id: 'url', name: 'по ссылке' });
    return list;
  }

  function sourceName() {
    var list = sources();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === cfg.source) return list[i].name;
    }
    return list[0].name;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  // ---- источники фото ----

  function natureUrl() {
    // На старых прошивках HTTPS может не пройти из-за сертификатов — тогда чередуем с HTTP.
    var proto = fails % 2 ? 'http' : 'https';
    return proto + '://picsum.photos/seed/' + Math.floor(Math.random() * 1e9) + '/1920/1080';
  }

  function nextUrl() {
    if (cfg.source === 'nature' || !queue.length) return natureUrl();
    if (qi >= queue.length) {
      shuffle(queue);
      qi = 0;
    }
    return queue[qi++];
  }

  function loadUrlList(cb) {
    var url = cfg.listUrl;
    if (!url) return cb(new Error('no url'));
    var done = false;
    var x = new XMLHttpRequest();
    function finish(err, list) {
      if (done) return;
      done = true;
      cb(err, list);
    }
    x.open('GET', url, true);
    x.timeout = 15000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status < 200 || x.status >= 300) return finish(new Error('HTTP ' + x.status));
      // Подходит любой текст: берём из него все ссылки на картинки.
      var found = x.responseText.match(/https?:\/\/[^\s"'<>]+\.(jpe?g|png|webp|gif)(\?[^\s"'<>]*)?/gi) || [];
      finish(found.length ? null : new Error('empty'), found);
    };
    x.ontimeout = function () { finish(new Error('timeout')); };
    x.onerror = function () { finish(new Error('network')); };
    x.send();
  }

  function prepareQueue(cb) {
    queue = [];
    qi = 0;
    if (cfg.source === 'local' && localPhotos().length) {
      queue = shuffle(localPhotos().slice());
      return cb();
    }
    if (cfg.source === 'url') {
      loadUrlList(function (err, list) {
        if (err) {
          setNote('Не удалось загрузить список фото по ссылке — показываю фото из интернета');
        } else {
          queue = shuffle(list);
        }
        cb();
      });
      return;
    }
    cb();
  }

  // ---- показ ----

  function setNote(text) {
    var el = $('saverNote');
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
  }

  function showImage(url) {
    var back = layers[1 - front];
    var old = layers[front];
    back.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
    // Перезапускаем анимацию «наезда» со случайным направлением.
    back.className = 'saver-layer';
    void back.offsetWidth;
    var dur = (cfg.interval + FADE_MS / 1000 * 2) + 's';
    back.style.webkitAnimationDuration = dur;
    back.style.animationDuration = dur;
    back.className = 'saver-layer kb' + (1 + Math.floor(Math.random() * 4));
    back.style.opacity = '1';
    old.style.opacity = '0';
    front = 1 - front;
    $('saver').className = 'saver';
    setTimeout(function () {
      // Освобождаем память: у телевизора её немного.
      if (active && old.style.opacity === '0') old.style.backgroundImage = 'none';
    }, FADE_MS + 200);
    // Сдвигаем часы в другой угол, чтобы картинка не стояла на месте.
    corner = (corner + 1) % 2;
    $('saverInfo').className = 'saver-info ' + (corner ? 'right' : 'left');
  }

  function gradientMode() {
    layers[0].style.opacity = '0';
    layers[1].style.opacity = '0';
    $('saver').className = 'saver gradient';
  }

  function schedule(ms) {
    clearTimeout(slideTimer);
    slideTimer = setTimeout(next, ms);
  }

  function next() {
    if (!active) return;
    var my = ++token;
    var url = nextUrl();
    var img = new Image();
    var guard = setTimeout(fail, LOAD_TIMEOUT_MS);

    function fail() {
      clearTimeout(guard);
      if (my !== token || !active) return;
      fails++;
      if (fails >= 4) {
        gradientMode();
        setNote('Фото не загружаются. Проверьте интернет или добавьте свои фото в приложение.');
        fails = 0;
        schedule(60000);
      } else {
        next();
      }
    }

    img.onload = function () {
      clearTimeout(guard);
      if (my !== token || !active) return;
      fails = 0;
      showImage(url);
      schedule(cfg.interval * 1000);
    };
    img.onerror = fail;
    img.src = url;
  }

  function updateInfo() {
    var d = new Date();
    $('saverTime').textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    $('saverDate').textContent = RU.days[d.getDay()] + ', ' + d.getDate() + ' ' + RU.months[d.getMonth()];
    var w = Weather.getSummary();
    $('saverWeather').innerHTML = w ?
      '<span class="sw-icon">' + w.icon + '</span>' + w.temp + ' · ' + escapeHtml(w.city) : '';
  }

  // ---- управление ----

  function start() {
    if (active) return;
    active = true;
    startedAt = new Date().getTime();
    mouseOrigin = null;
    fails = 0;
    clearTimeout(idleTimer);
    lastFocus = document.activeElement;
    if (lastFocus && lastFocus.blur) lastFocus.blur();
    setNote('');
    layers[0].style.opacity = '0';
    layers[1].style.opacity = '0';
    $('saver').className = 'saver gradient';
    updateInfo();
    clockTimer = setInterval(updateInfo, 1000);
    prepareQueue(next);
  }

  function stop() {
    if (!active) return;
    active = false;
    token++;
    clearTimeout(slideTimer);
    clearInterval(clockTimer);
    $('saver').className = 'saver hidden';
    layers[0].style.backgroundImage = 'none';
    layers[1].style.backgroundImage = 'none';
    if (lastFocus && document.body.contains(lastFocus) && hasClass(lastFocus, 'focusable')) {
      lastFocus.focus();
    } else {
      Nav.focusFirst();
    }
    resetIdle();
  }

  function resetIdle() {
    clearTimeout(idleTimer);
    if (active || !cfg.timeout) return;
    idleTimer = setTimeout(function () {
      if (document.hidden) {
        resetIdle();
      } else {
        start();
      }
    }, cfg.timeout * 60000);
  }

  // Указка Magic Remote: закрываем только на реальное движение, а не на
  // служебные события, которые браузер шлёт при смене содержимого экрана.
  function onMouseMove(e) {
    if (!active) {
      resetIdle();
      return;
    }
    if (new Date().getTime() - startedAt < 1500) return;
    if (!mouseOrigin) {
      mouseOrigin = { x: e.clientX, y: e.clientY };
      return;
    }
    if (Math.abs(e.clientX - mouseOrigin.x) + Math.abs(e.clientY - mouseOrigin.y) > 8) stop();
  }

  function cycle(list, value) {
    var i = list.indexOf(value);
    return list[(i + 1) % list.length];
  }

  function init() {
    layers = [$('saverA'), $('saverB')];
    document.addEventListener('mousemove', onMouseMove);
    $('saver').addEventListener('click', stop);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else resetIdle();
    });
    resetIdle();
  }

  return {
    init: init,
    start: start,
    stop: stop,
    resetIdle: resetIdle,
    isActive: function () { return active; },
    getConfig: function () { return cfg; },
    sourceName: sourceName,
    cycleTimeout: function () {
      cfg.timeout = cycle(TIMEOUTS, cfg.timeout);
      save();
      resetIdle();
    },
    cycleInterval: function () {
      cfg.interval = cycle(INTERVALS, cfg.interval);
      save();
    },
    cycleSource: function () {
      var ids = [];
      var list = sources();
      for (var i = 0; i < list.length; i++) ids.push(list[i].id);
      cfg.source = cycle(ids, cfg.source);
      save();
    },
    setListUrl: function (url) {
      cfg.listUrl = url;
      save();
    }
  };
})();
