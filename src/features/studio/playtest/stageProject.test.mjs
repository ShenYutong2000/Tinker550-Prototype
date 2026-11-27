import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStageAssetVariant, cameraX, colliderBox, createLibraryPlacement, createPlacement, createScene, createStageAssetVariant, copyPlacements, overlaps, patchScenePlacement, placementBox, projectBoardScenes, resizeCollider, resizePlacement, resolveStageParameter, retainChallengeAnchors, rotatePlacement, rotateStagePoint } from './stageProject.ts';
import { activateStageEvent, advanceOverlay, beginSceneRules, clickStageObject, getStageActionControls, isActive, revertStageObjectTrial, setStageEntityHidden, startScene, stageEditPose, stepScene, restoreSceneCheckpoint, syncRunScenes } from './sceneRuntime.ts';
import { getOutcomeVisualEffects } from '../asset-library/effects/visualEffectsModel.ts';
import { emptyProject, parseProject } from '../projectStore.ts';
import { cloneGroupSubtree, propagateGroupDefinitionFrom } from '../design-board/studioModel.ts';
import { cardPreviewBehavior, challengeMotion, challengeSpeed } from './cardPreviewMotion.ts';
import { backgroundImageBox, editableBackground, rectangleBetween, resizeBackgroundImage, snapBackgroundBox } from './stageBackground.ts';
import { createStageHistory, stageHistoryReducer } from './stageHistory.ts';

const node = (id, kind, fields = {}) => ({ id, kind, fields, title: id, note: '', parentId: null, manualFields: [], x: 0, y: 0 });
const edge = (id, fromId, toId, event) => ({
  id, fromId, toId, conditionGroup: { combinator: 'AND', clauses: [{ id: id + '-event', kind: 'event', eventId: event, subjectLabel: '', targetMode: 'none' }] },
});
const input = { left: false, right: false, keys: new Set() };
const asset = (id, categoryId) => ({ id, categoryId, name: id, states: [], activeStateId: '' });

const meadow = { id: 'meadow', assetId: 'meadow', start: 0, end: 360, transition: 0 };
const forest = { id: 'forest', assetId: 'forest', start: 360, end: 800, transition: 80, transitionFrom: 'meadow' };

test('stage history treats one drag as one edit and clears redo after a new change', () => {
  const scene = createScene('Meadow', 'Spawn');
  const coin = createPlacement('challenge', 'Coin', 120, 150);
  scene.placements.push(coin);
  let history = createStageHistory([scene]);
  const drag = Symbol();
  const edit = (id, patch, group) => {
    history = stageHistoryReducer(history, {
      type: 'edit', sceneId: scene.id, group,
      update: scenes => scenes.map(item => patchScenePlacement(item, id, patch)),
    });
  };
  edit(coin.id, { x: 140 }, drag);
  edit(coin.id, { x: 160 }, drag);
  assert.equal(history.past.length, 1);
  history = stageHistoryReducer(history, { type: 'undo' });
  assert.equal(history.scenes[0].placements[1].x, 120);
  history = stageHistoryReducer(history, { type: 'redo' });
  assert.equal(history.scenes[0].placements[1].x, 160);
  history = stageHistoryReducer(history, { type: 'undo' });
  edit(coin.id, { x: 120 });
  assert.equal(history.future.length, 1);
  edit(coin.id, { rotation: 25 });
  assert.equal(history.future.length, 0);
  assert.equal(history.scenes[0].placements[1].rotation, 25);
});

test('automatic card anchors survive stage undo without consuming a history step', () => {
  const scene = createScene('Meadow', 'Spawn');
  const card = node('coin', 'challenge');
  let history = createStageHistory([scene]);
  history = stageHistoryReducer(history, {
    type: 'edit', sceneId: scene.id,
    update: scenes => scenes.map(item => ({ ...item, background: { mode: 'free', color: '#112233', elements: [] } })),
  });
  const projected = projectBoardScenes(history.scenes, [card], []);
  const coin = projected[0].placements.find(item => item.nodeId === card.id);
  history = stageHistoryReducer(history, { type: 'retain-anchors', projected });
  assert.equal(history.past.length, 1);
  history = stageHistoryReducer(history, { type: 'undo' });
  assert.equal(history.scenes[0].background, undefined);
  assert.deepEqual(history.scenes[0].boardOverrides[coin.id], { x: coin.x, y: coin.y });
  history = stageHistoryReducer(history, { type: 'redo' });
  assert.equal(history.scenes[0].background.color, '#112233');
  assert.deepEqual(history.scenes[0].boardOverrides[coin.id], { x: coin.x, y: coin.y });
});

test('legacy sections expose editable image elements with the same crop, lock and transition', () => {
  const scene = createScene('Forest', 'Spawn');
  const imagePlacement = { x: -20, y: -9, width: 430, height: 270 };
  scene.background = { mode: 'segments', color: '#ddeeff', segments: [{ ...meadow, imagePlacement }, forest] };
  const converted = editableBackground(scene);
  assert.equal(converted.color, '#ddeeff');
  assert.deepEqual(converted.elements.map(({ x, width, feather }) => [x, width, feather]), [[0, 400, 0], [320, 480, 80]]);
  assert.equal(converted.elements[0].locked, true);
  assert.deepEqual(backgroundImageBox(converted.elements[0], 120, 70), imagePlacement);
  assert.equal(converted.elements[1].crop.matte, '#ddeeff');
  assert.equal(scene.background.mode, 'segments');
});

test('legacy full-map, inherited and solid-color backgrounds can all be edited', () => {
  const scene = createScene('Forest', 'Spawn');
  const tiled = { ...scene, background: { mode: 'tile', color: '#fefefe', assetId: 'forest' } };
  assert.deepEqual(editableBackground(tiled).elements.map(item => [item.assetId, item.x, item.width]), [['forest', 0, scene.width]]);
  const solid = { ...scene, background: { mode: 'color', color: '#ab3426' } };
  assert.deepEqual(editableBackground(solid), { mode: 'free', color: '#ab3426', elements: [] });
  const inherited = { ...scene, placements: [...scene.placements,
    { ...createPlacement('background', 'Forest art', 240, 100), assetId: 'forest', width: 200, height: 120, rotation: 3 }] };
  const free = editableBackground(inherited);
  assert.equal(free.useSceneBackdrop, true);
  assert.deepEqual(free.elements.map(({ x, y, width, height, rotation }) => [x, y, width, height, rotation]), [[140, 40, 200, 120, 3]]);
});

