import type { StageLayout, StagePlacement } from './stageLayout';

export type MomentClock = { runMs: number; cardId?: string; cardMs: number };
export type MomentTiming = 'run' | 'card' | 'opening';
export type MomentValue =
  | { field: 'size'; value: Pick<StagePlacement, 'width' | 'height'> }
  | { field: 'background'; value: StageLayout['background'] };

export type StageMoment = MomentValue & {
  id: string;
  target: string;
  atMs: number;
  cardId?: string;
};

export type MomentEdit = MomentValue & {
  id: string;
  target: string;
  before: MomentValue['value'];
  clock: MomentClock;
  confirmed?: boolean;
};

export function readMomentValue(layout: StageLayout, target: string, field: MomentValue['field']): MomentValue['value'] {
  if (field === 'background') return layout.background;
  const pose = layout.placements[target];
  return { width: pose?.width, height: pose?.height };
}

export function applyStageMoments(layout: StageLayout, moments: readonly (MomentValue & { target: string })[]): StageLayout {
  if (moments.length === 0) return layout;
  const result = { ...layout, placements: { ...layout.placements } };
  for (const moment of moments) {
    if (moment.field === 'background') result.background = moment.value;
    else result.placements[moment.target] = { ...result.placements[moment.target], ...moment.value };
  }
  return result;
}

export function arrangeMoments(moments: readonly StageMoment[]): StageMoment[] {
  return [...moments].sort((a, b) => a.atMs - b.atMs);
}

export function dueMoments(sorted: readonly StageMoment[], clock: MomentClock): StageMoment[] {
  return [
    ...sorted.filter(moment => !moment.cardId && moment.atMs <= clock.runMs),
    ...sorted.filter(moment => moment.cardId && moment.cardId === clock.cardId && moment.atMs <= clock.cardMs),
  ];
}

export function upsertMoment(moments: StageMoment[], next: StageMoment): StageMoment[] {
  const samePoint = (moment: StageMoment) =>
    moment.target === next.target && moment.field === next.field &&
    moment.atMs === next.atMs && moment.cardId === next.cardId;
  const match = moments.find(samePoint);
  return arrangeMoments([...moments.filter(moment => moment.id !== next.id && !samePoint(moment)),
    { ...next, id: match?.id ?? next.id }]);
}

export function momentSecond(ms: number) {
  return (ms / 1000).toFixed(ms % 100 === 0 ? 1 : 3).replace(/(\.\d*?[1-9])0+$/, '$1');
}
