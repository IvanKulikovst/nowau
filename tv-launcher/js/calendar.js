// Виджет календаря на месяц с отметками праздников РФ.

var Calendar = (function () {
  var HOLIDAYS = [
    { m: 0, d: 1, n: 'Новый год' },
    { m: 0, d: 7, n: 'Рождество Христово' },
    { m: 1, d: 23, n: 'День защитника Отечества' },
    { m: 2, d: 8, n: 'Международный женский день' },
    { m: 4, d: 1, n: 'Праздник Весны и Труда' },
    { m: 4, d: 9, n: 'День Победы' },
    { m: 5, d: 12, n: 'День России' },
    { m: 10, d: 4, n: 'День народного единства' }
  ];

  function isHoliday(m, d) {
    if (m === 0 && d <= 8) return true; // новогодние каникулы
    for (var i = 0; i < HOLIDAYS.length; i++) {
      if (HOLIDAYS[i].m === m && HOLIDAYS[i].d === d) return true;
    }
    return false;
  }

  function nextHoliday(today) {
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var best = null;
    for (var y = start.getFullYear(); y <= start.getFullYear() + 1; y++) {
      for (var i = 0; i < HOLIDAYS.length; i++) {
        var h = HOLIDAYS[i];
        var date = new Date(y, h.m, h.d);
        if (date >= start && (!best || date < best.date)) {
          best = { date: date, name: h.n };
        }
      }
    }
    best.days = Math.round((best.date - start) / 86400000);
    return best;
  }

  function daysWord(n) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return 'день';
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'дня';
    return 'дней';
  }

  function renderHoliday(today) {
    var h = nextHoliday(today);
    var text;
    if (h.days === 0) {
      text = 'Сегодня праздник: ' + h.name;
    } else {
      text = h.date.getDate() + ' ' + RU.months[h.date.getMonth()] + ' — ' + h.name +
        ' (через ' + h.days + ' ' + daysWord(h.days) + ')';
    }
    $('holiday').textContent = text;
  }

  function render(today) {
    var y = today.getFullYear();
    var m = today.getMonth();
    var offset = (new Date(y, m, 1).getDay() + 6) % 7; // неделя с понедельника
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var html = '<div class="cal-title">' + RU.monthsNom[m] + ' ' + y + '</div><table class="cal"><tr>';
    var heads = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    for (var i = 0; i < 7; i++) {
      html += '<th' + (i >= 5 ? ' class="we"' : '') + '>' + heads[i] + '</th>';
    }
    html += '</tr><tr>';
    var col = 0;
    for (i = 0; i < offset; i++, col++) html += '<td></td>';
    for (var d = 1; d <= daysInMonth; d++, col++) {
      if (col === 7) {
        html += '</tr><tr>';
        col = 0;
      }
      var cls = [];
      if (col >= 5) cls.push('we');
      if (isHoliday(m, d)) cls.push('hol');
      if (d === today.getDate()) cls.push('today');
      html += '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '><span>' + d + '</span></td>';
    }
    for (; col < 7; col++) html += '<td></td>';
    html += '</tr></table>';
    $('calendar').innerHTML = html;
    renderHoliday(today);
  }

  return { render: render };
})();