test('background placement snaps to map and neighboring edges without moving other layers', () => {
  const scene = createScene('Forest', 'Spawn');
  const a = { id: 'a', kind: 'image', assetId: 'field', x: 0, y: 0, width: 360, height: 222 };
  const b = { id: 'b', kind: 'image', assetId: 'forest', x: 357, y: 3, width: 320, height: 222 };
  assert.deepEqual(snapBackgroundBox(b, [a, b], scene, 6), { x: 360, y: 0 });
  assert.deepEqual(snapBackgroundBox({ ...b, x: 301, y: 23 }, [a], scene, 6), { x: 301, y: 23 });
  assert.deepEqual(rectangleBetween({ x: 90, y: 60 }, { x: 10, y: 15 }), { x: 10, y: 15, width: 80, height: 45 });
  assert.equal(a.x, 0);
});

test('background corner resizing preserves the image aspect ratio and the opposite corner', () => {
  const image = { x: 10, y: 20, width: 200, height: 100 };
  const result = resizeBackgroundImage(image, { x: -1, y: -1 }, { x: 40, y: 20 });
  assert.deepEqual(result, { x: 50, y: 40, width: 160, height: 80 });
  const tiny = resizeBackgroundImage(image, { x: 1, y: 1 }, { x: -1000, y: -1000 });
  assert.equal(tiny.width / tiny.height, 2);
  assert.equal(tiny.height, 8);
});

test('layered background exports keep independent positions, opacity, feather and lock', () => {
  const project = emptyProject('Map');
  const scene = createScene('Map', 'Player');
  scene.background = { mode: 'free', color: '#e1edcb', elements: [
    { id: 'one', kind: 'image', assetId: 'meadow', x: -6, y: 0, width: 340, height: 222, locked: true },
    { id: 'two', kind: 'image', assetId: 'forest', x: 303, y: 4, width: 400, height: 226, feather: 32 },
    { id: 'three', kind: 'color', color: '#334455', x: 202, y: 25, width: 62, height: 51, opacity: .45 },
  ] };
  const restored = parseProject(JSON.stringify({ ...project, scenes: [scene] }));
  assert.deepEqual(restored.scenes[0].background, scene.background);
});

test('hidden challenges ignore clicks and contacts and can trigger again when shown', () => {
  const scene = createScene('Forest', 'Player');
  const item = { ...createPlacement('challenge', 'Star', 60, 175), nodeId: 'star', isHidden: true };
  scene.placements.push(item);
  const graph = {
    scenes: [scene],
    nodes: [node('star', 'challenge', { relatedBehavior: null }), node('points', 'outcome', { stageScoreFormula: '2' })],
    edges: [edge('touch', 'star', 'points', 'touches'), edge('click', 'star', 'points', 'is_clicked')],
  };
  const run = startScene(scene, []);
  clickStageObject(run, graph, item.x, item.y);
  stepScene(run, graph, input, .01);
  assert.equal(run.score, 0);
  assert.deepEqual(run.contacts, []);

  const shown = patchScenePlacement(scene, item.id, { isHidden: false });
  syncRunScenes(run, [scene], [shown]);
  graph.scenes = [shown];
  clickStageObject(run, graph, item.x, item.y);
  stepScene(run, graph, input, .01);
  assert.equal(run.score, 4);
  const live = run.entities.find(entity => entity.id === item.id);
  setStageEntityHidden(run, live, true);
  setStageEntityHidden(run, live, false);
  stepScene(run, graph, input, .01);
  assert.equal(run.score, 6);
});

test('a hidden platform loses collision and a hidden challenge countdown resumes its remaining time', () => {
  const scene = createScene('Forest', 'Player');
  const platform = createPlacement('platform', 'Bridge', 60, 196);
  const timer = { ...createPlacement('challenge', 'Timer', 280, 175), nodeId: 'timer' };
  scene.placements.push(platform, timer);
  const graph = {
    scenes: [scene],
    nodes: [node('timer', 'challenge', { relatedBehavior: null, relatedParameters: [{ id: 'auto-time-limit', name: 'Timer', value: 1 }] }),
      node('points', 'outcome', { stageScoreFormula: '1' })],
    edges: [edge('timeout', 'timer', 'points', 'time_up')],
  };
  const run = startScene(scene, []);
  stepScene(run, graph, input, .3);
  assert.equal(run.player.y, 176);
  const livePlatform = run.entities.find(entity => entity.id === platform.id);
  const liveTimer = run.entities.find(entity => entity.id === timer.id);
  setStageEntityHidden(run, livePlatform, true);
  setStageEntityHidden(run, liveTimer, true);
  stepScene(run, graph, input, 2);
  assert.equal(run.player.y, 208);
  assert.equal(run.score, 0);
  setStageEntityHidden(run, livePlatform, false);
  setStageEntityHidden(run, liveTimer, false);
  run.player.y = 175;
  stepScene(run, graph, input, .6);
  assert.equal(run.player.y, 176);
  assert.equal(run.score, 0);
  stepScene(run, graph, input, .15);
  assert.equal(run.score, 1);
});

test('an incoming trigger skips a hidden challenge until it is shown', () => {
  const scene = createScene('Forest', 'Player');
  const source = { ...createPlacement('challenge', 'Switch', 140, 140), nodeId: 'switch' };
  const target = { ...createPlacement('challenge', 'Gate', 260, 140), nodeId: 'gate', activationId: source.id, isHidden: true };
  scene.placements.push(source, target);
  const graph = {
    scenes: [scene],
    nodes: [node('switch', 'challenge'), node('gate', 'challenge'), node('points', 'outcome', { stageScoreFormula: '1' })],
    edges: [edge('activate', 'switch', 'gate', 'is_clicked'), { id: 'reward', fromId: 'gate', toId: 'points' }],
  };
  const run = startScene(scene, []);
  clickStageObject(run, graph, source.x, source.y);
  assert.equal(run.score, 0);
  assert.equal(run.flags.includes('active:' + target.id), false);
  setStageEntityHidden(run, run.entities.find(item => item.id === target.id), false);
  clickStageObject(run, graph, source.x, source.y);
  assert.equal(run.score, 1);
  assert.equal(run.flags.includes('active:' + target.id), true);
});

test('the library alone does not place a player and a challenge asset is not reused as the player', () => {
  const draft = createScene('Forest', 'Player');
  const cat = asset('cat', 'characters');
  const bird = asset('bird', 'characters');
  const challenge = { ...node('bird-challenge', 'challenge'), assetIds: [bird.id] };
  for (const cards of [[], [challenge]]) {
    const [scene] = projectBoardScenes([draft], cards, [cat, bird]);
    assert.equal(scene.placements.find(item => item.id === scene.entrySpawnId).assetId, undefined);
  }
});

