import type { Language } from '../../../shared/i18n';
import type { AssetItem } from '../asset-library/assetLibraryModel';
import { backgroundTransition, getBackgroundImage, type BackgroundBoundary, type BackgroundSegment, type SceneBackground } from './stageBackground';

const colors = ['#dbeafe', '#dcfce7', '#fef3c7', '#fae8ff', '#1e293b'];
const modes = ['inherit', 'color', 'segments'] as const;

export type BackgroundTool = 'add' | 'replace' | 'frame' | null;

interface StageBackgroundSettingsProps {
  lang: Language;
  background: SceneBackground;
  assets: AssetItem[];
  segments: BackgroundSegment[];
  segment?: BackgroundSegment;
  boundary?: BackgroundBoundary;
  tool: BackgroundTool;
  pendingAsset?: string;
  notice: string;
  onChange: (background: SceneBackground) => void;
  onTool: (tool: BackgroundTool) => void;
  onAsset: (id: string) => void;
  onPlaceInView: () => void;
  onRemoveSegment: () => void;
  onResetFrame: () => void;
  onSaveFrame: () => void;
  onSaveFrameAndAdd: () => void;
  onCancelFrame: () => void;
  onMoveSection: (id: string, x: number) => void;
  onMoveBoundary: (boundary: BackgroundBoundary, x: number) => void;
  onTransition: (id: string, width: number) => void;
}

