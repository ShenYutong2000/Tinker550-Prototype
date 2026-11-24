import { StageEffectControls } from './StageEffectControls';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Language } from '../../../shared/i18n';
import { NODE_CATALOG, type BoardNode } from '../design-board/studioModel';
import { GROUND_Y, getStagePlacement, stageBounds, stagePoint, stagePosition, WORLD_H, WORLD_W, type StageEditorSection, type StageLayout, type StagePlacement, type StagePose } from './stageLayout';

export interface PlacementItem {
  id: string;
  label: string;
  pose: StagePose;
  assetId?: string;
  image?: string;
  active: boolean;
  cardId?: string;
  symbol: string;
  group: 'base' | 'gameplay' | 'decoration' | 'actor' | 'interface' | 'effect';
  readOnly?: boolean;
}

interface Props {
  lang: Language;
  items: PlacementItem[];
  editorItems: PlacementItem[];
  section: StageEditorSection;
  onSection: (section: StageEditorSection) => void;
  cards: BoardNode[];
  cardId?: string;
  onSelectCard: (id: string) => void;
  backgroundSource?: string;
  isOffstage: boolean;
  selection: string;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: StagePlacement) => void;
  onPreview: (id: string, pose: Partial<StagePose> | null) => void;
  layout: StageLayout;
  backgroundImage?: { url: string; filter?: string; opacity: number };
  assets: { id: string; name: string; categoryId: string }[];
  onBackground: (background: StageLayout['background']) => void;
  onAddEffect: (assetId: string) => void;
  onPreviewEffect: (id: string) => void;
  onAddInterface: (assetId: string) => void;
  onAddDecoration: (assetId: string) => void;
  onRemove: (id: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  onLocateCard: (id: string) => void;
  onOpenAsset: (id: string) => void;
  cardName: (id: string) => string;
  backgroundName?: string;
}

