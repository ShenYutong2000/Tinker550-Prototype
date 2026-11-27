import type { AssetItem } from '../asset-library/assetLibraryModel';
import type { Point, ResizeCorner, Scene } from './stageProject';

export type BackgroundBox = Point & { width: number; height: number };
type BackgroundItem = BackgroundBox & { id: string; locked?: boolean; opacity?: number };

export type BackgroundImage = BackgroundItem & {
  kind: 'image';
  assetId: string;
  feather?: number;
  rotation?: number;
  // Older projects stored a crop area separately from the image it contained.
  crop?: { image?: BackgroundBox; align?: Point; matte?: string };
};
export type BackgroundColor = BackgroundItem & { kind: 'color'; color: string };
export type BackgroundElement = BackgroundImage | BackgroundColor;
export type BackgroundPreview = { sceneId: string; element: BackgroundElement; placing?: boolean };

interface BackgroundSegment {
  id: string;
  assetId: string;
  start: number;
  end: number;
  frame?: Point;
  imagePlacement?: BackgroundBox;
  transition: number;
  transitionFrom?: string;
}

interface LegacyBackground {
  mode: 'inherit' | 'color' | 'segments' | 'tile';
  color: string;
  assetId?: string;
  segments?: BackgroundSegment[];
}

export interface FreeBackground {
  mode: 'free';
  color: string;
  useSceneBackdrop?: boolean;
  elements: BackgroundElement[];
}

export type SceneBackground = LegacyBackground | FreeBackground;
export const DEFAULT_SCENE_BACKGROUND: LegacyBackground = { mode: 'inherit', color: '#dbeafe' };
const center: Point = { x: .5, y: .5 };
const migrated = new WeakMap<Scene, FreeBackground>();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function getBackgroundImage(asset: AssetItem) {
  const state = asset.states.find(slot => slot.id === asset.activeStateId) ?? asset.states[0];
  return state?.mediaKind !== 'video' && state?.mediaUrl ? state : undefined;
}

function transitionBetween(left: BackgroundSegment | undefined, right: BackgroundSegment | undefined) {
  if (!left || !right || left.end !== right.start || right.transitionFrom && right.transitionFrom !== left.id) return 0;
  return clamp(right.transition, 0, Math.min(left.end - left.start, right.end - right.start));
}

export function editableBackground(scene: Scene): FreeBackground {
  const source = scene.background ?? DEFAULT_SCENE_BACKGROUND;
  if (source.mode === 'free') return source;
  const existing = migrated.get(scene);
  if (existing) return existing;
  const background: FreeBackground = { mode: 'free', color: source.color, elements: [] };

  if (source.mode === 'inherit') {
    background.useSceneBackdrop = true;
    background.elements = scene.placements
      .filter(item => item.kind === 'background' && item.assetId && !item.isHidden)
      .sort((a, b) => a.layer - b.layer)
      .map(item => ({
        kind: 'image', id: item.id, assetId: item.assetId!, rotation: item.rotation,
        x: item.x - item.width / 2, y: item.y - item.height / 2, width: item.width, height: item.height,
      }));
  } else if (source.mode === 'segments' || source.mode === 'tile') {
    const height = Math.max(1, scene.height - 28);
    const segments = (source.segments ?? (source.assetId
      ? [{ id: 'original-background', assetId: source.assetId, start: 0, end: scene.width, transition: 0 }]
      : [])).map(item => ({ ...item, end: Math.min(scene.width, item.end) })).filter(item => item.end > item.start);
    background.elements = segments.map((item, index) => {
      const feather = transitionBetween(segments[index - 1], item);
      const x = item.start - feather / 2;
      const width = item.end + transitionBetween(item, segments[index + 1]) / 2 - x;
      const old = item.imagePlacement;
      return {
        kind: 'image', id: item.id, assetId: item.assetId, x, y: 0, width, height, feather,
        locked: Boolean(old),
        crop: {
          align: item.frame,
          matte: feather ? source.color : undefined,
          image: old && { x: (old.x - x) / width, y: old.y / height, width: old.width / width, height: old.height / height },
        },
      };
    });
  }
  migrated.set(scene, background);
  return background;
}

export function backgroundImageBox(item: BackgroundImage, imageWidth: number, imageHeight: number): BackgroundBox {
  if (!item.crop) return item;
  const frame = item.crop.image;
  if (frame) return {
    x: item.x + frame.x * item.width, y: item.y + frame.y * item.height,
    width: frame.width * item.width, height: frame.height * item.height,
  };
  const scale = Math.max(item.width / imageWidth, item.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const align = item.crop.align ?? center;
  return { x: item.x - (width - item.width) * align.x, y: item.y - (height - item.height) * align.y, width, height };
}

export function resizeBackgroundImage(image: BackgroundBox, corner: ResizeCorner, delta: Point): BackgroundBox {
  const x = image.width * corner.x;
  const y = image.height * corner.y;
  const minimum = Math.min(1, Math.max(8 / image.width, 8 / image.height));
  const scale = Math.max(minimum, 1 + (delta.x * x + delta.y * y) / (x * x + y * y));
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: image.x + (corner.x < 0 ? image.width - width : 0),
    y: image.y + (corner.y < 0 ? image.height - height : 0),
    width, height,
  };
}

export function snapBackgroundBox(box: BackgroundBox & { id?: string }, others: BackgroundElement[], scene: Pick<Scene, 'width' | 'height'>, distance: number): Point {
  function snap(value: number, size: number, edges: number[]) {
    let result = value;
    let best = distance;
    for (const edge of edges) {
      for (const candidate of [edge, edge - size]) {
        const offset = Math.abs(candidate - value);
        if (offset <= best) {
          best = offset;
          result = candidate;
        }
      }
    }
    return result;
  }
  const neighbors = others.filter(item => item.id !== box.id);
  return {
    x: snap(box.x, box.width, [0, scene.width, ...neighbors.flatMap(item => [item.x, item.x + item.width])]),
    y: snap(box.y, box.height, [0, scene.height - 28, ...neighbors.flatMap(item => [item.y, item.y + item.height])]),
  };
}

export function rectangleBetween(a: Point, b: Point): BackgroundBox {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
