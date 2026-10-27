// Ряды плиток: онлайн-кинотеатры, избранное и все установленные приложения.

var Apps = (function () {
  var LAUNCH = 'luna://com.webos.applicationManager/launch';
  var LIST = 'luna://com.webos.applicationManager/listLaunchPoints';
  var BROWSER_ID = 'com.webos.app.browser';

  // match — варианты названия установленного приложения (без регистра и пробелов).
  // Если приложения нет на телевизоре, сервис откроется во встроенном браузере.
  var CINEMAS = [
    { key: 'youtube', title: 'YouTube', logo: 'YouTube', bg: '#e62117', match: ['youtube'], id: 'youtube.leanback.v4', url: 'https://www.youtube.com/tv' },
    { key: 'kinopoisk', title: 'Кинопоиск', logo: 'Кинопоиск', bg: '#ff5500', match: ['кинопоиск', 'kinopoisk'], url: 'https://hd.kinopoisk.ru' },
    { key: 'okko', title: 'Okko', logo: 'Okko', bg: '#5b2bd6', match: ['okko'], url: 'https://okko.tv' },
    { key: 'ivi', title: 'Иви', logo: 'ivi', bg: '#ea003d', match: ['ivi', 'иви'], url: 'https://www.ivi.ru' },
    { key: 'wink', title: 'Wink', logo: 'Wink', bg: '#ff4f12', match: ['wink'], url: 'https://wink.ru' },
    { key: 'start', title: 'START', logo: 'START', bg: '#1b1b1b', match: ['start'], url: 'https://start.ru' },
    { key: 'kion', title: 'KION', logo: 'KION', bg: '#8b2cf5', match: ['kion', 'кион'], url: 'https://kion.ru' },
    { key: 'premier', title: 'PREMIER', logo: 'PREMIER', bg: '#2b2b33', match: ['premier'], url: 'https://premier.one' },
    { key: 'rutube', title: 'RUTUBE', logo: 'RUTUBE', bg: '#14191f', match: ['rutube'], url: 'https://rutube.ru' }
  ];

  // Только для просмотра в обычном браузере на компьютере.
  var DEMO_APPS = [
    { id: 'demo.tv', title: 'Live TV', bgColor: '#24527a' },
    { id: 'demo.youtube', title: 'YouTube', bgColor: '#e62117' },
    { id: 'demo.media', title: 'Медиаплеер', bgColor: '#3c7a52' },
    { id: 'demo.photos', title: 'Фото и видео', bgColor: '#7a3c6b' },
    { id: 'demo.music', title: 'Музыка', bgColor: '#6b5a24' },
    { id: 'demo.browser', title: 'Веб-браузер', bgColor: '#2f3b52' },
    { id: 'demo.store', title: 'LG Content Store', bgColor: '#a50034' },
    { id: 'demo.settings', title: 'Настройки', bgColor: '#444a55' }
  ];

  var installed = null; // null — список недоступен
  var favorites = Store.get('favorites', []);
  var actions = {};
  var container = null;
  var onRendered = null;

  function norm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, '');
  }

  function findInstalled(match) {
    if (!installed) return null;
    for (var i = 0; i < installed.length; i++) {
      var t = norm(installed[i].title);
      for (var j = 0; j < match.length; j++) {
        if (t === match[j] || t.indexOf(match[j]) === 0) return installed[i];
      }
    }
    return null;
  }

  function findById(id) {
    if (!installed) return null;
    for (var i = 0; i < installed.length; i++) {
      if (installed[i].id === id) return installed[i];
    }
    return null;
  }

  // ---- запуск ----

  function openUrl(url, title) {
    if (!Luna.available()) {
      window.open(url, '_blank');
      return;
    }
    toast('Открываю ' + title + ' в браузере…');
    Luna.call(LAUNCH, { id: BROWSER_ID, params: { target: url } }, function (res) {
      if (res.returnValue === false) toast('Не удалось открыть браузер');
    });
  }

  function launch(id, title, fallbackUrl) {
    if (!Luna.available()) {
      toast('Демо-режим: на телевизоре здесь запустится «' + title + '»');
      return;
    }
    toast('Запуск: ' + title);
    Luna.call(LAUNCH, { id: id }, function (res) {
      if (res.returnValue !== false) return;
      if (fallbackUrl) {
        openUrl(fallbackUrl, title);
      } else {
        toast('Не удалось запустить «' + title + '»');
      }
    });
  }

  // ---- избранное ----

  function isFavorite(id) {
    return favorites.indexOf(id) >= 0;
  }

  function toggleFavorite(tile) {
    var id = tile && tile.getAttribute('data-app');
    if (!id) {
      toast('Эту плитку нельзя добавить в избранное');
      return;
    }
    var app = findById(id);
    var title = app ? app.title : id;
    var i = favorites.indexOf(id);
    if (i >= 0) {
      favorites.splice(i, 1);
      toast('«' + title + '» убрано из избранного');
    } else {
      favorites.push(id);
      toast('«' + title + '» добавлено в избранное');
    }
    Store.set('favorites', favorites);
    render(tile);
  }

  function clearFavorites() {
    favorites = [];
    Store.set('favorites', favorites);
    render(null);
  }

  // ---- отрисовка ----

  function iconSrc(app) {
    return app.largeIcon || app.icon || '';
  }

  function tileHtml(key, opts) {
    var art;
    if (opts.icon) {
      art = '<div class="tile-art" style="background:' + escapeHtml(opts.bg || '#2a3350') + '">' +
        '<img src="' + escapeHtml(opts.icon) + '" alt=""></div>';
    } else {
      var text = opts.logo || opts.title;
      art = '<div class="tile-art logo" style="background:' + escapeHtml(opts.bg || '#2a3350') + '">' +
        '<span' + (text.length > 10 ? ' class="long"' : '') + '>' + escapeHtml(text) + '</span></div>';
    }
    return '<div class="tile focusable" tabindex="0" data-key="' + escapeHtml(key) + '"' +
      (opts.appId ? ' data-app="' + escapeHtml(opts.appId) + '"' : '') + '>' +
      art +
      (opts.fav ? '<div class="tile-fav"></div>' : '') +
      '<div class="tile-title">' + escapeHtml(opts.title) + '</div>' +
      (opts.sub ? '<div class="tile-sub">' + escapeHtml(opts.sub) + '</div>' : '') +
      '</div>';
  }

  function rowHtml(id, title, tiles) {
    return '<section class="row" data-row="' + id + '"><h2>' + title + '</h2>' +
      '<div class="row-track"><div class="row-inner">' + tiles + '</div></div></section>';
  }

  function appTile(prefix, app) {
    var key = prefix + ':' + app.id;
    actions[key] = function () { launch(app.id, app.title); };
    return tileHtml(key, {
      title: app.title,
      icon: iconSrc(app),
      bg: app.bgColor,
      appId: app.id,
      fav: isFavorite(app.id)
    });
  }

  function render(focusTile) {
    // Запоминаем, на какой плитке стоял фокус, чтобы вернуть его после перерисовки.
    var keepRow = null, keepKey = null;
    if (focusTile) {
      var row = closestWithClass(focusTile, 'row', container);
      keepRow = row && row.getAttribute('data-row');
      keepKey = focusTile.getAttribute('data-key');
    }

    actions = {};
    var html = '';

    var tiles = '';
    for (var i = 0; i < CINEMAS.length; i++) {
      (function (c) {
        var app = findInstalled(c.match);
        var key = 'cinema:' + c.key;
        if (app) {
          actions[key] = function () { launch(app.id, c.title, c.url); };
        } else if (c.id && !installed) {
          actions[key] = function () { launch(c.id, c.title, c.url); };
        } else {
          actions[key] = function () { openUrl(c.url, c.title); };
        }
        tiles += tileHtml(key, {
          title: c.title,
          logo: c.logo,
          bg: c.bg,
          icon: app ? iconSrc(app) : '',
          appId: app ? app.id : '',
          fav: app ? isFavorite(app.id) : false,
          sub: app || !installed ? '' : 'в браузере'
        });
      })(CINEMAS[i]);
    }
    html += rowHtml('cinemas', 'Онлайн-кинотеатры', tiles);

    if (installed && favorites.length) {
      tiles = '';
      for (i = 0; i < favorites.length; i++) {
        var fav = findById(favorites[i]);
        if (fav) tiles += appTile('fav', fav);
      }
      if (tiles) html += rowHtml('favorites', 'Избранное', tiles);
    }

    if (installed && installed.length) {
      tiles = '';
      for (i = 0; i < installed.length; i++) tiles += appTile('all', installed[i]);
      html += rowHtml('all', 'Все приложения' + (Luna.available() ? '' : ' (демо)'), tiles);
    }

    container.innerHTML = html;

    var target = null;
    if (keepRow) {
      var rowEl = container.querySelector('.row[data-row="' + keepRow + '"]');
      if (rowEl) {
        var list = rowEl.querySelectorAll('.tile');
        for (i = 0; i < list.length; i++) {
          if (list[i].getAttribute('data-key') === keepKey) target = list[i];
        }
        if (!target && list.length) target = list[list.length - 1];
      }
      if (!target) target = container.querySelector('.tile');
    }
    if (onRendered) onRendered(target);
  }

  function load() {
    Luna.call(LIST, {}, function (res) {
      var lps = null;
      if (res && res.returnValue !== false && res.launchPoints) {
        lps = res.launchPoints;
      } else if (!Luna.available()) {
        lps = DEMO_APPS;
      }
      if (lps) {
        var seen = {};
        installed = [];
        for (var i = 0; i < lps.length; i++) {
          var lp = lps[i];
          if (!lp.id || lp.id === APP_ID || seen[lp.id]) continue;
          seen[lp.id] = true;
          installed.push(lp);
        }
        installed.sort(function (a, b) {
          return String(a.title).localeCompare(String(b.title));
        });
      }
      var focused = document.activeElement;
      render(hasClass(focused, 'tile') ? focused : null);
    });
  }

  function init(el, renderedCb) {
    container = el;
    onRendered = renderedCb;
    render(null);
    load();

    container.addEventListener('click', function (e) {
      var tile = closestWithClass(e.target, 'tile', container);
      if (!tile) return;
      var action = actions[tile.getAttribute('data-key')];
      if (action) action();
    });
  }

  return {
    init: init,
    reload: load,
    toggleFavorite: toggleFavorite,
    clearFavorites: clearFavorites
  };
})();
