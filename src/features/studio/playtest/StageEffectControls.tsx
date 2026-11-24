import type { Language } from '../../../shared/i18n';
import type { BoardNode } from '../design-board/studioModel';
import { effectEntries, type StageEffectConfig } from './stageEffects';
import type { StageLayout, StagePlacement } from './stageLayout';

interface Props {
  lang: Language;
  id: string;
  placement: StagePlacement;
  cards: BoardNode[];
  missingAsset: boolean;
  onUpdate: (id: string, patch: StagePlacement) => void;
  onPreview: (id: string) => void;
}

export function StageEffectControls(props: Props) {
  const { placement, id } = props;
  const effect = placement.effect!;
  const zh = props.lang === 'zh';
  const label = (en: string, cn: string) => zh ? cn : en;
  const control = 'block w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs';
  const update = (patch: Partial<StageEffectConfig>) => props.onUpdate(id, { effect: { ...effect, ...patch } });
  const missingCard = effect.cardId && !props.cards.some(card => card.id === effect.cardId);
  return <div className="grid gap-3 text-xs">
    {(props.missingAsset || missingCard || (effect.trigger === 'card' && !effect.cardId)) &&
      <p role="status" className="text-amber-800">{label('Choose an available effect asset and card.', '请重新选择可用的特效素材或卡片。')}</p>}
    <label>{label('When to play', '什么时候出现')}
      <select className={control} value={effect.trigger} onChange={event => update({ trigger: event.target.value as StageEffectConfig['trigger'] })}>
        {(['collision', 'collect', 'score', 'victory', 'run', 'card'] as const).map((trigger, index) =>
          <option key={trigger} value={trigger}>{label(
            ['Hit obstacle', 'Collect item', 'Gain score', 'Victory', 'Seconds after start', 'Seconds after card entry'][index],
            ['撞到障碍', '捡到物品', '获得分数', '通关胜利', '从开局计时', '从进入卡片计时'][index])}</option>)}
      </select>
    </label>
    <label>{label('Card', '关联卡片')}
      <select className={control} value={effect.cardId ?? ''} onChange={event => update({ cardId: event.target.value || undefined })}>
        <option value="">{effect.trigger === 'card' ? label('Choose a card', '选择卡片') : label('All cards', '所有卡片')}</option>
        {missingCard && <option value={effect.cardId}>{label('Missing card', '卡片已移除')}</option>}
        {props.cards.map(card => <option key={card.id} value={card.id}>{card.title || card.note || card.kind}</option>)}
      </select>
    </label>
    {(effect.trigger === 'run' || effect.trigger === 'card') && <label>{label('Time in seconds', '第几秒')}
      <input className={control} type="number" min="0" step="0.1" value={effect.atMs / 1000}
        onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) update({ atMs: Math.max(0, Math.round(event.target.valueAsNumber * 1000)) }); }} />
    </label>}
    <label>{label('Where to play', '在哪里出现')}
      <select className={control} value={effect.anchor} onChange={event => update({ anchor: event.target.value as StageEffectConfig['anchor'] })}>
        <option value="event">{label('Event position', '事件发生的位置')}</option>
        <option value="hero">{label('Character position', '角色当时的位置')}</option>
        <option value="fixed">{label('Fixed stage position', '舞台固定坐标')}</option>
      </select>
    </label>
    <p className="text-slate-600">{effect.anchor === 'fixed'
      ? label('Drag the marker to set its position.', '拖动坐标图中的标记设置位置。')
      : label('The marker shows size. Playback uses the event or character position.', '坐标图中的标记展示大小，播放时使用事件或角色的位置。')}</p>
    <label>{label('Duration in seconds', '持续秒数')}
      <input className={control} type="number" min="0.1" max="30" step="0.1" value={effect.durationMs / 1000}
        onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) update({ durationMs: Math.max(100, Math.min(30000, Math.round(event.target.valueAsNumber * 1000))) }); }} />
    </label>
    <label>{label('Opacity', '不透明度')}
      <input className="w-full" type="range" min="0" max="1" step="0.05" value={effect.opacity} onChange={event => update({ opacity: Number(event.target.value) })} />
    </label>
    <label><input type="checkbox" checked={effect.fade} onChange={event => update({ fade: event.target.checked })} /> {label('Fade out', '淡出')}</label>
    <label><input type="checkbox" checked={effect.sound} onChange={event => update({ sound: event.target.checked })} /> {label('Play attached sound', '播放素材附带音效')}</label>
    <button type="button" disabled={props.missingAsset} className={control} onClick={() => props.onPreview(id)}>{label('Preview effect', '预览特效')}</button>
  </div>;
}

export function StageEffectTimeline(props: {
  lang: Language; layout: StageLayout; cards: BoardNode[]; onlyId: string | null;
  onUpdate: (id: string, patch: StagePlacement) => void;
  onSelect: (id: string) => void; onRemove: (id: string) => void;
}) {
  const zh = props.lang === 'zh';
  const entries = effectEntries(props.layout).filter(([id, placement]) => id === props.onlyId && ['run', 'card'].includes(placement.effect!.trigger));
  if (!entries.length) return null;
  return <section className="grid gap-2 rounded-xl border p-3 text-xs" aria-label={zh ? '定时特效' : 'Timed effects'}>
    <h3 className="font-semibold">{zh ? '定时特效' : 'Timed effects'}</h3>
    {entries.sort((a, b) => a[1].effect!.atMs - b[1].effect!.atMs).map(([id, placement]) => {
      const effect = placement.effect!;
      const card = props.cards.find(item => item.id === effect.cardId);
      return <div key={id} className="flex flex-wrap items-center gap-2">
        <span>{effect.trigger === 'run' ? (zh ? '开局后' : 'After start') : (card?.title || card?.note || (zh ? '选择卡片' : 'Choose card'))}</span>
        <label>{zh ? '秒' : 'Seconds'} <input className="w-20 rounded border px-2 py-1" type="number" min="0" step="0.1" value={effect.atMs / 1000}
          onChange={event => { if (Number.isFinite(event.target.valueAsNumber)) props.onUpdate(id, { effect: { ...effect, atMs: Math.max(0, Math.round(event.target.valueAsNumber * 1000)) } }); }} /></label>
        <button type="button" className="rounded border px-2 py-1" onClick={() => props.onSelect(id)}>{zh ? '查看特效' : 'Edit effect'}</button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => props.onRemove(id)}>{zh ? '删除' : 'Delete'}</button>
      </div>;
    })}
  </section>;
}