export function StagePlacementEditor(props: Props) {
  const zh = props.lang === 'zh';
  const label = (en: string, cn: string) => zh ? cn : en;
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(false);
  const [locked, setLocked] = useState(true);
  const map = useRef<SVGSVGElement>(null);
  const gesture = useRef<{
    id: string; pointer: number; start: ReturnType<typeof stagePoint>;
    pose: StagePose; resize: boolean; patch: Partial<StagePose>;
  } | null>(null);
  const selected = props.items.find(item => item.id === props.selection);
  const overlayStyle = selected && getStagePlacement(props.layout, selected.id);
  const backgroundColor = props.layout.background.color;
  const backgroundImage = backgroundColor ? undefined : props.backgroundImage;
  const tool = 'rounded border border-slate-300 px-2 py-1 text-xs bg-white disabled:opacity-40';
  // Keep the scene visible while selection only changes the inspector and handles.
  const shown = [...props.items.filter(item => item.id !== selected?.id), ...(selected ? [selected] : [])];
  const sections = [
    { id: 'card', name: label('Card visuals', '卡片画面') },
    { id: 'background', name: label('Background', '背景基础画面') },
    { id: 'decoration', name: label('Decorations', '舞台装饰') },
  ] as const;
  const activeCard = props.cards.find(card => card.id === props.cardId);


  const cancel = () => {
    if (!gesture.current) return;
    props.onPreview(gesture.current.id, null);
    gesture.current = null;
  };
  const begin = (event: PointerEvent<SVGElement>, item: PlacementItem, resize: boolean) => {
    if (event.button !== 0 || gesture.current || !map.current || item.readOnly) return;
    event.preventDefault();
    map.current.focus();
    map.current.setPointerCapture(event.pointerId);
    props.onSelect(item.id);
    gesture.current = {
      id: item.id, pointer: event.pointerId, pose: item.pose, resize, patch: {},
      start: stagePoint(map.current.getBoundingClientRect(), event.clientX, event.clientY),
    };
  };
  const size = (pose: StagePose, axis: 'width' | 'height', input: number) => {
    const minScale = Math.max(8 / pose.width, 8 / pose.height);
    const maxScale = Math.min(WORLD_W / pose.width, WORLD_H / pose.height);
    const value = Math.max(8, Math.min(axis === 'width' ? WORLD_W : WORLD_H, input));
    if (!locked) return { [axis]: Math.round(value) };
    const scale = Math.max(minScale, Math.min(maxScale, value / pose[axis]));
    return { width: Math.round(pose.width * scale), height: Math.round(pose.height * scale) };
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId || !map.current) return;
    const point = stagePoint(map.current.getBoundingClientRect(), event.clientX, event.clientY);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (dx === 0 && dy === 0 && Object.keys(drag.patch).length === 0) return;
    drag.patch = drag.resize
      ? locked ? size(drag.pose, 'width', drag.pose.width + (dx + dy) * 2 / (1 + drag.pose.height / drag.pose.width))
        : { ...size(drag.pose, 'width', drag.pose.width + dx * 2), ...size(drag.pose, 'height', drag.pose.height + dy * 2) }
      : stagePosition(drag.pose.x + dx, drag.pose.y + dy, snap ? 10 : 1, drag.id === 'hero');
    props.onPreview(drag.id, drag.patch);
  };
  const finish = (event: PointerEvent<SVGSVGElement>) => {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (Object.entries(drag.patch).some(([key, value]) => drag.pose[key as keyof StagePose] !== value)) {
      props.onUpdate(drag.id, drag.patch);
    }
    cancel();
  };
  const nudge = (dx: number, dy: number) => {
    if (selected && !selected.readOnly) props.onUpdate(selected.id, stagePosition(selected.pose.x + dx, selected.pose.y + dy, 1, selected.id === 'hero'));
  };
  const onMapKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'Escape') { cancel(); return; }
    const axis = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!axis || !selected) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    nudge(axis[0] * step, axis[1] * step);
  };

  return (
    <section aria-label={label('Arrange stage', '布置画面')} className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{label('Arrange stage', '布置画面')}</h3>
        <button className={tool} type="button" disabled={!props.canUndo} onClick={props.onUndo}>{label('Undo layout', '撤销布置')}</button>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <label><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} /> {label('Grid', '网格')}</label>
        <label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> {label('Snap to 10', '吸附到 10')}</label>
      </div>
      <div className="relative pl-5 pt-4 text-[10px] font-mono text-slate-600">
        <div className="absolute top-0 left-5 right-0 flex justify-between"><span>(0, 0)</span><span>120</span><span>240</span><span>360 X →</span></div>
        <div className="absolute left-0 top-4 bottom-0 flex flex-col justify-between"><span>0</span><span>125</span><span>250</span><span className="absolute top-full">Y↓</span></div>
        <svg ref={map} viewBox={'0 0 '+WORLD_W+' '+WORLD_H} tabIndex={0}
          aria-label={label('Coordinate layout', '坐标摆放图')} onKeyDown={onMapKey}
          className="block w-full bg-slate-50 outline-offset-2 touch-none select-none ring-1 ring-slate-300"
          onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}>
          {backgroundColor && <rect width={WORLD_W} height={WORLD_H} fill={backgroundColor} pointerEvents="none" />}
          {backgroundImage && <image href={backgroundImage.url} width={WORLD_W} height={GROUND_Y}
            preserveAspectRatio="none" opacity={backgroundImage.opacity} style={{ filter: backgroundImage.filter }}
            pointerEvents="none" />}
          {grid && <g stroke={backgroundColor || backgroundImage ? '#94a3b8' : '#dbe4ef'} strokeWidth="1" pointerEvents="none">
            {Array.from({length: 17}, (_, i) => <path key={'x'+i} d={'M '+(i+1)*20+' 0 v '+WORLD_H} />)}
            {Array.from({length: 12}, (_, i) => <path key={'y'+i} d={'M 0 '+(i+1)*20+' h '+WORLD_W} />)}
          </g>}
          {shown.map(item => {
            const { width, height, x, y } = item.pose;
            const { left, top } = stageBounds(item.pose, item.id === 'hero');
            const active = selected?.id === item.id;
            return <g key={item.id} data-stage-item={item.id}>
              <title>{item.label}{item.cardId ? ' · ' + props.cardName(item.cardId) : ''}</title>
              {active && <path d={'M 0 '+y+' H '+WORLD_W+' M '+x+' 0 V '+WORLD_H} stroke="#60a5fa" strokeDasharray="4 4" pointerEvents="none" />}
              <g onPointerDown={event => begin(event, item, false)} className={item.readOnly ? undefined : 'cursor-move'}>
                <rect x={left} y={top} width={width} height={height} rx="3" fill="#e0edff" fillOpacity=".55"
                  stroke={active ? '#2563eb' : '#94a3b8'} strokeDasharray={item.active ? undefined : '4 3'} />
                {item.image
                  ? <image href={item.image} x={left} y={top} width={width} height={height} preserveAspectRatio="none" pointerEvents="none" />
                  : <text x={x} y={top+height/2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(24, height*.7)} pointerEvents="none">{item.symbol}</text>}
              </g>
              {active && <g onPointerDown={event => begin(event, item, true)}
                aria-disabled={item.readOnly} className={item.readOnly ? 'opacity-40' : 'cursor-nwse-resize'} data-stage-resize="">
                <rect x={left+width-15} y={top+height-15} width="30" height="30" fill="transparent" />
                <rect x={left+width-5} y={top+height-5} width="10" height="10" rx="2" fill="#2563eb" stroke="white" pointerEvents="none" />
              </g>}
            </g>;
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label={label('Scene elements', '场景元素')}>
        {sections.map(section => <button type="button" key={section.id} aria-pressed={props.section === section.id}
          className={tool + ' aria-pressed:bg-sky-100 aria-pressed:border-sky-300'}
          onClick={() => props.onSection(section.id)}>{section.name}</button>)}
      </div>
      {props.section === 'card' && <>
        <label className="grid gap-1 text-xs font-semibold">{label('Card to edit', '编辑卡片')}
          <select className={tool + ' min-w-0'} value={props.cardId ?? ''} onChange={e => props.onSelectCard(e.target.value)}>
            {!props.cardId && <option value="">{label('Choose a card', '选择卡片')}</option>}
            {props.cards.map(card => <option value={card.id} key={card.id}>
              {zh ? NODE_CATALOG[card.kind].labelZh : NODE_CATALOG[card.kind].labelEn} · {props.cardName(card.id)}
            </option>)}
          </select>
        </label>
        {props.isOffstage && <p className="text-xs text-slate-600">{label('Editing another card. The paused game above stays here.', '正在编辑另一张卡片，上方仍停在当前试玩画面。')}</p>}
      </>}
      {(props.section === 'card' || props.editorItems.length > 0) && <label className="grid gap-1 text-xs font-semibold">
        {label('Element to edit', '编辑元素')}
        <select className={tool + ' min-w-0'} value={props.selection} disabled={!props.editorItems.length}
          onChange={e => props.onSelect(e.target.value)}>
          {!props.editorItems.length && <option value="">{label('No editable element yet', '暂无可编辑元素')}</option>}
          {props.editorItems.map(item => <option key={item.id} value={item.id}>{item.label}
            {!item.active && label(' · Offstage', ' · 尚未出场')}
          </option>)}
        </select>
      </label>}
      {props.section === 'card' && activeCard && !selected && <p className="text-xs text-slate-600">
        {label('Open the linked card to see what appears on stage.', '查看关联卡片，确认它在舞台上会显示什么。')}
      </p>}
      {selected ? <>
        {selected.cardId && <p className="break-words text-xs text-slate-600">
          {label('From card: ', '来自卡片：')}
          {props.cardName(selected.cardId)}
        </p>}
        {selected.group === 'decoration' && <p className="text-xs text-slate-600">
          {label('Visual only', '只布置画面')}
        </p>}
        {selected.readOnly && <p className="text-xs text-slate-600">
          {label('Preview this card before playing to arrange its character.', '这张卡片的角色当前无法在暂停画面里调整，可在开局前布置。')}
        </p>}
        <fieldset disabled={selected.readOnly} className="min-w-0 space-y-2 disabled:opacity-60">
          <legend className="text-xs font-semibold">{label('Position and size', '位置和尺寸')}</legend>
          <output className="block text-xs font-mono text-slate-600">X {selected.pose.x} · Y {selected.pose.y} · {selected.pose.width} × {selected.pose.height}</output>
        <div className="grid grid-cols-2 gap-2">
          {(['x', 'y', 'width', 'height'] as const).map(field =>
            <label key={field} className="min-w-0 grid gap-1 text-xs">
              {{x:'X', y:'Y', width:label('Width','宽度'), height:label('Height','高度')}[field]}
              <input aria-label={field} type="number" key={selected.id+'-'+field+'-'+selected.pose[field]}
                defaultValue={selected.pose[field]} className={tool+' min-w-0'}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                onBlur={e => {
                  const value = e.currentTarget.valueAsNumber;
                  if (Number.isFinite(value) && value !== selected.pose[field]) {
                    props.onUpdate(selected.id, field === 'width' || field === 'height'
                      ? size(selected.pose, field, value)
                      : stagePosition(field === 'x' ? value : selected.pose.x, field === 'y' ? value : selected.pose.y, 1, selected.id === 'hero'));
                  }
                  e.currentTarget.value = String(selected.pose[field]);
                }} />
            </label>)}
        </div>
        <div className="flex flex-wrap gap-1">
          {([[-1,0,'←'],[1,0,'→'],[0,-1,'↑'],[0,1,'↓']] as const).map(([dx,dy,arrow]) =>
            <button type="button" key={arrow} className={tool} onClick={() => nudge(dx,dy)}>{arrow}</button>)}
          <label className="self-center text-xs"><input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} /> {label('Lock ratio', '锁定比例')}</label>
        </div>
        </fieldset>
        <fieldset disabled={selected.readOnly} className="min-w-0 space-y-2 disabled:opacity-60">
          <legend className="text-xs font-semibold">{label('Style', '样式')}</legend>
          {(selected.group === 'base' || selected.group === 'interface') ? <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="grid gap-1">{label('Text size', '字号')}
            <input type="range" min="10" max="32" value={overlayStyle?.fontSize ?? 13}
              onChange={e => props.onUpdate(selected.id, { fontSize: Number(e.target.value) })} />
          </label>
          <label className="grid gap-1">{label('Text color', '文字颜色')}
            <input type="color" value={overlayStyle?.textColor ?? '#ffffff'}
              onChange={e => props.onUpdate(selected.id, { textColor: e.target.value })} />
          </label>
          <label className="grid gap-1">{label('Panel color', '底板颜色')}
            <input type="color" value={overlayStyle?.panelColor ?? '#0f172a'}
              onChange={e => props.onUpdate(selected.id, { panelColor: e.target.value })} />
          </label>
        </div> : (selected.group === 'decoration' || selected.group === 'effect') ? <label className="grid gap-1 text-xs">{label('Appearance', '造型')}
          <select value={selected.assetId ?? ''} className={tool} onChange={e => props.onUpdate(selected.id, { assetId: e.target.value })}>
            <option value="">{label('Default appearance', '默认造型')}</option>
            {selected.assetId && !props.assets.some(asset => asset.id === selected.assetId) && <option value={selected.assetId}>{label('Choose replacement', '重新选择素材')}</option>}
            {props.assets.filter(asset => selected?.group === 'effect' ? asset.categoryId === 'effects' : asset.categoryId !== 'backgrounds')
              .map(asset => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
          </select>
        </label> : <div className="flex items-center gap-2 text-xs text-slate-600">
          {selected.image && <img src={selected.image} alt="" className="h-8 w-8 shrink-0 object-contain" />}
          <span>{props.assets.find(asset => asset.id === selected.assetId)?.name ??
            label('Default appearance', '默认造型')}</span>
        </div>}
        </fieldset>
        <div className="flex flex-wrap gap-1">
          {selected.assetId && props.assets.some(asset => asset.id === selected.assetId) && <button type="button" className={tool} onClick={() => props.onOpenAsset(selected.assetId!)}>{label('Edit asset', '去素材库编辑')}</button>}
          {(props.layout.decorations.includes(selected.id) || selected.group === 'interface' || selected.group === 'effect') && <button type="button" className={tool} onClick={() => props.onRemove(selected.id)}>{selected.group === 'effect' ? label('Remove effect','移除特效') : selected.group === 'interface' ? label('Remove interface','移除界面') : label('Remove decoration', '移除装饰')}</button>}
        </div>
      </> : props.section === 'background' && <div className="flex flex-wrap items-end gap-2">
        <p className="w-full break-words text-xs text-slate-600">
          {props.layout.background.color ? label('Solid color', '纯色') : props.backgroundName ?? label('From cards or default', '沿用卡片或默认背景')}
          {props.backgroundSource && ' · ' + label('From: ', '来自：') + props.backgroundSource}
        </p>
        <label className="grid gap-1 text-xs">{label('Background', '背景')}
          <select className={tool} value={props.layout.background.assetId ?? ''} onChange={e => props.onBackground({assetId:e.target.value || undefined})}>
            <option value="">{label('From cards', '沿用卡片')}</option>
            {props.layout.background.assetId && !props.assets.some(asset => asset.id === props.layout.background.assetId) && <option value={props.layout.background.assetId}>{label('Choose replacement', '重新选择素材')}</option>}
            {props.assets.filter(asset => asset.categoryId === 'backgrounds').map(asset => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs">{label('Solid color', '纯色')}
          <input type="color" value={props.layout.background.color ?? '#1e293b'} onChange={e => props.onBackground({color:e.target.value})} />
        </label>
        <button type="button" className={tool} onClick={() => props.onBackground({})}>{label('Reset background', '还原背景')}</button>
      </div>}
      {selected?.group === 'base' && <label className="grid gap-1 text-xs">{label('Interface asset','界面素材')}<select className={tool} value={selected.assetId ?? ''} onChange={e=>props.onUpdate(selected.id,{assetId:e.target.value || undefined})}><option value="">{label('Original style','原有样式')}</option>{props.assets.filter(a=>a.categoryId==='interface').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
      {props.section === 'effect' && <label className="grid gap-1 text-xs">{label('+ Add effect','＋ 添加特效')}
        <select className={tool} value="" onChange={event => { if(event.target.value) props.onAddEffect(event.target.value); }}>
          <option value="">{label('Choose effect asset','选择特效素材')}</option>
          {props.assets.filter(asset => asset.categoryId === 'effects').map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
      </label>}
      {selected?.group === 'effect' && overlayStyle?.effect && <StageEffectControls lang={props.lang} id={selected.id} placement={overlayStyle}
        cards={props.cards} missingAsset={!props.assets.some(asset => asset.id === selected.assetId)} onUpdate={props.onUpdate} onPreview={props.onPreviewEffect} />}
      {props.section === 'interface' && <label className="grid gap-1 text-xs">{label('+ Add interface','＋ 添加界面')}<select className={tool} value="" onChange={e=>{if(e.target.value) props.onAddInterface(e.target.value);}}><option value="">{label('Choose interface asset','选择界面素材')}</option>{props.assets.filter(a=>a.categoryId==='interface').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
      {selected?.group === 'interface' && overlayStyle?.ui && <div className="grid gap-2 text-xs">
        <label>{label('Use as','用途')}<select className={tool} value={overlayStyle.ui.usage} onChange={e=>props.onUpdate(selected.id,{ui:{...overlayStyle.ui!,usage:e.target.value as 'text'}})}>{['text','icon','score','hp','button'].map((v,i)=><option key={v} value={v}>{label(['Text','Icon','Score','Life','Button'][i],['文字','图标','分数','生命','按钮'][i])}</option>)}</select></label>
        <label>{label('Text','文字')}<input className={tool} value={overlayStyle.ui.text} onChange={e=>props.onUpdate(selected.id,{ui:{...overlayStyle.ui!,text:e.target.value}})} /></label>
        <label>{label('Show in','出现范围')}<select className={tool} value={overlayStyle.ui.cardId ?? ''} onChange={e=>props.onUpdate(selected.id,{ui:{...overlayStyle.ui!,cardId:e.target.value || undefined}})}><option value="">{label('Whole game','整局')}</option>{props.cards.map(c=><option key={c.id} value={c.id}>{props.cardName(c.id)}</option>)}</select></label>
        {['score','hp'].includes(overlayStyle.ui.usage) && <>
        <label>{label('Display','显示方式')}<select className={tool} value={overlayStyle.ui.display} onChange={e=>props.onUpdate(selected.id,{ui:{...overlayStyle.ui!,display:e.target.value as 'number'}})}>{['number','icon','bar'].map((v,i)=><option key={v} value={v}>{label(['Number','Icon and number','Bar'][i],['数字','图标加数字','进度条'][i])}</option>)}</select></label>
        <label>{label('Full value','满格值')}<input className={tool} type="number" min="1" value={overlayStyle.ui.maximum} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber)) props.onUpdate(selected.id,{ui:{...overlayStyle.ui!,maximum:Math.max(1,e.target.valueAsNumber)}});}} /></label></>}
        {overlayStyle.ui.usage==='button' && <label>{label('On click','点击操作')}<select className={tool} value={overlayStyle.ui.action} onChange={e=>props.onUpdate(selected.id,{ui:{...overlayStyle.ui!,action:e.target.value as 'start'}})}>{['start','advance','restart'].map((v,i)=><option key={v} value={v}>{label(['Start','Continue dialogue','Restart'][i],['开始游戏','继续对话','重新试玩'][i])}</option>)}</select></label>}
      </div>}
      {props.section === 'card' && activeCard && <button type="button" className={tool} onClick={() => props.onLocateCard(activeCard.id)}>
        {label('Find card', '查看关联卡片')}
      </button>}
      {props.section === 'decoration' && <label className="grid gap-1 text-xs">{label('+ Add decoration', '＋ 添加装饰')}
        <select className={tool} value="" onChange={e => { if (e.target.value) props.onAddDecoration(e.target.value); }}>
          <option value="">{label('Choose an asset', '选择素材')}</option>
          {props.assets.filter(asset => asset.categoryId !== 'backgrounds').map(asset => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
        </select>
      </label>}
    </section>
  );
}