test('resizing an anchored element keeps the opposite corner fixed and clamps dimensions', () => {
  const caption = { ...createPlacement('subtitle', 'Caption', 0, 0), x: 20, y: 15, width: 70, height: 30, anchor: 'bottom-right' };
  const box = placementBox(caption);
  const resized = resizePlacement(caption, { x: 1, y: -1 }, { x: 35, y: -10 });
  const after = placementBox({ ...caption, ...resized });
  assert.deepEqual([after.x, after.y + after.height], [box.x, box.y + box.height]);
  assert.deepEqual([after.width, after.height], [105, 40]);
  assert.equal(resizePlacement(caption, { x: 1, y: -1 }, { x: -100, y: 0 }).width, 1);
});

test('rotated resize preserves the opposite visual corner', () => {
  const item = { ...createPlacement('decoration', 'Spark', 100, 120), rotation: 90 };
  const before = placementBox(item);
  const opposite = rotateStagePoint(before, item, item.rotation);
  const patch = resizePlacement(item, { x: 1, y: 1 }, { x: -10, y: 20 });
  const updated = { ...item, ...patch };
  const after = rotateStagePoint(placementBox(updated), updated, updated.rotation);
  assert.equal(patch.width, 50);
  assert.equal(patch.height, 40);
  assert.ok(Math.hypot(after.x - opposite.x, after.y - opposite.y) < 1e-9);
  assert.equal(rotatePlacement(item, { x: 100, y: 90 }, { x: 130, y: 120 }), 180);
});

test('a collision handle changes contact without changing the visual size or rotation', () => {
  const item = { ...createPlacement('challenge', 'Star', 60, 90), rotation: 45 };
  const player = { x: 84, y: 90, width: 10, height: 10 };
  assert.equal(overlaps(player, item), false);
  const updated = { ...item, collider: resizeCollider(item, { x: 1, y: 0 }, { x: 10, y: 6 }) };
  assert.equal(overlaps(player, updated), true);
  assert.deepEqual(colliderBox(updated), { x: 35, y: 75, width: 50, height: 30 });
  assert.deepEqual(placementBox(updated), placementBox(item));
  assert.equal(updated.rotation, 45);
});

test('Related Behavior keeps the original preview cadence and runtime motion at the edited placement', () => {
  const draft = createScene('Forest', 'Player');
  const card = { ...node('roller', 'challenge', {
    relatedBehavior: { mode: 'template', direction: 'right', action: 'roll and bounce, then patrol' },
    relatedParameters: [{ id: 'speed', name: 'Move Speed', value: 3, exposeOnStage: true }],
  }), assetIds: ['roller'] };
  const assets = [asset('roller', 'objects')];
  const [initial] = projectBoardScenes([draft], [card], assets);
  const id = initial.placements.find(item => item.nodeId === card.id).id;
  const edited = patchScenePlacement(draft, id, { x: 230, parameters: { speed: 6 } });
  const [scene] = projectBoardScenes([edited], [card], assets);
  const anchor = scene.placements.find(item => item.id === id);
  const behavior = cardPreviewBehavior(card);
  assert.equal(behavior.direction, 'right');
  const age = .25;
  const speed = challengeSpeed(anchor, card, behavior);
  const preview = challengeMotion(anchor, behavior, speed, scene, age, true);
  assert.equal(preview.x, anchor.x + 196 * .52 * speed * age);
  assert.equal(preview.y, anchor.y - Math.abs(Math.sin(age * 4.8 * Math.sqrt(speed))) * 22);
  const livePose = challengeMotion(anchor, behavior, speed, scene, age);
  const run = startScene(scene, []);
  stepScene(run, { nodes: [card], edges: [], scenes: [scene] }, input, age);
  const moving = run.entities.find(item => item.id === id);
  assert.ok(preview.x > anchor.x && preview.y < anchor.y);
  assert.equal(preview.spin, 1);
  assert.deepEqual({ x: moving.x, y: moving.y, spin: moving.spin }, livePose);
  assert.equal(anchor.x, 230);
});

test('falling and static card behaviors move along their defined directions', () => {
  const scene = createScene('Forest', 'Player');
  const anchor = { x: 200, y: 110 };
  const falling = cardPreviewBehavior(node('fall', 'challenge', { relatedBehavior: { mode: 'custom', customText: 'fall down' } }));
  const stationary = cardPreviewBehavior(node('still', 'challenge', { relatedBehavior: null }));
  const startingHeight = challengeMotion(anchor, falling, 1, scene, 0).y;
  const advanced = challengeMotion(anchor, falling, 1, scene, .25);
  assert.ok(advanced.y > startingHeight);
  assert.equal(advanced.x, anchor.x);
  assert.deepEqual(challengeMotion(anchor, stationary, 1, scene, .25), { ...anchor, spin: 0 });
});

test('changing Related Behavior keeps the original placement and mirrors the run without trial edits', () => {
  const draft = createScene('Forest', 'Player');
  const card = node('rolling', 'challenge', { relatedBehavior: { mode: 'template', direction: 'right', action: 'move' } });
  const first = projectBoardScenes([draft], [card], []);
  const original = first[0].placements.find(item => item.nodeId === card.id);
  const drafts = retainChallengeAnchors([draft], first);
  const falling = { ...card, fields: { relatedBehavior: { mode: 'template', direction: 'down', action: 'fall' } } };
  const updated = projectBoardScenes(drafts, [falling], []);
  const anchor = updated[0].placements.find(item => item.id === original.id);
  assert.deepEqual({ x: anchor.x, y: anchor.y }, { x: original.x, y: original.y });
  assert.equal(retainChallengeAnchors(drafts, updated), drafts);

  const run = startScene(updated[0], []);
  stepScene(run, { nodes: [falling], edges: [], scenes: updated }, input, .25);
  const live = run.entities.find(item => item.id === anchor.id);
  assert.notEqual(live.y, anchor.y);
  assert.equal(stageEditPose(anchor, live).y, live.y);
  const trialPose = stageEditPose(anchor, { ...live, x: live.x + 20, width: 99 }, { x: 20 });
  assert.equal(trialPose.x, live.x);
  assert.equal(trialPose.width, anchor.width);
  assert.equal(anchor.y, original.y);
});

