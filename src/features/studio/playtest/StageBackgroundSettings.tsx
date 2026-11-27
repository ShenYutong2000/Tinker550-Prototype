import { Check, Image, Layers, Lock, Plus, Square, Unlock } from 'lucide-react';
import type { Language } from '../../../shared/i18n';
import type { AssetItem } from '../asset-library/assetLibraryModel';
import { getBackgroundImage, type BackgroundColor, type BackgroundElement, type BackgroundImage, type FreeBackground } from './stageBackground';

export type BackgroundTool =
  | { kind: 'add' | 'images' }
  | { kind: 'image'; assetId: string }
  | { kind: 'color'; color: string }
  | null;

interface SettingsProps {
  lang: Language;
  assets: AssetItem[];
  background: FreeBackground;
  tool: BackgroundTool;
  notice?: 'loading' | 'unavailable';
  onTool: (tool: BackgroundTool) => void;
  onColor: (color: string) => void;
  onDone: () => void;
}

export function StageBackgroundSettings({ lang, assets, background, tool, notice, onTool, onColor, onDone }: SettingsProps) {
  const l = (en: string, zh: string) => lang === 'zh' ? zh : en;
  const images = assets.flatMap(asset => {
    if (asset.categoryId !== 'backgrounds') return [];
    const slot = getBackgroundImage(asset);
    return slot ? [{ asset, url: slot.mediaUrl }] : [];
  });
  return <section id="stage-background-settings" className="stage-inline-panel stage-background-editor" aria-label={l('Edit background', '编辑背景')}>
    <div className="stage-row stage-background-tools">
      <label className="stage-background-color-button">{l('Base color', '底色')}
        <input type="color" aria-label={l('Base color', '底色')} value={background.color} onInput={event => onColor(event.currentTarget.value)} />
      </label>
      <button type="button" className="stage-add" aria-expanded={Boolean(tool)} onClick={() => onTool(tool ? null : { kind: 'add' })}>
        <Plus size={15} aria-hidden="true" />{l('Add', '添加')}
      </button>
      <button type="button" className="stage-add stage-primary stage-background-done" onClick={onDone}>
        <Check size={15} aria-hidden="true" />{l('Done', '完成')}
      </button>
    </div>

    {tool?.kind === 'add' && <div className="stage-row">
      <button type="button" className="stage-add" onClick={() => onTool({ kind: 'images' })}><Image size={14} />{l('Image', '图片')}</button>
      <button type="button" className="stage-add" onClick={() => onTool({ kind: 'color', color: '#91b877' })}><Square size={14} />{l('Color block', '色块')}</button>
    </div>}

    {(tool?.kind === 'images' || tool?.kind === 'image') && <>
      <div className="stage-row stage-background-placement-hint">
        <p role="status">{tool.kind === 'image' ? l('Click the stage to place the image.', '点击舞台放置图片。') : l('Choose a background image.', '选择一张背景图片。')}</p>
        <button type="button" onClick={() => onTool(null)}>{l('Cancel', '取消')}</button>
      </div>
      {images.length > 0 ? <div className="stage-background-assets" role="group" aria-label={l('Background images', '背景图片')}>
        {images.map(({ asset, url }) => <button key={asset.id} type="button"
          aria-pressed={tool.kind === 'image' && tool.assetId === asset.id}
          onClick={() => onTool({ kind: 'image', assetId: asset.id })}>
          <img src={url} alt="" /><span>{asset.name}</span>
        </button>)}
      </div> : <p className="stage-panel-hint">{l('Add a background image in the asset library first.', '先在左侧素材库添加一张背景图片。')}</p>}
    </>}

    {tool?.kind === 'color' && <div className="stage-row stage-background-placement-hint">
      <label className="stage-background-color-button">{l('Block color', '色块颜色')}
        <input type="color" aria-label={l('Block color', '色块颜色')} value={tool.color}
          onInput={event => onTool({ kind: 'color', color: event.currentTarget.value })} />
      </label>
      <p role="status">{l('Drag on the stage to draw a block.', '在舞台上拖出一个色块。')}</p>
      <button type="button" onClick={() => onTool(null)}>{l('Cancel', '取消')}</button>
    </div>}
    {notice && <p role="status" className="stage-panel-hint">
      {notice === 'loading' ? l('Loading the background image…', '正在载入背景图片…') : l('This background image could not be loaded.', '这张背景图片无法载入。')}
    </p>}
  </section>;
}

export type BackgroundChange = Partial<Pick<BackgroundImage, 'x' | 'y' | 'width' | 'height' | 'locked' | 'opacity' | 'feather' | 'crop'> & Pick<BackgroundColor, 'color'>>;
interface InspectorProps {
  lang: Language;
  assets: AssetItem[];
  elements: BackgroundElement[];
  selected?: BackgroundElement;
  onSelect: (id: string) => void;
  onChange: (change: BackgroundChange) => void;
  onMoveLayer: (direction: -1 | 1) => void;
  onRemove: () => void;
  onShowFullImage: () => void;
}

