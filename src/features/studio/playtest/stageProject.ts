import type { AssetItem } from '../asset-library/assetLibraryModel';
import { getAncestorGroupIds, getNodeAssetIds, type BoardNode, type SceneTheme } from '../design-board/studioModel';
import { hasCardContent, resolveSceneTheme } from './boardPlayEngine';
import { cardPreviewBehavior } from './cardPreviewMotion';
import type { SceneBackground } from './stageBackground';

export const VIEW_WIDTH = 360;
export const VIEW_HEIGHT = 250;

export type StageKind = 'decoration' | 'challenge' | 'platform' | 'zone' | 'spawn' | 'checkpoint' | 'background' | 'hud' | 'subtitle';
export type Point = { x: number; y: number };
export interface Placement extends Point {
  id: string;
  kind: StageKind;
  name: string;
  width: number;
  height: number;
  layer: number;
  rotation: number;
  isHidden?: boolean;
  assetId?: string;
  nodeId?: string;
  boardCopy?: boolean;
  targetId?: string;
  activationId?: string;
  mechanismId?: string;
  collider?: { width: number; height: number };
  parameters?: Record<string, number>;
  hud?: 'score' | 'hp';
  anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface Scene {
  id: string;
  name: string;
  width: number;
  height: number;
  theme?: SceneTheme;
  background?: SceneBackground;
  entryGroupId?: string;
  entrySpawnId?: string;
  placements: Placement[];
  boardOverrides?: Record<string, Partial<Placement>>;
}

export const makeId = () => crypto.randomUUID();

export function createPlacement(kind: StageKind, name: string, x: number, y: number): Placement {
  return {
    id: makeId(), kind, name, x, y,
    width: kind === 'platform' ? 110 : kind === 'background' ? 360 : 30,
    height: kind === 'platform' ? 12 : kind === 'background' ? 250 : 30,
    rotation: 0, layer: kind === 'background' ? -10 : 0,
    ...(kind === 'hud' ? { hud: 'score' as const } : {}),
    ...(kind === 'subtitle' ? { anchor: 'bottom-left' as const, x: 12, y: 12, width: 336, height: 35 } : {}),
  };
}

export function createScene(name: string, spawnName: string, heroAssetId?: string): Scene {
  const spawn = createPlacement('spawn', spawnName, 60, 175);
  spawn.assetId = heroAssetId;
  return { id: makeId(), name, width: 1080, height: VIEW_HEIGHT, entrySpawnId: spawn.id, placements: [spawn] };
}

export function createLibraryPlacement(asset: AssetItem, scene: Pick<Scene, 'width' | 'height'>, world: Point, screen: Point): Placement {
  const kind = asset.categoryId === 'backgrounds' ? 'background' : asset.categoryId === 'interface' ? 'hud' : 'decoration';
  const { x, y } = kind === 'hud' ? screen : world;
  const item = createPlacement(kind, asset.name, x, y);
  item.assetId = asset.id;
  delete item.hud;
  if (kind === 'background') {
    return { ...item, x: scene.width / 2, y: scene.height / 2, width: scene.width, height: scene.height, layer: -9 };
  }
  return item;
}

export function copyPlacements(items: Placement[], selected: Placement, whole: boolean, offset: Point): Placement[] {
  const members = whole && selected.mechanismId ? items.filter(item => item.mechanismId === selected.mechanismId) : [selected];
  const ids = new Map(members.map(item => [item.id, makeId()]));
  const mechanismId = whole && selected.mechanismId ? makeId() : selected.mechanismId;
  return members.map(item => ({
    ...item, id: ids.get(item.id)!, mechanismId,
    boardCopy: item.id.startsWith('board:') || item.boardCopy,
    x: item.x + offset.x, y: item.y + offset.y,
    targetId: item.targetId ? ids.get(item.targetId) ?? item.targetId : undefined,
    activationId: item.activationId ? ids.get(item.activationId) ?? item.activationId : undefined,
    collider: item.collider && { ...item.collider },
    parameters: item.parameters && { ...item.parameters },
  }));
}

export function cameraX(sceneWidth: number, playerX: number): number {
  return Math.max(0, Math.min(sceneWidth - VIEW_WIDTH, playerX - VIEW_WIDTH * .55));
}

export function overlaps(a: Point & { width: number; height: number }, b: Placement): boolean {
  return Math.abs(a.x - b.x) < (a.width + (b.collider?.width ?? b.width)) / 2 &&
    Math.abs(a.y - b.y) < (a.height + (b.collider?.height ?? b.height)) / 2;
}

export function anchoredPosition(item: Placement): Point {
  return {
    x: item.anchor?.endsWith('right') ? VIEW_WIDTH - item.x : item.x,
    y: item.anchor?.startsWith('bottom') ? VIEW_HEIGHT - item.y : item.y,
  };
}

export const RESIZE_CORNERS = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }] as const;
export type ResizeCorner = typeof RESIZE_CORNERS[number];

