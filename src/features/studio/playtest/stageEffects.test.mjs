import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function load(name) {
  const source = stripTypeScriptTypes(readFileSync(new URL(name, import.meta.url), 'utf8'));
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const { StageEffectScheduler, DEFAULT_STAGE_EFFECT, eventEffects } = await load('./stageEffects.ts');
const { stageLayoutChanges, applyStageLayoutChanges } = await load('./stageLayout.ts');
const empty = () => ({ placements: {}, decorations: [], background: {} });
const fixture = trigger => ({ ...empty(), placements: {
  'effect:1': { assetId: 'sparkle', effect: { ...DEFAULT_STAGE_EFFECT, trigger, cardId: trigger === 'card' ? 'challenge' : undefined } },
} });

test('run timer fires once, including crossing a deadline with a large frame', () => {
  const scheduler = new StageEffectScheduler();
  const layout = fixture('run');
  assert.equal(scheduler.due(layout, 4999, 0).length, 0);
  assert.equal(scheduler.due(layout, 5100, 0).length, 1);
  assert.equal(scheduler.due(layout, 9000, 0).length, 0);
  scheduler.reset();
  assert.equal(scheduler.due(layout, 5100, 0).length, 1);
});
test('card timers restart per visit and skipped or exited cards never fire', () => {
  const scheduler = new StageEffectScheduler();
  const layout = fixture('card');
  scheduler.enter();
  assert.equal(scheduler.due(layout, 8000, 8000, 'other').length, 0);
  assert.equal(scheduler.due(layout, 9000, 4999, 'challenge').length, 0);
  assert.equal(scheduler.due(layout, 9001, 5000, 'challenge').length, 1);
  scheduler.enter();
  assert.equal(scheduler.due(layout, 10000, 0, 'challenge').length, 0);
  assert.equal(scheduler.due(layout, 15000, 5000, 'challenge').length, 1);
});
test('frozen clocks do not reach the next trigger while paused', () => {
  const scheduler = new StageEffectScheduler();
  for (let frame = 0; frame < 100; frame++) assert.equal(scheduler.due(fixture('run'), 4999, 0).length, 0);
  assert.equal(scheduler.due(fixture('run'), 5000, 0).length, 1);
});
test('events filter independently by trigger and source card', () => {
  const layout = fixture('collect');
  layout.placements['effect:1'].effect.cardId = 'challenge';
  assert.equal(eventEffects(layout, 'collision', ['challenge']).length, 0);
  assert.equal(eventEffects(layout, 'collect', ['other']).length, 0);
  assert.equal(eventEffects(layout, 'collect', ['challenge', 'result']).length, 1);
});
test('confirmation saves only selected effects and supports removal without modifying the saved input', () => {
  const saved = empty();
  const trial = fixture('collect');
  trial.placements['effect:2'] = { ...trial.placements['effect:1'], effect: { ...DEFAULT_STAGE_EFFECT, trigger: 'run' } };
  const changes = stageLayoutChanges(saved, trial);
  assert.equal(changes.length, 2);
  const next = applyStageLayoutChanges(saved, trial, [changes[0]]);
  assert.equal(Object.keys(next.placements).length, 1);
  assert.equal(Object.keys(saved.placements).length, 0);
  const removed = empty();
  assert.deepEqual(applyStageLayoutChanges(next, removed, stageLayoutChanges(next, removed)), removed);
});
test('legacy layouts have no effects or unexpected changes', () => {
  assert.deepEqual(eventEffects(empty(), 'score', []), []);
  assert.deepEqual(stageLayoutChanges(empty(), empty()), []);
});
