import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraX, colliderBox, createLibraryPlacement, createPlacement, createScene, copyPlacements, overlaps, patchScenePlacement, placementBox, projectBoardScenes, resizeCollider, resizePlacement, retainChallengeAnchors, rotatePlacement, rotateStagePoint } from './stageProject.ts';
import { activateStageEvent, advanceOverlay, beginSceneRules, clickStageObject, getStageActionControls, isActive, setStageEntityHidden, startScene, stageEditPose, stepScene, restoreSceneCheckpoint, syncRunScenes } from './sceneRuntime.ts';
import { getOutcomeVisualEffects } from '../asset-library/effects/visualEffectsModel.ts';
import { emptyProject, parseProject } from '../projectStore.ts';
import { cloneGroupSubtree, propagateGroupDefinitionFrom } from '../design-board/studioModel.ts';
import { cardPreviewBehavior, challengeMotion, challengeSpeed } from './cardPreviewMotion.ts';
import { backgroundBoundaries, backgroundImageExtent, backgroundImagePlacement, backgroundRangeAt, backgroundRangeForDrop, backgroundRangeInView, backgroundSegments, backgroundTransition, dragBackgroundBoundary, insertBackgroundSegment, moveBackgroundSegment, resizeBackgroundImage } from './stageBackground.ts';

const node = (id, kind, fields = {}) => ({ id, kind, fields, title: id, note: '', parentId: null, manualFields: [], x: 0, y: 0 });
const edge = (id, fromId, toId, event) => ({
  id, fromId, toId, conditionGroup: { combinator: 'AND', clauses: [{ id: id + '-event', kind: 'event', eventId: event, subjectLabel: '', targetMode: 'none' }] },
});
const input = { left: false, right: false, keys: new Set() };
const asset = (id, categoryId) => ({ id, categoryId, name: id, states: [], activeStateId: '' });

const meadow = { id: 'meadow', assetId: 'meadow', start: 0, end: 360, transition: 0 };
const forest = { id: 'forest', assetId: 'forest', start: 360, end: 800, transition: 80, transitionFrom: 'meadow' };

test('separate background assets occupy world ranges and share a movable boundary', () => {
  assert.deepEqual(backgroundRangeAt([meadow], 1080, 367, 360), { start: 360, end: 720 });
  assert.equal(backgroundRangeAt([meadow, forest], 1080, 500, 360), null);
  const seam = backgroundBoundaries([meadow, forest]).find(item => item.x === 360);
  const shifted = dragBackgroundBoundary([meadow, forest], seam, 1080, 419.6, 8);
  assert.deepEqual(shifted.map(item => [item.assetId, item.start, item.end]), [['meadow', 0, 420], ['forest', 420, 800]]);
  const limited = dragBackgroundBoundary(shifted, seam, 1080, 0, 8);
  assert.equal(limited[0].end, 16);
  assert.equal(limited[1].start, 16);
});

test('placing a background in the leftmost view starts at zero and the next image starts at the seam', () => {
  assert.deepEqual(backgroundRangeInView([], 1080, 0, 360, 360), { start: 0, end: 360 });
  assert.deepEqual(backgroundRangeInView([meadow], 1080, 0, 360, 360), { start: 360, end: 720 });
  assert.deepEqual(backgroundRangeInView([], 1080, 420, 360, 360), { start: 420, end: 780 });
});

test('dropping a different image onto an occupied background splits it without changing the existing framing', () => {
  const framing = { x: -25, y: -8, width: 1200, height: 270 };
  const original = { ...meadow, end: 1080, imagePlacement: framing };
  const range = backgroundRangeForDrop([original], 1080, 360, 360);
  const other = { ...range, id: 'forest', assetId: 'forest', transition: 0 };
  assert.deepEqual(insertBackgroundSegment([original], other, 'right-fragment'), [
    { ...original, end: 360 }, other,
    { ...original, id: 'right-fragment', start: 720, transitionFrom: undefined },
  ]);
  const neighbor = { ...forest, id: 'neighbor', start: 1080, end: 1440 };
  const withNeighbor = insertBackgroundSegment([original, neighbor], other, 'right-fragment');
  assert.equal(backgroundTransition(withNeighbor[2], withNeighbor[3]), neighbor.transition);
  assert.deepEqual(backgroundRangeForDrop([meadow], 1080, 0, 360), { start: 0, end: 344 });
});

