import { useEffect, useState } from 'react';
import type { Language } from '../../../shared/i18n';
import { momentSecond } from './stageMoments';

export interface TimelineEntry {
  id: string;
  cardId?: string;
  atMs: number;
  durationMs?: number;
  label: string;
  track: string;
}

export interface TimelineCursor {
  cardId?: string;
  atMs: number;
  before?: boolean;
}

interface Props {
  lang: Language;
  entries: TimelineEntry[];
  cards: { id: string; name: string }[];
  paused?: TimelineCursor & { runMs: number };
  cursor: TimelineCursor | null;
  onCursor: (cursor: TimelineCursor | null) => void;
  onInspect: (id: string | null) => void;
  onPlayEffect: (id: string) => void;
  onRestart: () => void;
  canPlay: boolean;
}

export function StageTimeline(props: Props) {
  const { cursor, onCursor } = props;
  const zh = props.lang === 'zh';
  const label = (en: string, cn: string) => zh ? cn : en;
  const [cardId, setCardId] = useState<string>();
  const [entryId, setEntryId] = useState<string>();
  const [clip, setClip] = useState<{ start: number; end: number; returnTo: number }>();
  const entries = props.entries.filter(entry => entry.cardId === cardId).sort((a, b) => a.atMs - b.atMs);
  const times = [...new Set(entries.map(entry => entry.atMs))].sort((a,b) => a-b);
  const selected = entries.find(entry => entry.id === entryId);
  const time = cursor?.atMs ?? 0;
  const pausedTime = cardId ? props.paused?.cardId === cardId ? props.paused.atMs : undefined : props.paused?.runMs;
  const end = Math.max(10000, Math.ceil(Math.max(time, pausedTime ?? 0, clip?.end ?? 0,
    ...entries.map(entry => entry.atMs + (entry.durationMs ?? 0))) / 1000) * 1000);
  const seek = (atMs: number, before = false) => {
    setClip(undefined);
    onCursor({ cardId, atMs, before });
  };
  const select = (entry: TimelineEntry) => {
    setEntryId(entry.id);
    props.onInspect(entry.id);
    seek(entry.atMs);
  };
  useEffect(() => {
    if (!clip) return;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const atMs = Math.min(clip.end, Math.round(clip.start + now - started));
      onCursor({ cardId, atMs });
      if (atMs < clip.end) frame = requestAnimationFrame(step);
      else setClip(undefined);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [clip, cardId, onCursor]);

  const selectTime = (point: number) => {
    const entry = entries.find(item => item.atMs === point);
    if (entry) select(entry);
  };
  const previous = [...times].reverse().find(point => point < time);
  const next = times.find(point => point > time);
  const button = 'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs disabled:opacity-40';
  return <section aria-label={label('Changes timeline', '变化时间轴')} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 p-3">
    <label className="grid gap-1 text-xs">{label('Start counting', '从哪里计时')}
      <select className={button} value={cardId ?? ''} onChange={event => {
        const id = event.target.value || undefined;
        setCardId(id); setClip(undefined); setEntryId(undefined); props.onInspect(null);
        onCursor({ cardId: id, atMs: 0 });
      }}>
        <option value="">{label('From game start', '从开局计时')}</option>
        {props.cards.map(card => <option key={card.id} value={card.id}>
          {zh ? '进入「' + card.name + '」后' : 'After entering ' + card.name}
        </option>)}
      </select>
    </label>
    {cardId && <p className="text-xs text-slate-600">{label('This clock starts at zero each time you enter the card.', '每次进入这张卡都从 0 秒开始。')}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-xs">{label('Preview time', '预览时间')}
        <input className={button + ' w-24'} key={time} type="number" min={0} step="any" defaultValue={momentSecond(time)}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          onBlur={event => {
            const ms = Math.round(event.currentTarget.valueAsNumber * 1000);
            if (!Number.isSafeInteger(ms) || ms < 0) event.currentTarget.value = momentSecond(time);
            else if (ms !== time || !cursor) seek(ms);
          }} />
        {label('s', '秒')}
      </label>
      {pausedTime !== undefined && <button type="button" className={button} onClick={() => seek(pausedTime)}>
        {label('Use pause time', '用暂停时间')} · {momentSecond(pausedTime)} {label('s', '秒')}
      </button>}
    </div>
    <div className="relative rounded-lg bg-slate-50 p-2">
      <input className="relative z-10 block w-full accent-sky-700" type="range" min={0} max={end} step={1}
        value={time} aria-label={label('Timeline playhead', '时间轴读秒线')} aria-valuetext={momentSecond(time) + label(' seconds', ' 秒')}
        onChange={event => seek(Math.round(Number(event.target.value) / 100) * 100)}
        onKeyDown={event => {
          const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 :
            event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : 0;
          if (direction) { event.preventDefault(); seek(Math.max(0, Math.min(end, time + direction * 100))); }
        }} />
      <div className="flex justify-between font-mono text-[10px] text-slate-600">
        {[0, 0.25, 0.5, 0.75, 1].map(fraction => <span key={fraction}>{momentSecond(Math.round(end * fraction))}{label('s', '秒')}</span>)}
      </div>
      <div className="relative h-9" aria-hidden="true">
        {pausedTime !== undefined && <span className="absolute inset-y-0 border-l-2 border-dashed border-amber-600" style={{ left: pausedTime / end * 100 + '%' }} />}
        {entries.map(entry => {
          const following = entries.find(item => item.track === entry.track && item.atMs > entry.atMs);
          const until = entry.durationMs !== undefined ? entry.atMs + entry.durationMs : following?.atMs ?? end;
          return <span key={entry.id} className={'absolute h-1 rounded ' + (entry.durationMs === undefined ? 'top-2 bg-sky-500' : 'top-5 bg-violet-500')}
            style={{ left: entry.atMs / end * 100 + '%', width: Math.max(0, until - entry.atMs) / end * 100 + '%' }}>
            <span className="absolute -left-1 -top-1 text-[10px]">{entry.durationMs === undefined ? '◆' : '✦'}</span>
          </span>;
        })}
        {cursor && <span className="pointer-events-none absolute inset-y-0 border-l-2 border-sky-800" style={{ left: time / end * 100 + '%' }} />}
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={previous === undefined} onClick={() => { if (previous !== undefined) selectTime(previous); }}>{label('Previous change', '上一处变化')}</button>
      <button type="button" className={button} disabled={next === undefined} onClick={() => { if (next !== undefined) selectTime(next); }}>{label('Next change', '下一处变化')}</button>
      {cursor && <button type="button" className={button} onClick={() => { setClip(undefined); onCursor(null); }}>
        {props.paused ? label('Back to paused game', '回到本局暂停画面') : label('Back to stage', '返回舞台')}
      </button>}
    </div>
    {times.length === 0 && <p className="text-xs text-slate-600">{label('Pause play and save a change at a time, or set a timed effect.', '暂停试玩后可把画面改动保存到某一刻，也可以在「特效」里设置定时播放。')}</p>}
    {times.length > 0 && <div className="grid max-h-48 gap-2 overflow-y-auto">
      {times.map(point => <div key={point} className="grid gap-1 rounded-lg border border-slate-200 p-2">
        <button type="button" className="text-start text-xs font-semibold" onClick={() => selectTime(point)}>
          {momentSecond(point)} {label('s', '秒')}
        </button>
        {entries.filter(entry => entry.atMs === point).map(entry => <button type="button" key={entry.id}
          aria-pressed={entry.id === entryId} className={button + ' text-start aria-pressed:bg-sky-100'} onClick={() => select(entry)}>
          {entry.durationMs === undefined ? '◆' : '✦'} {entry.label}
        </button>)}
      </div>)}
    </div>}
    {selected && <div className="flex flex-wrap gap-2">
      <button type="button" className={button} onClick={() => seek(selected.atMs, true)}>{label('Before', '变化前')}</button>
      <button type="button" className={button} onClick={() => seek(selected.atMs)}>{label('After', '变化后')}</button>
      {clip ? <button type="button" className={button} onClick={() => seek(clip.returnTo)}>{label('Stop preview', '停止预览')}</button>
        : <button type="button" className={button} onClick={() => setClip({
          start: Math.max(0, selected.atMs - 1000), end: selected.atMs + Math.max(1000, selected.durationMs ?? 0), returnTo: selected.atMs,
        })}>{label('Preview this part', '预览这一段')}</button>}
      {selected.durationMs !== undefined && <button type="button" className={button} onClick={() => {
        seek(selected.atMs); props.onPlayEffect(selected.id);
      }}>{label('Play effect once', '播一次')}</button>}
    </div>}
    <button type="button" className={button + ' justify-self-start'} disabled={!props.canPlay} onClick={props.onRestart}>
      {label('Play from start', '从头试玩')}
    </button>
  </section>;
}
