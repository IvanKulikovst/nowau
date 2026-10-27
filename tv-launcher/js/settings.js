// Окно настроек: город для погоды, секунды на часах, сброс избранного.

var Settings = (function () {
  var lastFocus = null;
  var found = [];

  function isOpen() {
    return !hasClass($('settings'), 'hidden');
  }

  function updateSecondsLabel() {
    $('toggleSeconds').textContent = 'Секунды на часах: ' + (Clock.getShowSeconds() ? 'вкл' : 'выкл');
  }

  function open() {
    lastFocus = document.activeElement;
    $('currentCity').textContent = Weather.getCity().name;
    $('cityResults').innerHTML = '';
    $('cityInput').value = '';
    updateSecondsLabel();
    $('settings').classList.remove('hidden');
    // Фокус на кнопку, а не на поле — иначе сразу всплывёт экранная клавиатура.
    Nav.focus($('citySearch'));
  }

  function close() {
    $('cityInput').blur();
    $('settings').classList.add('hidden');
    if (lastFocus && lastFocus.parentNode && document.body.contains(lastFocus)) {
      Nav.focus(lastFocus);
    } else {
      Nav.focusFirst();
    }
  }

  function search() {
    var q = $('cityInput').value.replace(/^\s+|\s+$/g, '');
    if (!q) {
      $('cityInput').focus();
      return;
    }
    $('cityInput').blur();
    var box = $('cityResults');
    box.innerHTML = '<div class="muted">Поиск…</div>';
    Weather.searchCity(q, function (err, list) {
      if (err) {
        box.innerHTML = '<div class="muted">Не удалось выполнить поиск. Проверьте интернет.</div>';
        Nav.focus($('citySearch'));
        return;
      }
      if (!list.length) {
        box.innerHTML = '<div class="muted">Ничего не найдено</div>';
        Nav.focus($('citySearch'));
        return;
      }
      found = list;
      var html = '';
      for (var i = 0; i < list.length; i++) {
        html += '<div class="btn result focusable" tabindex="0" data-idx="' + i + '">' +
          escapeHtml(list[i].name) + (list[i].region ? ' <span>' + escapeHtml(list[i].region) + '</span>' : '') +
          '</div>';
      }
      box.innerHTML = html;
      Nav.focus(box.querySelector('.result'));
    });
  }

  function init() {
    $('btnSettings').addEventListener('click', open);
    $('weather').addEventListener('click', open);
    $('citySearch').addEventListener('click', search);
    $('closeSettings').addEventListener('click', close);
    $('toggleSeconds').addEventListener('click', function () {
      Clock.setShowSeconds(!Clock.getShowSeconds());
      updateSecondsLabel();
    });
    $('resetFav').addEventListener('click', function () {
      Apps.clearFavorites();
      toast('Избранное очищено');
    });
    $('cityResults').addEventListener('click', function (e) {
      var btn = closestWithClass(e.target, 'result', $('cityResults'));
      if (!btn) return;
      var c = found[+btn.getAttribute('data-idx')];
      if (!c) return;
      Weather.setCity(c);
      toast('Город изменён: ' + c.name);
      close();
    });
  }

  return {
    init: init,
    open: open,
    close: close,
    search: search,
    isOpen: isOpen
  };
})();
