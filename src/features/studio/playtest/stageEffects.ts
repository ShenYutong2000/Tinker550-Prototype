import type { StageLayout, StagePlacement } from './stageLayout';

export type EffectTrigger = 'collision' | 'collect' | 'score' | 'victory' | 'run' | 'card';
export interface StageEffectConfig {
  trigger: EffectTrigger;
  cardId?: string;
  atMs: number;
  anchor: 'event' | 'hero' | 'fixed';
  durationMs: number;
  opacity: number;
  fade: boolean;
  sound: boolean;
}

export const DEFAULT_STAGE_EFFECT: StageEffectConfig = {
  trigger: 'collect', atMs: 5000, anchor: 'event', durationMs: 1000,
  opacity: 1, fade: true, sound: false,
};

export interface EffectPoint { x: number; y: number }
export interface EffectOccurrence {
  key: string;
  placement: StagePlacement;
  point: EffectPoint;
  at: number;
  preview: boolean;
}

export function effectEntries(layout: StageLayout) {
  return Object.entries(layout.placements).filter(([, placement]) => placement.effect);
}

// Each card entry has its own timer identity, including immediate re-entry.
export class StageEffectScheduler {
  private fired = new Set<string>();
  private visit = 0;
  reset() { this.fired.clear(); this.visit = 0; }
  enter() { this.visit += 1; }

  due(layout: StageLayout, runMs: number, cardMs: number, cardId?: string) {
    return effectEntries(layout).filter(([id, placement]) => {
      const effect = placement.effect!;
      if (effect.trigger !== 'run' && effect.trigger !== 'card') return false;
      if (effect.trigger === 'card' && (!effect.cardId || effect.cardId !== cardId)) return false;
      if (effect.trigger === 'run' && effect.cardId && effect.cardId !== cardId) return false;
      const key = effect.trigger === 'run' ? id : `${id}:${this.visit}`;
      const time = effect.trigger === 'run' ? runMs : cardMs;
      if (time < effect.atMs || this.fired.has(key)) return false;
      this.fired.add(key);
      return true;
    });
  }
}

export function eventEffects(layout: StageLayout, trigger: EffectTrigger, cardIds: readonly string[]) {
  return effectEntries(layout).filter(([, placement]) =>
    placement.effect!.trigger === trigger &&
    (!placement.effect!.cardId || cardIds.includes(placement.effect!.cardId!)));
}
