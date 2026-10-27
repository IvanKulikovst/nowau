// Навигация стрелками пульта: из всех видимых .focusable выбирается
// ближайший элемент в нужном направлении.

var Nav = (function () {
  function scope() {
    var s = $('settings');
    return hasClass(s, 'hidden') ? $('app') : s;
  }

  function visibleFocusables() {
    var all = scope().querySelectorAll('.focusable');
    var res = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].offsetWidth > 0 || all[i].offsetHeight > 0) res.push(all[i]);
    }
    return res;
  }

  function current() {
    var a = document.activeElement;
    if (a && hasClass(a, 'focusable') && scope().contains(a)) return a;
    return null;
  }

  function ensureVisible(el) {
    var p = el.parentNode;
    while (p && p !== document.body) {
      if (hasClass(p, 'row-track')) {
        var tr = p.getBoundingClientRect();
        var er = el.getBoundingClientRect();
        var pad = tr.width * 0.05;
        if (er.right > tr.right - pad) {
          p.scrollLeft += er.right - (tr.right - pad);
        } else if (er.left < tr.left + pad) {
          p.scrollLeft -= (tr.left + pad) - er.left;
        }
      }
      if (p.id === 'main') {
        var section = closestWithClass(el, 'row', p) || closestWithClass(el, 'widgets', p);
        if (hasClass(section, 'widgets')) {
          p.scrollTop = 0;
        } else if (section) {
          var mr = p.getBoundingClientRect();
          var sr = section.getBoundingClientRect();
          if (sr.bottom > mr.bottom) {
            p.scrollTop += sr.bottom - mr.bottom;
          } else if (sr.top < mr.top) {
            p.scrollTop -= mr.top - sr.top;
          }
        }
      }
      p = p.parentNode;
    }
  }

  function focus(el) {
    if (!el) return;
    el.focus();
    ensureVisible(el);
  }

  function focusFirst() {
    var list = visibleFocusables();
    var tile = scope().querySelector('.tile');
    focus(tile || list[0]);
  }

  function move(dir) {
    var cur = current();
    if (!cur) {
      focusFirst();
      return;
    }
    var cr = cur.getBoundingClientRect();
    var cx = cr.left + cr.width / 2;
    var cy = cr.top + cr.height / 2;
    var list = visibleFocusables();
    var best = null, bestScore = Infinity;

    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === cur) continue;
      var r = el.getBoundingClientRect();
      var x = r.left + r.width / 2;
      var y = r.top + r.height / 2;
      var primary, secondary;
      var sameLine = r.top < cr.bottom && r.bottom > cr.top;
      if ((dir === 'left' || dir === 'right') && !sameLine) continue;
      if (dir === 'right') {
        if (r.left < cr.right - 2) continue;
        primary = x - cx;
        secondary = Math.abs(y - cy);
      } else if (dir === 'left') {
        if (r.right > cr.left + 2) continue;
        primary = cx - x;
        secondary = Math.abs(y - cy);
      } else if (dir === 'down') {
        if (r.top < cr.bottom - 2) continue;
        primary = y - cy;
        secondary = Math.abs(x - cx);
      } else {
        if (r.bottom > cr.top + 2) continue;
        primary = cy - y;
        secondary = Math.abs(x - cx);
      }
      // Горизонтально держимся своего ряда, вертикально — ближайшего столбца.
      var score = dir === 'left' || dir === 'right' ? primary + secondary * 4 : primary * 2 + secondary;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) focus(best);
  }

  return {
    move: move,
    focus: focus,
    focusFirst: focusFirst,
    current: current
  };
})();
