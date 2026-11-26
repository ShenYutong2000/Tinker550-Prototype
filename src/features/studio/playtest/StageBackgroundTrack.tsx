import { useRef, useState, type PointerEvent } from 'react';
import type { Language } from '../../../shared/i18n';
import type { AssetItem } from '../asset-library/assetLibraryModel';
import { backgroundBoundaries, backgroundRangeAt, backgroundTransition, getBackgroundImage, type BackgroundBoundary, type BackgroundSegment } from './stageBackground';

interface StageBackgroundTrackProps {
  lang: Language;
  width: number;
  preferredWidth: number;
  color: string;
  assets: AssetItem[];
  segments: BackgroundSegment[];
  segmentId?: string;
  boundaryId?: string;
  pendingAsset?: string;
  editingImage?: boolean;
  onSelect: (id: string) => void;
  onBoundary: (boundary: BackgroundBoundary) => void;
  onMove: (boundary: BackgroundBoundary, x: number, snap?: number) => void;
  onPlace: (x: number) => void;
}

export function StageBackgroundTrack(props: StageBackgroundTrackProps) {
  const { lang, width, preferredWidth, color, assets, segments, segmentId, boundaryId, pendingAsset, onSelect, onBoundary, onMove, onPlace } = props;
  const l = (en: string, zh: string) => lang === 'zh' ? zh : en;
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ boundary: BackgroundBoundary; pointerId: number; offset: number } | undefined>(undefined);
  const [hover, setHover] = useState<number>();
  const boundaries = backgroundBoundaries(segments);
  const preview = pendingAsset && hover !== undefined ? backgroundRangeAt(segments, width, hover, preferredWidth) : null;
  const percent = (x: number) => x / width * 100 + '%';
  const assetById = new Map(assets.map(asset => [asset.id, asset]));
  const position = (event: PointerEvent) => {
    const rect = rail.current!.getBoundingClientRect();
    return (event.clientX - rect.left) * width / rect.width;
  };

  const beginDrag = (event: PointerEvent<HTMLButtonElement>, boundary: BackgroundBoundary) => {
    if (props.editingImage || event.button !== 0) return;
    const x = position(event);
    if (pendingAsset && backgroundRangeAt(segments, width, x, preferredWidth)) {
      onPlace(x);
      return;
    }
    drag.current = { boundary, pointerId: event.pointerId, offset: x - boundary.x };
    rail.current?.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointerId === event.pointerId) {
      onMove(current.boundary, position(event) - current.offset, Math.min(24, width * 7 / event.currentTarget.clientWidth));
    } else if (pendingAsset) {
      setHover(position(event));
    }
  };
  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    if (event.type === 'pointerup') {
      const original = current.boundary;
      const updated = boundaries.find(item => item.id === original.id)
        ?? boundaries.find(item => original.leftId ? item.leftId === original.leftId : item.rightId === original.rightId);
      onBoundary(updated ?? original);
    }
  };

  return <div className="stage-background-track-row">
    <div ref={rail} className="stage-background-track" role="group" aria-label={l('Background sections on map', '地图上的背景分段')}
      data-placing={Boolean(pendingAsset)} style={{ backgroundColor: color }}
      onPointerDown={event => { if (pendingAsset && event.button === 0 && event.target === event.currentTarget) onPlace(position(event)); }}
      onPointerMove={moveDrag} onPointerLeave={() => setHover(undefined)}
      onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}>
      {segments.map((segment, index) => {
        const asset = assetById.get(segment.assetId);
        const state = asset && getBackgroundImage(asset);
        const name = asset?.name ?? l('Missing background', '素材已不可用');
        const fade = backgroundTransition(segments[index - 1], segment);
        return <div className="stage-background-section-wrap" key={segment.id}>
          <button type="button" className="stage-background-section" aria-label={name + ' · ' + segment.start + '–' + segment.end}
            aria-pressed={segmentId === segment.id} title={name + ' · ' + segment.start + '–' + segment.end}
            disabled={props.editingImage}
            style={{ left: percent(segment.start), width: percent(segment.end - segment.start) }}
            onClick={() => onSelect(segment.id)}>
            {state && <img src={state.mediaUrl} alt="" />}
            <span>{name}</span>
          </button>
          {fade > 0 && <span className="stage-background-fade" aria-hidden="true" style={{ left: percent(segment.start - fade / 2), width: percent(fade) }} />}
        </div>;
      })}
      {preview && <span className="stage-background-ghost" aria-hidden="true" style={{ left: percent(preview.start), width: percent(preview.end - preview.start) }} />}
      {boundaries.map(boundary => (
        <button key={boundary.id} type="button" className="stage-background-boundary"
          aria-label={(boundary.leftId && boundary.rightId ? l('Join at ', '接缝 ') : l('Background edge at ', '背景边界 ')) + boundary.x}
          aria-pressed={boundary.id === boundaryId} style={{ left: `clamp(6px, ${percent(boundary.x)}, calc(100% - 6px))` }}
          disabled={props.editingImage}
          onPointerDown={event => beginDrag(event, boundary)}
          onClick={event => { if (event.detail === 0) onBoundary(boundary); }}
          onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            onBoundary(boundary);
            onMove(boundary, boundary.x + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1));
          }}
        />
      ))}
    </div>
    {segments.length === 0 && !pendingAsset && <small>{l('Empty areas use the base color.', '空白区域会显示底色。')}</small>}
  </div>;
}