export function StageBackgroundSettings({
  lang, background, assets, segments, segment, boundary, tool, pendingAsset, notice, onChange, onTool, onAsset, onPlaceInView,
  onRemoveSegment, onResetFrame, onSaveFrame, onSaveFrameAndAdd, onCancelFrame, onMoveSection, onMoveBoundary, onTransition,
}: StageBackgroundSettingsProps) {
  const l = (en: string, zh: string) => lang === 'zh' ? zh : en;
  const modeLabels = [l('Follow Board', '跟随设计板'), l('Solid color', '纯色'), l('Background sections', '分段背景')];
  const mode = background.mode === 'tile' ? 'segments' : background.mode;
  const images = assets.flatMap(asset => {
    if (asset.categoryId !== 'backgrounds') return [];
    const state = getBackgroundImage(asset);
    return state ? [{ asset, url: state.mediaUrl }] : [];
  });
  const assetName = (id: string) => assets.find(asset => asset.id === id)?.name ?? l('Missing background', '素材已不可用');
  const left = segments.find(item => item.id === boundary?.leftId);
  const right = segments.find(item => item.id === boundary?.rightId);
  const maximumFade = left && right ? Math.min(left.end - left.start, right.end - right.start) : 0;
  const fade = backgroundTransition(left, right);
  const framing = tool === 'frame';
  const chooseAsset = tool === 'add' || tool === 'replace' || !segments.length;

  return <section id="stage-background-settings" className="stage-inline-panel" aria-label={l('Background settings', '背景设置')}>
    <div className="stage-row" role="group" aria-label={l('Background type', '背景类型')}>
      {modes.map((option, index) => (
        <button key={option} type="button" aria-pressed={mode === option} disabled={framing}
          onClick={() => onChange({ ...background, mode: option })}>
          {modeLabels[index]}
        </button>
      ))}
    </div>
    {mode !== 'inherit' && <div className="stage-background-colors">
      <label className="stage-color-picker">
        {l('Base color', '底色')}
        <input aria-label={l('Base color', '底色')} type="color" value={background.color} disabled={framing}
          onChange={event => onChange({ ...background, color: event.target.value })} />
        <code>{background.color}</code>
      </label>
      <div className="stage-row" role="group" aria-label={l('Preset colors', '预设颜色')}>
        {colors.map(color => (
          <button key={color} type="button" className="stage-color-swatch" style={{ backgroundColor: color }} disabled={framing}
            aria-label={color} aria-pressed={background.color === color}
            onClick={() => onChange({ ...background, color })} />
        ))}
      </div>
    </div>}
    {mode === 'segments' && <>
      {segments.length > 0 && !framing && <div className="stage-row">
        <button type="button" aria-pressed={tool === 'add'} onClick={() => onTool(tool === 'add' ? null : 'add')}>
          {l('Add background section', '＋ 添加背景段')}
        </button>
        {segment && <>
          <strong title={assetName(segment.assetId)}>{assetName(segment.assetId)} · {segment.start}–{segment.end}</strong>
          {segment.imagePlacement && <small>{l('Image locked', '取景已锁定')}</small>}
          <button type="button" aria-pressed={tool === 'replace'} onClick={() => onTool(tool === 'replace' ? null : 'replace')}>{l('Replace image', '换素材')}</button>
          <button type="button" onClick={() => onTool('frame')}>
            {segment.imagePlacement ? l('Unlock and edit', '解锁并编辑') : l('Edit background image', '编辑背景图')}
          </button>
          <button type="button" onClick={onRemoveSegment}>{l('Remove section', '移除此段')}</button>
        </>}
      </div>}
      {segment && !framing && tool === null && <div className="stage-row stage-background-boundary-controls">
        <label>{l('Section start', '分段起点')} <input type="number" min="0" aria-label={l('Section start', '分段起点')} value={segment.start}
          onChange={event => { if (event.target.value !== '') onMoveSection(segment.id, Number(event.target.value)); }} /></label>
        <small>{l('Drag the whole section on the stage or map to move it. Drag its edges to adjust the seam.',
          '在舞台或总览拖动整段可移动位置，拖动总览上的分段边缘可调整接缝。')}</small>
      </div>}
      {framing && segment && <div className="stage-object-details">
        <div className="stage-row">
          <strong>{assetName(segment.assetId)}</strong>
          <button type="button" className="stage-primary" onClick={onSaveFrame}>{l('Save and lock', '保存并锁定')}</button>
          <button type="button" onClick={onSaveFrameAndAdd}>{l('Save and add section', '保存并添加下一段')}</button>
          <button type="button" onClick={onCancelFrame}>{l('Cancel', '取消')}</button>
          <button type="button" onClick={onResetFrame}>{l('Fit to section', '适配分段')}</button>
        </div>
        <small>{l('Drag to adjust the image within this section. Drag a square corner to scale it.', '拖动可调整此段内的取景，拖动方形角点可等比例缩放。')}</small>
      </div>}
      {boundary && <div className="stage-row stage-background-boundary-controls">
        <strong>{left && right ? l('Join', '接缝') : l('Section edge', '分段边界')} · {boundary.x}</strong>
        <label>{l('Position', '位置')} <input type="number" aria-label={l('Boundary position', '边界位置')} value={boundary.x}
          onChange={event => { if (event.target.value !== '') onMoveBoundary(boundary, Number(event.target.value)); }} /></label>
        {left && right && <>
          <button type="button" aria-pressed={fade === 0} onClick={() => onTransition(right.id, 0)}>{l('Hard cut', '直接拼接')}</button>
          <button type="button" aria-pressed={fade > 0} onClick={() => onTransition(right.id, Math.min(80, maximumFade))}>{l('Crossfade', '渐变过渡')}</button>
          {fade > 0 && <label>{l('Fade width', '过渡宽度')} <input type="number" min="1" max={maximumFade} value={fade}
            aria-label={l('Fade width', '过渡宽度')}
            onChange={event => { if (event.target.value !== '') onTransition(right.id, Math.min(maximumFade, Math.max(1, Math.round(Number(event.target.value))))); }} /></label>}
        </>}
      </div>}
      {notice && <p className="stage-panel-hint" role="status">{notice}</p>}
      {chooseAsset && <>
        {pendingAsset ? <div className="stage-row">
          <small>{l('Click the stage or map to place', '点击舞台或关卡总览放置')} {assetName(pendingAsset)}
            {l('. Placing it on another section splits that section.', '。放在已有背景上可分割原段。')}</small>
          <button type="button" onClick={onPlaceInView}>{l('Place in current view', '在当前视野放置')}</button>
          <button type="button" onClick={() => onTool(null)}>{l('Cancel', '取消')}</button>
        </div> : <small>{tool === 'replace' ? l('Choose a replacement image.', '选择替换素材。') : l('Choose an image for the new section.', '选择新背景段的素材。')}</small>}
        {images.length ? <div className="stage-background-assets" role="group" aria-label={l('Background assets', '背景素材')}>
          {images.map(({ asset, url }) => (
            <button key={asset.id} type="button" aria-pressed={(pendingAsset ?? (tool === 'replace' ? segment?.assetId : undefined)) === asset.id}
              onClick={() => onAsset(asset.id)}>
              <img src={url} alt="" />
              <span>{asset.name}</span>
            </button>
          ))}
        </div> : <small>{l('Add a background image in My Game Assets.', '在左侧素材库添加一张背景图片。')}</small>}
      </>}
    </>}
  </section>;
}
