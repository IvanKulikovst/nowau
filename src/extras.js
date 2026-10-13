/* Расширения КРПД: разделы меню, строка меню, окно печати, справочные данные.
   Работает поверх ядра через window.KRPD. */
(function () {
  'use strict';
  var K = window.KRPD;
  if (!K) return;
  var NS = 'krpd-firewood.';
  function $(id) { return document.getElementById(id); }
  function E(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (k === 'style') n.style.cssText = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null && c !== false) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function svg(path, cls) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', cls || 'ic'); s.innerHTML = '<path d="' + path + '"/>'; return s; }
  function toast(t) { K.toast(t); }
  function lsGet(k, d) { try { var v = localStorage.getItem(NS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { toast('Не удалось сохранить настройки в браузере.'); return false; } }
  function landingOpen() { var l = $('landing'); return l && !l.hidden && !l.classList.contains('leave'); }
  function download(name, mime, text) {
    var blob = new Blob(['﻿', text], { type: mime + ';charset=utf-8' });
    var a = E('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function nowStr() { var d = new Date(); return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

  /* ---------- настройки ---------- */
  function getS() { var s = lsGet('settings', {}); return { user: s.user || {}, org: s.org || {}, calc: s.calc || {}, view: s.view || {} }; }
  function setS(s) { return lsSet('settings', s); }

  /* ---------- журнал печати ---------- */
  function logPrint(form, action, detail) {
    var l = lsGet('printlog', []);
    l.unshift({ t: new Date().toISOString(), form: form, action: action, detail: detail || '' });
    lsSet('printlog', l.slice(0, 100));
    renderRecent();
  }
  var FORM_NAME = { a1: 'Приложение № 1 — Расчёт потребности', a2: 'Приложение № 2 — Заявка', a3: 'Приложение № 3 — Журнал (отопление)', a4: 'Приложение № 4 — Журнал (помывка)' };
  function fmtIso(iso) { var d = new Date(iso); return isNaN(d) ? '' : pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  var ACT = { print: 'Печать', pdf: 'PDF', word: 'Word', excel: 'Excel', email: 'E-mail' };

  /* ---------- универсальное окно ---------- */
  var stack = [];
  function xwin(o) {
    var last = document.activeElement;
    var ov = E('div', { class: 'xov xhide' });
    var head = E('div', { class: 'xw-head' }, [E('h2', { text: o.title }), E('button', { type: 'button', class: 'xw-x', 'aria-label': 'Закрыть', text: '✕', onclick: function () { api.close(); } })]);
    var body = E('div', { class: 'xw-body' }, o.body ? [o.body] : []);
    var win = E('div', { class: 'xw ' + (o.cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title, style: o.width ? 'width:' + o.width : '' }, [head, o.bar || null, body]);
    if (o.footer && o.footer.length) win.appendChild(E('div', { class: 'xw-foot' }, o.footer.map(function (b) {
      return E('button', { type: 'button', class: 'xbtn ' + (b.kind || ''), text: b.label, onclick: function () { if (b.onClick) b.onClick(api); if (!b.keep) api.close(); } });
    })));
    ov.appendChild(win);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) api.close(); });
    document.body.appendChild(ov);
    var api = { el: win, body: body, close: function () { var i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); ov.remove(); if (o.onClose) o.onClose(); if (last && last.focus) try { last.focus(); } catch (e) { } } };
    stack.push(api);
    var f = win.querySelector('input,select,button.xbtn.fill'); if (f) setTimeout(function () { try { f.focus(); } catch (e) { } }, 30);
    return api;
  }

  /* ---------- действия ---------- */
  function scrollTo(key) {
    var t = key === 'list' ? $('secList') : key === 'data' ? $('secData') : key === 'recent' ? $('recentCard') : key === 'quick' ? $('quick') : null;
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function newCalc(preset) { K.openEditor(null, preset && preset.object ? preset : undefined); }
  function importCalc() { $('btnImport').click(); }
  function exportCalc() { if (!K.getItems().length) { toast('Нечего сохранять: список расчётов пуст.'); return; } $('btnExport').click(); }
  function recalcAll() { K.render(); var n = K.getItems().length; toast('Пересчитано расчётов: ' + n + '.'); }
  function checkData() {
    var items = K.getItems(), bad = [];
    items.forEach(function (it) { var c = K.calcRecord(it); if (!c.ok) bad.push([it.title, c.error]); });
    var body = E('div', null, [E('p', { text: 'Проверено расчётов: ' + items.length + '. Без ошибок: ' + (items.length - bad.length) + '. С ошибками: ' + bad.length + '.' })]);
    if (bad.length) body.appendChild(E('ul', null, bad.map(function (b) { return E('li', { text: b[0] + ' — ' + b[1] }); })));
    else body.appendChild(E('p', { class: 'xnote', text: 'Все значения укладываются в диапазоны норм приказа № 270.' }));
    xwin({ title: 'Проверка данных', body: body, footer: [{ label: 'Закрыть', kind: 'fill' }] });
  }
  function exitApp() {
    try { window.close(); } catch (e) { }
    setTimeout(function () { toast('Браузер не позволяет закрыть вкладку программой. Закройте вкладку вручную (Ctrl+W).'); }, 200);
  }
  function openHistory() {
    var items = K.getItems().slice().sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });
    var q = E('input', { type: 'search', class: 'xin', placeholder: 'Поиск по наименованию' });
    var tb = E('tbody');
    var w;
    function draw() {
      var s = q.value.trim().toLowerCase(); tb.replaceChildren();
      var n = 0;
      items.forEach(function (it) {
        if (s && it.title.toLowerCase().indexOf(s) < 0) return;
        var c = K.calcRecord(it), o = K.objectOf(it.object); n++;
        tb.appendChild(E('tr', null, [E('td', { text: fmtIso(it.updatedAt) }), E('td', { text: it.title }), E('td', { text: o ? o.label : '' }), E('td', { text: c.ok ? K.fmtScaled(c.volL, 3) + ' м³' : '—' }),
          E('td', null, [E('button', { type: 'button', class: 'xbtn sm', text: 'Открыть', onclick: function () { w.close(); K.openEditor(it.id); } })])]));
      });
      if (!n) tb.appendChild(E('tr', null, [E('td', { colspan: '5', class: 'xempty', text: items.length ? 'Ничего не найдено.' : 'Архив пуст. Создайте первый расчёт.' })]));
    }
    q.addEventListener('input', draw);
    var tbl = E('table', { class: 'xtable' }, [E('thead', null, [E('tr', null, ['Изменён', 'Наименование', 'Объект', 'Объём', ''].map(function (t) { return E('th', { text: t }); }))]), tb]);
    w = xwin({ title: 'История расчётов', width: 'min(960px,100%)', body: E('div', { style: 'display:grid;gap:10px' }, [q, tbl]), footer: [{ label: 'Закрыть', kind: 'fill' }] });
    draw();
  }
  var TEMPLATE_HINT = { tent: 'Таблица Нормы № 1 · учёт ветра и часов топки', dugout: 'Норма № 2 · на 100 м³', bldg: 'Норма № 3 · до 25 м³', wash: 'Норма № 4 · на человека' };
  function openTemplates() {
    var w = xwin({ title: 'Шаблоны расчётов', width: 'min(900px,100%)', body: E('div', null, [E('p', { class: 'xnote', text: 'Готовая форма расчёта по типу объекта: тип и наименование заполнены, остальные параметры — по умолчанию (КПД и константы берутся из «Настройки → Параметры расчёта»).' }),
      E('div', { class: 'xgrid3', style: 'margin-top:10px' }, K.OBJECTS.map(function (o) {
        return E('button', { type: 'button', class: 'xcard', onclick: function () { w.close(); K.openEditor(null, { object: o.key, title: o.label, tempC: o.kind === 'wash' ? '0' : (o.kind === 'bldg' ? '-10' : '-10'), qty: o.kind === 'bldg' ? '20' : (o.kind === 'dugout' ? '100' : '1') }); } }, [E('b', { text: o.label }), E('small', { text: TEMPLATE_HINT[o.kind] })]);
      }))]), footer: [{ label: 'Закрыть' }] });
  }
  function openOrders() {
    var w = xwin({ title: 'Приказы', body: E('div', { style: 'display:grid;gap:10px' }, [
      E('div', { class: 'xcard' }, [E('b', { text: 'Приказ Росгвардии от 14.07.2025 № 270' }), E('small', { text: 'Об утверждении Порядка обеспечения дровами и Норм расхода дров в войсках национальной гвардии Российской Федерации. Основание — ч. 1 ст. 31 Федерального закона № 226-ФЗ.' }),
        E('div', { class: 'row', style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px' }, [
          E('button', { type: 'button', class: 'xbtn sm fill', text: 'Полный текст', onclick: function () { w.close(); openRef('s1'); } }),
          E('button', { type: 'button', class: 'xbtn sm', text: 'Порядок (прил. № 1)', onclick: function () { w.close(); openRef('s1', 'ref-p1'); } }),
          E('button', { type: 'button', class: 'xbtn sm', text: 'Нормы (прил. № 2)', onclick: function () { w.close(); openRef('s3'); } })])]),
      E('p', { class: 'xnote', text: 'В программе загружен один приказ. Остальные приказы можно добавить в будущих версиях.' })]), footer: [{ label: 'Закрыть' }] });
  }
  function openAmend() {
    var w = xwin({ title: 'Дополнения', body: E('div', null, [E('div', { class: 'xempty', text: 'К приказу № 270 дополнений нет.' }), E('p', { class: 'xnote', text: 'В материалах, загруженных в программу, нет приказов о внесении изменений. Если дополнения будут утверждены, они появятся здесь и в разделе «Основания расчёта» справочника.' })]), footer: [{ label: 'Справочные данные', onClick: function () { openRef('s1'); } }, { label: 'Закрыть', kind: 'fill' }] });
  }
  function openDocTemplates() {
    var w = xwin({ title: 'Шаблоны документов', width: 'min(820px,100%)', body: E('div', { class: 'xgrid3' }, ['a1', 'a2', 'a3', 'a4'].map(function (f) {
      return E('button', { type: 'button', class: 'xcard', onclick: function () { w.close(); openPrintWin({ form: f }); } }, [E('b', { text: FORM_NAME[f] }), E('small', { text: 'Рекомендуемый образец формы — открыть в окне предпросмотра' })]);
    })), footer: [{ label: 'Закрыть' }] });
  }
  function openPrintLog() {
    var l = lsGet('printlog', []);
    var tb = E('tbody');
    l.forEach(function (r) { tb.appendChild(E('tr', null, [E('td', { text: fmtIso(r.t) }), E('td', { text: FORM_NAME[r.form] || r.form }), E('td', { text: ACT[r.action] || r.action }), E('td', { text: r.detail })])); });
    if (!l.length) tb.appendChild(E('tr', null, [E('td', { colspan: '4', class: 'xempty', text: 'Печать ещё не выполнялась.' })]));
    xwin({ title: 'История печати', width: 'min(860px,100%)', body: E('table', { class: 'xtable' }, [E('thead', null, [E('tr', null, ['Дата', 'Форма', 'Действие', 'Параметры'].map(function (t) { return E('th', { text: t }); }))]), tb]),
      footer: [{ label: 'Очистить журнал', onClick: function () { lsSet('printlog', []); renderRecent(); toast('Журнал очищен.'); } }, { label: 'Закрыть', kind: 'fill' }] });
  }
  function settingsWin(kind) {
    var s = getS(), fields = [], title, groupKey;
    if (kind === 'user') { title = 'Пользователь'; groupKey = 'user'; fields = [['rank', 'Воинское звание'], ['name', 'Фамилия и инициалы'], ['position', 'Должность (подставляется в подписи форм)']]; }
    if (kind === 'org') { title = 'Организация'; groupKey = 'org'; fields = [['unit', 'Воинская часть (организация)'], ['place', 'Место дислокации']]; }
    if (kind === 'calc') { title = 'Параметры расчёта'; groupKey = 'calc'; fields = [['kpd', 'КПД печи по умолчанию (0,7 — п. 13 Порядка)'], ['qt', 'Калорийный эквивалент Qт по умолчанию, ккал/кг'], ['density', 'Плотность древесины ρ по умолчанию, кг/м³']]; }
    var inputs = {};
    var form = E('div', { style: 'display:grid;gap:10px' }, fields.map(function (f) {
      var inp = E('input', { type: 'text', value: s[groupKey][f[0]] || '', maxlength: '200', placeholder: kind === 'calc' ? ({ kpd: '0,7', qt: '1862', density: '590' })[f[0]] : '' }); inputs[f[0]] = inp;
      return E('label', { class: 'xfield' }, [E('span', { text: f[1] }), inp]);
    }));
    var kids = [form];
    if (kind === 'calc') kids.push(E('div', { class: 'ref-table-wrap' }, [E('h4', { text: 'Константы приказа (не изменяются)' }), E('ul', null, [
      E('li', { text: 'Qут = 7000 ккал/кг — условное топливо' }), E('li', { text: 'Температура внутри по умолчанию: +18 °C (примечание к Норме № 3)' }), E('li', { text: 'Время топки палатки по умолчанию: 12 ч (Норма № 1)' }), E('li', { text: 'Запас: 0,125 м³/сут на печь на 3 суток (п. 14)' }), E('li', { text: 'Помывка: 0,115 (лето), 0,138 (отопительный период) кг у.т. на человека' })])]));
    xwin({ title: title, body: E('div', { style: 'display:grid;gap:12px' }, kids), footer: [{ label: 'Отмена' }, { label: 'Сохранить', kind: 'fill', onClick: function () {
      var cur = getS(); cur[groupKey] = {};
      fields.forEach(function (f) { cur[groupKey][f[0]] = inputs[f[0]].value.trim(); });
      if (setS(cur)) toast('Настройки сохранены.');
    } }] });
  }
  function guideWin() {
    xwin({ title: 'Руководство пользователя', width: 'min(760px,100%)', body: E('div', { class: 'ref-sec', style: 'margin:0' }, [
      E('h3', { text: '1. Создайте расчёт' }), E('p', { text: 'Расчёт → Новый расчёт (Ctrl+N). Выберите объект, введите количество, температуру, ветер (для палаток), время топки, число суток, КПД, плотность и Qт. Результат виден сразу.' }),
      E('h3', { text: '2. Проверьте по справочнику' }), E('p', { text: 'F1 — «Справочные данные»: текст приказа, формулы, таблицы норм и примеры. Каждое правило снабжено ссылкой на пункт приказа.' }),
      E('h3', { text: '3. Напечатайте формы' }), E('p', { text: 'Печать → Предпросмотр (Ctrl+P). Выберите форму (приложения № 1–4), бумагу, поля и экспортируйте в PDF, Word или Excel.' }),
      E('h3', { text: '4. Данные' }), E('p', { text: 'Данные хранятся только в этом браузере. Для переноса используйте «Файл → Экспорт данных» и «Файл → Импорт данных». Программа работает без интернета.' }),
      E('h3', { text: 'Горячие клавиши' }), E('p', { text: 'Ctrl+N новый · Ctrl+O открыть · Ctrl+S сохранить · Ctrl+P печать · Ctrl+Z отменить · Ctrl+F найти · F1 справка · F5 пересчитать · F11 полный экран · Alt+1…5 разделы.' })]), footer: [{ label: 'Закрыть', kind: 'fill' }] });
  }
  function updatesWin() {
    xwin({ title: 'Проверка обновлений', body: E('div', null, [E('p', { text: 'Версия: 2.0 (приказ Росгвардии № 270 от 14.07.2025).' }), E('p', { class: 'xnote', text: 'Программа работает автономно, без подключения к интернету, и не может проверять обновления сама. Новую версию вы получите файлом; ваши данные при замене файла сохраняются в браузере.' })]), footer: [{ label: 'Закрыть', kind: 'fill' }] });
  }
  function aboutWin() { var b = document.querySelector('.brand'); if (b) b.click(); }

  /* ---------- разделы ---------- */
  var PATH = {
    home: 'M3 11 12 4l9 7v9H3z', calc: 'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h4',
    docs: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6', print: 'M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z', set: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1a7 7 0 0 0-2-1l-.5-2h-5L9 7a7 7 0 0 0-2 1l-2-1-2 4 2 1v2l-2 1 2 4 2-1a7 7 0 0 0 2 1l.5 2h5l.5-2a7 7 0 0 0 2-1l2 1 2-4-2-1z'
  };
  var SECTIONS = [
    { id: 'home', label: 'Главная', icon: PATH.home, items: [
      { t: 'Обзор', h: 'Потребление: итоги и графики', run: function () { showSection('home'); } },
      { t: 'Графики', h: 'Структура, крупнейшие расчёты, динамика', run: function () { showSection('home'); var c = document.querySelector('.charts'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }] },
    { id: 'calc', label: 'Расчёт', icon: PATH.calc, items: [
      { t: 'Новый расчёт', h: 'Создание расчёта', run: function () { newCalc(); } },
      { t: 'Загрузить расчёт', h: 'Импорт из файла', run: importCalc },
      { t: 'История расчётов', h: 'Архив всех расчётов', run: openHistory },
      { t: 'Шаблоны расчётов', h: 'Готовые формы по типам объектов', run: openTemplates }] },
    { id: 'docs', label: 'Документы', icon: PATH.docs, items: [
      { t: 'Приказы', h: 'Список приказов', run: openOrders },
      { t: 'Дополнения', h: 'Список дополнений', run: openAmend },
      { t: 'Шаблоны документов', h: 'Формы приложений № 1–4', run: openDocTemplates }] },
    { id: 'print', label: 'Печать', icon: PATH.print, items: [
      { t: 'Предпросмотр', h: 'Просмотр перед печатью', run: function () { openPrintWin(); } },
      { t: 'Настройки печати', h: 'Параметры страницы', run: function () { openPrintWin({ focus: 'settings' }); } },
      { t: 'История печати', h: 'Журнал печати и экспорта', run: openPrintLog }] },
    { id: 'set', label: 'Настройки', icon: PATH.set, items: [
      { t: 'Пользователь', h: 'Профиль', run: function () { settingsWin('user'); } },
      { t: 'Организация', h: 'Данные организации', run: function () { settingsWin('org'); } },
      { t: 'Параметры расчёта', h: 'Константы и значения по умолчанию', run: function () { settingsWin('calc'); } }] }
  ];
  var curSec = 'home';
  var VIEW_OF = { home: 'home', calc: 'calc', docs: 'docs', print: 'print', set: 'set' };
  var curView = 'home';
  function setViewName(name, fromHash) {
    curView = name;
    var app = $('app'); if (!app) return;
    app.setAttribute('data-cur', name);
    document.querySelectorAll('#app [data-view]').forEach(function (n) { n.classList.toggle('vhide', n.getAttribute('data-view').split(' ').indexOf(name) < 0); });
    if (!fromHash && location.hash !== '#/' + name && location.hash !== '#selftest') { try { history.pushState(null, '', '#/' + name); } catch (e) { location.hash = '#/' + name; } }
    window.scrollTo({ top: 0 });
  }
  function showSection(id) { activate(id); }
  window.addEventListener('popstate', function () { var m = /^#\/(\w+)/.exec(location.hash); var id = m && VIEW_OF[m[1]] ? m[1] : 'home'; activate(id, true); });
  function activate(id, silent) {
    curSec = id; setViewName(VIEW_OF[id] || 'home', !!silent);
    document.querySelectorAll('.side-sec').forEach(function (el) {
      var on = el.getAttribute('data-sec') === id;
      el.classList.toggle('on', on);
      var b = el.querySelector('.side-sec-btn'); b.setAttribute('aria-expanded', on ? 'true' : 'false');
      el.querySelectorAll('.side-item').forEach(function (i) { i.tabIndex = on ? 0 : -1; });
    });
    document.querySelectorAll('.tabbar button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-sec') === id); });
  }
  function buildSide() {
    var nav = $('sideNav'); if (!nav) return;
    nav.replaceChildren(E('p', { class: 'side-label', text: 'Разделы' }));
    SECTIONS.forEach(function (s, i) {
      var sub = E('div', { class: 'side-sub', role: 'menu', 'aria-label': s.label }, [E('div', null, s.items.map(function (it) {
        return E('button', { type: 'button', class: 'side-item', role: 'menuitem', tabindex: '-1', onclick: function () { if (curSec !== s.id || curView !== VIEW_OF[s.id]) activate(s.id); it.run(); } }, [it.t, E('small', { text: it.h })]);
      }))]);
      var chev = E('span'); chev.innerHTML = '<svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
      var btn = E('button', { type: 'button', class: 'side-sec-btn', 'aria-expanded': 'false', title: s.label + ' (Alt+' + (i + 1) + ')', onclick: function () { activate(s.id); } }, [svg(s.icon), E('span', { text: s.label }), E('span', { class: 'kbd', text: 'Alt ' + (i + 1) }), chev.firstChild]);
      nav.appendChild(E('div', { class: 'side-sec', 'data-sec': s.id }, [btn, sub]));
    });
    activate('home');
  }
  function buildTabbar() {
    var tb = $('tabbar'); if (!tb) return;
    tb.replaceChildren();
    var pop = E('div', { class: 'tabpop xhide', hidden: true, id: 'tabpop' }); document.body.appendChild(pop);
    SECTIONS.forEach(function (s) {
      var b = E('button', { type: 'button', 'data-sec': s.id, onclick: function (e) {
        e.stopPropagation();
        var open = !pop.hidden && pop.getAttribute('data-sec') === s.id;
        if (open) { pop.hidden = true; return; }
        pop.replaceChildren(E('h4', { text: s.label }));
        s.items.forEach(function (it) { pop.appendChild(E('button', { type: 'button', class: 'side-item', onclick: function () { pop.hidden = true; activate(s.id); it.run(); } }, [it.t, E('small', { text: it.h })])); });
        pop.setAttribute('data-sec', s.id); pop.hidden = false; activate(s.id);
      } }, [svg(s.icon), s.label]);
      tb.appendChild(b);
    });
    document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });
  }
  function buildQuick() {
    var kp = document.querySelector('.kpis'); if (!kp || $('quick')) return;
    var q = E('div', { class: 'quick', id: 'quick', 'data-view': 'calc', role: 'toolbar', 'aria-label': 'Быстрые действия' }, [
      E('button', { type: 'button', onclick: function () { newCalc(); } }, [svg('M12 5v14M5 12h14'), 'Новый расчёт']),
      E('button', { type: 'button', onclick: importCalc }, [svg('M12 16V5M7 9l5-5 5 5M5 20h14'), 'Загрузить']),
      E('button', { type: 'button', onclick: function () { openPrintWin(); } }, [svg(PATH.print), 'Печать форм']),
      E('button', { type: 'button', onclick: function () { openRef(); } }, [svg('M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM9 7h6'), 'Справочные данные']),
      E('button', { type: 'button', onclick: function () { if (curView !== 'calc') activate('calc'); var s = $('search'); s.scrollIntoView({ behavior: 'smooth', block: 'center' }); s.focus({ preventScroll: true }); } }, [svg('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5'), 'Поиск'])]);
    kp.parentNode.insertBefore(q, kp);
  }
  function pageHead(title, sub) { return E('div', { class: 'hero-line' }, [E('h2', { text: title }), E('p', { class: 't-sub sec', text: sub })]); }
  function actCard(title, text, btns) { return E('div', { class: 'xcard gcard' }, [E('b', { text: title }), E('small', { text: text }), E('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' }, btns.map(function (b) { return E('button', { type: 'button', class: 'xbtn sm' + (b[2] ? ' fill' : ''), text: b[0], onclick: b[1] }); }))]); }
  function buildPages() {
    var app = $('app'), fab = $('fab'); if (!app || $('viewDocs')) return;
    function ins(n) { app.insertBefore(n, fab); }
    /* расчёты: заголовок и быстрые действия */
    var sl = $('secList');
    if (sl) { var hd = pageHead('Расчёты', 'Список расчётов, поиск и разделы по типам объектов'); hd.setAttribute('data-view', 'calc'); sl.parentNode.insertBefore(hd, sl); sl.remove(); var qq = $('quick'); if (qq) hd.after(qq); }
    /* документы */
    var d = E('div', { id: 'viewDocs', 'data-view': 'docs' }, [pageHead('Документы', 'Приказ, дополнения и формы приложений'),
      E('div', { class: 'xgrid3 pgrid' }, [
        actCard('Приказ Росгвардии от 14.07.2025 № 270', 'Об утверждении Порядка обеспечения дровами и Норм расхода дров в войсках национальной гвардии.', [['Полный текст', function () { openRef('s1'); }, 1], ['Порядок', function () { openRef('s1', 'ref-p1'); }], ['Нормы', function () { openRef('s3'); }]]),
        actCard('Дополнения', 'К приказу № 270 дополнений в программе нет.', [['Открыть список', openAmend]]),
        actCard('Справочные данные', 'Формулы, таблицы, примеры и пояснения по приказу.', [['Открыть (F1)', function () { openRef(); }, 1]])]),
      E('h3', { class: 'pg-h', text: 'Шаблоны документов' }),
      E('div', { class: 'xgrid3 pgrid' }, ['a1', 'a2', 'a3', 'a4'].map(function (f) { return actCard(FORM_NAME[f], 'Рекомендуемый образец формы', [['Открыть предпросмотр', function () { openPrintWin({ form: f }); }, 1]]); }))]);
    ins(d);
    /* печать */
    var pr = E('div', { id: 'viewPrint', 'data-view': 'print' }, [pageHead('Печать', 'Предпросмотр, параметры страницы и журнал'),
      E('div', { class: 'xgrid3 pgrid' }, [
        actCard('Предпросмотр', 'Просмотр формы перед печатью, масштаб, страницы.', [['Открыть', function () { openPrintWin(); }, 1]]),
        actCard('Настройки печати', 'Бумага, ориентация, поля, копии, колонтитулы.', [['Параметры страницы', function () { openPrintWin({ focus: 'settings' }); }]]),
        actCard('История печати', 'Журнал печати и экспорта.', [['Открыть журнал', openPrintLog]])]),
      E('h3', { class: 'pg-h', text: 'Последние документы' }),
      E('div', { class: 'gcard', style: 'padding:16px 20px' }, [E('ul', { class: 'recent-list', id: 'recentList' })])]);
    ins(pr); renderRecent();
    /* настройки */
    var st = E('div', { id: 'viewSet', 'data-view': 'set' }, [pageHead('Настройки', 'Пользователь, организация, параметры расчёта и данные'),
      E('div', { class: 'xgrid3 pgrid' }, [
        actCard('Пользователь', 'Звание, фамилия и должность — подставляются в подписи форм.', [['Изменить', function () { settingsWin('user'); }, 1]]),
        actCard('Организация', 'Воинская часть и место дислокации.', [['Изменить', function () { settingsWin('org'); }, 1]]),
        actCard('Параметры расчёта', 'КПД, Qт и плотность по умолчанию; константы приказа.', [['Изменить', function () { settingsWin('calc'); }, 1]])])]);
    ins(st);
    /* пометки существующих блоков */
    var tag = function (el, v) { if (el) el.setAttribute('data-view', v); };
    tag(document.querySelector('.hero-line'), 'home'); tag(document.querySelector('.kpis'), 'home'); tag($('totN'), 'home'); tag(document.querySelector('.charts'), 'home');
    tag(document.querySelector('.tools'), 'calc'); tag($('seg'), 'calc'); tag($('panel'), 'calc');
    var sd = $('secData'); if (sd) { var grp = sd.nextElementSibling, nt = document.querySelector('#app > .note'); st.appendChild(sd); st.appendChild(grp); if (nt) st.appendChild(nt); }
  }

  function renderRecent() {
    var ul = $('recentList'); if (!ul) return;
    var l = lsGet('printlog', []).slice(0, 5);
    ul.replaceChildren();
    if (!l.length) ul.appendChild(E('li', null, [E('span', { class: 'xnote', text: 'Печать ещё не выполнялась. Откройте «Печать → Предпросмотр».' })]));
    l.forEach(function (r) { ul.appendChild(E('li', null, [E('span', { text: (ACT[r.action] || r.action) + ' · ' + (FORM_NAME[r.form] || r.form).split(' — ')[0] }), E('small', { text: fmtIso(r.t) })])); });
  }

  /* ---------- вид ---------- */
  var root = document.documentElement;
  var view = { toolbar: true, status: true, side: true, zoom: 100 };
  function loadView() { var v = getS().view; Object.keys(view).forEach(function (k) { if (v[k] !== undefined) view[k] = v[k]; }); applyView(); }
  function applyView() {
    root.classList.toggle('no-toolbar', !view.toolbar); root.classList.toggle('no-status', !view.status); root.classList.toggle('no-side', !view.side);
    var app = $('app'); if (app) app.style.zoom = view.zoom === 100 ? '' : String(view.zoom / 100);
  }
  function setView(k, v) { view[k] = v; applyView(); var s = getS(); s.view = Object.assign({}, view); setS(s); }
  function fullscreen() {
    try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { toast('Полноэкранный режим недоступен.'); }
  }

  /* ---------- строка меню ---------- */
  function activeField() { var a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'checkbox' && a.type !== 'button' ? a : null; }
  var lastField = null;
  document.addEventListener('focusin', function (e) { var a = e.target; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && !a.closest('.menubar,.mb-drop')) lastField = a; });
  function fieldOp(op) {
    var f = activeField() || lastField; if (!f) return;
    f.focus();
    if (op === 'paste') {
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { f.setRangeText(t, f.selectionStart, f.selectionEnd, 'end'); f.dispatchEvent(new Event('input', { bubbles: true })); }).catch(function () { toast('Браузер не разрешил чтение буфера обмена. Нажмите Ctrl+V.'); });
      else toast('Нажмите Ctrl+V.');
      return;
    }
    try { document.execCommand(op); } catch (e) { toast('Операция недоступна.'); }
    if (op === 'cut') f.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function hasSel() { var f = activeField() || lastField; return !!f && f.selectionStart !== f.selectionEnd; }
  function hasField() { return !!(activeField() || lastField); }
  function replaceWin() {
    var f = activeField() || lastField; if (!f) return;
    var a = E('input', { type: 'text', placeholder: 'Что заменить' }), b = E('input', { type: 'text', placeholder: 'Чем заменить' });
    xwin({ title: 'Заменить в поле', width: 'min(460px,100%)', body: E('div', { style: 'display:grid;gap:10px' }, [E('label', { class: 'xfield' }, [E('span', { text: 'Найти' }), a]), E('label', { class: 'xfield' }, [E('span', { text: 'Заменить на' }), b]), E('p', { class: 'xnote', text: 'Замена выполняется в последнем активном текстовом поле.' })]),
      footer: [{ label: 'Отмена' }, { label: 'Заменить всё', kind: 'fill', onClick: function () { if (!a.value) return; f.value = f.value.split(a.value).join(b.value); f.dispatchEvent(new Event('input', { bubbles: true })); toast('Замена выполнена.'); } }] });
  }
  function findCmd() { if (RW) { RW.focusSearch(); return; } if (curView !== 'calc') activate('calc'); var s = $('search'); s.scrollIntoView({ behavior: 'smooth', block: 'center' }); s.focus({ preventScroll: true }); s.select(); }
  var MENUS = [
    { t: 'Файл', items: [
      { t: 'Новый', k: 'Ctrl+N', run: function () { newCalc(); } }, { t: 'Открыть…', k: 'Ctrl+O', run: importCalc },
      { t: 'Сохранить', k: 'Ctrl+S', run: exportCalc, en: function () { return K.getItems().length > 0; } }, { t: 'Сохранить как…', k: 'Ctrl+Shift+S', run: exportCalc, en: function () { return K.getItems().length > 0; } }, '-',
      { t: 'Импорт данных…', run: importCalc }, { t: 'Экспорт данных…', run: exportCalc, en: function () { return K.getItems().length > 0; } }, '-',
      { t: 'Печать…', k: 'Ctrl+P', run: function () { openPrintWin({ focus: 'print' }); } }, { t: 'Предпросмотр печати', k: 'Ctrl+Shift+P', run: function () { openPrintWin(); } }, '-',
      { t: 'Выход', k: 'Alt+F4', run: exitApp }] },
    { t: 'Правка', items: [
      { t: 'Отменить', k: 'Ctrl+Z', run: function () { K.undo(); }, en: function () { return K.canUndo(); } }, { t: 'Повторить', k: 'Ctrl+Y', run: function () { }, en: function () { return false; }, why: 'Повтор отменённого действия не поддерживается' }, '-',
      { t: 'Вырезать', k: 'Ctrl+X', run: function () { fieldOp('cut'); }, en: hasSel }, { t: 'Копировать', k: 'Ctrl+C', run: function () { fieldOp('copy'); }, en: hasSel }, { t: 'Вставить', k: 'Ctrl+V', run: function () { fieldOp('paste'); }, en: hasField }, '-',
      { t: 'Найти…', k: 'Ctrl+F', run: findCmd }, { t: 'Заменить…', k: 'Ctrl+H', run: replaceWin, en: hasField, why: 'Установите курсор в текстовое поле' }] },
    { t: 'Вид', items: [
      { t: 'Панель инструментов', chk: function () { return view.toolbar; }, run: function () { setView('toolbar', !view.toolbar); } },
      { t: 'Строка состояния', chk: function () { return view.status; }, run: function () { setView('status', !view.status); } },
      { t: 'Боковая панель', chk: function () { return view.side; }, run: function () { setView('side', !view.side); } }, '-',
      { t: 'Масштаб', sub: [80, 90, 100, 110, 125, 150].map(function (z) { return { t: z + '%', chk: function () { return view.zoom === z; }, run: function () { setView('zoom', z); } }; }) },
      { t: 'Полноэкранный режим', k: 'F11', run: fullscreen }] },
    { t: 'Расчёт', items: [
      { t: 'Новый расчёт', run: function () { newCalc(); } }, { t: 'Загрузить расчёт', run: importCalc }, '-',
      { t: 'Пересчитать все', k: 'F5', run: recalcAll }, { t: 'Проверить данные', run: checkData }, '-',
      { t: 'История расчётов', run: openHistory }, { t: 'Шаблоны расчётов', run: openTemplates }] },
    { t: 'Документы', items: [
      { t: 'Приказы', run: openOrders }, { t: 'Дополнения', run: openAmend }, '-', { t: 'Шаблоны документов', run: openDocTemplates }, { t: 'Архив документов', run: openPrintLog }] },
    { t: 'Справка', items: [
      { t: 'Справочные данные', k: 'F1', ref: true, run: function () { openRef(); } }, { t: 'Руководство пользователя', run: guideWin }, '-',
      { t: 'О программе', run: aboutWin }, { t: 'Проверить обновления', run: updatesWin }] }
  ];
  var openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.drop.remove(); openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu = null; } }
  function itemNode(it, close) {
    if (it === '-') return E('div', { class: 'mb-sep', role: 'separator' });
    var en = it.en ? it.en() : true;
    var kids = [E('span', { class: 'ck', text: it.chk ? (it.chk() ? '✓' : '') : '' }), E('span', { text: it.t }), it.k ? E('span', { class: 'k', text: it.k }) : null];
    if (it.sub) {
      var sd = E('div', { class: 'mb-drop', role: 'menu' }, it.sub.map(function (s) { return itemNode(s, close); }));
      var holder = E('div', { class: 'mb-sub' }, [E('button', { type: 'button', class: 'mb-item', role: 'menuitem', 'aria-haspopup': 'true', onclick: function () { holder.classList.toggle('open'); } }, [E('span', { class: 'ck' }), E('span', { text: it.t })]), sd]);
      return holder;
    }
    return E('button', { type: 'button', class: 'mb-item' + (it.ref ? ' ref' : ''), role: it.chk ? 'menuitemcheckbox' : 'menuitem', 'aria-disabled': en ? 'false' : 'true', 'aria-checked': it.chk ? String(!!it.chk()) : null, title: !en && it.why ? it.why : null,
      onmousedown: function (e) { e.preventDefault(); }, onclick: function () { if (!en) return; close(); it.run(); } }, kids);
  }
  function showMenu(i, btn) {
    closeMenu();
    var m = MENUS[i], r = btn.getBoundingClientRect();
    var drop = E('div', { class: 'mb-drop xhide', role: 'menu', 'aria-label': m.t, style: 'left:' + r.left + 'px;top:' + (r.bottom + 2) + 'px' }, m.items.map(function (it) { return itemNode(it, closeMenu); }));
    document.body.appendChild(drop);
    btn.setAttribute('aria-expanded', 'true');
    openMenu = { drop: drop, btn: btn, i: i };
  }
  function buildMenubar() {
    var bar = E('div', { class: 'menubar xhide', role: 'menubar', 'aria-label': 'Строка меню' });
    MENUS.forEach(function (m, i) {
      var b = E('button', { type: 'button', class: 'mb-top', role: 'menuitem', 'aria-haspopup': 'true', 'aria-expanded': 'false', text: m.t,
        onclick: function (e) { e.stopPropagation(); if (openMenu && openMenu.i === i) closeMenu(); else showMenu(i, b); },
        onmouseenter: function () { if (openMenu && openMenu.i !== i) showMenu(i, b); } });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
    document.addEventListener('click', function (e) { if (openMenu && !openMenu.drop.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', function (e) {
      if (!openMenu) return;
      var items = [].slice.call(openMenu.drop.querySelectorAll(':scope > .mb-item:not([aria-disabled="true"])'));
      var cur = items.findIndex(function (x) { return x.classList.contains('hl'); });
      if (e.key === 'Escape') { closeMenu(); e.stopPropagation(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items.forEach(function (x) { x.classList.remove('hl'); }); var n = e.key === 'ArrowDown' ? (cur + 1) % items.length : (cur <= 0 ? items.length - 1 : cur - 1); items[n].classList.add('hl'); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); var n2 = (openMenu.i + (e.key === 'ArrowRight' ? 1 : MENUS.length - 1)) % MENUS.length; showMenu(n2, bar.querySelectorAll('.mb-top')[n2]); }
      else if (e.key === 'Enter' && cur >= 0) { e.preventDefault(); items[cur].click(); }
    }, true);
  }
  function buildStatus() {
    var st = E('div', { class: 'statusbar xhide', role: 'status' }, [E('span', { id: 'stCalc' }), E('span', { id: 'stOrder', text: 'Приказ № 270 от 14.07.2025' }), E('span', { class: 'sp', id: 'stNet' }), E('span', { id: 'stZoom' })]);
    document.body.appendChild(st);
    function upd() {
      var n = K.getItems().length;
      $('stCalc').innerHTML = 'Расчётов: <b>' + n + '</b> · Объём: <b>' + ($('totV') ? $('totV').textContent : '') + '</b> · Масса: <b>' + ($('totM') ? $('totM').textContent : '') + '</b>';
      $('stNet').innerHTML = '<span class="dot' + (navigator.onLine ? '' : ' off') + '"></span>' + (navigator.onLine ? 'Онлайн (работает и без сети)' : 'Автономно');
      $('stZoom').textContent = 'Масштаб ' + view.zoom + '%';
    }
    upd();
    var mo = new MutationObserver(upd);
    ['totV', 'totM', 'totC'].forEach(function (id) { if ($(id)) mo.observe($(id), { childList: true, characterData: true, subtree: true }); });
    window.addEventListener('online', upd); window.addEventListener('offline', upd);
    window.KRPD_X.statusUpdate = upd;
  }

  /* ---------- окно печати ---------- */
  var PW = null;
  var PAPERS = { A4: [210, 297, 'A4'], A3: [297, 420, 'A3'], A5: [148, 210, 'A5'], Letter: [215.9, 279.4, 'letter'], Legal: [215.9, 355.6, 'legal'] };
  var MM = 96 / 25.4;
  function defaultPx() { return { printer: 'system', copies: 1, orient: 'landscape', paper: 'A4', mt: 12, mr: 12, mb: 12, ml: 15, duplex: false, color: 'color', header: true, pageno: true, nup: 1, zoomMode: 'fitw', presets: [] }; }
  function openPrintWin(opts) {
    opts = opts || {};
    if (!K.isReady()) { toast('Данные ещё загружаются.'); return; }
    if (PW) { PW.apply(opts); return; }
    var px = Object.assign(defaultPx(), lsGet('printx', {}));
    var S = getS(), pref = K.loadPrintPrefs(), roles = pref.roles || {};
    var now = new Date();
    var draft = { form: opts.form || 'a1', year: String(now.getFullYear()), month: String(now.getMonth() + 1), unit: pref.unit || S.org.unit || '', place: pref.place || S.org.place || '', rem: '0', price: pref.price || '', sign1: pref.sign1 || [S.user.rank, S.user.name].filter(Boolean).join(' '), sign2: pref.sign2 || '', role1: '', role2: '' };
    var curForm = null, pages = 1, curPage = 1, zoom = 1, paperEl = null, lastModel = null;
    var ov = E('div', { class: 'pw xhide', role: 'dialog', 'aria-label': 'Предпросмотр и печать', 'aria-modal': 'false' });
    var w0 = Math.min(1440, window.innerWidth - 32), h0 = Math.min(900, window.innerHeight - 32);
    ov.style.cssText = 'left:' + Math.max(8, (window.innerWidth - w0) / 2) + 'px;top:' + Math.max(8, (window.innerHeight - h0) / 2) + 'px;width:' + w0 + 'px;height:' + h0 + 'px';
    var R = {};
    function fld(label, key, extra) { var inp = E('input', Object.assign({ type: 'text', id: 'pw-' + key, value: draft[key] || '', maxlength: '200' }, extra || {})); R[key] = inp; inp.addEventListener('input', function () { refresh(); }); var err = E('span', { class: 'xerr', hidden: true }); R[key + 'Err'] = err; return E('label', { class: 'xfield', id: 'pwf-' + key }, [E('span', { text: label }), inp, err]); }
    var formSel = E('select', { id: 'pw-form' }, [['a1', 'Приложение № 1 — Расчёт потребности на год'], ['a2', 'Приложение № 2 — Заявка'], ['a3', 'Приложение № 3 — Журнал расхода (отопление)'], ['a4', 'Приложение № 4 — Журнал расхода (помывка)']].map(function (o) { return E('option', { value: o[0], text: o[1] }); }));
    formSel.value = draft.form; R.form = formSel; formSel.addEventListener('change', function () { refresh(); });
    var monthSel = E('select', { id: 'pw-month' }, K.MONTHS.map(function (m, i) { return E('option', { value: String(i + 1), text: m }); })); monthSel.value = draft.month; R.month = monthSel; monthSel.addEventListener('change', function () { refresh(); });
    function chk(label, key) { var c = E('input', { type: 'checkbox', id: 'pw-' + key }); c.checked = !!px[key]; R[key] = c; c.addEventListener('change', function () { px[key] = c.checked; saveP(); rebuild(); }); return E('label', { class: 'chk' }, [c, label]); }
    function saveP() { var o = Object.assign({}, px); lsSet('printx', o); }
    var paperSel = E('select', { id: 'pw-paper' }, Object.keys(PAPERS).map(function (k) { return E('option', { value: k, text: k === 'Letter' ? 'Letter (216×279 мм)' : k === 'Legal' ? 'Legal (216×356 мм)' : k + ' (' + PAPERS[k][0] + '×' + PAPERS[k][1] + ' мм)' }); })); paperSel.value = px.paper; paperSel.addEventListener('change', function () { px.paper = paperSel.value; saveP(); rebuild(); });
    var printerSel = E('select', { id: 'pw-printer' }, [E('option', { value: 'system', text: 'Принтер — выбор в системном окне печати' }), E('option', { value: 'pdf', text: 'Сохранить как PDF (в системном окне)' })]); printerSel.value = px.printer; printerSel.addEventListener('change', function () { px.printer = printerSel.value; saveP(); });
    var copies = E('input', { type: 'number', min: '1', max: '99', value: String(px.copies), id: 'pw-copies', class: 'xin', style: 'width:56px;text-align:center' });
    function setCopies(n) { n = Math.max(1, Math.min(99, n || 1)); copies.value = String(n); px.copies = n; saveP(); }
    copies.addEventListener('change', function () { setCopies(parseInt(copies.value, 10)); });
    var oriP = E('button', { type: 'button', id: 'pw-op', onclick: function () { px.orient = 'portrait'; syncOri(); saveP(); rebuild(); } }, [E('span', { class: 'ori p' }), 'Книжная']);
    var oriL = E('button', { type: 'button', id: 'pw-ol', onclick: function () { px.orient = 'landscape'; syncOri(); saveP(); rebuild(); } }, [E('span', { class: 'ori l' }), 'Альбомная']);
    function syncOri() { oriP.classList.toggle('on', px.orient === 'portrait'); oriL.classList.toggle('on', px.orient === 'landscape'); }
    function marg(label, key) { var i = E('input', { type: 'number', min: '0', max: '60', step: '1', value: String(px[key]), class: 'xin', 'aria-label': label }); i.addEventListener('change', function () { var v = parseFloat(i.value); if (!(v >= 0 && v <= 60)) v = 12; i.value = String(v); px[key] = v; saveP(); rebuild(); }); return E('label', { class: 'xfield' }, [E('span', { text: label }), i]); }
    var colorBtns = ['color', 'bw'].map(function (v) { var b = E('button', { type: 'button', text: v === 'color' ? 'Цветная' : 'Чёрно-белая', onclick: function () { px.color = v; syncColor(); saveP(); } }); b.setAttribute('data-v', v); return b; });
    function syncColor() { colorBtns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === px.color); }); }
    var presetSel = E('select', { id: 'pw-presets' }); var presetName = E('input', { type: 'text', class: 'xin', placeholder: 'Название шаблона печати', maxlength: '60' });
    function fillPresets() { presetSel.replaceChildren(E('option', { value: '', text: 'Шаблоны печати…' })); (px.presets || []).forEach(function (p, i) { presetSel.appendChild(E('option', { value: String(i), text: p.name })); }); }
    presetSel.addEventListener('change', function () { var p = (px.presets || [])[parseInt(presetSel.value, 10)]; if (!p) return; Object.assign(px, p.s); setUiFromPx(); saveP(); rebuild(); toast('Шаблон применён.'); });
    function savePreset() { var n = presetName.value.trim(); if (!n) { toast('Введите название шаблона.'); presetName.focus(); return; } var s = {}; ['orient', 'paper', 'mt', 'mr', 'mb', 'ml', 'duplex', 'color', 'header', 'pageno', 'copies', 'nup'].forEach(function (k) { s[k] = px[k]; }); px.presets = (px.presets || []).filter(function (p) { return p.name !== n; }).concat([{ name: n, s: s }]); saveP(); fillPresets(); presetName.value = ''; toast('Шаблон «' + n + '» сохранён.'); }
    var marginInputs = [marg('Верх, мм', 'mt'), marg('Право, мм', 'mr'), marg('Низ, мм', 'mb'), marg('Лево, мм', 'ml')];
    function setUiFromPx() { paperSel.value = px.paper; copies.value = String(px.copies); syncOri(); syncColor(); ['duplex', 'header', 'pageno'].forEach(function (k) { R[k].checked = !!px[k]; }); nupSel.value = String(px.nup); marginInputs.forEach(function (m, i) { m.querySelector('input').value = String(px[['mt', 'mr', 'mb', 'ml'][i]]); }); }
    var docFs = E('fieldset', null, [E('legend', { text: 'Документ' }), E('label', { class: 'xfield' }, [E('span', { text: 'Печатная форма' }), formSel]), E('div', { class: 'xgrid2' }, [fld('Год', 'year', { inputmode: 'numeric', maxlength: '4' }), E('label', { class: 'xfield', id: 'pwf-month' }, [E('span', { text: 'Месяц журнала' }), monthSel])]),
      fld('Воинская часть (организация)', 'unit'), fld('Место дислокации', 'place'), fld('Остаток дров, м³', 'rem', { inputmode: 'decimal' }), fld('Цена за 1 м³, руб.', 'price', { inputmode: 'decimal' }),
      fld('Должность (подпись 1)', 'role1'), fld('Звание и фамилия (подпись 1)', 'sign1'), fld('Должность (подпись 2)', 'role2'), fld('Звание и фамилия (подпись 2)', 'sign2')]);
    var nupSel = E('select', { id: 'pw-nup' }, [['1', '1 страница на листе'], ['2', '2 страницы на листе'], ['4', '4 страницы на листе']].map(function (o) { return E('option', { value: o[0], text: o[1] }); })); nupSel.value = String(px.nup);
    nupSel.addEventListener('change', function () { px.nup = parseInt(nupSel.value, 10); saveP(); layoutPages(); fitIfMode(); });
    var prFs = E('fieldset', { id: 'pw-settings' }, [E('legend', { text: 'Параметры печати' }), E('label', { class: 'xfield' }, [E('span', { text: 'Принтер' }), printerSel]), E('p', { class: 'xnote', text: 'Браузер не раскрывает список принтеров: конкретный принтер выбирается в системном окне, которое откроется при печати.' }),
      E('div', { class: 'row' }, [E('span', { text: 'Копии' }), E('span', { class: 'cnt' }, [E('button', { type: 'button', 'aria-label': 'Меньше', text: '−', onclick: function () { setCopies(px.copies - 1); } }), copies, E('button', { type: 'button', 'aria-label': 'Больше', text: '+', onclick: function () { setCopies(px.copies + 1); } })])]),
      E('div', { class: 'row' }, [E('span', { class: 'seg2' }, [oriP, oriL])]), E('label', { class: 'xfield' }, [E('span', { text: 'Размер бумаги' }), paperSel]),
      E('div', { class: 'xgrid2' }, marginInputs), chk('Двусторонняя печать (каждая копия с нового листа)', 'duplex'), E('div', { class: 'row' }, [E('span', { class: 'seg2' }, colorBtns)]),
      chk('Колонтитул (часть и дата)', 'header'), chk('Номера страниц', 'pageno'), E('label', { class: 'xfield' }, [E('span', { text: 'Несколько страниц на листе (предпросмотр)' }), nupSel])]);
    var tplFs = E('fieldset', null, [E('legend', { text: 'Шаблоны печати' }), presetSel, E('div', { class: 'row' }, [presetName, E('button', { type: 'button', class: 'xbtn sm', text: 'Сохранить как шаблон', onclick: savePreset })])]);
    var side = E('div', { class: 'pw-side' }, [docFs, prFs, tplFs]);
    var thumbs = E('div', { class: 'pw-thumbs', 'aria-label': 'Миниатюры страниц' });
    var pagesBox = E('div', { class: 'pw-pages' });
    var scroll = E('div', { class: 'pw-scroll', tabindex: '0', 'aria-label': 'Предварительный просмотр' }, [pagesBox]);
    /* панель масштаба и страниц */
    var slider = E('input', { type: 'range', min: '25', max: '300', value: '100', 'aria-label': 'Масштаб', id: 'pw-zoom' });
    var zlabel = E('span', { text: '100%', style: 'width:42px;text-align:right' });
    var zBtns = [50, 75, 100, 150, 200].map(function (z) { return E('button', { type: 'button', text: z + '%', 'data-z': String(z), onclick: function () { px.zoomMode = 'fixed'; setZoom(z / 100); } }); });
    var fitBtns = [['fitw', 'По ширине'], ['fith', 'По высоте'], ['fit', 'Вместить']].map(function (f) { return E('button', { type: 'button', text: f[1], 'data-m': f[0], onclick: function () { px.zoomMode = f[0]; fitIfMode(); saveP(); } }); });
    var pgIn = E('input', { type: 'number', class: 'pg', min: '1', value: '1', 'aria-label': 'Номер страницы' });
    var pgInfo = E('span', { text: 'Страница 1 из 1' });
    var navBtns = [['⏮', 'Первая', function () { goPage(1); }], ['◀', 'Предыдущая', function () { goPage(curPage - 1); }], ['▶', 'Следующая', function () { goPage(curPage + 1); }], ['⏭', 'Последняя', function () { goPage(pages); }]].map(function (b) { return E('button', { type: 'button', 'aria-label': b[1], title: b[1], text: b[0], onclick: b[2] }); });
    pgIn.addEventListener('change', function () { goPage(parseInt(pgIn.value, 10)); });
    var bar = E('div', { class: 'pw-bar' }, [E('div', { class: 'grp' }, zBtns.concat([slider, zlabel])), E('div', { class: 'grp' }, fitBtns), E('div', { class: 'grp' }, [navBtns[0], navBtns[1], pgIn, navBtns[2], navBtns[3], pgInfo])]);
    var statusEl = E('span', { class: 'pw-status', id: 'pw-status' });
    function exportBtn(label, fn) { return E('button', { type: 'button', class: 'xbtn', text: label, onclick: fn }); }
    var foot = E('div', { class: 'pw-foot' }, [exportBtn('Экспорт в PDF', function () { doPrint('pdf'); }), exportBtn('Экспорт в Word', function () { doExport('word'); }), exportBtn('Экспорт в Excel', function () { doExport('excel'); }), exportBtn('Отправить по e-mail', function () { doMail(); }), statusEl, E('span', { class: 'sp' }), E('button', { type: 'button', class: 'xbtn', text: 'Закрыть', onclick: function () { close(); } }), E('button', { type: 'button', class: 'xbtn fill', id: 'pw-print', text: 'Печать', onclick: function () { doPrint('print'); } })]);
    /* заголовок окна */
    var maxBtn = E('button', { type: 'button', title: 'Развернуть / восстановить', 'aria-label': 'Развернуть', text: '▢', onclick: function () { toggleMax(); } });
    var fsBtn = E('button', { type: 'button', title: 'Полный экран (F11)', 'aria-label': 'Полный экран', text: '⛶', onclick: function () { fullscreen(); } });
    var title = E('div', { class: 'pw-title' }, [E('h2', { text: 'Предпросмотр и печать — приказ № 270' }), fsBtn, maxBtn, E('button', { type: 'button', 'aria-label': 'Закрыть', title: 'Закрыть (Esc)', text: '✕', onclick: function () { close(); } })]);
    ov.appendChild(title); ov.appendChild(bar); ov.appendChild(E('div', { class: 'pw-main' }, [thumbs, scroll, side])); ov.appendChild(foot);
    document.body.appendChild(ov);
    function toggleMax() { ov.classList.toggle('max'); setTimeout(fitIfMode, 60); }
    /* перетаскивание */
    title.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button') || ov.classList.contains('max')) return;
      var r = ov.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      title.setPointerCapture(e.pointerId);
      function mv(ev) { ov.style.left = Math.min(Math.max(-r.width + 120, ev.clientX - dx), window.innerWidth - 120) + 'px'; ov.style.top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40) + 'px'; }
      function up() { title.removeEventListener('pointermove', mv); title.removeEventListener('pointerup', up); }
      title.addEventListener('pointermove', mv); title.addEventListener('pointerup', up);
    });
    title.addEventListener('dblclick', function (e) { if (!e.target.closest('button')) toggleMax(); });
    var ro = window.ResizeObserver ? new ResizeObserver(function () { fitIfMode(); }) : null; if (ro) ro.observe(scroll);

    /* геометрия */
    function geom() {
      var p = PAPERS[px.paper] || PAPERS.A4, w = px.orient === 'landscape' ? p[1] : p[0], h = px.orient === 'landscape' ? p[0] : p[1];
      return { w: w, h: h, wp: w * MM, hp: h * MM, pw: (w - px.ml - px.mr) * MM, ph: (h - px.mt - px.mb) * MM, css: p[2] + ' ' + px.orient };
    }
    function readDraft() {
      var d = { form: formSel.value, month: monthSel.value };
      ['year', 'unit', 'place', 'rem', 'price', 'role1', 'sign1', 'role2', 'sign2'].forEach(function (k) { d[k] = R[k].value; });
      return d;
    }
    function layoutForm(f) {
      var a12 = f === 'a1' || f === 'a2', jr = f === 'a3' || f === 'a4';
      $('pwf-month').hidden = !jr; $('pwf-place').hidden = f !== 'a2'; $('pwf-rem').hidden = f !== 'a2'; $('pwf-price').hidden = f !== 'a2'; $('pwf-role2').hidden = !a12; $('pwf-sign2').hidden = !a12;
      if (curForm !== f) {
        if (curForm) roles[curForm] = { role1: R.role1.value, role2: R.role2.value };
        var sv = roles[f] || {}, df = K.DEFAULT_ROLES[f] || ['', ''];
        R.role1.value = sv.role1 || S.user.position || df[0]; R.role2.value = sv.role2 || df[1]; curForm = f;
      }
    }
    function showErrors(errs) { ['year', 'unit', 'place', 'rem', 'price', 'role1', 'sign1', 'role2', 'sign2'].forEach(function (k) { var e = R[k + 'Err'], m = errs[k]; e.hidden = !m; e.textContent = m || ''; R[k].classList.toggle('bad', !!m); }); }
    function refresh() {
      layoutForm(formSel.value);
      var d = readDraft(), r = K.parsePrint(d);
      showErrors(r.errors);
      if (Object.keys(r.errors).length) { paperEl = null; lastModel = null; pagesBox.replaceChildren(E('p', { class: 'xempty', text: 'Исправьте отмеченные поля, чтобы увидеть форму.' })); thumbs.replaceChildren(); pages = 1; updNav(); return; }
      lastModel = K.buildModel(K.getItems(), r.p);
      paperEl = K.renderPaper(lastModel);
      rebuild();
    }
    function headerText() { return (R.unit.value.trim() || 'Воинская часть') + ' · Приказ Росгвардии № 270 · ' + nowStr().slice(0, 10); }
    function rebuild() {
      if (!paperEl) return;
      var g = geom();
      var meas = E('div', { class: 'pv pv-meas', style: 'width:' + g.pw + 'px' }, [paperEl.cloneNode(true)]);
      document.body.appendChild(meas); var H = meas.scrollHeight; meas.remove();
      pages = Math.max(1, Math.ceil(H / g.ph - 0.02));
      pagesBox.replaceChildren(); thumbs.replaceChildren();
      for (var i = 0; i < pages; i++) {
        var inner = E('div', { class: 'pv-in pv', style: 'left:' + px.ml * MM + 'px;top:' + px.mt * MM + 'px;width:' + g.pw + 'px;height:' + g.ph + 'px' }, [E('div', { style: 'width:' + g.pw + 'px;transform:translateY(' + (-i * g.ph) + 'px)' }, [paperEl.cloneNode(true)])]);
        var sheet = E('div', { class: 'pv-sheet', 'data-p': String(i + 1), style: 'width:' + g.wp + 'px;height:' + g.hp + 'px' }, [inner]);
        if (px.header) sheet.appendChild(E('div', { class: 'pv-hd', style: 'top:' + Math.max(2, px.mt * MM / 2 - 7) + 'px', text: headerText() }));
        if (px.pageno) sheet.appendChild(E('div', { class: 'pv-ft', style: 'bottom:' + Math.max(2, px.mb * MM / 2 - 7) + 'px', text: 'Страница ' + (i + 1) + ' из ' + pages }));
        pagesBox.appendChild(sheet);
        var sc = 100 / g.wp, tb = E('div', { class: 'tb', style: 'width:100px;height:' + g.hp * sc + 'px' }, [E('div', { style: 'width:' + g.wp + 'px;height:' + g.hp + 'px;transform:scale(' + sc + ')' }, [sheet.cloneNode(true)])]);
        (function (n) { thumbs.appendChild(E('button', { type: 'button', class: 'pw-thumb', 'data-p': String(n), 'aria-label': 'Страница ' + n, onclick: function () { goPage(n); } }, [tb, E('span', { text: String(n) })])); }(i + 1));
      }
      layoutPages(); curPage = Math.min(curPage, pages); updNav(); fitIfMode();
      statusEl.textContent = pages + ' стр. · разбивка приблизительная' + (px.orient === 'portrait' ? ' · образцы приказа — на альбомном листе, в книжной ориентации широкие таблицы обрезаются' : '');
    }
    function layoutPages() { var cols = px.nup === 1 ? 1 : 2; pagesBox.style.gridTemplateColumns = 'repeat(' + cols + ',auto)'; }
    function setZoom(z) { zoom = Math.max(0.25, Math.min(3, z)); pagesBox.style.zoom = String(zoom); slider.value = String(Math.round(zoom * 100)); zlabel.textContent = Math.round(zoom * 100) + '%'; zBtns.forEach(function (b) { b.classList.toggle('on', Math.round(zoom * 100) === parseInt(b.getAttribute('data-z'), 10)); }); fitBtns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-m') === px.zoomMode); }); }
    function fitIfMode() {
      if (!paperEl) return;
      var g = geom(), cols = px.nup === 1 ? 1 : 2, rows = Math.ceil(Math.min(pages, px.nup === 1 ? 1 : 4) / cols) || 1;
      var aw = scroll.clientWidth - 48, ah = scroll.clientHeight - 48;
      var tw = cols * g.wp + (cols - 1) * 22, th = rows * g.hp + (rows - 1) * 22;
      if (px.zoomMode === 'fitw') setZoom(aw / tw); else if (px.zoomMode === 'fith') setZoom(ah / th); else if (px.zoomMode === 'fit') setZoom(Math.min(aw / tw, ah / th)); else setZoom(zoom);
    }
    slider.addEventListener('input', function () { px.zoomMode = 'fixed'; setZoom(parseInt(slider.value, 10) / 100); });
    function updNav() {
      pgIn.max = String(pages); pgIn.value = String(curPage); pgInfo.textContent = 'Страница ' + curPage + ' из ' + pages;
      navBtns[0].disabled = navBtns[1].disabled = curPage <= 1; navBtns[2].disabled = navBtns[3].disabled = curPage >= pages;
      thumbs.querySelectorAll('.pw-thumb').forEach(function (t) { t.classList.toggle('cur', t.getAttribute('data-p') === String(curPage)); });
    }
    function goPage(n) { if (!(n >= 1)) n = 1; n = Math.min(n, pages); curPage = n; updNav(); var s = pagesBox.querySelector('.pv-sheet[data-p="' + n + '"]'); if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    scroll.addEventListener('scroll', function () {
      var top = scroll.getBoundingClientRect().top + 40, best = 1;
      pagesBox.querySelectorAll('.pv-sheet').forEach(function (s) { if (s.getBoundingClientRect().top <= top) best = parseInt(s.getAttribute('data-p'), 10); });
      if (best !== curPage) { curPage = best; updNav(); }
    });
    /* печать и экспорт */
    function validated() {
      layoutForm(formSel.value);
      var d = readDraft(), r = K.parsePrint(d);
      showErrors(r.errors);
      if (Object.keys(r.errors).length) { toast('Исправьте отмеченные поля.'); return null; }
      roles[d.form] = { role1: d.role1, role2: d.role2 };
      K.savePrintPrefs(d, roles);
      return { d: d, r: r };
    }
    function pageCss(g) {
      var css = '@page{size:' + g.css + ';margin:' + px.mt + 'mm ' + px.mr + 'mm ' + px.mb + 'mm ' + px.ml + 'mm;';
      if (px.header) css += '@top-center{content:' + JSON.stringify(headerText()) + ';font:9pt "Times New Roman",serif;color:#444}';
      if (px.pageno) css += '@bottom-center{content:"Страница " counter(page) " из " counter(pages);font:9pt "Times New Roman",serif;color:#444}';
      css += '}';
      css += '@media print{html.printing #printRoot{display:block;' + (px.color === 'bw' ? 'filter:grayscale(1);' : '') + '}#printRoot .pw-copy{' + (px.duplex ? 'break-before:right;' : '') + '}#printRoot .pw-copy:first-child{break-before:auto}}';
      return css;
    }
    var styleEl = null;
    function doPrint(mode) {
      var v = validated(); if (!v) return;
      var g = geom();
      if (!styleEl) { styleEl = E('style', { id: 'pw-print-style' }); document.head.appendChild(styleEl); }
      styleEl.textContent = pageCss(g);
      var root = $('printRoot'); root.replaceChildren();
      var model = K.buildModel(K.getItems(), v.r.p);
      for (var i = 0; i < px.copies; i++) root.appendChild(E('div', { class: 'pw-copy' }, [K.renderPaper(model)]));
      document.documentElement.classList.add('printing');
      logPrint(v.d.form, mode === 'pdf' ? 'pdf' : 'print', px.paper + ' ' + (px.orient === 'landscape' ? 'альбомная' : 'книжная') + ', копий: ' + px.copies + (px.color === 'bw' ? ', ч/б' : '') + (px.duplex ? ', двусторонняя' : ''));
      if (mode === 'pdf') toast('В окне печати выберите «Сохранить как PDF».');
      try { window.print(); } catch (e) { document.documentElement.classList.remove('printing'); root.replaceChildren(); toast('Печать недоступна в этом браузере.'); }
    }
    function fileName(ext) { return 'krpd-' + formSel.value + '-' + R.year.value + (formSel.value === 'a3' || formSel.value === 'a4' ? '-' + pad2(parseInt(monthSel.value, 10)) : '') + '.' + ext; }
    function doExport(kind) {
      var v = validated(); if (!v) return;
      var model = K.buildModel(K.getItems(), v.r.p), paper = K.renderPaper(model), g = geom();
      var css = 'body{font-family:"Times New Roman",serif;font-size:11pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:3px 4px;text-align:center;vertical-align:middle;font-size:10pt}td.l,td.b{text-align:left}.pt,.pt-sub{text-align:center;font-weight:bold}.uline,.sg-line{border-bottom:1px solid #000;min-height:16px}.ucap,.sg-cap,.pnote{font-size:9pt}';
      if (kind === 'word') {
        var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>КРПД</title><style>@page{size:' + g.w + 'mm ' + g.h + 'mm;margin:' + px.mt + 'mm ' + px.mr + 'mm ' + px.mb + 'mm ' + px.ml + 'mm}' + css + '</style></head><body>' + paper.outerHTML + '</body></html>';
        download(fileName('doc'), 'application/msword', html);
      } else {
        var tabs = [].slice.call(paper.querySelectorAll('table')).map(function (t) { return t.outerHTML; }).join('<br>');
        var head = [].slice.call(paper.querySelectorAll('.pt,.pt-sub,.uline')).map(function (n) { return '<p><b>' + n.innerHTML + '</b></p>'; }).join('');
        download(fileName('xls'), 'application/vnd.ms-excel', '<html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + head + tabs + '</body></html>');
      }
      logPrint(v.d.form, kind, fileName(kind === 'word' ? 'doc' : 'xls'));
      toast('Файл сформирован: ' + fileName(kind === 'word' ? 'doc' : 'xls'));
    }
    function doMail() {
      var v = validated(); if (!v) return;
      var m = K.buildModel(K.getItems(), v.r.p);
      var body = FORM_NAME[v.d.form] + '\n' + (v.d.unit ? 'Воинская часть: ' + v.d.unit + '\n' : '') + 'Год: ' + v.d.year + '\nИтого: ' + (m.total || m.vol || m.need || '—') + ' м³\n\nФайл формы (PDF, Word или Excel) прикрепите вручную: почтовая программа не принимает вложения от веб-страницы.';
      logPrint(v.d.form, 'email', v.d.unit || '');
      location.href = 'mailto:?subject=' + encodeURIComponent('КРПД: ' + FORM_NAME[v.d.form]) + '&body=' + encodeURIComponent(body);
    }
    function close() { if (!PW) return; document.removeEventListener('keydown', onKey, true); if (ro) ro.disconnect(); ov.remove(); PW = null; if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { } } }
    function onKey(e) {
      if (e.key === 'Escape' && !stack.length && !openMenu) { close(); }
      else if (e.key === 'F11') { e.preventDefault(); fullscreen(); }
      else if (e.key === 'PageDown' && !e.target.closest('input,select,textarea')) { e.preventDefault(); goPage(curPage + 1); }
      else if (e.key === 'PageUp' && !e.target.closest('input,select,textarea')) { e.preventDefault(); goPage(curPage - 1); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); px.zoomMode = 'fixed'; setZoom(zoom + 0.1); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); px.zoomMode = 'fixed'; setZoom(zoom - 0.1); }
    }
    document.addEventListener('keydown', onKey, true);
    PW = { apply: function (o) { if (o.form) { formSel.value = o.form; refresh(); } if (o.focus === 'settings') { prFs.scrollIntoView({ behavior: 'smooth' }); paperSel.focus(); } if (o.focus === 'print') $('pw-print').focus(); ov.style.zIndex = '86'; }, close: close };
    fillPresets(); setUiFromPx(); setZoom(1);
    refresh();
    PW.apply(opts);
  }

  /* ---------- справочные данные ---------- */
  var RW = null;
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (res, rej) { var ta = E('textarea', { style: 'position:fixed;left:-999px' }); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } ta.remove(); });
  }
  function openRef(secId, anchor) {
    if (!window.KRPD_REF) { toast('Справочник недоступен.'); return; }
    if (RW) { RW.go(secId, anchor); return; }
    var secs = window.KRPD_REF.build();
    var marks = [], mi = -1, curSecId = secs[0].id, hist = lsGet('refhist', []), books = lsGet('refbooks', []);
    var search = E('input', { type: 'search', id: 'rw-search', placeholder: 'Поиск по справочнику (Ctrl+F)', 'aria-label': 'Поиск по справочнику' });
    var count = E('span', { class: 'xnote', style: 'min-width:90px' });
    var content = E('div', { class: 'rw-content', tabindex: '0' }, secs.map(function (s) { return s.el; }));
    var toc = E('nav', { class: 'rw-toc', 'aria-label': 'Оглавление' });
    function btn(label, fn, cls, title) { return E('button', { type: 'button', class: 'xbtn sm ' + (cls || ''), text: label, title: title || label, onclick: fn }); }
    var bookBtn = btn('☆ Закладка', function () { toggleBook(); }, '', 'Добавить в закладки (Ctrl+B)');
    function drawToc() {
      toc.replaceChildren(E('h5', { text: 'Разделы' }));
      secs.forEach(function (s) { var n = marks.filter(function (m) { return s.el.contains(m); }).length; toc.appendChild(E('button', { type: 'button', class: s.id === curSecId ? 'cur' : '', onclick: function () { go(s.id); } }, [E('span', { text: s.title.replace(/^Раздел \d+\. /, '') }), n ? E('span', { class: 'n', text: String(n) }) : null])); });
      toc.appendChild(E('h5', { text: 'Закладки' }));
      if (!books.length) toc.appendChild(E('span', { class: 'xnote', style: 'padding:0 10px', text: 'Нет закладок' }));
      books.forEach(function (b) { toc.appendChild(E('button', { type: 'button', onclick: function () { go(b.id); } }, [E('span', { text: '★ ' + b.title.replace(/^Раздел \d+\. /, '') })])); });
      toc.appendChild(E('h5', { text: 'История просмотров' }));
      if (!hist.length) toc.appendChild(E('span', { class: 'xnote', style: 'padding:0 10px', text: 'Пока пусто' }));
      hist.slice(0, 6).forEach(function (b) { toc.appendChild(E('button', { type: 'button', onclick: function () { go(b.id); } }, [E('span', { text: b.title.replace(/^Раздел \d+\. /, '') })])); });
      var isB = books.some(function (b) { return b.id === curSecId; }); bookBtn.textContent = (isB ? '★' : '☆') + ' Закладка';
    }
    function pushHist(id) { var s = secs.filter(function (x) { return x.id === id; })[0]; hist = [{ id: id, title: s.title }].concat(hist.filter(function (h) { return h.id !== id; })).slice(0, 15); lsSet('refhist', hist); }
    function go(id, anchor) {
      var s = secs.filter(function (x) { return x.id === id; })[0] || secs[0];
      curSecId = s.id; pushHist(s.id);
      var t = anchor && $(anchor) ? $(anchor) : s.el; t.scrollIntoView({ block: 'start' }); drawToc();
    }
    function toggleBook() { var i = books.findIndex(function (b) { return b.id === curSecId; }); var s = secs.filter(function (x) { return x.id === curSecId; })[0]; if (i >= 0) { books.splice(i, 1); toast('Закладка удалена.'); } else { books.push({ id: s.id, title: s.title }); toast('Раздел добавлен в закладки.'); } lsSet('refbooks', books); drawToc(); }
    function clearMarks() { content.querySelectorAll('mark.hit').forEach(function (m) { var p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); }); marks = []; mi = -1; }
    function doSearch() {
      clearMarks(); var q = search.value.trim();
      if (q.length < 2) { count.textContent = ''; drawToc(); return; }
      var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return n.parentNode.closest('button,script,style') ? NodeFilter.FILTER_REJECT : (re.lastIndex = 0, re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT); } });
      var nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (n) {
        var txt = n.nodeValue, frag = document.createDocumentFragment(), last = 0, m; re.lastIndex = 0;
        while ((m = re.exec(txt))) { frag.appendChild(document.createTextNode(txt.slice(last, m.index))); var mk = E('mark', { class: 'hit', text: m[0] }); frag.appendChild(mk); marks.push(mk); last = m.index + m[0].length; if (m[0].length === 0) re.lastIndex++; }
        frag.appendChild(document.createTextNode(txt.slice(last))); n.parentNode.replaceChild(frag, n);
      });
      count.textContent = marks.length ? 'Найдено: ' + marks.length : 'Не найдено';
      drawToc(); if (marks.length) step(1);
    }
    function step(d) { if (!marks.length) return; if (mi >= 0) marks[mi].classList.remove('cur'); mi = (mi + d + marks.length) % marks.length; marks[mi].classList.add('cur'); marks[mi].scrollIntoView({ block: 'center' }); count.textContent = (mi + 1) + ' из ' + marks.length; }
    search.addEventListener('input', doSearch);
    search.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } });
    function secText(ids) { return secs.filter(function (s) { return ids.indexOf(s.id) >= 0; }).map(function (s) { return s.el.innerText; }).join('\n\n'); }
    function printRef(all, pdf) {
      var ids = all ? secs.map(function (s) { return s.id; }) : [curSecId];
      clearMarks();
      var root = $('printRoot'); root.replaceChildren();
      secs.filter(function (s) { return ids.indexOf(s.id) >= 0; }).forEach(function (s) { root.appendChild(s.el.cloneNode(true)); });
      if (!$('rw-print-style')) document.head.appendChild(E('style', { id: 'rw-print-style' }));
      $('rw-print-style').textContent = '@page{size:A4 portrait;margin:15mm 12mm 15mm 15mm;@bottom-center{content:"Страница " counter(page) " из " counter(pages);font:9pt serif}}@media print{html.printing #printRoot{display:block}}';
      document.documentElement.classList.add('printing');
      logPrint('ref', 'print', all ? 'Справочник целиком' : 'Раздел: ' + secs.filter(function (s) { return s.id === curSecId; })[0].title);
      if (pdf) toast('В окне печати выберите «Сохранить как PDF».');
      try { window.print(); } catch (e) { document.documentElement.classList.remove('printing'); root.replaceChildren(); toast('Печать недоступна.'); }
    }
    FORM_NAME.ref = 'Справочные данные';
    function xl(id) {
      var all = window.KRPD_REF.tables(), pick = id === 'all' ? all : all.filter(function (t) { return t.id === id; });
      var html = '<html><head><meta charset="utf-8"><style>td,th{border:1px solid #000;padding:2px 5px;text-align:center}</style></head><body>' + pick.map(function (t) {
        return '<p><b>' + t.title + '</b><br>Единица измерения: ' + t.unit + '<br>Источник: ' + t.source + '</p><table>' + t.head.map(function (r) { return '<tr>' + r.map(function (c) { return '<th' + (c.rs ? ' rowspan="' + c.rs + '"' : '') + (c.cs ? ' colspan="' + c.cs + '"' : '') + '>' + c.t + '</th>'; }).join('') + '</tr>'; }).join('') + t.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</table><p>Примечание: ' + t.note + '</p><br>';
      }).join('') + '</body></html>';
      download('krpd-tablicy-' + (id === 'all' ? 'vse' : id) + '.xls', 'application/vnd.ms-excel', html);
    }
    content.addEventListener('click', function (e) { var b = e.target.closest('[data-xl]'); if (b) xl(b.getAttribute('data-xl')); });
    var bar = E('div', { class: 'rw-bar' }, [search, count, btn('▲', function () { step(-1); }, '', 'Предыдущее совпадение'), btn('▼', function () { step(1); }, '', 'Следующее совпадение'), bookBtn,
      btn('Копировать', function () { copyText(secText([curSecId])).then(function () { toast('Текст раздела скопирован.'); }, function () { toast('Не удалось скопировать.'); }); }, '', 'Копировать текст текущего раздела'),
      btn('Печать раздела', function () { printRef(false); }), btn('Печать всего', function () { printRef(true); }), btn('Экспорт в PDF', function () { printRef(true, true); }, 'fill')]);
    var api = xwin({ title: 'Справочные данные — приказ Росгвардии № 270 от 14.07.2025', cls: 'rw', width: 'min(1240px,100%)', bar: bar, body: E('div', { class: 'rw-main', style: 'margin:0 -16px;border-top:1px solid var(--separator)' }, [toc, content]), onClose: function () { RW = null; } });
    api.body.style.cssText = 'padding:0;overflow:hidden;display:block';
    api.body.firstChild.style.cssText = 'height:100%;display:grid;grid-template-columns:260px minmax(0,1fr);margin:0';
    api.el.style.height = 'calc(100vh - 24px)'; api.el.style.width = 'min(1240px,100%)';
    var obs = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { var id = en.target.id.replace('ref-', ''); if (id !== curSecId) { curSecId = id; drawToc(); } } }); }, { root: content, rootMargin: '0px 0px -75% 0px' });
    secs.forEach(function (s) { obs.observe(s.el); });
    RW = { go: function (id, a) { if (id) go(id, a); }, focusSearch: function () { search.focus(); search.select(); }, toggleBook: toggleBook, close: api.close };
    drawToc(); go(secId || secs[0].id, anchor);
    api.el.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); RW.focusSearch(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleBook(); }
    });
    setTimeout(function () { search.focus(); }, 60);
  }

  /* ---------- горячие клавиши ---------- */
  document.addEventListener('keydown', function (e) {
    if (landingOpen()) return;
    var k = e.key, c = e.ctrlKey || e.metaKey, lk = k.length === 1 ? k.toLowerCase() : k;
    if (k === 'Escape') { if (stack.length) { stack[stack.length - 1].close(); e.preventDefault(); } return; }
    if (stack.length && !(RW && k === 'F1')) { if (!(c && (lk === 'f' || lk === 'b'))) { if (k !== 'F11') return; } }
    if (k === 'F1') { e.preventDefault(); if (RW) RW.focusSearch(); else openRef(); return; }
    if (k === 'F11') { e.preventDefault(); fullscreen(); return; }
    if (k === 'F5') { e.preventDefault(); recalcAll(); return; }
    if (e.altKey && !c && /^[1-5]$/.test(k)) { e.preventDefault(); var s = SECTIONS[parseInt(k, 10) - 1]; activate(s.id); if (s.id === 'home') scrollTo('top'); return; }
    if (c && !e.altKey && /^[1-5]$/.test(k)) { e.preventDefault(); var s2 = SECTIONS[parseInt(k, 10) - 1]; activate(s2.id); return; }
    if (!c || e.altKey) return;
    var inField = !!e.target.closest && e.target.closest('input,textarea,select');
    if (lk === 'n' && !e.shiftKey) { e.preventDefault(); newCalc(); }
    else if (lk === 'o') { e.preventDefault(); importCalc(); }
    else if (lk === 's') { e.preventDefault(); exportCalc(); }
    else if (lk === 'p') { e.preventDefault(); openPrintWin(e.shiftKey ? {} : { focus: 'print' }); }
    else if (lk === 'f') { e.preventDefault(); findCmd(); }
    else if (lk === 'h' && hasField()) { e.preventDefault(); replaceWin(); }
    else if (lk === 'y' && !inField) { e.preventDefault(); toast('Повтор отменённого действия не поддерживается.'); }
  }, true);

  window.KRPD_X = window.KRPD_X || {};
  window.KRPD_X.openPrintWin = openPrintWin;
  window.KRPD_X.openRef = openRef;

  /* ---------- запуск ---------- */
  function init() {
    buildSide(); buildTabbar(); buildQuick(); buildPages(); buildMenubar(); loadView(); buildStatus();
    var m = /^#\/(\w+)/.exec(location.hash); activate(m && VIEW_OF[m[1]] ? m[1] : 'home', true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