test('paused editing shows trial geometry while project updates preserve temporary fields', () => {
  const draft = createScene('Meadow', 'Spawn');
  const coin = { ...createPlacement('challenge', 'Coin', 175, 180), parameters: { reward: 1 } };
  draft.placements.push(coin);
  const run = startScene(draft, []);
  const entity = run.entities.find(item => item.id === coin.id);
  const patch = { x: 20, width: 58, parameters: { reward: 3 } };
  Object.assign(entity, { ...patch, x: coin.x + patch.x, motionOffset: { x: patch.x, y: 0 }, collected: true });
  const revised = patchScenePlacement(draft, coin.id, { x: 185, width: 36, height: 42, parameters: { reward: 2 } });
  syncRunScenes(run, [draft], [revised], new Map([[coin.id, patch]]));
  const live = run.entities.find(item => item.id === coin.id);
  const authored = revised.placements.find(item => item.id === coin.id);
  const projectPose = stageEditPose(authored, live, patch);
  const trialPose = stageEditPose(authored, live, patch, true);
  assert.deepEqual([projectPose.x, projectPose.width, projectPose.height, projectPose.parameters.reward], [185, 36, 42, 2]);
  assert.deepEqual([trialPose.x, trialPose.width, trialPose.height, trialPose.parameters.reward], [205, 58, 42, 3]);
  assert.equal(trialPose.collected, true);
});

test('discarding trial edits restores one placement without rewinding the run or another object', () => {
  const scene = createScene('Meadow', 'Spawn');
  const coin = { ...createPlacement('challenge', 'Coin', 175, 180), collider: { width: 24, height: 22 }, parameters: { reward: 1 } };
  const otherCoin = createPlacement('challenge', 'Coin', 220, 180);
  scene.placements.push(coin, otherCoin);
  const run = startScene(scene, []);
  const first = run.entities.find(item => item.id === coin.id);
  const second = run.entities.find(item => item.id === otherCoin.id);
  run.time = 2;
  run.score = 7;
  first.collected = true;
  first.spin = 1;
  first.x = 216;
  first.y = 196;
  first.motionOffset = { x: 20, y: 13 };
  first.width = 58;
  first.collider = undefined;
  first.parameters = { reward: 3 };
  second.width = 64;
  setStageEntityHidden(run, first, true);

  revertStageObjectTrial(run, first, coin, { x: 20, y: 13, width: 58, collider: undefined, parameters: { reward: 3 }, isHidden: true });
  assert.deepEqual([first.x, first.y, first.width, first.collider, first.parameters, first.isHidden],
    [196, 183, coin.width, coin.collider, coin.parameters, undefined]);
  assert.deepEqual(first.motionOffset, { x: 0, y: 0 });
  assert.equal(first.hiddenSince, undefined);
  assert.equal(first.collected, true);
  assert.equal(first.spin, 1);
  assert.equal(second.width, 64);
  assert.deepEqual([run.time, run.score], [2, 7]);
});

test('placing a library asset leaves gameplay to the cards in edit and play', () => {
  const scene = createScene('Forest', 'Player');
  const star = asset('star', 'objects');
  const overlay = asset('label', 'interface');
  const world = { x: 500, y: 100 };
  const screen = { x: 40, y: 20 };
  const decoration = createLibraryPlacement(star, scene, world, screen);
  const label = createLibraryPlacement(overlay, scene, world, screen);
  scene.placements.push(decoration, label);
  const card = { ...node('star-card', 'challenge'), assetIds: [star.id] };
  const [projected] = projectBoardScenes([scene], [card], [star, overlay]);
  const stars = startScene(projected, []).entities.filter(item => item.assetId === star.id);
  assert.deepEqual(stars.map(item => [item.kind, item.nodeId]), [['decoration', undefined], ['challenge', card.id]]);
  assert.equal(stars[0].x, world.x);
  assert.equal(label.x, screen.x);
  assert.equal(label.hud, undefined);
});

test('projects authored cards into the same placements used by the editor and a live run', () => {
  const draft = createScene('Forest', 'Spawn');
  const star = { ...node('star-card', 'challenge', { challengePattern: 'collectible' }), assetIds: ['star'] };
  const action = { ...node('jump', 'action'), assetIds: ['cat'] };
  const intro = { ...node('intro', 'narration'), assetIds: ['meadow'] };
  const assets = [asset('star', 'objects'), asset('coin', 'objects'), asset('cat', 'characters'), asset('meadow', 'backgrounds')];
  const before = projectBoardScenes([draft], [intro, star, action], assets);
  const placement = before[0].placements.find(item => item.kind === 'challenge');
  assert.equal(placement.assetId, 'star');
  assert.equal(before[0].placements[0].assetId, 'cat');
  assert.ok(before[0].placements.some(item => item.kind === 'background' && item.assetId === 'meadow'));
  const run = startScene(before[0], []);
  beginSceneRules(run, before[0], { nodes: [intro, star, action], edges: [], scenes: before });
  assert.equal(run.overlayId, intro.id);
  assert.deepEqual(run.entities, before[0].placements);
  run.entities.find(item => item.id === placement.id).collected = true;
  const edited = patchScenePlacement(draft, placement.id, { x: 295, width: 44 });
  const after = projectBoardScenes([edited], [intro, { ...star, assetIds: ['coin'] }, action], assets);
  syncRunScenes(run, before, after);
  const live = run.entities.find(item => item.id === placement.id);
  assert.equal(live.assetId, 'coin');
  assert.equal(live.x, 295);
  assert.equal(live.width, 44);
  assert.equal(live.collected, true);
  assert.equal(projectBoardScenes([edited], [intro, action], assets)[0].placements.some(item => item.id === placement.id), false);
});

test('explicit stage placements are not duplicated and copying a projected card keeps the original', () => {
  const scene = createScene('Forest', 'Spawn');
  const card = { ...node('star-card', 'challenge'), assetIds: ['star'] };
  const assets = [asset('star', 'objects')];
  const first = projectBoardScenes([scene], [card], assets)[0].placements.find(item => item.nodeId === card.id);
  const [copy] = copyPlacements([first], first, false, { x: 24, y: 0 });
  assert.equal(projectBoardScenes([{ ...scene, placements: [...scene.placements, copy] }], [card], assets)[0]
    .placements.filter(item => item.nodeId === card.id).length, 2);
  const manual = { ...createPlacement('challenge', 'Star', 60, 175), nodeId: card.id };
  assert.deepEqual(projectBoardScenes([{ ...scene, placements: [...scene.placements, manual] }], [card], assets)[0]
    .placements.filter(item => item.nodeId === card.id).map(item => item.id), [manual.id]);
});

