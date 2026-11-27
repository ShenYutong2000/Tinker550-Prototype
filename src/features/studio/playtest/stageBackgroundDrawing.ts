import type { AssetItem } from '../asset-library/assetLibraryModel';
import { buildCssFilterString, evaluateDynamicEffects, getOutcomeVisualEffects, getStaticOpacity, isHiddenByEffect, type RunningVisual } from '../asset-library/effects/visualEffectsModel';
import { backgroundImageBox, editableBackground, getBackgroundImage, type BackgroundImage, type BackgroundPreview } from './stageBackground';
import type { Scene } from './stageProject';

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
  ctx: CanvasRenderingContext2D, scene: Scene, pan: number, visibleWidth: number, visibleHeight: number,
  assets: AssetItem[], images: Map<string, HTMLImageElement>, preview?: BackgroundPreview,
  visuals?: Record<string, RunningVisual>, time = 0,
) {
  const background = editableBackground(scene);
  const width = Math.min(scene.width, pan + visibleWidth) - pan;
  const height = Math.min(visibleHeight, scene.height);
  if (width <= 0 || height <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(pan, 0, width, height);
  ctx.clip();
  if (!background.useSceneBackdrop) {
    ctx.fillStyle = background.color;
    ctx.fillRect(pan, 0, width, scene.height - 28);
  }

  const draft = preview?.sceneId === scene.id ? preview.element : undefined;
  const items = background.elements.map(item => item.id === draft?.id ? draft : item);
  if (draft && !items.some(item => item.id === draft.id)) items.push(draft);
  for (const item of items) {
    if (!('rotation' in item && item.rotation) && (item.x + item.width <= pan || item.x >= pan + width
      || item.y + item.height <= 0 || item.y >= height)) continue;
    const alpha = (item.opacity ?? 1) * (preview?.placing && item === draft ? .65 : 1);
    if (item.kind === 'color') {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = item.color;
      ctx.fillRect(item.x, item.y, item.width, item.height);
      ctx.globalAlpha = 1;
      continue;
    }

    const asset = assets.find(candidate => candidate.id === item.assetId);
    const slot = asset && getBackgroundImage(asset);
    const image = loadStageImage(slot?.mediaUrl, images);
    const visual = visuals?.[item.assetId];
    const effects = getOutcomeVisualEffects(slot?.visualEffects, visual, time);
    if (!image || isHiddenByEffect(effects)) continue;
    const box = backgroundImageBox(item, image.naturalWidth, image.naturalHeight);
    const draw = (target: CanvasRenderingContext2D) => {
      target.save();
      target.globalAlpha *= getStaticOpacity(effects);
      target.filter = buildCssFilterString(effects) || 'none';
      if (item.rotation) {
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        target.translate(cx, cy);
        target.rotate(item.rotation * Math.PI / 180);
        target.translate(-cx, -cy);
      }
      if (visual && effects !== slot?.visualEffects) {
        const frame = evaluateDynamicEffects([visual.effect], Math.min(time - visual.start, visual.duration), false);
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        target.globalAlpha *= frame.opacityMul;
        target.translate(cx + frame.offsetX, cy + frame.offsetY);
        target.scale(frame.scale, frame.scale);
        target.translate(-cx, -cy);
      }
      target.drawImage(image, box.x, box.y, box.width, box.height);
      target.restore();
    };

    const feather = Math.min(item.width, item.feather ?? 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (item.crop || feather > 0) {
      ctx.beginPath();
      ctx.rect(item.x + feather, item.y, item.width - feather, item.height);
      ctx.clip();
    }
    draw(ctx);
    ctx.restore();
    if (feather > 0) drawFeather(ctx, item, feather, pan, width, height, alpha, draw);
  }
  ctx.restore();
}

function drawFeather(
  ctx: CanvasRenderingContext2D, item: BackgroundImage, feather: number,
  pan: number, visibleWidth: number, visibleHeight: number, alpha: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const left = Math.max(pan, item.x);
  const right = Math.min(pan + visibleWidth, item.x + feather);
  const top = Math.max(0, item.y);
  const bottom = Math.min(visibleHeight, item.y + item.height);
  if (right <= left || bottom <= top) return;
  let canvas = fadeCanvases.get(ctx);
  if (!canvas) {
    canvas = document.createElement('canvas');
    fadeCanvases.set(ctx, canvas);
  }
  const transform = ctx.getTransform();
  const width = right - left;
  const height = bottom - top;
  const pixelWidth = Math.max(1, Math.ceil(width * transform.a));
  const pixelHeight = Math.max(1, Math.ceil(height * transform.d));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const layer = canvas.getContext('2d');
  if (!layer) return;
  const scaleX = pixelWidth / width;
  const scaleY = pixelHeight / height;
  layer.setTransform(scaleX, 0, 0, scaleY, -left * scaleX, -top * scaleY);
  layer.globalCompositeOperation = 'source-over';
  layer.clearRect(left, top, width, height);
  if (item.crop?.matte) {
    layer.fillStyle = item.crop.matte;
    layer.fillRect(left, top, width, height);
  }
  draw(layer);
  const mask = layer.createLinearGradient(item.x, 0, item.x + feather, 0);
  mask.addColorStop(0, '#0000');
  mask.addColorStop(1, '#000');
  layer.globalCompositeOperation = 'destination-in';
  layer.fillStyle = mask;
  layer.fillRect(left, top, width, height);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(canvas, left, top, width, height);
  ctx.restore();
}