test('moving and reordering background sections preserves width and follows with locked framing', () => {
  const framing = { x: 175, y: -15, width: 400, height: 270 };
  const offset = { ...meadow, start: 180, end: 540, imagePlacement: framing };
  assert.deepEqual(moveBackgroundSegment([offset], 'meadow', 1080, 4, 8), [
    { ...offset, start: 0, end: 360, imagePlacement: { ...framing, x: -5 } },
  ]);
  const other = { ...forest, end: 720, transition: 0 };
  const moved = moveBackgroundSegment([{ ...meadow, imagePlacement: { ...framing, x: -5 } }, other], 'meadow', 1080, 520);
  assert.deepEqual(moved.map(({ id, start, end }) => [id, start, end]), [['forest', 0, 360], ['meadow', 360, 720]]);
  assert.equal(moved[1].imagePlacement.x, 355);
});

test('background seams snap to an adjacent segment and fade only where sections touch', () => {
  const offsetForest = { ...forest, start: 400 };
  const separated = [meadow, offsetForest];
  assert.equal(backgroundTransition(...separated), 0);
  const edge = backgroundBoundaries(separated).find(item => item.leftId === meadow.id);
  const joined = dragBackgroundBoundary(separated, edge, 1080, 396, 8);
  assert.equal(joined[0].end, joined[1].start);
  assert.equal(backgroundTransition(...joined), 80);
  assert.deepEqual(backgroundImageExtent(joined, 0), { start: 0, end: 440, incoming: 0 });
  assert.deepEqual(backgroundImageExtent(joined, 1), { start: 360, end: 800, incoming: 40 });
});

test('background framing covers its segment and legacy single images open as one editable section', () => {
  assert.deepEqual(backgroundImagePlacement({ ...meadow, frame: { x: .5, y: .75 } }, 20, 350, 230, 400, 400),
    { x: 20, y: -75, width: 330, height: 330 });
  assert.deepEqual(backgroundSegments({ mode: 'tile', color: '#fff', assetId: 'forest' }, 1080), [
    { id: 'original-background', assetId: 'forest', start: 0, end: 1080, transition: 0 },
  ]);
});

test('background corner resizing preserves the image aspect ratio and the opposite corner', () => {
  const image = { x: 10, y: 20, width: 200, height: 100 };
  const result = resizeBackgroundImage(image, { x: -1, y: -1 }, { x: 40, y: 20 });
  assert.deepEqual(result, { x: 50, y: 40, width: 160, height: 80 });
  const tiny = resizeBackgroundImage(image, { x: 1, y: 1 }, { x: -1000, y: -1000 });
  assert.equal(tiny.width / tiny.height, 2);
  assert.equal(tiny.height, 8);
});

test('moving a background seam or changing its fade preserves a saved image in world coordinates', () => {
  const imagePlacement = { x: 17, y: -12, width: 340, height: 255 };
  const saved = [{ ...meadow, imagePlacement }, forest];
  const seam = backgroundBoundaries(saved).find(edge => edge.leftId === meadow.id && edge.rightId === forest.id);
  const moved = dragBackgroundBoundary(saved, seam, 1080, 430, 0);
  const crop = backgroundImageExtent(moved, 0);
  assert.equal(moved[0].end, 430);
  assert.equal(moved[1].start, 430);
  assert.equal(crop.end, 470);
  assert.deepEqual(backgroundImagePlacement(moved[0], crop.start, crop.end, 222, 400, 300), imagePlacement);
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
