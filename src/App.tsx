import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Search, ChevronRight, X, Sun, Moon, Monitor,
  Download, Upload, Trash2, Edit3, ArrowLeft, AlertTriangle
} from 'lucide-react';

// === Constants ===
const APP_ID = 'raschet-n1';
const LS_KEY = APP_ID + '.root';
const LS_THEME = APP_ID + '.theme';
const MAX_IMPORT_SIZE = 2000000;

// === Норма №1 (общевойсковая, на 1 чел/сут) ===
interface NormProduct {
  name: string;
  norm: number;
  unit: string;
}

const NORM1: NormProduct[] = [
  { name: 'Хлеб пшеничный (мука в/с)', norm: 400, unit: 'г' },
  { name: 'Хлеб ржаной (мука обдирная)', norm: 300, unit: 'г' },
  { name: 'Мука пшеничная', norm: 20, unit: 'г' },
  { name: 'Макароны', norm: 30, unit: 'г' },
  { name: 'Крупа и бобовые', norm: 140, unit: 'г' },
  { name: 'Картофель', norm: 500, unit: 'г' },
  { name: 'Капуста свежая', norm: 180, unit: 'г' },
  { name: 'Морковь', norm: 40, unit: 'г' },
  { name: 'Свёкла', norm: 40, unit: 'г' },
  { name: 'Лук репчатый', norm: 30, unit: 'г' },
  { name: 'Зелень', norm: 20, unit: 'г' },
  { name: 'Огурцы/помидоры свежие', norm: 40, unit: 'г' },
  { name: 'Фрукты свежие', norm: 50, unit: 'г' },
  { name: 'Мясо (говядина I кат.)', norm: 198, unit: 'г' },
  { name: 'Рыба свежемороженая', norm: 100, unit: 'г' },
  { name: 'Масло сливочное', norm: 20, unit: 'г' },
  { name: 'Масло растительное', norm: 30, unit: 'г' },
  { name: 'Молоко цельное', norm: 200, unit: 'г' },
  { name: 'Яйца куриные', norm: 1, unit: 'шт' },
  { name: 'Соль', norm: 25, unit: 'г' },
  { name: 'Чай', norm: 2, unit: 'г' },
  { name: 'Сахар', norm: 40, unit: 'г' },
  { name: 'Соус столовый', norm: 30, unit: 'г' },
  { name: 'Перец, лавровый лист', norm: 1, unit: 'г' },
  { name: 'Дрожжи хлебопекарные', norm: 5, unit: 'г' },
];

// === Types ===
interface Calculation {
  id: string;
  title: string;
  personnelCount: number;
  days: number;
  updatedAt: string;
}

interface AppData {
  payload: Calculation[];
  quarantine: unknown[];
}

// === Seeds ===
const SEEDS: Calculation[] = [
  { id: 'seed0001-0001-4001-8001-000000000001', title: 'Рота обеспечения', personnelCount: 100, days: 1, updatedAt: '2026-01-15T08:00:00.000Z' },
  { id: 'seed0002-0002-4002-8002-000000000002', title: 'Батальон полевой', personnelCount: 300, days: 3, updatedAt: '2026-01-16T10:30:00.000Z' },
  { id: 'seed0003-0003-4003-8003-000000000003', title: 'Караул суточный', personnelCount: 24, days: 1, updatedAt: '2026-01-17T06:00:00.000Z' },
];

// === Helpers ===
function newId(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

function validateItem(item: unknown): Calculation | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const obj = item as Record<string, unknown>;
  const id = obj.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(id)) return null;
  const title = obj.title;
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > 120) return null;
  const pc = obj.personnelCount;
  if (typeof pc !== 'number' || !Number.isInteger(pc) || pc < 1 || pc > 100000) return null;
  const days = obj.days;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) return null;
  const upd = obj.updatedAt;
  if (typeof upd !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(upd)) return null;
  return { id, title: trimmed, personnelCount: pc, days, updatedAt: upd };
}

