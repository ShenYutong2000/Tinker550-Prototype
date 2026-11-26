import type { BoardEdge, BoardNode, ChallengePattern } from '../design-board/studioModel';
import { resolveChallengeConfig, resolveChallengeTimeLimitSec, type ChallengeDirection } from './boardPlayEngine';
import type { Placement, Point, Scene } from './stageProject';

type Behavior = ReturnType<typeof resolveChallengeConfig>;
const configs = new WeakMap<BoardNode, Behavior>();
const timeLimits = new WeakMap<BoardEdge[], WeakMap<BoardNode, number | null>>();

export function cardPreviewBehavior(card: BoardNode): Behavior {
  const existing = configs.get(card);
  if (existing) return existing;
  const behavior = resolveChallengeConfig(card);
  configs.set(card, behavior);
  return behavior;
}

export function challengeSpeed(placement: Placement, card: BoardNode, behavior: Behavior) {
  const parameter = card.fields.relatedParameters?.find(item => /speed|速度/i.test(item.name));
  const override = parameter?.exposeOnStage ? placement.parameters?.[parameter.id] : undefined;
  return override !== undefined && override > 0
    ? Math.max(0.35, Math.min(2.6, override / 3))
    : behavior.speedMultiplier;
}

export function cardPreviewTimeLimit(card: BoardNode, edges: BoardEdge[]) {
  let limits = timeLimits.get(edges);
  if (!limits) {
    limits = new WeakMap();
    timeLimits.set(edges, limits);
  }
  const existing = limits.get(card);
  if (existing !== undefined) return existing;
  const limit = resolveChallengeTimeLimitSec(card, edges);
  limits.set(card, limit);
  return limit;
}

export function cardPreviewTravelSpeed(direction: ChallengeDirection, pattern: ChallengePattern, speed: number) {
  if (direction === 'static') return 0;
  return (direction === 'patrol' || direction === 'down' ? 112 : direction === 'up' ? 102 : pattern === 'collectible' ? 125 : 148) * speed;
}

export function cardPreviewCycle(age: number, speed: number) {
  return (age * 0.52 * speed) % 1;
}

export function cardPreviewPatrol(age: number, speed: number) {
  const phase = age * 2.2 * speed;
  return { offset: Math.cos(phase), direction: -Math.sin(phase) >= 0 ? 1 : -1 } as const;
}

export function cardPreviewBounce(age: number, speed: number, preview = false) {
  return Math.abs(Math.sin(age * (preview ? 4.8 : 5) * Math.sqrt(Math.max(0.4, speed)))) * (preview ? 22 : 26);
}

export function challengeMotion(
  anchor: Point, behavior: Behavior, speed: number,
  scene: Pick<Scene, 'width' | 'height'>, age: number, preview = false,
): Point & { spin: -1 | 0 | 1 } {
  const { direction, rotates, visual, bounces, pattern } = behavior;
  const canRoll = rotates || (visual === 'rock' && ['left', 'right', 'patrol'].includes(direction));
  const bounce = bounces && direction !== 'up' && direction !== 'down' ? cardPreviewBounce(age, speed, preview) : 0;

  // Use the original preview's behavior and play speeds around each placed instance.
  const vertical = direction === 'down' || direction === 'up';
  const forward = direction === 'right' || direction === 'down';
  const min = 15;
  const max = vertical ? scene.height - 28 - 15 : scene.width - 15;
  const origin = vertical ? anchor.y : anchor.x;
  if (direction === 'static') return { x: anchor.x, y: anchor.y - bounce, spin: rotates ? 1 : 0 };
  const start = Math.min(max, Math.max(min, origin));
  const rate = cardPreviewTravelSpeed(direction, pattern, speed);
  const travel = (distance: number) => !distance ? 0 : preview ? cardPreviewCycle(age, speed) * distance : (age * rate) % distance;
  if (vertical) {
    const distance = Math.min(preview ? forward ? 152 : 150 : 145, max - min);
    const top = Math.min(max - distance, Math.max(min, start - distance / 2));
    const offset = travel(distance);
    return { x: anchor.x, y: (forward ? top + offset : top + distance - offset) + origin - start, spin: canRoll ? forward ? 1 : -1 : 0 };
  }
  let position = start;
  let sign: -1 | 1 = forward ? 1 : -1;
  if (direction === 'patrol') {
    const low = Math.max(min, start - 66);
    const high = Math.min(max, start + 66);
    const span = high - low;
    if (preview) {
      const patrol = cardPreviewPatrol(age, speed);
      position = (high + low) / 2 + patrol.offset * span / 2;
      sign = patrol.direction;
    } else if (span) {
      const period = span * 2;
      const phase = (period + start - low - (age * rate) % period) % period;
      position = low + (phase <= span ? phase : period - phase);
      sign = phase <= span ? -1 : 1;
    }
  } else {
    const distance = Math.min(196, forward ? max - start : start - min);
    position += sign * travel(distance);
  }
  return {
    x: position + origin - start,
    y: anchor.y - bounce,
    spin: canRoll ? sign : 0,
  };
}