test('copies a whole mechanism with local links remapped and shared rule references preserved', () => {
  const switchItem = { ...createPlacement('zone', 'Switch', 100, 100), mechanismId: 'pair', nodeId: 'rule', collider: { width: 34, height: 18 } };
  const door = { ...createPlacement('platform', 'Door', 120, 100), mechanismId: 'pair' };
  switchItem.targetId = door.id;
  const [switchCopy, doorCopy] = copyPlacements([switchItem, door], switchItem, true, { x: 30, y: 20 });
  assert.equal(switchCopy.nodeId, 'rule');
  assert.equal(switchCopy.targetId, doorCopy.id);
  assert.notEqual(switchCopy.mechanismId, switchItem.mechanismId);
  assert.deepEqual(switchCopy.collider, switchItem.collider);
  assert.notEqual(switchCopy.collider, switchItem.collider);
  assert.equal(doorCopy.x - switchCopy.x, 20);
  const [single] = copyPlacements([switchItem, door], switchItem, false, { x: 30, y: 20 });
  assert.equal(single.targetId, door.id);
});

test('copies sharing a rule collect independently with per-instance rewards', () => {
  const scene = createScene('Forest', 'Spawn');
  const star = { ...createPlacement('challenge', 'Star', 60, 175), nodeId: 'star' };
  const [copy] = copyPlacements([star], star, false, { x: 0, y: 0 });
  const [third] = copyPlacements([star], star, false, { x: 0, y: 0 });
  copy.parameters = { reward: 3 };
  scene.placements.push(star, copy, third);
  const graph = {
    scenes: [scene],
    nodes: [node('star', 'challenge', { challengePattern: 'collectible', relatedParameters: [{ id: 'reward', name: 'Reward', value: 1, exposeOnStage: true }] }), node('points', 'outcome', { stageScoreFormula: 'Reward' })],
    edges: [edge('collect', 'star', 'points', 'is_collected')],
  };
  const run = startScene(scene, []);
  stepScene(run, graph, input, .01);
  stepScene(run, graph, input, .01);
  assert.equal(run.score, 5);
  assert.ok(run.entities.filter(item => item.kind === 'challenge').every(item => item.collected));
  assert.notEqual(run.verdicts[star.id + ':collect'], run.verdicts[copy.id + ':collect']);
  graph.nodes[0].fields.relatedParameters[0].value = 2;
  const replay = startScene(scene, []);
  stepScene(replay, graph, input, .01);
  assert.equal(replay.score, 7);
});

test('a saved coin variant preserves placement and the original asset event while copies follow its default', () => {
  const project = emptyProject('Coins');
  const scene = createScene('Meadow', 'Spawn');
  const reward = { id: 'reward', name: 'Reward', value: 1, min: 0, max: 10, exposeOnStage: true };
  const coin = { ...asset('coin', 'objects'), folderId: null, activeStateId: 'look', states: [{ id: 'look' }] };
  const challenge = { ...node('collect-coins', 'challenge', { challengePattern: 'collectible', relatedParameters: [reward] }), assetIds: [coin.id] };
  const result = node('points', 'outcome', { stageScoreFormula: 'Reward' });
  const collect = edge('collect', challenge.id, result.id, 'is_collected');
  Object.assign(collect.conditionGroup.clauses[0], { subjectKind: 'asset', subjectAssetId: coin.id });

  const [original] = projectBoardScenes([scene], [challenge, result], [coin])[0].placements.filter(item => item.kind === 'challenge');
  assert.equal(original.assetId, coin.id);
  const [edited] = copyPlacements([original], original, false, { x: 40, y: 0 });
  Object.assign(edited, { x: 60, y: 175, width: 50, height: 45, rotation: 24, collider: { width: 34, height: 32 }, parameters: { reward: 2 } });
  const bigCoin = createStageAssetVariant(coin, edited, challenge, 'Big Coin');
  assert.equal(bigCoin.properties[0].initialValue, 2);
  bigCoin.properties[0].initialValue = 3;
  const placed = { ...edited, ...applyStageAssetVariant(edited, bigCoin) };
  assert.deepEqual(placed.parameters, {});
  assert.deepEqual([placed.x, placed.y, placed.width, placed.height, placed.rotation, placed.collider, placed.nodeId],
    [60, 175, 50, 45, 24, edited.collider, challenge.id]);
  const [copy] = copyPlacements([placed], placed, false, { x: 0, y: 0 });
  const fromLibrary = createLibraryPlacement(bigCoin, scene, { x: 350, y: 175 }, { x: 0, y: 0 }, [challenge]);
  assert.deepEqual([fromLibrary.kind, fromLibrary.nodeId, fromLibrary.width, fromLibrary.height, fromLibrary.rotation, fromLibrary.collider],
    ['challenge', challenge.id, 50, 45, 24, edited.collider]);
  assert.equal(createLibraryPlacement(bigCoin, scene, fromLibrary, fromLibrary).kind, 'decoration');
  assert.equal(resolveStageParameter(reward, original, coin).value, 1);
  assert.equal(resolveStageParameter(reward, copy, bigCoin).value, 3);
  assert.equal(resolveStageParameter(reward, copy, bigCoin).source, 'asset');

  scene.placements.push(placed, copy, fromLibrary);
  const restored = parseProject(JSON.stringify({ ...project, nodes: [challenge, result], edges: [collect], assets: [coin, bigCoin], scenes: [scene] }));
  const graph = {
    nodes: restored.nodes, edges: restored.edges, assets: restored.assets,
    scenes: projectBoardScenes(restored.scenes, restored.nodes, restored.assets),
  };
  assert.equal(graph.scenes[0].placements.filter(item => item.kind === 'challenge').length, 4);
  const run = startScene(graph.scenes[0], []);
  stepScene(run, graph, input, .01);
  assert.equal(run.score, 6);
  const verdict = run.verdicts[copy.id + ':collect'];
  assert.deepEqual(verdict.parameters, [{ id: 'reward', name: 'Reward', value: 3, source: 'asset', assetName: 'Big Coin' }]);

  const restoredBigCoin = graph.assets.find(item => item.id === bigCoin.id);
  restoredBigCoin.properties[0].initialValue = 4;
  assert.equal(resolveStageParameter(reward, copy, restoredBigCoin).value, 4);
  assert.equal(resolveStageParameter(reward, { ...copy, parameters: { reward: 5 } }, restoredBigCoin).value, 5);
  assert.equal(resolveStageParameter(reward, fromLibrary, restoredBigCoin).value, 4);
  assert.equal(verdict.parameters[0].value, 3);
  assert.equal(run.score, 6);
  const replay = startScene(graph.scenes[0], []);
  stepScene(replay, graph, input, .01);
  assert.equal(replay.score, 8);

  const propertyResult = {
    ...result,
    promptInput: { outcomeMode: 'property' },
    fields: { relatedProperties: [{ id: 'score', variableId: 'Points', op: 'formula', formula: 'Points + Reward' }] },
  };
  const propertyRun = startScene(graph.scenes[0], [numberEntry('Points')]);
  stepScene(propertyRun, { ...graph, nodes: [challenge, propertyResult] }, input, .01);
  assert.equal(propertyRun.variables[0].playValue, 8);
  assert.deepEqual(propertyRun.verdicts[copy.id + ':collect'].propertyChanges,
    [{ id: 'Points', name: 'Points', before: 4, after: 8 }]);
});