function domainCalc(calc: { personnelCount: number; days: number }) {
  const total = calc.personnelCount * calc.days;
  return NORM1.map(p => ({
    name: p.name,
    norm: p.norm,
    unit: p.unit,
    total: p.norm * total,
  }));
}

function formatGrams(g: number): string {
  if (g >= 1000) {
    const kg = g / 1000;
    if (kg === Math.floor(kg)) return kg + ' кг';
    return kg.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + ' кг';
  }
  return g + ' г';
}

function formatQuantity(val: number, unit: string): string {
  if (unit === 'шт') return val + ' шт';
  return formatGrams(val);
}

// === Storage ===
function loadData(): AppData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.payload)) {
        const valid: Calculation[] = [];
        for (const item of parsed.payload) {
          const v = validateItem(item);
          if (v) valid.push(v);
        }
        return { payload: valid, quarantine: Array.isArray(parsed.quarantine) ? parsed.quarantine : [] };
      }
    }
  } catch (e) { /* ignore */ }
  return { payload: [...SEEDS], quarantine: [] };
}

function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

// === Theme ===
type Theme = 'system' | 'light' | 'dark';

function getStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(LS_THEME);
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch (e) { /* ignore */ }
  return 'system';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(LS_THEME, theme); } catch (e) { /* ignore */ }
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach(m => m.setAttribute('content', isDark ? '#000000' : '#F2F2F7'));
}

