// Вызовы системных сервисов webOS (Luna) через PalmServiceBridge.
// В обычном браузере моста нет — тогда Luna.available() === false и
// приложение работает в демо-режиме.

var Luna = (function () {
  // Держим ссылки на мосты, пока не придёт ответ, иначе их соберёт GC.
  var pending = [];

  function available() {
    return typeof window.PalmServiceBridge !== 'undefined';
  }

  function call(uri, params, cb) {
    if (!available()) {
      setTimeout(function () {
        cb({ returnValue: false, errorText: 'PalmServiceBridge недоступен' });
      }, 0);
      return;
    }
    var bridge = new window.PalmServiceBridge();
    var done = false;
    pending.push(bridge);

    function finish(res) {
      if (done) return;
      done = true;
      var i = pending.indexOf(bridge);
      if (i >= 0) pending.splice(i, 1);
      cb(res);
    }

    bridge.onservicecallback = function (msg) {
      var res;
      try {
        res = JSON.parse(msg);
      } catch (e) {
        res = { returnValue: false, errorText: 'Некорректный ответ сервиса' };
      }
      finish(res);
    };
    try {
      bridge.call(uri, JSON.stringify(params || {}));
    } catch (e) {
      finish({ returnValue: false, errorText: String(e) });
    }
  }

  return { available: available, call: call };
})();
