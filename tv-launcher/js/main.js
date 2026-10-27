// Точка входа: запуск виджетов и обработка кнопок пульта.

(function () {
  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 461, ESC: 27, BACKSPACE: 8,
    RED: 403, GREEN: 404, BLUE: 406
  };
  var exitArmedUntil = 0;

  function onBack() {
    if (Settings.isOpen()) {
      Settings.close();
      return;
    }
    var now = new Date().getTime();
    if (now < exitArmedUntil) {
      window.close();
      return;
    }
    exitArmedUntil = now + 2500;
    toast('Нажмите «Назад» ещё раз, чтобы выйти');
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    // Любая кнопка закрывает заставку и больше ничего не делает.
    if (Screensaver.isActive()) {
      Screensaver.stop();
      e.preventDefault();
      return;
    }
    Screensaver.resetIdle();
    var active = document.activeElement;
    var inInput = active && active.tagName === 'INPUT';

    switch (k) {
      case KEY.LEFT:
        if (inInput) return;
        Nav.move('left');
        break;
      case KEY.RIGHT:
        if (inInput) return;
        Nav.move('right');
        break;
      case KEY.UP:
        Nav.move('up');
        break;
      case KEY.DOWN:
        Nav.move('down');
        break;
      case KEY.ENTER:
        if (inInput) {
          Settings.submitInput(active);
        } else if (Nav.current()) {
          Nav.current().click();
        } else {
          Nav.focusFirst();
        }
        break;
      case KEY.BACKSPACE:
        if (inInput) return;
        onBack();
        break;
      case KEY.BACK:
      case KEY.ESC:
        onBack();
        break;
      case KEY.RED:
        if (!Settings.isOpen() && hasClass(Nav.current(), 'tile')) Apps.toggleFavorite(Nav.current());
        break;
      case KEY.BLUE:
        if (Settings.isOpen()) Settings.close();
        Screensaver.start();
        break;
      case KEY.GREEN:
        Weather.refresh();
        toast('Обновляю погоду…');
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // Указка Magic Remote: наведение переводит фокус на плитку.
  document.addEventListener('mouseover', function (e) {
    var el = closestWithClass(e.target, 'focusable', document.body);
    if (el && el !== document.activeElement && (!Settings.isOpen() || $('settings').contains(el))) {
      el.focus();
    }
  });

  // При возврате в приложение обновляем список приложений и погоду.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      Apps.reload();
      Weather.refreshIfStale();
    }
  });
  document.addEventListener('webOSRelaunch', function () {
    Apps.reload();
    Weather.refreshIfStale();
  });

  Clock.start();
  Weather.init();
  Settings.init();
  Screensaver.init();
  Apps.init($('rows'), function (target) {
    if (Settings.isOpen()) return;
    if (target) {
      Nav.focus(target);
    } else if (!Nav.current()) {
      Nav.focusFirst();
    }
  });
})();
