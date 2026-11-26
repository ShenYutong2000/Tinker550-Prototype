import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraX, colliderBox, createLibraryPlacement, createPlacement, createScene, copyPlacements, overlaps, patchScenePlacement, placementBox, projectBoardScenes, resizeCollider, resizePlacement, retainChallengeAnchors, rotatePlacement, rotateStagePoint } from './stageProject.ts';
import { beginSceneRules, clickStageObject, setStageEntityHidden, startScene, stageEditPose, stepScene, restoreSceneCheckpoint, syncRunScenes } from './sceneRuntime.ts';
import { cardPreviewBehavior, challengeMotion, challengeSpeed } from './cardPreviewMotion.ts';
import { backgroundBoundaries, backgroundImageExtent, backgroundImagePlacement, backgroundRangeAt, backgroundSegments, backgroundTransition, dragBackgroundBoundary, resizeBackgroundImage } from './stageBackground.ts';

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