export function BackgroundItemInspector({ lang, assets, elements, selected, onSelect, onChange, onMoveLayer, onRemove, onShowFullImage }: InspectorProps) {
  const l = (en: string, zh: string) => lang === 'zh' ? zh : en;
  const index = elements.findIndex(item => item.id === selected?.id);
  const itemName = (item: BackgroundElement) => item.kind === 'color'
    ? l('Color block', '色块') : assets.find(asset => asset.id === item.assetId)?.name ?? l('Missing image', '图片不可用');
  return <aside className="stage-inspector stage-background-inspector" aria-label={l('Background element', '背景元素')}>
    {selected ? <>
      <div className="stage-row stage-background-element-heading">
        <h3>{itemName(selected)}</h3>
        <button type="button" className="stage-add" aria-pressed={Boolean(selected.locked)} onClick={() => onChange({ locked: !selected.locked })}>
          {selected.locked ? <Unlock size={14} /> : <Lock size={14} />}
          {selected.locked ? l('Unlock', '解锁') : l('Lock', '锁定')}
        </button>
      </div>
      <div className="stage-background-dimensions">
        {(['x', 'y', 'width', 'height'] as const).map((field, i) => {
          const label = ['X', 'Y', l('Width', '宽'), l('Height', '高')][i];
          return <label key={field}>{label}
            <input type="number" aria-label={l('Background ', '背景') + label} step="any"
              min={i >= 2 ? 8 : undefined} disabled={selected.locked} value={Math.round(selected[field] * 10) / 10}
              onChange={event => {
                if (event.currentTarget.value !== '') onChange({ [field]: i >= 2 ? Math.max(8, Number(event.currentTarget.value)) : Number(event.currentTarget.value) });
              }} />
          </label>;
        })}
      </div>
      {selected.kind === 'color' && <label className="stage-background-color-button">{l('Color', '颜色')}
        <input type="color" aria-label={l('Selected block color', '所选色块颜色')} value={selected.color}
          onInput={event => onChange({ color: event.currentTarget.value })} />
      </label>}
    </> : <small>{l('Select a picture or color block on the stage.', '在舞台上选中一张图片或一个色块。')}</small>}
    {elements.length > 0 && <details className="stage-background-layers">
      <summary><Layers size={14} aria-hidden="true" />{l('Layers & blending', '层级与混合')}</summary>
      <label>{l('Layer', '图层')}
        <select aria-label={l('Background layer', '背景图层')} value={selected?.id ?? ''} onChange={event => onSelect(event.currentTarget.value)}>
          <option value="" disabled>{l('Select a layer', '选择图层')}</option>
          {[...elements].reverse().map((item, i) => <option key={item.id} value={item.id}>
            {itemName(item)}{itemsWithSameName(elements, itemName(item), itemName) > 1 ? ' · ' + (elements.length - i) : ''}
          </option>)}
        </select>
      </label>
      {selected && <>
        <div className="stage-row">
          <button type="button" disabled={index === elements.length - 1} onClick={() => onMoveLayer(1)}>{l('Bring forward', '上移一层')}</button>
          <button type="button" disabled={index === 0} onClick={() => onMoveLayer(-1)}>{l('Send backward', '下移一层')}</button>
          {selected.kind === 'image' && selected.crop && <button type="button" disabled={selected.locked} onClick={onShowFullImage}>{l('Show full image', '显示完整图片')}</button>}
          <button type="button" className="stage-background-remove" onClick={onRemove}>{l('Remove', '移除')}</button>
        </div>
        <label>{l('Opacity', '透明度')} <input type="number" aria-label={l('Background opacity', '背景透明度')} min="0" max="100" step="any"
          value={Math.round((selected.opacity ?? 1) * 1000) / 10}
          onChange={event => {
            if (event.currentTarget.value !== '') onChange({ opacity: Math.max(0, Math.min(1, Number(event.currentTarget.value) / 100)) });
          }} />%</label>
        {selected.kind === 'image' && <label>{l('Left edge feather', '左边缘羽化')}
          <input type="number" aria-label={l('Left edge feather', '左边缘羽化')} min="0" max={selected.width} step="any" value={selected.feather ?? 0}
            onChange={event => {
              if (event.currentTarget.value !== '') onChange({ feather: Math.max(0, Math.min(selected.width, Number(event.currentTarget.value))) });
            }} />
        </label>}
      </>}
    </details>}
  </aside>;
}

function itemsWithSameName(items: BackgroundElement[], name: string, itemName: (item: BackgroundElement) => string) {
  return items.filter(item => itemName(item) === name).length;
}
