import type { StageEffectConfig } from './stageEffects';
export const WORLD_W = 360;
export const WORLD_H = 250;
export const GROUND_Y = 196;
export const HERO_BASE_X = 76;

export interface StagePose {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StagePlacement extends Partial<StagePose> {
  ui?: { usage: 'text' | 'icon' | 'score' | 'hp' | 'button'; text: string; display: 'number' | 'icon' | 'bar'; maximum: number; action: 'start' | 'advance' | 'restart'; cardId?: string };
  effect?: StageEffectConfig;
  assetId?: string;
  fontSize?: number;
  textColor?: string;
  panelColor?: string;
}

export interface StageLayout {
  placements: Record<string, StagePlacement>;
  decorations: string[];
  background: { assetId?: string; color?: string };
}

export const EMPTY_STAGE_LAYOUT: StageLayout = { placements: {}, decorations: [], background: {} };
export const HERO_POSE: StagePose = { x: HERO_BASE_X, y: GROUND_Y, width: 42, height: 42 };
export const DECORATION_POSE: StagePose = { x: 180, y: 110, width: 48, height: 48 };

export function challengeId(cardId: string) {
  return 'challenge:' + cardId;
}

export function challengePose(collectible: boolean): StagePose {
  return { x: 236, y: GROUND_Y - (collectible ? 60 : 14), width: 32.5, height: 32.5 };
}

export function stagePoint(rect: DOMRect, clientX: number, clientY: number) {
  return { x: (clientX - rect.left) * WORLD_W / rect.width, y: (clientY - rect.top) * WORLD_H / rect.height };
}

export function stageBounds(pose: StagePose, hero: boolean) {
  return { left: pose.x - pose.width / 2, top: pose.y - (hero ? pose.height + 2 : pose.height / 2) };
}

export function stagePosition(x: number, y: number, step: number, player = false) {
  return {
    x: Math.max(player ? 38 : 0, Math.min(player ? WORLD_W - 60 : WORLD_W, Math.round(x / step) * step)),
    y: Math.max(0, Math.min(player ? GROUND_Y : WORLD_H, Math.round(y / step) * step)),
  };
}
export type LayoutChange = { id: string; field: 'position' | 'size' | 'assetId' | 'style' | 'background' | 'add' | 'remove' | 'ui' | 'effect' };

export function stageLayoutChanges(saved: StageLayout, trial: StageLayout): LayoutChange[] {
  const changes: LayoutChange[] = [];
  if (saved.background.assetId !== trial.background.assetId || saved.background.color !== trial.background.color) {
    changes.push({ id: 'background', field: 'background' });
  }
  const ids = new Set([...Object.keys(saved.placements), ...Object.keys(trial.placements)]);
  for (const id of ids) {
    if (id.startsWith('interface:') || id.startsWith('effect:')) {
      if (JSON.stringify(saved.placements[id]) !== JSON.stringify(trial.placements[id])) {
        changes.push({ id, field: id.startsWith('effect:') ? 'effect' : 'ui' });
      }
      continue;
    }
    const before = saved.placements[id] ?? {};
    const after = trial.placements[id] ?? {};
    if (!saved.decorations.includes(id) && trial.decorations.includes(id)) {
      changes.push({ id, field: 'add' });
    } else if (saved.decorations.includes(id) && !trial.decorations.includes(id)) {
      changes.push({ id, field: 'remove' });
    } else {
      if (before.x !== after.x || before.y !== after.y) changes.push({ id, field: 'position' });
      if (before.width !== after.width || before.height !== after.height) changes.push({ id, field: 'size' });
      if (before.assetId !== after.assetId) changes.push({ id, field: 'assetId' });
      if (before.fontSize !== after.fontSize || before.textColor !== after.textColor || before.panelColor !== after.panelColor) {
        changes.push({ id, field: 'style' });
      }
    }
  }
  return changes;
}

export function applyStageLayoutChanges(saved: StageLayout, trial: StageLayout, changes: LayoutChange[]): StageLayout {
  const next = { ...saved, placements: { ...saved.placements }, decorations: [...saved.decorations] };
  for (const { id, field } of changes) {
    const value = trial.placements[id] ?? {};
    const before = next.placements[id] ?? {};
    switch (field) {
      case 'effect':
      case 'ui':
        if (trial.placements[id]) next.placements[id] = value;
        else delete next.placements[id];
        break;
      case 'background':
        next.background = trial.background;
        break;
      case 'add':
        next.decorations.push(id);
        next.placements[id] = value;
        break;
      case 'remove':
        next.decorations = next.decorations.filter(decoration => decoration !== id);
        delete next.placements[id];
        break;
      case 'position':
        next.placements[id] = { ...before, x: value.x, y: value.y };
        break;
      case 'size':
        next.placements[id] = { ...before, width: value.width, height: value.height };
        break;
      case 'assetId':
        next.placements[id] = { ...before, assetId: value.assetId };
        break;
      case 'style':
        next.placements[id] = { ...before, fontSize: value.fontSize, textColor: value.textColor, panelColor: value.panelColor };
        break;
    }
  }
  return next;
}

export function editedStagePosition(before: StagePlacement | undefined, after: StagePlacement | undefined, fallback: Pick<StagePose, 'x' | 'y'>) {
  return {
    x: before?.x !== after?.x ? after?.x ?? fallback.x : fallback.x,
    y: before?.y !== after?.y ? after?.y ?? fallback.y : fallback.y,
  };
}
export type StageEditorSection = 'card' | 'background' | 'decoration' | 'interface' | 'effect';

export function cardOverlayId(role: 'narration' | 'dialogue' | 'ending', cardId: string) {
  return 'overlay:' + role + ':' + cardId;
}

export function getStagePlacement(layout: StageLayout, id: string): StagePlacement {
  const sharedId = /^overlay:(narration|dialogue|ending):/.exec(id)?.[1];
  const placement = layout.placements[id] ?? {};
  if (!sharedId) return placement;
  const overrides = Object.fromEntries(Object.entries(placement).filter(([, value]) => value !== undefined));
  return { ...layout.placements['overlay:' + sharedId], ...overrides };
}
