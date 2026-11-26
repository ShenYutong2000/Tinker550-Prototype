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

function emptyBackgroundRanges(segments: BackgroundSegment[], width: number) {
  const gaps: { start: number; end: number }[] = [];
  let start = 0;
  for (const segment of segments) {
    if (segment.start > start) gaps.push({ start, end: segment.start });
    start = Math.max(start, segment.end);
  }
  if (start < width) gaps.push({ start, end: width });
  return gaps;
}

export function backgroundRangeInView(segments: BackgroundSegment[], width: number, pan: number, visibleWidth: number, preferredWidth: number) {
  const gaps = emptyBackgroundRanges(segments, width);
  for (const gap of gaps) {
    const start = Math.max(gap.start, Math.round(pan));
    if (start < pan + visibleWidth && gap.end - start >= MIN_SEGMENT_WIDTH) {
      return { start, end: Math.min(gap.end, start + preferredWidth) };
    }
  }
  const next = gaps.find(gap => gap.start >= pan && gap.end - gap.start >= MIN_SEGMENT_WIDTH)
    ?? gaps.find(gap => gap.end - gap.start >= MIN_SEGMENT_WIDTH);
  if (next) return { start: next.start, end: Math.min(next.end, next.start + preferredWidth) };
  return backgroundRangeForDrop(segments, width, pan + visibleWidth / 2, preferredWidth);
}

export function backgroundRangeForDrop(segments: BackgroundSegment[], width: number, x: number, preferredWidth: number) {
  const at = clamp(x, 0, width - 1);
  const empty = backgroundRangeAt(segments, width, at, preferredWidth);
  if (empty) return empty;
  const item = segments.find(segment => at >= segment.start && at < segment.end);
  if (!item || item.end - item.start < 2 * MIN_SEGMENT_WIDTH) return null;
  const size = Math.min(preferredWidth, item.end - item.start - MIN_SEGMENT_WIDTH);
  const start = at - item.start < MIN_SEGMENT_WIDTH
    ? item.start : clamp(Math.round(at), item.start + MIN_SEGMENT_WIDTH, item.end - MIN_SEGMENT_WIDTH);
  const end = item.end - (start + size) < MIN_SEGMENT_WIDTH ? item.end : start + size;
  return { start, end };
}

export function insertBackgroundSegment(segments: BackgroundSegment[], added: BackgroundSegment, newFragmentId: string) {
  let splitId: string | undefined;
  const kept = segments.flatMap(item => {
    if (item.end <= added.start || item.start >= added.end) return [item];
    const left = item.start < added.start ? { ...item, end: added.start } : undefined;
    const right = item.end > added.end ? {
      ...item, id: left ? newFragmentId : item.id, start: added.end, transition: 0, transitionFrom: undefined,
    } : undefined;
    if (left && right) splitId = item.id;
    return [left, right].filter((segment): segment is BackgroundSegment => Boolean(segment));
  });
  const ordered = [...kept, added].sort((a, b) => a.start - b.start);
  return splitId ? ordered.map((item, index) => item.transitionFrom === splitId && ordered[index - 1]?.id === newFragmentId
    ? { ...item, transitionFrom: newFragmentId } : item) : ordered;
}

function translateBackgroundSegment(segment: BackgroundSegment, start: number): BackgroundSegment {
  const delta = start - segment.start;
  return {
    ...segment, start, end: segment.end + delta,
    imagePlacement: segment.imagePlacement && { ...segment.imagePlacement, x: segment.imagePlacement.x + delta },
  };
}

export function moveBackgroundSegment(segments: BackgroundSegment[], id: string, width: number, requestedStart: number, snap = 0): BackgroundSegment[] {
  const originalIndex = segments.findIndex(item => item.id === id);
  const original = segments[originalIndex];
  if (!original || !Number.isFinite(requestedStart)) return segments;
  const size = original.end - original.start;
  const start = clamp(Math.round(requestedStart), 0, width - size);
  const rest = segments.filter(item => item.id !== id);
  const gap = emptyBackgroundRanges(rest, width).find(item =>
    item.end - item.start >= size && start >= item.start - snap && start + size <= item.end + snap);
  if (gap) {
    const end = gap.end - size;
    const position = start - gap.start <= snap ? gap.start : end - start <= snap ? end : start;
    return [...rest, translateBackgroundSegment(original, position)].sort((a, b) => a.start - b.start);
  }

  const center = start + size / 2;
  const nextIndex = rest.findIndex(item => center < (item.start + item.end) / 2);
  const target = nextIndex < 0 ? rest.length : nextIndex;
  if (target === originalIndex) {
    const position = clamp(start, rest[target - 1]?.end ?? 0, (rest[target]?.start ?? width) - size);
    return segments.map(item => item.id === id ? translateBackgroundSegment(item, position) : item);
  }
  const first = Math.min(originalIndex, target);
  const last = Math.max(originalIndex, target);
  const affected = segments.slice(first, last + 1);
  const ordered = affected.filter(item => item.id !== id);
  ordered.splice(target - first, 0, original);
  let cursor = affected[0].start;
  const moved = ordered.map((item, index) => {
    const translated = translateBackgroundSegment(item, cursor);
    cursor = translated.end + (affected[index + 1] ? affected[index + 1].start - affected[index].end : 0);
    return translated;
  });
  return [...segments.slice(0, first), ...moved, ...segments.slice(last + 1)];
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
