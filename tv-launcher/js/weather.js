// Погода через бесплатный API Open-Meteo (без ключа).

var Weather = (function () {
  var DEFAULT_CITY = { name: 'Москва', lat: 55.7558, lon: 37.6173 };
  var REFRESH_MS = 30 * 60 * 1000;
  var RETRY_MS = 5 * 60 * 1000;

  var city = Store.get('city', DEFAULT_CITY);
  var timer = null;
  var lastOk = 0;
  var lastData = null;

  var CODES = {
    0: ['Ясно', 'sun'],
    1: ['Преимущественно ясно', 'sun'],
    2: ['Переменная облачность', 'partly'],
    3: ['Пасмурно', 'cloud'],
    45: ['Туман', 'fog'],
    48: ['Туман с изморозью', 'fog'],
    51: ['Слабая морось', 'rain'],
    53: ['Морось', 'rain'],
    55: ['Сильная морось', 'rain'],
    56: ['Ледяная морось', 'rain'],
    57: ['Ледяная морось', 'rain'],
    61: ['Небольшой дождь', 'rain'],
    63: ['Дождь', 'rain'],
    65: ['Сильный дождь', 'rain'],
    66: ['Ледяной дождь', 'rain'],
    67: ['Ледяной дождь', 'rain'],
    71: ['Небольшой снег', 'snow'],
    73: ['Снег', 'snow'],
    75: ['Сильный снег', 'snow'],
    77: ['Снежная крупа', 'snow'],
    80: ['Небольшой ливень', 'rain'],
    81: ['Ливень', 'rain'],
    82: ['Сильный ливень', 'rain'],
    85: ['Снегопад', 'snow'],
    86: ['Сильный снегопад', 'snow'],
    95: ['Гроза', 'storm'],
    96: ['Гроза с градом', 'storm'],
    99: ['Гроза с градом', 'storm']
  };

  // ---- иконки (inline SVG: эмодзи на webOS 3.5 отображаются не везде) ----

  var CLOUD = '<path d="M20 46h26a10 10 0 0 0 0-20 14 14 0 0 0-27-3A11 11 0 0 0 20 46z" fill="#d7deea"/>';

  function sunSvg(cx, cy, r) {
    var s = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#ffd54f"/>';
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      var x1 = cx + Math.cos(a) * (r + 4), y1 = cy + Math.sin(a) * (r + 4);
      var x2 = cx + Math.cos(a) * (r + 9), y2 = cy + Math.sin(a) * (r + 9);
      s += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) +
        '" y2="' + y2.toFixed(1) + '" stroke="#ffd54f" stroke-width="3" stroke-linecap="round"/>';
    }
    return s;
  }

  var MOON = '<path d="M38 10a22 22 0 1 0 16 34A18 18 0 0 1 38 10z" fill="#e8ecf8"/>';

  function iconSvg(kind, isDay) {
    var body;
    switch (kind) {
      case 'sun':
        body = isDay ? sunSvg(32, 32, 12) : MOON;
        break;
      case 'partly':
        body = (isDay ? '<g transform="translate(-8 -8)">' + sunSvg(32, 32, 10) + '</g>' :
          '<g transform="translate(-6 -6) scale(.8)">' + MOON + '</g>') +
          '<g transform="translate(4 4)">' + CLOUD + '</g>';
        break;
      case 'cloud':
        body = '<g transform="translate(0 -2)">' + CLOUD + '</g>';
        break;
      case 'rain':
        body = '<g transform="translate(0 -8)">' + CLOUD + '</g>' +
          '<g stroke="#64b5f6" stroke-width="3" stroke-linecap="round">' +
          '<line x1="24" y1="44" x2="21" y2="54"/><line x1="33" y1="44" x2="30" y2="54"/>' +
          '<line x1="42" y1="44" x2="39" y2="54"/></g>';
        break;
      case 'snow':
        body = '<g transform="translate(0 -8)">' + CLOUD + '</g>' +
          '<g fill="#ffffff"><circle cx="23" cy="47" r="2.6"/><circle cx="32" cy="52" r="2.6"/>' +
          '<circle cx="41" cy="47" r="2.6"/><circle cx="27" cy="57" r="2.2"/><circle cx="37" cy="58" r="2.2"/></g>';
        break;
      case 'storm':
        body = '<g transform="translate(0 -8)">' + CLOUD + '</g>' +
          '<polygon points="34,38 24,52 31,52 27,62 40,46 33,46 37,38" fill="#ffd54f"/>';
        break;
      default: // fog
        body = '<g transform="translate(0 -8)">' + CLOUD + '</g>' +
          '<g stroke="#b0bccd" stroke-width="3" stroke-linecap="round">' +
          '<line x1="14" y1="46" x2="50" y2="46"/><line x1="18" y1="53" x2="46" y2="53"/></g>';
    }
    return '<svg viewBox="0 0 64 64">' + body + '</svg>';
  }

  // ---- сеть ----

  function xhrJson(url, cb) {
    var done = false;
    function finish(err, data) {
      if (done) return;
      done = true;
      cb(err, data);
    }
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.timeout = 15000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status >= 200 && x.status < 300) {
        try {
          finish(null, JSON.parse(x.responseText));
        } catch (e) {
          finish(e);
        }
      } else {
        finish(new Error('HTTP ' + x.status));
      }
    };
    x.ontimeout = function () { finish(new Error('timeout')); };
    x.onerror = function () { finish(new Error('network')); };
    x.send();
  }

  // На старых прошивках может не хватать свежих корневых сертификатов —
  // тогда пробуем ещё и по HTTP.
  function getJson(hostAndPath, cb) {
    xhrJson('https://' + hostAndPath, function (err, data) {
      if (!err) return cb(null, data);
      xhrJson('http://' + hostAndPath, cb);
    });
  }

  // ---- отображение ----

  function fmtTemp(t) {
    var r = Math.round(t);
    return (r > 0 ? '+' : '') + r + '°';
  }

  function describe(code) {
    return CODES[code] || ['—', 'cloud'];
  }

  function render(data) {
    lastData = data;
    var c = data.current;
    var info = describe(c.weather_code);
    var upd = new Date(data.fetchedAt);
    var html =
      '<div class="w-head"><span class="w-city">' + escapeHtml(city.name) + '</span>' +
      '<span class="w-upd">обновлено ' + pad2(upd.getHours()) + ':' + pad2(upd.getMinutes()) + '</span></div>' +
      '<div class="w-now">' +
      '<div class="w-icon">' + iconSvg(info[1], c.is_day !== 0) + '</div>' +
      '<div class="w-temp">' + fmtTemp(c.temperature_2m) + '</div>' +
      '<div class="w-desc">' + info[0] +
      '<small>Ощущается как ' + fmtTemp(c.apparent_temperature) + '<br>' +
      'Ветер ' + Math.round(c.wind_speed_10m) + ' м/с · Влажность ' + Math.round(c.relative_humidity_2m) + '%</small>' +
      '</div></div><div class="w-days">';

    var dl = data.daily;
    for (var i = 0; i < dl.time.length && i < 4; i++) {
      var p = dl.time[i].split('-');
      var date = new Date(+p[0], +p[1] - 1, +p[2]);
      var di = describe(dl.weather_code[i]);
      html += '<div class="w-day"><div class="w-dname">' + (i === 0 ? 'Сегодня' : RU.daysShort[date.getDay()]) + '</div>' +
        '<div class="w-dicon">' + iconSvg(di[1], true) + '</div>' +
        '<div class="w-drange">' + fmtTemp(dl.temperature_2m_max[i]) +
        ' <span>' + fmtTemp(dl.temperature_2m_min[i]) + '</span></div></div>';
    }
    html += '</div>';
    $('weather').innerHTML = html;
  }

  function renderError() {
    $('weather').innerHTML =
      '<div class="w-head"><span class="w-city">' + escapeHtml(city.name) + '</span></div>' +
      '<div class="w-empty">Нет данных о погоде.<br>Проверьте подключение к интернету.<br>' +
      '<small>Нажмите OK, чтобы сменить город</small></div>';
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(refresh, ms);
  }

  function refresh() {
    var path = 'api.open-meteo.com/v1/forecast?latitude=' + city.lat + '&longitude=' + city.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&wind_speed_unit=ms&timezone=auto&forecast_days=4';
    getJson(path, function (err, data) {
      if (err || !data || !data.current || !data.daily) {
        var cached = Store.get('weatherCache', null);
        if (cached && cached.lat === city.lat && cached.lon === city.lon) {
          render(cached);
        } else {
          renderError();
        }
        schedule(RETRY_MS);
        return;
      }
      data.fetchedAt = new Date().getTime();
      data.lat = city.lat;
      data.lon = city.lon;
      Store.set('weatherCache', data);
      lastOk = data.fetchedAt;
      render(data);
      schedule(REFRESH_MS);
    });
  }

  function init() {
    var cached = Store.get('weatherCache', null);
    if (cached && cached.lat === city.lat && cached.lon === city.lon) {
      try {
        render(cached);
      } catch (e) { /* устаревший формат кэша — просто перезагрузим */ }
    }
    refresh();
  }

  function refreshIfStale() {
    if (new Date().getTime() - lastOk > REFRESH_MS) refresh();
  }

  function searchCity(query, cb) {
    var path = 'geocoding-api.open-meteo.com/v1/search?count=6&language=ru&format=json&name=' +
      encodeURIComponent(query);
    getJson(path, function (err, data) {
      if (err) return cb(err);
      var list = [];
      var results = (data && data.results) || [];
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var region = [];
        if (r.admin1 && r.admin1 !== r.name) region.push(r.admin1);
        if (r.country) region.push(r.country);
        list.push({ name: r.name, region: region.join(', '), lat: r.latitude, lon: r.longitude });
      }
      cb(null, list);
    });
  }

  function getSummary() {
    if (!lastData) return null;
    var c = lastData.current;
    var info = describe(c.weather_code);
    return {
      city: city.name,
      temp: fmtTemp(c.temperature_2m),
      text: info[0],
      icon: iconSvg(info[1], c.is_day !== 0)
    };
  }

  function setCity(c) {
    lastData = null;
    city = { name: c.name, lat: c.lat, lon: c.lon };
    Store.set('city', city);
    $('weather').innerHTML = '<div class="w-empty">Загрузка погоды…</div>';
    refresh();
  }

  return {
    init: init,
    refresh: refresh,
    refreshIfStale: refreshIfStale,
    searchCity: searchCity,
    setCity: setCity,
    getSummary: getSummary,
    getCity: function () { return city; }
  };
})();