test('renaming a saved asset updates its placed and copied names while retaining a custom name', () => {
  const coin = { ...asset('coin', 'objects'), name: 'Coin' };
  const challenge = { ...node('collect', 'challenge'), assetIds: [coin.id] };
  const scene = createScene('Meadow', 'Spawn');
  const original = projectBoardScenes([scene], [challenge], [coin])[0].placements.find(item => item.kind === 'challenge');
  const bigCoin = {
    ...coin, id: 'big-coin', name: 'Big Coin',
    stagePreset: { challengeNodeId: challenge.id, ruleAssetIds: [coin.id], width: 48, height: 48, rotation: 0 },
  };
  const patch = applyStageAssetVariant(original, bigCoin);
  assert.equal(patch.nameSource, 'asset');
  // An existing project can already contain the stale label saved by a previous version.
  const legacyScene = patchScenePlacement(scene, original.id, { ...patch, nameSource: undefined });
  const placed = createLibraryPlacement(bigCoin, scene, { x: 220, y: 175 }, { x: 0, y: 0 }, [challenge]);
  const [copy] = copyPlacements([placed], placed, false, { x: 40, y: 0 });
  const [custom] = copyPlacements([placed], { ...placed, name: 'Bridge reward', nameSource: 'custom' }, false, { x: 80, y: 0 });
  legacyScene.placements.push(placed, { ...copy, nameSource: undefined }, custom);

  const before = projectBoardScenes([legacyScene], [challenge], [coin, bigCoin])[0];
  const updated = { ...bigCoin, name: 'Golden Medal' };
  const imported = parseProject(JSON.stringify({ ...emptyProject('Coins'), nodes: [challenge], assets: [coin, updated], scenes: [legacyScene] }));
  const [after] = projectBoardScenes(imported.scenes, imported.nodes, imported.assets);
  const displayName = id => after.placements.find(item => item.id === id)?.name;
  assert.deepEqual([original.id, placed.id, copy.id, custom.id].map(displayName),
    ['Golden Medal', 'Golden Medal', 'Golden Medal', 'Bridge reward']);
  const run = startScene(before, []);
  syncRunScenes(run, [before], [after]);
  const activeCopy = run.entities.find(item => item.id === copy.id);
  assert.equal(activeCopy.name, 'Golden Medal');
  assert.deepEqual([activeCopy.x, activeCopy.y, activeCopy.width, activeCopy.assetId, activeCopy.nodeId],
    [copy.x, copy.y, copy.width, bigCoin.id, challenge.id]);
});

test('a trigger area activates its linked challenge and a scene exit preserves score', () => {
  const scene = { ...createScene('Bridge', 'Spawn'), entryGroupId: 'bridge' };
  const destination = { ...createScene('Castle', 'Spawn'), entryGroupId: 'castle' };
  const zone = { ...createPlacement('zone', 'Bridge entrance', 60, 175), nodeId: 'entry' };
  const log = { ...createPlacement('challenge', 'Log', 210, 170), nodeId: 'log', activationId: zone.id };
  scene.placements.push(zone, log);
  const graph = { scenes: [scene, destination], nodes: [node('bridge', 'group'), node('castle', 'group'), node('entry', 'challenge'), node('log', 'challenge')],
    edges: [edge('activate', 'entry', 'log', 'enters_zone'), { id: 'advance', fromId: 'bridge', toId: 'castle', condition: 'Score >= 5' }] };
  const run = startScene(scene, []);
  stepScene(run, graph, input, .01);
  assert.ok(run.flags.includes('active:' + log.id));
  run.score = 5;
  stepScene(run, graph, input, .01);
  assert.equal(run.sceneId, destination.id);
  assert.equal(run.score, 5);
});

test('checkpoint preserves run state while reading compatible edits from the scene', () => {
  const scene = createScene('Forest', 'Spawn');
  const star = { ...createPlacement('challenge', 'Star', 110, 175), nodeId: 'star' };
  scene.placements.push(star);
  const snap = startScene(scene, []);
  snap.score = 3;
  snap.entities[1].collected = true;
  snap.entities[1].x = 125;
  star.width = 44;
  const restored = restoreSceneCheckpoint(snap, [scene], [node('star', 'challenge')]);
  assert.ok(restored);
  assert.equal(restored.score, 3);
  assert.equal(restored.entities[1].x, 125);
  assert.equal(restored.entities[1].width, 44);
  assert.equal(restored.entities[1].collected, true);
  assert.equal(restoreSceneCheckpoint(snap, [scene], []), undefined);
  assert.equal(cameraX(1080, 900), 702);
});

test('bidirectional associations combine framed actions and lock competing ones for that instance', () => {
  const scene = createScene('Forest', 'Spawn');
  const spark = { ...createPlacement('challenge', 'Spark', 100, 200), nodeId: 'spark-card' };
  scene.placements.push(spark);
  const control = (id, x, key, mechanic) => ({
    ...node(id, 'action', { actionMechanic: mechanic, actionControl: { device: 'keyboard', input: key, interactionType: 'press' } }),
    note: id,
    x,
  });
  const shield = control('shield', 0, 'S', 'shield');
  const pulse = control('pulse', 0, 'D', 'ability');
  const dodge = control('dodge', 450, 'W', 'dodge');
  const graph = {
    scenes: [scene], nodes: [node('spark-card', 'challenge'), shield, pulse, dodge],
    edges: [
      { id: 'reverse', fromId: shield.id, toId: 'spark-card', edgeType: 'association' },
      ...[pulse, dodge].map(action => ({ id: 'to-' + action.id, fromId: 'spark-card', toId: action.id, edgeType: 'association' })),
    ],
    comboFrames: [{ id: 'combo', x: 0, y: 0, width: 300, height: 250 }],
  };
  const run = startScene(scene, []);
  stepScene(run, graph, { ...input, keys: new Set(['s', 'd', 'w']) }, .01);
  assert.deepEqual(Object.keys(run.activeActions), ['shield', 'pulse']);
  assert.ok(run.guardUntil > run.time);
  assert.equal(run.waves.length, 1);
  assert.equal(getStageActionControls(run, graph).find(item => item.action.id === dodge.id).locked, true);
  assert.equal(run.firedEdges.reverse, .01);
  assert.equal(run.firedEdges['to-pulse'], .01);
});

