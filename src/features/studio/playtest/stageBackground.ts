import type { AssetItem } from '../asset-library/assetLibraryModel';
import type { Point, ResizeCorner } from './stageProject';

export type BackgroundImagePlacement = Point & { width: number; height: number };
export type BackgroundImageDraft = {
  sceneId: string;
  segmentId: string;
  assetId: string;
  image: BackgroundImagePlacement;
};

export interface BackgroundSegment {
  id: string;
  assetId: string;
  start: number;
  end: number;
  frame?: Point;
  imagePlacement?: BackgroundImagePlacement;
  transition: number;
  transitionFrom?: string;
}

export type SceneBackground = {
  mode: 'inherit' | 'color' | 'segments' | 'tile';
  color: string;
  assetId?: string;
  segments?: BackgroundSegment[];
};

export const DEFAULT_SCENE_BACKGROUND: SceneBackground = { mode: 'inherit', color: '#dbeafe' };
export const DEFAULT_BACKGROUND_FRAME: Point = { x: .5, y: .5 };
const MIN_SEGMENT_WIDTH = 16;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type BackgroundBoundary = { id: string; x: number; leftId?: string; rightId?: string };

export function getBackgroundImage(asset: AssetItem) {
  const state = asset.states.find(slot => slot.id === asset.activeStateId) ?? asset.states[0];
  return state?.mediaKind !== 'video' && state?.mediaUrl ? state : undefined;
}

export function backgroundSegments(background: SceneBackground, width: number): BackgroundSegment[] {
  const segments = background.segments ?? (background.assetId
    ? [{ id: 'original-background', assetId: background.assetId, start: 0, end: width, transition: 0 }]
    : []);
  return segments.flatMap(segment => {
    const end = Math.min(width, segment.end);
    return end > segment.start ? [{ ...segment, end }] : [];
  });
}

export function backgroundBoundaries(segments: BackgroundSegment[]): BackgroundBoundary[] {
  return segments.flatMap((segment, index) => {
    const previous = segments[index - 1];
    const next = segments[index + 1];
    const joined = next?.start === segment.end;
    const end: BackgroundBoundary = {
      id: joined ? segment.id + '::' + next.id : segment.id + ':end',
      x: segment.end,
      leftId: segment.id,
      rightId: joined ? next.id : undefined,
    };
    return previous?.end === segment.start ? [end] : [
      { id: segment.id + ':start', x: segment.start, rightId: segment.id }, end,
    ];
  });
}

export function backgroundRangeAt(segments: BackgroundSegment[], width: number, at: number, desiredWidth: number) {
  if (at < 0 || at >= width || segments.some(segment => at >= segment.start && at < segment.end)) return null;
  const next = segments.findIndex(segment => segment.start > at);
  const low = segments[(next < 0 ? segments.length : next) - 1]?.end ?? 0;
  const high = segments[next]?.start ?? width;
  if (high - low < MIN_SEGMENT_WIDTH) return null;
  const start = at - low <= 12 ? low : clamp(Math.round(at), low, high - MIN_SEGMENT_WIDTH);
  return { start, end: Math.min(high, start + desiredWidth) };
}

export function dragBackgroundBoundary(segments: BackgroundSegment[], boundary: BackgroundBoundary, width: number, x: number, snap: number) {
  const left = segments.findIndex(segment => segment.id === boundary.leftId);
  const right = segments.findIndex(segment => segment.id === boundary.rightId);
  const low = left >= 0 ? Math.min(segments[left].end, segments[left].start + MIN_SEGMENT_WIDTH) : segments[right - 1]?.end ?? 0;
  const high = right >= 0 ? Math.max(segments[right].start, segments[right].end - MIN_SEGMENT_WIDTH) : segments[left + 1]?.start ?? width;
  const position = clamp(Math.round(x), low, high);
  const snapped = left < 0 && position - low <= snap ? low : right < 0 && high - position <= snap ? high : position;
  return segments.map((segment, index) => index === left ? { ...segment, end: snapped }
    : index === right ? { ...segment, start: snapped } : segment);
}

export function backgroundTransition(left: BackgroundSegment | undefined, right: BackgroundSegment | undefined) {
  if (!left || !right || left.end !== right.start) return 0;
  if (right.transitionFrom && right.transitionFrom !== left.id) return 0;
  return clamp(right.transition, 0, Math.min(left.end - left.start, right.end - right.start));
}

export function backgroundImageExtent(segments: BackgroundSegment[], index: number) {
  const segment = segments[index];
  const incoming = backgroundTransition(segments[index - 1], segment) / 2;
  const outgoing = backgroundTransition(segment, segments[index + 1]) / 2;
  return { start: segment.start - incoming, end: segment.end + outgoing, incoming };
}

function backgroundImageBox(start: number, end: number, height: number, imageWidth: number, imageHeight: number, frame: Point): BackgroundImagePlacement {
  const scale = Math.max((end - start) / imageWidth, height / imageHeight);
  const width = imageWidth * scale;
  const imageBoxHeight = imageHeight * scale;
  const excessX = Math.max(0, width - (end - start));
  const excessY = Math.max(0, imageBoxHeight - height);
  return { x: start - excessX * frame.x, y: -excessY * frame.y, width, height: imageBoxHeight };
}

export function backgroundImagePlacement(
  segment: BackgroundSegment, start: number, end: number, height: number, imageWidth: number, imageHeight: number,
): BackgroundImagePlacement {
  return segment.imagePlacement ?? backgroundImageBox(start, end, height, imageWidth, imageHeight, segment.frame ?? DEFAULT_BACKGROUND_FRAME);
}

export function resizeBackgroundImage(image: BackgroundImagePlacement, corner: ResizeCorner, delta: Point): BackgroundImagePlacement {
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
