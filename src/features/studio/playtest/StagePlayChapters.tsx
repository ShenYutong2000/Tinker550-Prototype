import { Check, Layers, Lock } from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import { resolveGroupCode, type BoardNode } from '../design-board/studioModel';
import type { StageRun } from './sceneRuntime';

interface Props {
  lang: Language;
  nodes: BoardNode[];
  run: StageRun;
  mechanisms: BoardNode[];
  onChapter: (id: string) => void;
  onMechanism: (id: string) => void;
}

export function StagePlayChapters({ lang, nodes, run, mechanisms, onChapter, onMechanism }: Props) {
  const t = COPY[lang].studio.play;
  const untitled = COPY[lang].studio.board.groupUntitled;
  const unlocked = run.unlockedGroups.flatMap(id => nodes.find(node => node.id === id && node.kind === 'group') ?? []);
  const waiting = run.waitingGroups.flatMap(id => nodes.find(node => node.id === id && node.kind === 'group') ?? []);
  const showChapters = unlocked.length + waiting.length > 0;
  if (!showChapters && mechanisms.length < 2) return null;
  const focusedId = run.entities.find(item => item.id === run.focusedObjectId)?.nodeId;

  return <section className="stage-play-chapters px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
    {showChapters && <div className="space-y-1">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B] flex items-center justify-between">
        <span>{t.chaptersLabel}</span><span className="font-mono tabular-nums font-normal">
          {unlocked.length}{waiting.length > 0 && ' / ' + (unlocked.length + waiting.length)}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {unlocked.map(group => {
          const focused = group.id === run.groupId;
          const completed = run.flags.some(flag => flag.startsWith('exit:') && flag.endsWith(':' + group.id));
          return <button type="button" key={group.id} aria-pressed={focused} onClick={() => onChapter(group.id)}
            className={'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ' +
              (focused ? 'bg-[#14244B] border-[#14244B] text-white' : 'bg-white border-[#CBD5E1] text-[#14244B] hover:border-[#14244B]')}>
            <Layers className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="font-mono text-[10px] font-bold opacity-75 shrink-0">{resolveGroupCode(group, nodes)}</span>
            <span className="truncate max-w-[130px]">{group.title.trim() || group.note.trim() || untitled}</span>
            {completed && <Check className={'w-3 h-3 shrink-0 ' + (focused ? 'text-[#FBC53D]' : 'text-[#059669]')} aria-hidden="true" />}
          </button>;
        })}
        {waiting.map(group => <div key={group.id} title={group.availableWhen || t.chapterLockedHint}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B] text-[11px] font-medium whitespace-nowrap">
          <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="font-mono text-[10px] font-bold opacity-75 shrink-0">{resolveGroupCode(group, nodes)}</span>
          <span className="truncate max-w-[110px]">{group.title.trim() || group.note.trim() || untitled}</span>
          {group.availableWhen && <span className="text-[10px] text-[#94A3B8] truncate max-w-[90px]">· {group.availableWhen}</span>}
        </div>)}
      </div>
    </div>}
    {mechanisms.length > 0 ? <div className="space-y-1">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B] flex items-center justify-between">
        <span>{t.mechanismsLabel}</span><span className="font-mono tabular-nums font-normal">{mechanisms.length} {t.mechanismReady}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {mechanisms.map((node, index) => {
          const focused = focusedId ? focusedId === node.id : index === 0;
          return <button type="button" key={node.id} aria-pressed={focused} onClick={() => onMechanism(node.id)}
            className={'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ' +
              (focused ? 'bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8]' : 'bg-white border-[#CBD5E1] text-[#334155] hover:border-[#2563EB]')}>
            <span className="truncate max-w-[155px]">{node.note.trim() || node.title.trim() || COPY[lang].studio.board.patternLabel}</span>
          </button>;
        })}
      </div>
    </div> : unlocked.length > 0 && <div className="text-[11px] text-[#64748B]">{t.noActiveMechInGroup}</div>}
  </section>;
}
