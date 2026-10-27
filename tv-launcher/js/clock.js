// Часы, дата, приветствие и фон по времени суток.

var Clock = (function () {
  var showSeconds = Store.get('seconds', true);
  var lastDay = -1;
  var lastPeriod = '';

  var PERIODS = {
    night: 'Доброй ночи',
    morning: 'Доброе утро',
    day: 'Добрый день',
    evening: 'Добрый вечер'
  };

  function periodOf(h) {
    if (h < 5) return 'night';
    if (h < 11) return 'morning';
    if (h < 17) return 'day';
    if (h < 22) return 'evening';
    return 'night';
  }

  function tick() {
    var d = new Date();
    $('clockHM').textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    $('clockS').textContent = showSeconds ? pad2(d.getSeconds()) : '';

    if (d.getDate() !== lastDay) {
      lastDay = d.getDate();
      var day = RU.days[d.getDay()];
      $('clockDate').textContent = day.charAt(0).toUpperCase() + day.slice(1) + ', ' +
        d.getDate() + ' ' + RU.months[d.getMonth()];
      Calendar.render(d);
    }

    var p = periodOf(d.getHours());
    if (p !== lastPeriod) {
      lastPeriod = p;
      document.body.className = 'period-' + p;
      $('greeting').textContent = PERIODS[p];
    }
  }

  function start() {
    tick();
    setInterval(tick, 1000);
  }

  function setShowSeconds(on) {
    showSeconds = on;
    Store.set('seconds', on);
    tick();
  }

  return {
    start: start,
    setShowSeconds: setShowSeconds,
    getShowSeconds: function () { return showSeconds; }
  };
})();