export function placementBox(item: Placement) {
  const position = anchoredPosition(item);
  const right = item.anchor?.endsWith('right');
  const bottom = item.anchor?.startsWith('bottom');
  return {
    x: position.x - item.width * (item.kind === 'subtitle' ? Number(Boolean(right)) : .5),
    y: position.y - item.height * (item.kind === 'subtitle' ? Number(Boolean(bottom)) : .5),
    width: item.width, height: item.height,
  };
}

export function rotateStagePoint(point: Point, origin: Point, degrees: number): Point {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const dx = point.x - origin.x, dy = point.y - origin.y;
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}

export function resizePlacement(item: Placement, corner: ResizeCorner, delta: Point) {
  const local = rotateStagePoint(delta, { x: 0, y: 0 }, -item.rotation);
  const width = Math.max(1, Math.round(item.width + local.x * corner.x));
  const height = Math.max(1, Math.round(item.height + local.y * corner.y));
  const right = Boolean(item.anchor?.endsWith('right'));
  const bottom = Boolean(item.anchor?.startsWith('bottom'));
  const shiftX = (width - item.width) * (item.kind === 'subtitle' ? Number((corner.x > 0) === right) : .5);
  const shiftY = (height - item.height) * (item.kind === 'subtitle' ? Number((corner.y > 0) === bottom) : .5);
  const offset = rotateStagePoint({ x: shiftX * corner.x, y: shiftY * corner.y }, { x: 0, y: 0 }, item.rotation);
  return { width, height, x: item.x + offset.x * (right ? -1 : 1), y: item.y + offset.y * (bottom ? -1 : 1) };
}

export const COLLIDER_SIDES = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }] as const;
export type ColliderSide = typeof COLLIDER_SIDES[number];

export function colliderBox(item: Placement) {
  const { width, height } = item.collider ?? item;
  return { x: item.x - width / 2, y: item.y - height / 2, width, height };
}

export function resizeCollider(item: Placement, side: ColliderSide, delta: Point): NonNullable<Placement['collider']> {
  const { width, height } = item.collider ?? item;
  return {
    width: side.x ? Math.max(1, Math.round(width + 2 * side.x * delta.x)) : width,
    height: side.y ? Math.max(1, Math.round(height + 2 * side.y * delta.y)) : height,
  };
}

export function rotatePlacement(item: Placement, from: Point, to: Point) {
  const pivot = anchoredPosition(item);
  const angleAt = (point: Point) => Math.atan2(point.y - pivot.y, point.x - pivot.x);
  const angle = Math.round(item.rotation + (angleAt(to) - angleAt(from)) * 180 / Math.PI);
  return ((angle % 360) + 360) % 360;
}

export function exposedParameters(nodes: BoardNode[], placement: Placement) {
  return nodes.find(node => node.id === placement.nodeId)?.fields.relatedParameters?.filter(parameter => parameter.exposeOnStage) ?? [];
}

export function patchScenePlacement(scene: Scene, id: string, patch: Partial<Placement>): Scene {
  if (scene.placements.some(item => item.id === id)) {
    return { ...scene, placements: scene.placements.map(item => item.id === id ? { ...item, ...patch } : item) };
  }
  return { ...scene, boardOverrides: { ...scene.boardOverrides, [id]: { ...scene.boardOverrides?.[id], ...patch } } };
}

export function retainChallengeAnchors(drafts: Scene[], projected: Scene[]): Scene[] {
  let changed = false;
  const next = drafts.map(draft => {
    const scene = projected.find(item => item.id === draft.id);
    let overrides = draft.boardOverrides;
    for (const item of scene?.placements ?? []) {
      if (item.kind !== 'challenge' || !item.id.startsWith('board:')) continue;
      const saved = overrides?.[item.id];
      if (saved?.x !== undefined && saved.y !== undefined) continue;
      overrides = { ...overrides, [item.id]: { x: item.x, y: item.y, ...saved } };
    }
    if (overrides === draft.boardOverrides) return draft;
    changed = true;
    return { ...draft, boardOverrides: overrides };
  });
  return changed ? next : drafts;
}

