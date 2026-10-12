import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const pad = value => String(value).padStart(2, '0');
const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

export const DatePickerField = ({ label, value, min, max, disabled, onChange, accentBg, alignRight = false }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => new Date());
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (!open) {
      const selected = value ? new Date(`${value}T12:00:00`) : new Date();
      setView(selected);
    }
    setOpen(!open);
  };

  const year = view.getFullYear();
  const month = view.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  const today = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const years = Array.from({ length: 111 }, (_, index) => 2000 + index);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <span className="text-xs text-slate-400">{label}</span>
      <button type="button" disabled={disabled} onClick={toggle} aria-expanded={open}
        aria-label={`${label}，${value || '未选择'}`}
        className="mt-1 flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm text-white transition-colors hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50">
        <span className={value ? 'text-white' : 'text-slate-500'}>{value || '选择日期'}</span>
        <CalendarDays className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div role="dialog" aria-label={`${label}日历`}
          className={`absolute top-full z-30 mt-2 w-[min(18rem,calc(100vw-3rem))] rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl shadow-black/60 ${alignRight ? 'right-0' : 'left-0'}`}>
          <div className="mb-3 flex items-center justify-between gap-1">
            <button type="button" onClick={() => setView(new Date(year, month - 1, 1))} aria-label="上个月"
              className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
            <div className="flex gap-1">
              <select aria-label="年份" value={year} onChange={event => setView(new Date(Number(event.target.value), month, 1))}
                className="rounded-lg border border-slate-700 bg-slate-950 px-1 py-1 text-sm text-white">
                {years.map(item => <option key={item} value={item}>{item} 年</option>)}
              </select>
              <select aria-label="月份" value={month} onChange={event => setView(new Date(year, Number(event.target.value), 1))}
                className="rounded-lg border border-slate-700 bg-slate-950 px-1 py-1 text-sm text-white">
                {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{index + 1} 月</option>)}
              </select>
            </div>
            <button type="button" onClick={() => setView(new Date(year, month + 1, 1))} aria-label="下个月"
              className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day} className="py-1 text-slate-500">{day}</span>)}
            {cells.map((day, index) => {
              if (!day) return <span key={`blank-${index}`} />;
              const key = dateKey(year, month, day);
              const unavailable = (min && key < min) || (max && key > max);
              return <button key={key} type="button" disabled={unavailable} aria-label={key}
                onClick={() => { onChange(key); setOpen(false); }}
                className={`h-9 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-25 ${key === value ? `${accentBg} text-white` : 'text-slate-200 hover:bg-slate-700'} ${key === today && key !== value ? 'ring-1 ring-indigo-400/60' : ''}`}>
                {day}
              </button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
};
