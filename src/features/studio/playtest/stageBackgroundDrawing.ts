import type { AssetItem } from '../asset-library/assetLibraryModel';
import { buildCssFilterString, evaluateDynamicEffects, getOutcomeVisualEffects, getStaticOpacity, isHiddenByEffect, type RunningVisual } from '../asset-library/effects/visualEffectsModel';
import { backgroundImageExtent, backgroundImagePlacement, backgroundSegments, getBackgroundImage, type BackgroundImageDraft, type BackgroundSegment } from './stageBackground';
import { VIEW_HEIGHT, VIEW_WIDTH, type Scene } from './stageProject';

const fadeCanvases = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>();

export function loadStageImage(url: string | undefined, images: Map<string, HTMLImageElement>) {
  if (!url) return null;
  let image = images.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    images.set(url, image);
  }
  return image.complete && image.naturalWidth && image.naturalHeight ? image : null;
}

export function drawSceneBackground(
  ctx: CanvasRenderingContext2D, scene: Scene, pan: number, zoom: number,
  assets: AssetItem[], images: Map<string, HTMLImageElement>,
  draft?: BackgroundImageDraft,
  visuals?: Record<string, RunningVisual>, time = 0,
) {
  const background = scene.background;
  if (!background || background.mode === 'inherit') return;
  const height = scene.height - 28;
  const visibleHeight = Math.min(height, VIEW_HEIGHT / zoom);
  const left = Math.max(0, pan);
  const right = Math.min(scene.width, pan + VIEW_WIDTH / zoom);
  ctx.save();
  ctx.fillStyle = background.color;
  ctx.fillRect(left, 0, right - left, height);
  if (background.mode === 'color') {
    ctx.restore();
    return;
  }

  const segments = backgroundSegments(background, scene.width);
  const drawSegment = (target: CanvasRenderingContext2D, segment: BackgroundSegment, start: number, end: number, clipStart: number, clipEnd: number) => {
    if (clipEnd <= clipStart) return;
    const asset = assets.find(item => item.id === segment.assetId && item.categoryId === 'backgrounds');
    const slot = asset && getBackgroundImage(asset);
    const image = loadStageImage(slot?.mediaUrl, images);
    const visual = visuals?.[segment.assetId];
    const effects = getOutcomeVisualEffects(slot?.visualEffects, visual, time);
    if (!image || isHiddenByEffect(effects)) return;
    const box = draft?.sceneId === scene.id && draft.segmentId === segment.id && draft.assetId === segment.assetId
      ? draft.image : backgroundImagePlacement(segment, start, end, height, image.naturalWidth, image.naturalHeight);
    target.save();
    target.beginPath();
    target.rect(clipStart, 0, clipEnd - clipStart, visibleHeight);
    target.clip();
    target.globalAlpha = getStaticOpacity(effects);
    target.filter = buildCssFilterString(effects) || 'none';
    if (visual && effects !== slot?.visualEffects) {
      const frame = evaluateDynamicEffects([visual.effect], Math.min(time - visual.start, visual.duration), false);
      target.globalAlpha *= frame.opacityMul;
      target.translate(box.x + box.width / 2 + frame.offsetX, box.y + box.height / 2 + frame.offsetY);
      target.scale(frame.scale, frame.scale);
      target.translate(-box.x - box.width / 2, -box.y - box.height / 2);
    }
    target.drawImage(image, box.x, box.y, box.width, box.height);
    target.restore();
  };

  for (const [index, segment] of segments.entries()) {
    const { start, end, incoming } = backgroundImageExtent(segments, index);
    const fadeEnd = segment.start + incoming;
    const clipStart = Math.max(start, left);
    const clipEnd = Math.min(end, right);
    if (clipEnd <= clipStart) continue;
    drawSegment(ctx, segment, start, end, Math.max(fadeEnd, left), clipEnd);
    const fadeRight = Math.min(fadeEnd, clipEnd);
    if (!incoming || fadeRight <= clipStart) continue;

    // Composite the incoming image and its base color together before applying the fade.
    let canvas = fadeCanvases.get(ctx);
    if (!canvas) {
      canvas = document.createElement('canvas');
      fadeCanvases.set(ctx, canvas);
    }
    const transform = ctx.getTransform();
    const fadeWidth = fadeRight - clipStart;
    const pixelWidth = Math.max(1, Math.ceil(fadeWidth * transform.a));
    const pixelHeight = Math.max(1, Math.ceil(visibleHeight * transform.d));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const layer = canvas.getContext('2d');
    if (!layer) continue;
    const scale = pixelWidth / fadeWidth;
    layer.setTransform(scale, 0, 0, pixelHeight / visibleHeight, -clipStart * scale, 0);
    layer.globalCompositeOperation = 'source-over';
    layer.fillStyle = background.color;
    layer.fillRect(clipStart, 0, fadeWidth, visibleHeight);
    drawSegment(layer, segment, start, end, clipStart, fadeRight);
    const mask = layer.createLinearGradient(start, 0, fadeEnd, 0);
    mask.addColorStop(0, '#0000');
    mask.addColorStop(1, '#000');
    layer.globalCompositeOperation = 'destination-in';
    layer.fillStyle = mask;
    layer.fillRect(clipStart, 0, fadeWidth, visibleHeight);
    ctx.drawImage(canvas, clipStart, 0, fadeWidth, visibleHeight);
  }
  ctx.restore();
}