test('shared branches execute together and visual outcomes use the paused simulation clock', () => {
  const scene = createScene('Forest', 'Spawn');
  const spark = { ...createPlacement('challenge', 'Spark', 100, 200), nodeId: 'spark-card', assetId: 'spark' };
  scene.placements.push(spark);
  const fx = { type: 'visibility', enabled: true, visible: false };
  const visual = {
    ...node('visual', 'outcome', { visualOutcome: { assetId: 'spark', effect: fx, duration: .2, restore: true } }),
    promptInput: { outcomeMode: 'visual' },
  };
  const property = (id, variableId, numberValue) => ({
    ...node(id, 'outcome', { relatedProperties: [{ id: 'change-' + id, variableId, op: 'set', numberValue }] }),
    promptInput: { outcomeMode: 'property' },
  });
  const before = property('immediate', 'first', 2);
  const after = property('after-animation', 'second', 3);
  const graph = {
    scenes: [scene], nodes: [node('spark-card', 'challenge'), visual, before, after],
    edges: [
      { ...edge('fx', 'spark-card', visual.id, 'is_clicked'), sharedConditionId: 'branches' },
      { ...edge('property', 'spark-card', before.id, 'is_clicked'), sharedConditionId: 'branches' },
      { id: 'after', fromId: visual.id, toId: after.id },
    ],
  };
  const variable = id => ({ variable: { id, name: id, type: 'number', initialValue: 0 }, fullKey: id, scope: 'global', playValue: 0 });
  const run = startScene(scene, [variable('first'), variable('second')]);
  clickStageObject(run, graph, spark.x, spark.y);
  assert.deepEqual(run.variables.map(entry => entry.playValue), [2, 0]);
  assert.deepEqual(getOutcomeVisualEffects(undefined, run.visualOutcomes.spark, run.time), [fx]);
  assert.equal(run.pendingOutcomes.length, 1);
  assert.deepEqual(Object.keys(run.firedEdges), ['fx', 'property']);
  stepScene(run, graph, input, .1);
  assert.deepEqual(run.variables.map(entry => entry.playValue), [2, 0]);
  stepScene(run, graph, input, .11);
  assert.deepEqual(run.variables.map(entry => entry.playValue), [2, 3]);
  assert.equal(getOutcomeVisualEffects(undefined, run.visualOutcomes.spark, run.time), undefined);
});

test('version-one project files round-trip Canvas edits and accept teammate files without scenes', () => {
  const project = emptyProject('Forest');
  const scene = createScene('Forest', 'Spawn');
  const spark = { ...createPlacement('challenge', 'Spark B', 160, 190), isHidden: true, rotation: 28,
    collider: { width: 49, height: 21 }, parameters: { reward: 3 } };
  scene.placements.push(spark);
  scene.boardOverrides = { 'board:shared:challenge:0': { x: 200, width: 36 } };
  scene.background = { mode: 'segments', color: '#203020', segments: [
    meadow, { ...forest, imagePlacement: { x: 300, y: -20, width: 650, height: 260 } },
  ] };
  assert.equal(parseProject(JSON.stringify(project)).scenes, undefined);
  const json = JSON.stringify({ ...project, scenes: [scene] });
  assert.deepEqual(parseProject(json).scenes, JSON.parse(json).scenes);
});

const numberEntry = (id, initialValue = 0) => ({
  variable: { id, name: id, type: 'number', initialValue }, fullKey: id, scope: 'global', playValue: initialValue,
});
const propertyOutcome = (id, variableId, numberValue) => ({
  ...node(id, 'outcome', { relatedProperties: [{ id, variableId, op: 'set', numberValue }] }),
  promptInput: { outcomeMode: 'property' },
});

test('two passing Outcome arrows from a Challenge run together without a shared condition hub', () => {
  const scene = createScene('Forest', 'Spawn');
  const spark = { ...createPlacement('challenge', 'Spark', 100, 200), nodeId: 'spark' };
  scene.placements.push(spark);
  const nodes = [node('spark', 'challenge'), propertyOutcome('one', 'first', 2), propertyOutcome('two', 'second', 3)];
  const edges = [edge('first-branch', 'spark', 'one', 'is_clicked'), edge('second-branch', 'spark', 'two', 'is_clicked')];
  const run = startScene(scene, [numberEntry('first'), numberEntry('second')]);
  clickStageObject(run, { nodes, edges, scenes: [scene] }, spark.x, spark.y);
  assert.deepEqual(run.variables.map(entry => entry.playValue), [2, 3]);
});

test('a standalone trigger inside a chapter waits for the chapter to unlock', () => {
  const scene = createScene('Forest', 'Spawn');
  const chapter = { ...node('chapter', 'group'), availableWhen: 'Score >= 2' };
  const result = { ...propertyOutcome('result', 'value', 5), parentId: chapter.id };
  const graph = { nodes: [chapter, result], edges: [{ id: 'entry', fromId: null, toId: result.id, edgeType: 'flow', condition: 'Score >= 0' }], scenes: [scene] };
  const run = startScene(scene, [numberEntry('value')]);
  beginSceneRules(run, scene, graph);
  stepScene(run, graph, input, .01);
  assert.equal(run.variables[0].playValue, 0);
  assert.deepEqual(run.unlockedGroups, []);
  run.score = 2;
  stepScene(run, graph, input, .01);
  stepScene(run, graph, input, .01);
  assert.deepEqual(run.unlockedGroups, [chapter.id]);
  assert.equal(run.variables[0].playValue, 5);
});

test('an authored flow delays the Challenge in Play while its Canvas placement stays available', () => {
  const draft = createScene('Forest', 'Spawn');
  const intro = { ...node('intro', 'narration'), note: 'Start the challenge' };
  const spark = { ...node('spark', 'challenge'), note: 'Moving spark' };
  const graph = { nodes: [intro, spark], edges: [{ id: 'intro-flow', fromId: intro.id, toId: spark.id, edgeType: 'flow' }], scenes: [] };
  graph.scenes = projectBoardScenes([draft], graph.nodes, []);
  const [scene] = graph.scenes;
  const original = scene.placements.find(item => item.nodeId === spark.id);
  const run = startScene(scene, []);
  beginSceneRules(run, scene, graph);
  assert.equal(isActive(original, run), false);
  assert.deepEqual(stageEditPose(original, run.entities.find(item => item.id === original.id)), { ...original, spin: undefined, collected: undefined, open: undefined });
  advanceOverlay(run, graph);
  assert.equal(isActive(original, run), true);
});