function cycleTheme(current: Theme): Theme {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

// === Main Component ===
export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [query, setQuery] = useState('');
  const [screen, setScreen] = useState<'list' | 'detail'>('list');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ accepted: Calculation[]; quarantined: unknown[]; repaired: number } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; withUndo: boolean }[]>([]);
  const [undoStack, setUndoStack] = useState<AppData[]>([]);
  const toastIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [formTitle, setFormTitle] = useState('');
  const [formPc, setFormPc] = useState('');
  const [formDays, setFormDays] = useState('1');
  const [formErrors, setFormErrors] = useState<{ title?: string; pc?: string; days?: string }>({});

  // Apply theme
  useEffect(() => { applyTheme(theme); }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (theme === 'system') applyTheme('system'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Commit function
  const commit = useCallback((mutator: (d: AppData) => void, label?: string) => {
    setData(prev => {
      const before = JSON.parse(JSON.stringify(prev));
      const next = JSON.parse(JSON.stringify(prev));
      mutator(next);
      // Save to storage
      saveData(next);
      // Push undo
      if (label) {
        setUndoStack(stack => [...stack.slice(-19), before]);
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setUndoStack(stack => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setData(prev);
      saveData(prev);
      return stack.slice(0, -1);
    });
  }, []);

  // Toast
  const showToast = useCallback((text: string, withUndo = false) => {
    const id = ++toastIdRef.current;
    setToasts(t => [...t, { id, text, withUndo }]);
    const duration = withUndo ? 5000 : 2400;
    setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id));
    }, duration);
  }, []);

  // Filtered & sorted list
  const filteredItems = useMemo(() => {
    let items = [...data.payload];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(it => it.title.toLowerCase().includes(q));
    }
    items.sort((a, b) => {
      if (a.updatedAt > b.updatedAt) return -1;
      if (a.updatedAt < b.updatedAt) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    return items;
  }, [data.payload, query]);

  // Detail item
  const detailItem = useMemo(() => {
    if (!detailId) return null;
    return data.payload.find(it => it.id === detailId) || null;
  }, [data.payload, detailId]);

  // Handlers
  const handleCreate = () => {
    setEditId(null);
    setFormTitle('');
    setFormPc('');
    setFormDays('1');
    setFormErrors({});
    setEditOpen(true);
  };

  const handleEdit = (id: string) => {
    const item = data.payload.find(it => it.id === id);
    if (!item) return;
    setEditId(id);
    setFormTitle(item.title);
    setFormPc(String(item.personnelCount));
    setFormDays(String(item.days));
    setFormErrors({});
    setEditOpen(true);
  };

  const handleSave = () => {
    const errors: { title?: string; pc?: string; days?: string } = {};
    const title = formTitle.trim();
    const pc = parseInt(formPc, 10);
    const days = parseInt(formDays, 10);

    if (!title || title.length < 1) errors.title = 'Введите название';
    else if (title.length > 120) errors.title = 'Не более 120 символов';
    if (isNaN(pc) || pc < 1 || pc > 100000) errors.pc = 'От 1 до 100 000';
    if (isNaN(days) || days < 1 || days > 365) errors.days = 'От 1 до 365';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    if (editId) {
      commit(d => {
        const idx = d.payload.findIndex(it => it.id === editId);
        if (idx >= 0) {
          d.payload[idx] = { ...d.payload[idx], title, personnelCount: pc, days, updatedAt: new Date().toISOString() };
        }
      }, 'update');
    } else {
      commit(d => {
        d.payload.push({
          id: newId(),
          title,
          personnelCount: pc,
          days,
          updatedAt: new Date().toISOString(),
        });
      }, 'create');
    }
    setEditOpen(false);
  };

  const handleDelete = (id: string) => {
    setConfirmText('Расчёт будет удалён. Это действие можно отменить.');
    setConfirmAction(() => () => {
      commit(d => {
        d.payload = d.payload.filter(it => it.id !== id);
      }, 'delete');
      if (screen === 'detail' && detailId === id) {
        setScreen('list');
        setDetailId(null);
      }
      showToast('Расчёт удалён', true);
    });
    setConfirmOpen(true);
  };

  const handleExport = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const exportData = {
      _meta: { appId: APP_ID, schemaVersion: 1, updatedAt: new Date().toISOString() },
      payload: data.payload.map(it => ({
        id: it.id, title: it.title, personnelCount: it.personnelCount, days: it.days, updatedAt: it.updatedAt
      })),
      quarantine: data.quarantine,
    };
    const json = JSON.stringify(exportData, null, 2) + '\n';
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = APP_ID + '_' + dateStr + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > MAX_IMPORT_SIZE) {
      showToast('Файл слишком большой (макс. 2 МБ)');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => showToast('Не удалось прочитать файл');
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed || !Array.isArray(parsed.payload)) {
          showToast('Файл не содержит данных');
          return;
        }
        const accepted: Calculation[] = [];
        const quarantined: unknown[] = [];
        let repaired = 0;

        for (const item of parsed.payload) {
          let obj = item;
          if (!obj.id || typeof obj.id !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(obj.id)) {
            obj = { ...obj, id: newId() };
            repaired++;
          }
          const v = validateItem(obj);
          if (v) accepted.push(v);
          else quarantined.push(obj);
        }

        if (accepted.length === 0) {
          showToast('Нет пригодных записей');
          return;
        }

        setPendingImport({ accepted, quarantined, repaired });
        setImportOpen(true);
      } catch {
        showToast('Файл повреждён');
      }
    };
    reader.readAsText(file);
  };

  const handleImportMerge = () => {
    if (!pendingImport) return;
    const inc = pendingImport;
    commit(d => {
      const map = new Map<string, Calculation>();
      for (const item of d.payload) map.set(item.id, item);
      for (const item of inc.accepted) {
        const prev = map.get(item.id);
        if (!prev || item.updatedAt >= prev.updatedAt) map.set(item.id, item);
      }
      d.payload = Array.from(map.values());
      d.quarantine = [...d.quarantine, ...inc.quarantined];
    }, 'import-merge');
    setImportOpen(false);
    setPendingImport(null);
    showToast('Импорт выполнен');
  };

  const handleImportReplace = () => {
    if (!pendingImport) return;
    const inc = pendingImport;
    commit(d => {
      d.payload = [...inc.accepted];
      d.quarantine = [...inc.quarantined];
    }, 'import-replace');
    setImportOpen(false);
    setPendingImport(null);
    showToast('Импорт выполнен');
  };

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editOpen) { setEditOpen(false); return; }
        if (confirmOpen) { setConfirmOpen(false); setConfirmAction(null); return; }
        if (importOpen) { setImportOpen(false); setPendingImport(null); return; }
        if (screen === 'detail') { setScreen('list'); setDetailId(null); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && editOpen) {
        e.preventDefault();
        handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          undo();
        }
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && screen === 'list') {
          e.preventDefault();
          document.getElementById('searchInput')?.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editOpen, confirmOpen, importOpen, screen, undo]);

  // Lock scroll when modal open
  useEffect(() => {
    if (editOpen || confirmOpen || importOpen) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
  }, [editOpen, confirmOpen, importOpen]);

  // Theme icon
  const themeIcon = theme === 'light' ? <Sun size={24} /> : theme === 'dark' ? <Moon size={24} /> : <Monitor size={24} />;
  const themeLabel = theme === 'light' ? 'Светлая тема' : theme === 'dark' ? 'Тёмная тема' : 'Системная тема';

  // Detail lines
  const detailLines = detailItem ? domainCalc(detailItem) : [];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px', paddingBottom: 120 }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, padding: '16px 0 12px', background: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h1 style={{ fontSize: 34, lineHeight: '41px', fontWeight: 700, letterSpacing: '0.37px', margin: 0 }}>
            {screen === 'list' ? 'Раскладка' : ''}
          </h1>
          <div style={{ display: 'flex', gap: 4 }}>
            {screen === 'list' && (
              <>
                <button className="icon-btn" onClick={handleExport} type="button" aria-label="Экспорт" style={iconBtnStyle}>
                  <Download size={24} />
                </button>
                <button className="icon-btn" onClick={handleImportClick} type="button" aria-label="Импорт" style={iconBtnStyle}>
                  <Upload size={24} />
                </button>
              </>
            )}
            <button className="icon-btn" onClick={() => setTheme(cycleTheme(theme))} type="button" aria-label={themeLabel} style={iconBtnStyle}>
              {themeIcon}
            </button>
          </div>
        </div>
      </header>

      {/* Quarantine banner */}
      {data.quarantine.length > 0 && (
        <div style={bannerStyle}>
          <span style={{ flex: 1 }}>Повреждённых записей: {data.quarantine.length}</span>
          <button style={bannerBtnStyle} type="button" onClick={() => commit(d => { d.quarantine = []; }, 'clear-q')}>
            Удалить
          </button>
        </div>
      )}

      {/* List View */}
      {screen === 'list' && (
        <>
          {/* Search */}
          <div style={{ margin: '12px 0' }}>
            <div style={searchStyle}>
              <Search size={18} style={{ color: 'var(--label-secondary)', flexShrink: 0 }} />
              <input
                id="searchInput"
                type="text"
                placeholder="Поиск по названию"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={searchInputStyle}
              />
            </div>
          </div>

          {/* List */}
          {data.payload.length === 0 ? (
            <div style={emptyStyle}>
              <h2 style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700, margin: '0 0 8px' }}>Нет расчётов</h2>
              <p style={{ fontSize: 15, lineHeight: '20px', color: 'var(--label-secondary)', margin: '0 0 20px' }}>
                Создайте первый расчёт продовольственного довольствия.
              </p>
              <button style={filledBtnStyle} type="button" onClick={handleCreate}>Создать расчёт</button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={emptyStyle}>
              <h2 style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700, margin: '0 0 8px' }}>Ничего не найдено</h2>
              <p style={{ fontSize: 15, lineHeight: '20px', color: 'var(--label-secondary)', margin: 0 }}>
                Попробуйте изменить поисковый запрос.
              </p>
            </div>
          ) : (
            <div style={groupStyle}>
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  style={rowStyle}
                  onClick={() => { setScreen('detail'); setDetailId(item.id); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') { setScreen('detail'); setDetailId(item.id); } }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, lineHeight: '22px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--label-secondary)', marginTop: 2 }}>
                      {item.personnelCount} чел × {item.days} сут
                    </div>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--label-secondary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' as const, flexShrink: 0 }}>
                    {item.personnelCount * item.days} чел/сут
                  </div>
                  <div style={{ color: 'var(--label-tertiary)', flexShrink: 0 }}>
                    <ChevronRight size={18} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Detail View */}
      {screen === 'detail' && detailItem && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button style={ghostBtnStyle} type="button" onClick={() => { setScreen('list'); setDetailId(null); }}>
              <ArrowLeft size={20} style={{ marginRight: 4 }} /> Назад
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="icon-btn" type="button" aria-label="Редактировать" style={iconBtnStyle} onClick={() => handleEdit(detailItem.id)}>
                <Edit3 size={24} />
              </button>
              <button className="icon-btn" type="button" aria-label="Удалить" style={{ ...iconBtnStyle, color: 'var(--system-destructive)' }} onClick={() => handleDelete(detailItem.id)}>
                <Trash2 size={24} />
              </button>
            </div>
          </div>

          <h2 style={{ fontSize: 22, lineHeight: '28px', fontWeight: 700, margin: '0 0 16px' }}>{detailItem.title}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={infoCardStyle}>
              <div style={{ fontSize: 13, color: 'var(--label-secondary)', marginBottom: 4 }}>Личный состав</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{detailItem.personnelCount} чел</div>
            </div>
            <div style={infoCardStyle}>
              <div style={{ fontSize: 13, color: 'var(--label-secondary)', marginBottom: 4 }}>Период</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{detailItem.days} сут</div>
            </div>
            <div style={{ ...infoCardStyle, gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 13, color: 'var(--label-secondary)', marginBottom: 4 }}>Итого человек-суток</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{detailItem.personnelCount * detailItem.days}</div>
            </div>
          </div>

          <div style={groupStyle}>
            <div style={{ padding: '12px 16px', fontWeight: 600, fontSize: 17 }}>Норма №1 — продукты</div>
            <div style={{ overflowX: 'auto' as const }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 15, lineHeight: '20px' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Продукт</th>
                    <th style={{ ...thStyle, textAlign: 'right' as const }}>На 1 чел/сут</th>
                    <th style={{ ...thStyle, textAlign: 'right' as const }}>Всего</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLines.map((ln, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{ln.name}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' }}>{ln.norm} {ln.unit}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' }}>{formatQuantity(ln.total, ln.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* FAB */}
      {screen === 'list' && (
        <button style={fabStyle} type="button" aria-label="Новый расчёт" onClick={handleCreate}>
          <Plus size={28} />
        </button>
      )}

      {/* Edit Sheet */}
      {editOpen && (
        <div className="sheet-backdrop" style={backdropStyle} onClick={e => { if (e.target === e.currentTarget) setEditOpen(false); }} role="dialog" aria-modal="true" aria-labelledby="editTitle">
          <div style={sheetStyle}>
            <div className="sheet-grabber" style={grabberStyle} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 id="editTitle" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{editId ? 'Редактирование' : 'Новый расчёт'}</h2>
              <button className="icon-btn" type="button" aria-label="Закрыть" style={iconBtnStyle} onClick={() => setEditOpen(false)}>
                <X size={24} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="fieldTitle" style={labelStyle}>Название расчёта</label>
              <input
                id="fieldTitle"
                type="text"
                maxLength={120}
                placeholder="Например: Рота обеспечения"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                aria-invalid={!!formErrors.title}
                style={{ ...inputStyle, borderColor: formErrors.title ? 'var(--system-destructive)' : undefined }}
              />
              {formErrors.title && <div style={errorStyle}>{formErrors.title}</div>}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="fieldPc" style={labelStyle}>Количество личного состава, чел</label>
              <input
                id="fieldPc"
                type="number"
                min={1}
                max={100000}
                step={1}
                inputMode="numeric"
                placeholder="100"
                value={formPc}
                onChange={e => setFormPc(e.target.value)}
                aria-invalid={!!formErrors.pc}
                style={{ ...inputStyle, borderColor: formErrors.pc ? 'var(--system-destructive)' : undefined }}
              />
              {formErrors.pc && <div style={errorStyle}>{formErrors.pc}</div>}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="fieldDays" style={labelStyle}>Период, суток</label>
              <input
                id="fieldDays"
                type="number"
                min={1}
                max={365}
                step={1}
                inputMode="numeric"
                placeholder="1"
                value={formDays}
                onChange={e => setFormDays(e.target.value)}
                aria-invalid={!!formErrors.days}
                style={{ ...inputStyle, borderColor: formErrors.days ? 'var(--system-destructive)' : undefined }}
              />
              {formErrors.days && <div style={errorStyle}>{formErrors.days}</div>}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button style={ghostBtnStyle} type="button" onClick={() => setEditOpen(false)}>Отмена</button>
              <button style={filledBtnStyle} type="button" onClick={handleSave}>Готово</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Sheet */}
      {confirmOpen && (
        <div className="sheet-backdrop" style={backdropStyle} onClick={e => { if (e.target === e.currentTarget) { setConfirmOpen(false); setConfirmAction(null); } }} role="dialog" aria-modal="true">
          <div style={{ ...sheetStyle, textAlign: 'center' as const }}>
            <div className="sheet-grabber" style={grabberStyle} />
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>Подтверждение</h2>
            <p style={{ color: 'var(--label-secondary)', margin: '0 0 20px' }}>{confirmText}</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={ghostBtnStyle} type="button" onClick={() => { setConfirmOpen(false); setConfirmAction(null); }}>Отмена</button>
              <button style={{ ...ghostBtnStyle, color: 'var(--system-destructive)' }} type="button" onClick={() => {
                if (confirmAction) confirmAction();
                setConfirmOpen(false);
                setConfirmAction(null);
              }}>Удалить</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Sheet */}
      {importOpen && pendingImport && (
        <div className="sheet-backdrop" style={backdropStyle} onClick={e => { if (e.target === e.currentTarget) { setImportOpen(false); setPendingImport(null); } }} role="dialog" aria-modal="true">
          <div style={sheetStyle}>
            <div className="sheet-grabber" style={grabberStyle} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Импорт</h2>
              <button className="icon-btn" type="button" aria-label="Закрыть" style={iconBtnStyle} onClick={() => { setImportOpen(false); setPendingImport(null); }}>
                <X size={24} />
              </button>
            </div>
            <div style={{ background: 'var(--fill-tertiary)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 15 }}>
                <span>Принято</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{pendingImport.accepted.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 15 }}>
                <span>Починено</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{pendingImport.repaired}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 15 }}>
                <span>В карантин</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{pendingImport.quarantined.length}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={ghostBtnStyle} type="button" onClick={() => { setImportOpen(false); setPendingImport(null); }}>Отмена</button>
              <button style={ghostBtnStyle} type="button" onClick={handleImportMerge}>Объединить</button>
              <button style={filledBtnStyle} type="button" onClick={handleImportReplace}>Заменить</button>
            </div>
          </div>
        </div>
      )}

      {/* File input */}
      <input type="file" ref={fileInputRef} accept="application/json,.json" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* Toasts */}
      <div style={{ position: 'fixed', bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)', zIndex: 200, display: 'flex', flexDirection: 'column' as const, gap: 8, pointerEvents: 'none' as const }}>
        {toasts.map(t => (
          <div key={t.id} style={toastStyle} role="status">
            <span style={{ flex: 1 }}>{t.text}</span>
            {t.withUndo && (
              <button style={{ ...ghostBtnStyle, minHeight: 36, padding: '4px 12px', fontSize: 15 }} type="button" onClick={() => {
                undo();
                setToasts(ts => ts.filter(x => x.id !== t.id));
              }}>Отменить</button>
            )}
          </div>
        ))}
      </div>

      {/* Selftest */}
      {window.location.hash === '#selftest' && <SelfTestBanner />}
    </div>
  );
}

// === SelfTest ===
function SelfTestBanner() {
  const [results, setResults] = useState<{ name: string; ok: boolean; detail: string }[]>([]);

  useEffect(() => {
    const res: { name: string; ok: boolean; detail: string }[] = [];

    // 1. Validate
    const v1 = validateItem(null);
    const v2 = validateItem({ id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', title: '', personnelCount: 1, days: 1, updatedAt: '2026-01-01T00:00:00.000Z' });
    const longTitle = 'a'.repeat(121);
    const v3 = validateItem({ id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', title: longTitle, personnelCount: 1, days: 1, updatedAt: '2026-01-01T00:00:00.000Z' });
    const orig = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', title: 'ok', personnelCount: 5, days: 2, updatedAt: '2026-01-01T00:00:00.000Z', evil: true };
    const v4 = validateItem(orig);
    const stripOk = v4 !== null && !('evil' in v4) && ('evil' in orig);
    res.push({ name: 'Валидатор', ok: v1 === null && v2 === null && v3 === null && stripOk, detail: `null=${v1 === null} empty=${v2 === null} long=${v3 === null} strip=${stripOk}` });

    // 2. Domain calc
    const lines = domainCalc({ personnelCount: 100, days: 1 });
    const bread = lines.find(l => l.name === 'Хлеб пшеничный (мука в/с)');
    const eggs = lines.find(l => l.name === 'Яйца куриные');
    const meat = lines.find(l => l.name === 'Мясо (говядина I кат.)');
    const ok1 = bread?.total === 40000;
    const ok2 = eggs?.total === 100;
    const ok3 = meat?.total === 19800;
    res.push({ name: 'Расчёт нормы', ok: !!ok1 && !!ok2 && !!ok3, detail: `bread=${ok1} eggs=${ok2} meat=${ok3}` });

    // 3. Format
    const f1 = formatGrams(1500) === '1.5 кг';
    const f2 = formatGrams(2000) === '2 кг';
    const f3 = formatGrams(500) === '500 г';
    res.push({ name: 'Форматирование', ok: f1 && f2 && f3, detail: `1500=${f1} 2000=${f2} 500=${f3}` });

    // 4. Sort stability
    const items = [
      { id: 'b', updatedAt: '2026-01-01T00:00:00.000Z', title: 'B' },
      { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z', title: 'A' },
    ];
    items.sort((a, b) => {
      if (a.updatedAt > b.updatedAt) return -1;
      if (a.updatedAt < b.updatedAt) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    const sortOk = items[0].id === 'a' && items[1].id === 'b';
    res.push({ name: 'Сортировка', ok: sortOk, detail: `stable=${sortOk}` });

    setResults(res);
  }, []);

  const allOk = results.every(r => r.ok);
  const text = allOk
    ? `Самопроверка пройдена: ${results.length}`
    : results.filter(r => !r.ok).map(r => `${r.name}: ${r.detail}`).join('; ');

  return (
    <div style={{ ...bannerStyle, background: allOk ? 'var(--system-success)' : undefined, marginTop: 16 }}>
      <span style={{ flex: 1 }}>{text}</span>
    </div>
  );
}

// === Styles ===
const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minHeight: 44, minWidth: 44, padding: 0, border: 'none', borderRadius: 12,
  background: 'transparent', color: 'var(--system-accent)', cursor: 'pointer',
};

const searchStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'var(--fill-tertiary)', borderRadius: 12, padding: '0 12px', height: 44,
};

const searchInputStyle: React.CSSProperties = {
  flex: 1, border: 'none', background: 'transparent',
  fontFamily: 'var(--font)', fontSize: 17, lineHeight: '22px',
  color: 'var(--label-primary)', outline: 'none', minWidth: 0,
};

const groupStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)', borderRadius: 16,
  boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 16px', minHeight: 56,
  borderTop: '1px solid var(--separator)', cursor: 'pointer',
};

const emptyStyle: React.CSSProperties = {
  padding: '32px 20px', textAlign: 'center',
};

const fabStyle: React.CSSProperties = {
  position: 'fixed', right: 'calc(20px + env(safe-area-inset-right, 0px))',
  bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
  width: 56, height: 56, borderRadius: '50%',
  background: 'var(--system-accent)', color: '#FFFFFF',
  border: 'none', boxShadow: 'var(--shadow-lg)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20,
};

const backdropStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  backdropFilter: 'blur(20px) saturate(190%)', WebkitBackdropFilter: 'blur(20px) saturate(190%)',
  zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
};

const sheetStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)', width: '100%', maxWidth: 560,
  borderRadius: '22px 22px 0 0', padding: '16px 20px',
  maxHeight: '90vh', overflowY: 'auto' as const, boxShadow: 'var(--shadow-lg)',
};

const grabberStyle: React.CSSProperties = {
  width: 36, height: 5, background: 'var(--fill-primary)',
  borderRadius: 3, margin: '0 auto 16px',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, lineHeight: '18px',
  color: 'var(--label-secondary)', marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px',
  border: '1px solid var(--separator)', borderRadius: 12,
  background: 'var(--bg-tertiary)', fontFamily: 'var(--font)',
  fontSize: 17, lineHeight: '22px', color: 'var(--label-primary)', outline: 'none',
};

const errorStyle: React.CSSProperties = {
  fontSize: 13, lineHeight: '18px', color: 'var(--system-destructive)', marginTop: 4,
};

const filledBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minHeight: 44, padding: '8px 16px', border: 'none', borderRadius: 12,
  background: 'var(--system-accent)', color: '#FFFFFF',
  fontFamily: 'var(--font)', fontSize: 17, fontWeight: 600, cursor: 'pointer', flex: 1,
};

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minHeight: 44, padding: '8px 16px', border: 'none', borderRadius: 12,
  background: 'var(--fill-tertiary)', color: 'var(--system-accent)',
  fontFamily: 'var(--font)', fontSize: 17, fontWeight: 600, cursor: 'pointer', flex: 1,
};

const bannerStyle: React.CSSProperties = {
  background: 'var(--system-warning)', color: '#000',
  borderRadius: 12, padding: '12px 16px', marginBottom: 16,
  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const,
};

const bannerBtnStyle: React.CSSProperties = {
  border: 'none', background: 'transparent', color: '#000',
  fontWeight: 600, fontSize: 15, cursor: 'pointer', padding: '4px 12px',
};

const infoCardStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)', borderRadius: 12,
  padding: '12px 16px', boxShadow: 'var(--shadow-sm)',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left', fontWeight: 600, padding: '12px 12px',
  borderBottom: '2px solid var(--separator)', color: 'var(--label-secondary)',
  fontSize: 13, lineHeight: '18px', fontVariantNumeric: 'tabular-nums',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px', borderBottom: '1px solid var(--separator)', verticalAlign: 'middle',
};

const toastStyle: React.CSSProperties = {
  background: 'var(--material)', backdropFilter: 'blur(20px) saturate(190%)',
  borderRadius: 16, boxShadow: 'var(--shadow-md)',
  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
  pointerEvents: 'auto' as const, fontSize: 15, lineHeight: '20px', maxWidth: 420,
};
