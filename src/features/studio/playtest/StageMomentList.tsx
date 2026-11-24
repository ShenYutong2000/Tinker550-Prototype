import type { Language } from '../../../shared/i18n';
import { applyStageMoments, dueMoments, momentSecond, type StageMoment } from './stageMoments';
import { DECORATION_POSE, HERO_POSE, challengePose, type StageLayout } from './stageLayout';

interface Props {
  lang: Language;
  moments: StageMoment[];
  onlyId: string | null;
  opening: StageLayout;
  assets: { id: string; name: string; categoryId: string }[];
  cardName: (id: string) => string;
  targetName: (id: string) => string;
  cardBackground?: string;
  targetImage: (id: string) => string | undefined;
  missingCard: (id: string) => boolean;
  failedBackgrounds: string[];
  getImage: (id: string) => string | undefined;
  onUpdate: (moment: StageMoment) => void;
  onDelete: (id: string) => void;
  onRestart: () => void;
  canPlay: boolean;
}

export function StageMomentList(props: Props) {
  const zh = props.lang === 'zh';
  const label = (en: string, cn: string) => zh ? cn : en;
  const control = 'rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-40';
  const panels = [
    { id: undefined, title: label('From start', '从开局计时') },
    ...Array.from(new Set(props.moments.flatMap(moment => moment.cardId ? [moment.cardId] : []))).map(id => ({
      id, title: label('After entering ', '进入卡片后 · ') + props.cardName(id),
    })),
  ];

  const sample = (moment: StageMoment, layout: StageLayout) => {
    if (moment.field === 'background') {
      const { assetId, color } = layout.background;
      const image = color ? undefined : assetId ? props.getImage(assetId) : props.cardBackground;
      return <div className="flex h-11 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-100 text-[10px]"
        style={{ backgroundColor: color }}>
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : !color && label('Card background', '沿用卡片背景')}
      </div>;
    }
    const pose = layout.placements[moment.target];
    const defaults = moment.target === 'hero' ? HERO_POSE : moment.target.startsWith('decoration:') ? DECORATION_POSE : challengePose(false);
    const width = pose?.width ?? defaults.width;
    const height = pose?.height ?? defaults.height;
    const image = (pose?.assetId && props.getImage(pose.assetId)) || props.targetImage(moment.target);
    return <div className="flex h-11 items-center justify-center gap-1 rounded border border-slate-200 text-[10px]">
      <div className="shrink-0 rounded bg-sky-100 bg-center bg-contain bg-no-repeat"
        style={{ width: Math.min(32, width / 4), height: Math.min(32, height / 4), backgroundImage: image ? 'url("' + image + '")' : undefined }} />
      <span>{width} × {height}</span>
    </div>;
  };

  if (!props.moments.some(moment => moment.id === props.onlyId)) return null;
  return <section aria-label={label('Timed changes', '定时变化')} className="space-y-3 rounded-xl border border-slate-200 p-3">
    {props.moments.length === 0 && <p className="text-xs text-slate-600">
      {label('Pause, change the scene, and save a time to see it here.', '暂停后修改画面，把改动保存到某一刻。')}
    </p>}
    {panels.map(panel => {
      const entries = props.moments.filter(moment => moment.cardId === panel.id);
      if (!entries.some(moment => moment.id === props.onlyId)) return null;
      return <div key={panel.id ?? 'start'} className="space-y-2">
        <h3 className="text-xs font-semibold">{panel.title}</h3>
        {entries.filter(moment => moment.id === props.onlyId).map(moment => {
          const earlier = dueMoments(entries, { runMs: moment.atMs - 1, cardId: moment.cardId, cardMs: moment.atMs - 1 });
          const before = applyStageMoments(props.opening, earlier);
          const after = applyStageMoments(before, [moment]);
          const lostAsset = moment.field === 'background' && moment.value.assetId &&
            (!props.getImage(moment.value.assetId) || props.failedBackgrounds.includes(moment.value.assetId));
          return <article key={moment.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
            <strong>{props.targetName(moment.target)}{moment.field === 'size' && label(' · Appearance size', ' · 外观大小')}</strong>
            <div className="grid grid-cols-2 gap-2 text-slate-600">
              <div>{label('Before', '变化前')}{sample(moment, before)}</div>
              <div>{label('After', '变化后')}{sample(moment, after)}</div>
            </div>
            {moment.cardId && props.missingCard(moment.cardId) && <p className="text-amber-800">{label('The source card is unavailable.', '找不到来源卡片。')}</p>}
            {lostAsset && <label className="grid gap-1 text-amber-800">
              {label('Background unavailable. Choose another.', '背景不可用，请重新选择。')}
              <select className={control} value="" onChange={event => {
                if (event.target.value) props.onUpdate({ ...moment, field: 'background', value: { assetId: event.target.value } });
              }}>
                <option value="">{label('Choose an asset', '选择素材')}</option>
                {props.assets.filter(asset => asset.categoryId === 'backgrounds' && props.getImage(asset.id) && !props.failedBackgrounds.includes(asset.id))
                  .map(asset => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
              </select>
            </label>}
            <div className="flex flex-wrap items-end justify-between gap-2">
              <label className="grid gap-1">{label('Time (s)', '时间（秒）')}
                <input className={control + ' w-24'} type="number" min="0" step="any" key={moment.atMs}
                  defaultValue={momentSecond(moment.atMs)} onKeyDown={event => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }} onBlur={event => {
                    const seconds = event.currentTarget.valueAsNumber;
                    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(Math.round(seconds * 1000))) {
                      event.currentTarget.value = momentSecond(moment.atMs);
                      return;
                    }
                    const atMs = Math.round(seconds * 1000);
                    if (atMs !== moment.atMs) props.onUpdate({ ...moment, atMs });
                  }} />
              </label>
              <button type="button" className={control} onClick={() => props.onDelete(moment.id)}>{label('Delete', '删除')}</button>
            </div>
          </article>;
        })}
      </div>;
    })}
  </section>;
}