test('a pending Action can finish when a debug condition changes after the input', () => {
  const scene = createScene('Forest', 'Spawn');
  const action = { ...node('pulse', 'action', { actionMechanic: 'ability',
    actionControl: { device: 'keyboard', input: 'Space', interactionType: 'press' } }), note: 'Pulse' };
  const result = propertyOutcome('result', 'charge', 3);
  const graph = { nodes: [action, result], scenes: [scene],
    edges: [{ id: 'wait-for-toggle', fromId: action.id, toId: result.id, edgeType: 'flow', condition: 'Enable pulse' }] };
  const run = startScene(scene, [numberEntry('charge')]);
  beginSceneRules(run, scene, graph);
  stepScene(run, graph, { ...input, keys: new Set(['space']) }, .01);
  assert.equal(run.variables[0].playValue, 0);
  activateStageEvent(run, 'Enable pulse', graph);
  stepScene(run, graph, input, .01);
  assert.equal(run.variables[0].playValue, 3);
  assert.equal(run.activeActions.pulse.resolved, true);
});

test('a locked chapter blocks interaction and only emits appearance after its challenge is available', () => {
  const scene = createScene('Forest', 'Spawn');
  const chapter = { ...node('chapter', 'group'), availableWhen: 'Score >= 2' };
  const spark = { ...createPlacement('challenge', 'Spark', 250, 200), nodeId: 'spark' };
  scene.placements.push(spark);
  const nodes = [chapter, { ...node('spark', 'challenge'), parentId: chapter.id },
    { ...propertyOutcome('click', 'clicked', 3), parentId: chapter.id },
    { ...propertyOutcome('appear', 'visible', 5), parentId: chapter.id }];
  const edges = [edge('clicked', 'spark', 'click', 'is_clicked'), edge('appeared', 'spark', 'appear', 'appears')];
  const graph = { nodes, edges, scenes: [scene] };
  const run = startScene(scene, [numberEntry('clicked'), numberEntry('visible')]);
  beginSceneRules(run, scene, graph);
  clickStageObject(run, graph, spark.x, spark.y);
  stepScene(run, graph, input, .01);
  assert.deepEqual(run.variables.map(entry => entry.playValue), [0, 0]);
  run.score = 2;
  stepScene(run, graph, input, .01);
  assert.deepEqual(run.variables.map(entry => entry.playValue), [0, 5]);
  clickStageObject(run, graph, spark.x, spark.y);
  assert.deepEqual(run.variables.map(entry => entry.playValue), [3, 5]);
});

test('nested chapter roots unlock and a parallel chapter progresses without taking initial focus', () => {
  const scene = createScene('Forest', 'Spawn');
  const focus = node('focus', 'group');
  const nested = { ...node('nested', 'group'), parentId: focus.id };
  const helper = { ...node('helper', 'challenge'), parentId: nested.id };
  const result = { ...propertyOutcome('result', 'points', 3), parentId: nested.id };
  const parallel = { ...node('parallel', 'group'), x: 500 };
  const next = { ...node('next', 'group'), x: 1000 };
  const graph = {
    nodes: [focus, nested, helper, result, parallel, next], scenes: [scene],
    edges: [
      edge('inside-nested', helper.id, result.id, 'is_clicked'),
      { id: 'parallel-progress', fromId: parallel.id, toId: next.id, edgeType: 'flow', condition: 'Score >= 2' },
    ],
  };
  const run = startScene(scene, [numberEntry('points')]);
  beginSceneRules(run, scene, graph);
  assert.equal(run.groupId, focus.id);
  assert.ok(run.unlockedGroups.includes(nested.id));
  assert.ok(run.unlockedGroups.includes(parallel.id));
  run.score = 2;
  stepScene(run, graph, input, .01);
  assert.equal(run.groupId, next.id);
});

test('a Challenge property condition reacts once for each instance without a collision', () => {
  const scene = createScene('Forest', 'Spawn');
  const spark = { ...createPlacement('challenge', 'Spark', 300, 200), nodeId: 'spark' };
  scene.placements.push(spark);
  const result = {
    ...node('result', 'outcome', { relatedProperties: [{ id: 'reward', variableId: 'value', op: 'formula', formula: 'value + 1' }] }),
    promptInput: { outcomeMode: 'property' },
  };
  const next = propertyOutcome('next', 'chained', 2);
  const graph = { nodes: [node('spark', 'challenge'), result, next],
    edges: [
      { id: 'on-score', fromId: 'spark', toId: result.id, condition: 'Score >= 2' },
      { id: 'after-score', fromId: result.id, toId: next.id },
    ], scenes: [scene] };
  const run = startScene(scene, [numberEntry('value'), numberEntry('chained')]);
  stepScene(run, graph, input, .01);
  assert.equal(run.variables[0].playValue, 0);
  run.score = 2;
  stepScene(run, graph, input, .01);
  stepScene(run, graph, input, .01);
  assert.equal(run.variables[0].playValue, 1);
  assert.equal(run.variables[1].playValue, 2);
});

test('duplicated and linked groups each use their own shared condition hub ID', () => {
  const group = node('group', 'group');
  const children = ['origin', 'branch1', 'branch2'].map(id => ({ ...node(id, 'challenge'), parentId: group.id }));
  const edges = [
    { id: 'e1', fromId: 'origin', toId: 'branch1', edgeType: 'flow', condition: 'Score >= 2', sharedConditionId: 'hub' },
    { id: 'e2', fromId: 'origin', toId: 'branch2', edgeType: 'flow', condition: 'Score >= 2', sharedConditionId: 'hub' },
  ];
  const duplicate = cloneGroupSubtree(group.id, 'duplicate', [group, ...children], edges, 'en');
  const copyEdges = duplicate.edges.slice(edges.length);
  assert.equal(copyEdges[0].sharedConditionId, copyEdges[1].sharedConditionId);
  assert.notEqual(copyEdges[0].sharedConditionId, 'hub');
  const reuse = cloneGroupSubtree(group.id, 'reuse', [group, ...children], edges, 'en');
  const updated = reuse.edges.map(item => edges.some(edge => edge.id === item.id) ? { ...item, condition: 'Score >= 3' } : item);
  const synced = propagateGroupDefinitionFrom(group.id, reuse.nodes, updated);
  const syncedCopy = synced.edges.filter(item => !edges.some(edge => edge.id === item.id));
  assert.equal(syncedCopy.length, 2);
  assert.notEqual(syncedCopy[0].sharedConditionId, 'hub');
  assert.equal(syncedCopy[0].sharedConditionId, syncedCopy[1].sharedConditionId);
  assert.ok(syncedCopy.every(item => item.condition === 'Score >= 3'));
});
