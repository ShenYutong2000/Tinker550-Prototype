import { COPY, type Language } from '../../../shared/i18n';
import type { SimulatedEventDescriptor } from '../design-board/arrowConditionModel';

interface Props {
  lang: Language;
  events: SimulatedEventDescriptor[];
  conditions: string[];
  active: string[];
  disabled: boolean;
  onToggle: (key: string) => void;
}

export function StagePlaySwitches({ lang, events, conditions, active, disabled, onToggle }: Props) {
  const t = COPY[lang].studio.play;
  const panels = [
    { title: t.simEventsBar, special: true, items: events.map(event => ({ key: event.key, label: '◇ ' + event.label })) },
    { title: t.conditionsBar, special: false, items: conditions.map(condition => ({ key: condition, label: condition })) },
  ];

  return panels.filter(panel => panel.items.length > 0).map(({ title, special, items }) => (
    <section key={title} aria-label={title}
      className={'stage-play-switches px-3 py-2 rounded-xl border space-y-1.5 ' + (special ? 'bg-[#FFFBEB] border-[#FDE68A]' : 'bg-[#F8FAFC] border-[#E2E8F0]')}>
      <div className={'text-[10.5px] font-bold uppercase tracking-wider ' + (special ? 'text-[#B45309]' : 'text-[#64748B]')}>{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => {
          const state = active.includes(item.key);
          const caption = special ? (state ? t.simTriggered : t.simIdle) : (state ? t.condTrue : t.condFalse);
          const colors = state ? 'bg-[#ECFDF5] border-[#10B981] text-[#047857]'
            : special ? 'bg-white border-[#FCD34D] text-[#92400E] hover:border-[#D97706]'
              : 'bg-white border-[#CBD5E1] text-[#64748B] hover:border-[#14244B]';
          return (
            <button type="button" key={item.key} aria-pressed={state} disabled={disabled} onClick={() => onToggle(item.key)}
              className={'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 ' + colors}>
              <span>{item.label}</span><span className="font-mono text-[10px]">· {caption}</span>
            </button>
          );
        })}
      </div>
    </section>
  ));
}