/** Board cards own asset references. Canvas owns the placement overrides, keyed by card and visual role. */
export function projectBoardScenes(scenes: Scene[], nodes: BoardNode[], assets: AssetItem[]): Scene[] {
  const assetById = new Map(assets.map(asset => [asset.id, asset]));
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const assignedScene = new Map(scenes.filter(scene => scene.entryGroupId).map(scene => [scene.entryGroupId, scene.id]));
  const manualObjects = scenes.flatMap(scene => scene.placements);
  const boundAssets = (node: BoardNode) => getNodeAssetIds(node).flatMap(id => {
    const asset = assetById.get(id);
    return asset ? [asset] : [];
  });
  return scenes.map((scene, index) => {
    const cards = nodes.filter(node => {
      if (!hasCardContent(node) || node.kind === 'group') return false;
      const ancestors = getAncestorGroupIds(node.id, nodeById);
      if (ancestors.some(id => nodeById.get(id)?.stageTemplate)) return false;
      const owner = ancestors.map(id => assignedScene.get(id)).find(Boolean);
      return owner ? owner === scene.id : index === 0;
    });
    const generated: Placement[] = [];
    const add = (node: BoardNode, kind: StageKind, role: string, name: string, size: Pick<Placement, 'x' | 'y' | 'width' | 'height'>, assetId?: string, extra?: Partial<Placement>) => {
      const id = 'board:' + node.id + ':' + role;
      generated.push({
        id, kind, nodeId: node.id, name, assetId, ...size,
        layer: kind === 'background' ? -10 : 0, rotation: 0,
        ...extra, ...scene.boardOverrides?.[id],
      });
    };
    let challengeIndex = 0;
    const interfaces = new Set<string>();
    const backgrounds = new Set<string>();
    for (const node of cards) {
      const media = boundAssets(node);
      if (node.kind === 'challenge' && !node.stageAuthored && !manualObjects.some(item => item.kind === 'challenge' && item.nodeId === node.id && !item.boardCopy)) {
        const objects = media.filter(asset => asset.categoryId === 'objects');
        const visuals = objects.length ? objects : media.filter(asset => asset.categoryId === 'characters' || asset.categoryId === 'effects').slice(0, 1);
        const behavior = cardPreviewBehavior(node);
        const instances = !behavior.isSceneOnly && visuals.length ? visuals : [undefined];
        for (const [slot, asset] of instances.entries()) {
          const x = 175 + challengeIndex * 68;
          if (!behavior.isSceneOnly) challengeIndex += 1;
          add(node, 'challenge', 'challenge:' + slot, asset?.name ?? (node.title.trim() || node.note.trim()), {
            x, y: behavior.direction === 'down' ? 50 : scene.height - (behavior.pattern === 'collectible' ? 70 : 45), width: 30, height: 30,
          }, asset?.id);
        }
      }
      if (node.kind === 'outcome') continue;
      for (const asset of media) {
        if (asset.categoryId === 'backgrounds' && !backgrounds.has(asset.id)) {
          backgrounds.add(asset.id);
          add(node, 'background', 'background:' + asset.id, asset.name, { x: scene.width / 2, y: scene.height / 2, width: scene.width, height: scene.height }, asset.id);
        } else if (asset.categoryId === 'interface' && !interfaces.has(asset.id)) {
          interfaces.add(asset.id);
          add(node, 'hud', 'interface:' + asset.id, asset.name, { x: 45 + (interfaces.size - 1) * 85, y: 24, width: 70, height: 28 }, asset.id);
        }
      }
    }
    const hero = cards.filter(node => node.kind === 'action').flatMap(boundAssets).find(asset => asset.categoryId === 'characters')
      ?? cards.filter(node => node.kind === 'challenge' && node.promptInput?.actorAssetId !== node.promptInput?.obstacleAssetId)
        .map(node => assetById.get(node.promptInput?.actorAssetId ?? '')).find(asset => asset?.categoryId === 'characters')
      ?? cards.filter(node => node.kind !== 'dialogue' && node.kind !== 'challenge').flatMap(boundAssets).find(asset => asset.categoryId === 'characters');
    const placements = scene.placements.map(item => {
      if (item.kind !== 'spawn' || item.assetId || !hero) return item;
      const defaultSize = item.width === 30 && item.height === 30 ? { width: 42, height: 42 } : {};
      return { ...item, ...defaultSize, assetId: hero.id };
    });
    return {
      ...scene,
      theme: cards.filter(node => node.kind === 'narration' || node.kind === 'challenge')
        .map(resolveSceneTheme).find(theme => theme !== 'neutral') ?? 'neutral',
      width: Math.max(scene.width, 175 + Math.max(0, challengeIndex - 1) * 68 + 35),
      placements: [...placements, ...generated],
    };
  });
}
