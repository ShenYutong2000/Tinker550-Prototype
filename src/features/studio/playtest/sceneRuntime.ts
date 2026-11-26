import { type BoardEdge, type BoardNode } from '../design-board/studioModel';
import { applyOutcomePropertyRule, clampNumberValue, evaluateNumberFormula, type ScopedStateVariable } from '../properties/stateModel';
import { evaluateEdgeCondition, evaluateGroupAvailability, findStartNodeId, getGroupLocalRoots, getPlayableNodes, INITIAL_PLAY_STATS, resolveActionConfig, resolveActionControl, resolveOutcomeConfig, resolvePlaybackSettings, type RuntimeEventRecord } from './boardPlayEngine';
import { cardPreviewBehavior, cardPreviewTimeLimit, challengeMotion, challengeSpeed } from './cardPreviewMotion';
import { cameraX, overlaps, type Placement, type Scene } from './stageProject';

export interface StageVerdict {
  edgeId: string;
  nodeId?: string;
  objectId?: string;
  passed: boolean;
  clauses: { id: string; passed: boolean; actual?: string | number | boolean }[];
  scoreBefore: number;
  scoreAfter: number;
}

export type StageEntity = Placement & { collected?: boolean; open?: boolean; hiddenSince?: number; motionOffset?: { x: number; y: number }; spin?: -1 | 0 | 1 };
type Entity = StageEntity;
export interface StageRun {
  sceneId: string;
  player: { x: number; y: number; vy: number; grounded: boolean; width: number; height: number };
  entities: Entity[];
  saved: Record<string, Entity[]>;
  contacts: string[];
  flags: string[];
  variables: ScopedStateVariable[];
  score: number;
  hp: number;
  time: number;
  entryTime: number;
  verdicts: Record<string, StageVerdict>;
  activationTimes: Record<string, number>;
  edgeId?: string;
  edgeTime?: number;
  checkpointId?: string;
  checkpointVisits?: number;
  overlayId?: string;
  overlayTime: number;
  actionId?: string;
  actionOwnerId?: string;
  actionTime: number;
  guardUntil?: number;
  lockedCameraX?: number;
  sound?: { id: string; assetId: string };
  finished?: 'victory' | 'defeat';
}

export type StageInput = { left: boolean; right: boolean; keys: Set<string> };
type Graph = { nodes: BoardNode[]; edges: BoardEdge[]; scenes: Scene[] };

export function setStageEntityHidden(run: StageRun, item: StageEntity, hidden: boolean | undefined) {
  item.isHidden = hidden;
  if (hidden) {
    item.hiddenSince ??= run.time;
    run.contacts = run.contacts.filter(id => id !== item.id);
  } else if (item.hiddenSince !== undefined) {
    const activated = run.activationTimes[item.id] ?? run.entryTime;
    run.activationTimes[item.id] = activated + Math.max(0, run.time - Math.max(activated, item.hiddenSince));
    item.hiddenSince = undefined;
  }
}

export function stageEditPose(placement: Placement, active?: StageEntity, trialOffset?: Pick<Partial<Placement>, 'x' | 'y'>): StageEntity {
  if (!active) return placement;
  return {
    ...placement,
    x: active.x - (trialOffset?.x ?? 0), y: active.y - (trialOffset?.y ?? 0),
    spin: active.spin, collected: active.collected, open: active.open,
  };
}

export function startScene(scene: Scene, variables: ScopedStateVariable[], previous?: StageRun): StageRun {
  const spawn = scene.placements.find(item => item.id === scene.entrySpawnId) ?? scene.placements.find(item => item.kind === 'spawn');
  const saved = previous ? { ...previous.saved, [previous.sceneId]: previous.entities } : {};
  const run: StageRun = {
    sceneId: scene.id, player: { x: spawn?.x ?? 55, y: spawn?.y ?? scene.height - 48, vy: 0, grounded: false, width: 23, height: 28 },
    entities: structuredClone(saved[scene.id] ?? scene.placements), saved, contacts: [], flags: previous?.flags ?? [],
    variables: structuredClone(previous?.variables ?? variables),
    score: previous?.score ?? INITIAL_PLAY_STATS.score, hp: previous?.hp ?? INITIAL_PLAY_STATS.hp,
    time: previous?.time ?? 0, entryTime: previous?.time ?? 0, verdicts: previous?.verdicts ?? {}, activationTimes: previous?.activationTimes ?? {},
    edgeId: previous?.edgeId, overlayTime: 0, actionTime: -1,
  };
  for (const item of run.entities) {
    if (item.isHidden) setStageEntityHidden(run, item, true);
  }
  return run;
}

export function restoreSceneCheckpoint(snapshot: StageRun, scenes: Scene[], nodes: BoardNode[]): StageRun | undefined {
  const scene = scenes.find(item => item.id === snapshot.sceneId);
  if (!scene || snapshot.entities.some(item => item.nodeId && !nodes.some(node => node.id === item.nodeId))) return;
  const restored = structuredClone(snapshot);
  restored.entities = scene.placements.map(placement => {
    const prior = snapshot.entities.find(item => item.id === placement.id);
    const next = structuredClone(placement);
    if (!prior) {
      if (next.isHidden) setStageEntityHidden(restored, next, true);
      return next;
    }
    const { x, y, collected, open, motionOffset, spin, hiddenSince } = prior;
    const entity = { ...next, x, y, collected, open, motionOffset: motionOffset && { ...motionOffset }, spin, hiddenSince };
    setStageEntityHidden(restored, entity, next.isHidden);
    return entity;
  });
  restored.verdicts = {};
  restored.edgeId = undefined;
  restored.sound = undefined;
  return restored;
}

export function syncRunScenes(run: StageRun, previous: Scene[], next: Scene[]) {
  const reconcile = (id: string, entities: Entity[]) => {
    const before = new Map(previous.find(scene => scene.id === id)?.placements.map(item => [item.id, item]));
    const active = new Map(entities.map(item => [item.id, item]));
    return (next.find(scene => scene.id === id)?.placements ?? []).map(placement => {
      const entity = active.get(placement.id);
      const old = before.get(placement.id);
      if (!entity || !old) {
        if (id === run.sceneId) run.activationTimes[placement.id] = run.time;
        const added = structuredClone(placement);
        if (added.isHidden) setStageEntityHidden(run, added, true);
        return added;
      }
      const change: Entity = { ...entity };
      for (const key of Object.keys({ ...old, ...placement }) as (keyof Placement)[]) {
        if (key === 'x' || key === 'y' || Object.is(old[key], placement[key])) continue;
        Object.assign(change, { [key]: structuredClone(placement[key]) });
      }
      change.x += placement.x - old.x;
      change.y += placement.y - old.y;
      if (entity.isHidden !== change.isHidden) setStageEntityHidden(run, change, change.isHidden);
      return change;
    });
  };
  run.entities = reconcile(run.sceneId, run.entities);
  const present = new Set(run.entities.filter(item => !item.isHidden).map(item => item.id));
  run.contacts = run.contacts.filter(id => present.has(id));
  for (const [id, entities] of Object.entries(run.saved)) run.saved[id] = reconcile(id, entities);
}

function setOverlay(run: StageRun, node: BoardNode) {
  run.overlayId = node.id;
  run.overlayTime = run.time;
}

function symbols(graph: Pick<Graph, 'nodes'>, object?: Placement) {
  const source = graph.nodes.find(node => node.id === object?.nodeId);
  const nodes = source ? [source, ...graph.nodes.filter(node => node !== source)] : graph.nodes;
  const parameters = nodes.flatMap(node => node.fields.relatedParameters?.map(parameter => ({
    key: parameter.name,
    value: node.id === source?.id && parameter.exposeOnStage ? object?.parameters?.[parameter.id] ?? parameter.value : parameter.value,
    source: 'parameter' as const,
  })) ?? []);
  if (object) parameters.unshift(
    { key: 'StageWidth', value: object.width, source: 'parameter' },
    { key: 'StageHeight', value: object.height, source: 'parameter' },
  );
  return parameters;
}

export function calculateStageReward(node: BoardNode, nodes: BoardNode[], variables: ScopedStateVariable[], object?: Placement) {
  const formula = node.fields.stageScoreFormula?.trim();
  const result = formula ? evaluateNumberFormula(formula, variables, symbols({ nodes }, object)) : undefined;
  return { formula, value: result?.ok ? result.value : resolveOutcomeConfig(node).scoreDelta, valid: !result || result.ok };
}

function evaluate(run: StageRun, edge: BoardEdge, graph: Graph, object: Entity | undefined, events: RuntimeEventRecord[]) {
  const scene = graph.scenes.find(item => item.id === run.sceneId);
  const hero = scene?.placements.find(item => item.id === scene.entrySpawnId);
  const customFlags = Object.fromEntries(run.flags.map(flag => [flag, true]));
  const context = {
    eventRecords: events, runtimeEvents: new Set(events.map(event => event.eventId)),
    simulatedEvents: customFlags, numericParameters: symbols(graph, object), heroAssetId: hero?.assetId, hazardAssetId: object?.assetId,
  };
  const stats = { score: run.score, hp: run.hp };
  const passed = evaluateEdgeCondition(edge.condition, stats, customFlags, run.variables, edge.conditionGroup, context).passed;
  const verdict: StageVerdict = {
    edgeId: edge.id, nodeId: edge.fromId ?? undefined, objectId: object?.id, passed,
    clauses: edge.conditionGroup?.clauses.map(clause => ({
      id: clause.id,
      actual: clause.kind === 'property' ? run.variables.find(entry => entry.variable.id === clause.propertyId)?.playValue : undefined,
      passed: evaluateEdgeCondition('', stats, customFlags, run.variables, { combinator: 'AND', clauses: [clause] }, context).passed,
    })) ?? [],
    scoreBefore: run.score, scoreAfter: run.score,
  };
  run.verdicts[(object?.id ?? '') + ':' + edge.id] = verdict;
  return verdict;
}

function follow(run: StageRun, nodeId: string | null, graph: Graph, object: Entity | undefined, events: RuntimeEventRecord[], visited = new Set<string>()): boolean {
  if (object?.isHidden) return false;
  if (nodeId && visited.has(nodeId)) return false;
  if (nodeId) visited.add(nodeId);
  const candidates = graph.edges.filter(edge => edge.fromId === nodeId && !visited.has(edge.toId));
  for (const edge of candidates) {
    const node = graph.nodes.find(card => card.id === edge.toId);
    if (!node || node.kind === 'draft' || node.kind === 'action' || node.stageTemplate) continue;
    if (node.kind === 'challenge') {
      const targets = run.entities.filter(item => item.nodeId === node.id && (!item.activationId || item.activationId === object?.id));
      if (targets.length > 0 && targets.every(item => item.isHidden)) continue;
    }
    if (nodeId === null && !edge.condition && !edge.conditionGroup?.clauses.length) continue;
    if (nodeId === null && run.flags.includes('entry:' + edge.id)) continue;
    const verdict = evaluate(run, edge, graph, object, events);
    if (!verdict.passed) continue;
    if (node.kind === 'group' && !evaluateGroupAvailability(node, graph.nodes, { score: run.score, hp: run.hp }, {}, run.variables).passed) continue;
    if (nodeId === null) run.flags.push('entry:' + edge.id);
    run.edgeId = edge.id;
    run.edgeTime = run.time;
    if (node.kind === 'outcome') {
      const outcome = resolveOutcomeConfig(node);
      const params = symbols(graph, object);
      const reward = calculateStageReward(node, graph.nodes, run.variables, object);
      run.score = Math.max(0, run.score + reward.value);
      run.hp = Math.max(0, run.hp + outcome.hpDelta);
      const rules = node.fields.relatedProperties ?? [];
      for (const rule of rules) {
        const entry = run.variables.find(variable => variable.variable.id === rule.variableId);
        if (entry) entry.playValue = applyOutcomePropertyRule(rule, entry, run.variables, params);
      }
      for (const entry of run.variables) {
        if (entry.variable.type !== 'number' || rules.some(rule => rule.variableId === entry.variable.id)) continue;
        const name = entry.variable.name;
        const delta = /血量|血|生命|体力|\bhp\b|health|life/i.test(name) ? outcome.hpDelta
          : /分数|得分|积分|星星|金币|\bscore\b|point|\bpts\b|star|coin/i.test(name) ? reward.value : 0;
        if (delta) entry.playValue = clampNumberValue(Number(entry.playValue) + delta, entry.variable);
      }
      if (node.fields.stageTargetEffect === 'open' && object?.targetId) {
        const target = run.entities.find(item => item.id === object.targetId);
        if (target && !target.isHidden) target.open = true;
      }
      if (node.fields.stageTargetEffect === 'collect' && object) object.collected = true;
      if (node.fields.stageTargetEffect === 'lock-camera') {
        const scene = graph.scenes.find(item => item.id === run.sceneId);
        if (scene) run.lockedCameraX = sceneCamera(scene, run);
      }
      if (node.fields.stageTargetEffect === 'follow-camera') run.lockedCameraX = undefined;
      verdict.scoreAfter = run.score;
      if (outcome.visual === 'victory' || outcome.visual === 'defeat') run.finished = outcome.visual;
      if (!run.finished) follow(run, node.id, graph, object, [], visited);
    } else if (node.kind === 'narration' || node.kind === 'dialogue') {
      setOverlay(run, node);
    } else if (node.kind === 'group') {
      const destination = graph.scenes.find(scene => scene.id !== run.sceneId && scene.entryGroupId === node.id);
      if (destination) {
        enterScene(run, destination, graph);
        if (node.stageResetOnEntry) {
          run.score = INITIAL_PLAY_STATS.score;
          run.hp = INITIAL_PLAY_STATS.hp;
          run.variables = run.variables.map(entry => ({ ...entry, playValue: entry.variable.initialValue }));
        }
      }
      else enterGroup(run, node.id, graph);
    } else {
      for (const target of run.entities.filter(item => !item.isHidden && item.nodeId === node.id && (!item.activationId || item.activationId === object?.id))) {
        if (run.flags.includes('active:' + target.id)) continue;
        run.flags.push('active:' + target.id);
        run.activationTimes[target.id] = run.time;
      }
      follow(run, node.id, graph, object, [], visited);
    }
    return true;
  }
  return false;
}

export function enterGroup(run: StageRun, groupId: string, graph: Graph) {
  const opening = getGroupLocalRoots(groupId, graph.nodes, graph.edges).find(node => node.kind === 'dialogue' || node.kind === 'narration');
  if (opening) setOverlay(run, opening);
}

export function beginSceneRules(run: StageRun, scene: Scene, graph: Graph) {
  if (scene.entryGroupId) {
    enterGroup(run, scene.entryGroupId, graph);
    return;
  }
  if (scene.id !== graph.scenes[0]?.id) return;
  const start = findStartNodeId(graph.nodes.filter(node => !node.stageTemplate), graph.edges);
  const opening = graph.nodes.find(node => node.id === start);
  if (opening?.kind === 'group') enterGroup(run, opening.id, graph);
  if (opening?.kind === 'dialogue' || opening?.kind === 'narration') setOverlay(run, opening);
}

function enterScene(run: StageRun, destination: Scene, graph: Graph) {
  const next = startScene(destination, run.variables, run);
  Object.assign(run, next);
  beginSceneRules(run, destination, graph);
}

export function advanceOverlay(run: StageRun, graph: Graph, key?: string) {
  const node = graph.nodes.find(card => card.id === run.overlayId);
  if (!node) return;
  const playback = resolvePlaybackSettings(node);
  if (playback.mode === 'key' && key !== playback.key?.toLowerCase()) return;
  if (playback.mode === 'auto' && key !== undefined) return;
  if (playback.mode === 'click' && key !== undefined && key !== 'space' && key !== 'enter') return;
  run.overlayId = undefined;
  if (!follow(run, node.id, graph, undefined, []) && graph.edges.length === 0) {
    const playable = getPlayableNodes(graph.nodes);
    const next = playable[playable.findIndex(item => item.id === node.id) + 1];
    if (next?.kind === 'narration' || next?.kind === 'dialogue') setOverlay(run, next);
  }
}

export function clickStageObject(run: StageRun, graph: Graph, x: number, y: number) {
  if (run.overlayId || run.finished) return;
  const object = [...run.entities].reverse().find(item => item.kind === 'challenge' &&
    !item.open && !item.collected && isActive(item, run) &&
    !graph.nodes.some(node => node.id === item.nodeId && cardPreviewBehavior(node).isSceneOnly) &&
    overlaps({ x, y, width: 0, height: 0 }, item));
  if (!object) return;
  const events: RuntimeEventRecord[] = [{
    eventId: 'is_clicked', subjectAssetId: object.assetId, subjectInstanceId: object.id, subjectRole: 'hazard',
  }];
  if (!follow(run, object.nodeId ?? null, graph, object, events) && object.nodeId) follow(run, null, graph, object, events);
}

export function activateStageEvent(run: StageRun, flag: string, graph: Graph) {
  if (run.flags.includes(flag)) return;
  run.flags.push(flag);
  follow(run, null, graph, undefined, []);
  const scene = graph.scenes.find(item => item.id === run.sceneId);
  if (scene) checkSceneExit(run, scene, graph);
}

export function checkSceneExit(run: StageRun, scene: Scene, graph: Graph, object?: Entity, events: RuntimeEventRecord[] = []) {
  if (!scene.entryGroupId || run.overlayId || run.finished) return false;
  const challenges = run.entities.filter(item => item.kind === 'challenge' && !item.isHidden);
  const completed = challenges.length > 0 && challenges.every(item => item.collected || item.open);
  const eligible = graph.edges.filter(edge => edge.fromId !== scene.entryGroupId ||
    (edge.condition || edge.conditionGroup?.clauses.length || completed) && !run.flags.includes('exit:' + scene.id + ':' + edge.id));
  if (!follow(run, scene.entryGroupId, { ...graph, edges: eligible }, object, events)) return false;
  if (run.edgeId) run.flags.push('exit:' + scene.id + ':' + run.edgeId);
  return true;
}

export function stepScene(run: StageRun, graph: Graph, input: StageInput, dt: number) {
  const scene = graph.scenes.find(item => item.id === run.sceneId);
  if (!scene || run.finished) return;
  run.time += dt;
  const overlay = graph.nodes.find(node => node.id === run.overlayId);
  if (overlay) {
    const playback = resolvePlaybackSettings(overlay);
    if (playback.mode === 'auto' && run.time - run.overlayTime >= (playback.durationSec ?? 3)) advanceOverlay(run, graph);
    return;
  }
  const player = run.player;
  const hero = scene.placements.find(item => item.id === scene.entrySpawnId);
  const events: RuntimeEventRecord[] = [];
  const actions = graph.nodes.filter(node => node.kind === 'action' && graph.edges.some(edge =>
    edge.toId === node.id && (edge.fromId === scene.entryGroupId || run.entities.some(item => item.nodeId === edge.fromId))));
  for (const action of actions) {
    const control = resolveActionControl(action);
    const key = control.input === 'custom' ? control.customKey : control.input;
    if (!key || !input.keys.has(key.toLowerCase())) continue;
    const incoming = graph.edges.find(edge => {
      if (edge.toId !== action.id) return false;
      const owner = run.entities.find(item => !item.collected && item.nodeId === edge.fromId && isActive(item, run));
      return (edge.fromId === scene.entryGroupId || Boolean(owner)) && evaluate(run, edge, graph, owner, []).passed;
    });
    if (!incoming) continue;
    const behavior = resolveActionConfig(action).mechanic;
    if (behavior === 'jump' && player.grounded) {
      player.vy = -260;
      player.grounded = false;
      events.push({ eventId: 'jumps', subjectAssetId: hero?.assetId, subjectRole: 'hero' });
    } else if (behavior === 'jump') continue;
    else if (behavior === 'dodge') player.x += input.left ? -36 : 36;
    else if (behavior === 'ability') events.push({ eventId: 'fires', subjectAssetId: hero?.assetId, subjectRole: 'hero' });
    else if (behavior === 'shield') run.guardUntil = run.time + .65;
    run.actionId = action.id;
    run.actionOwnerId = run.entities.find(item => item.nodeId === incoming.fromId && !item.collected && isActive(item, run))?.id;
    run.actionTime = run.time;
    run.edgeId = incoming.id;
    run.edgeTime = run.time;
    follow(run, action.id, graph, undefined, events);
    break;
  }
  if (run.sceneId !== scene.id) return;
  const activeActionId = run.time - run.actionTime < 2 &&
    (!run.actionOwnerId || run.entities.some(item => item.id === run.actionOwnerId && isActive(item, run))) ? run.actionId : undefined;
  const oldX = player.x;
  const bottom = player.y + player.height / 2;
  player.x = Math.max(player.width / 2, Math.min(scene.width - player.width / 2, player.x + (Number(input.right) - Number(input.left)) * 145 * dt));
  for (const platform of run.entities) {
    if (platform.kind !== 'platform' || platform.open || platform.isHidden || !overlaps(player, platform)) continue;
    if (bottom <= platform.y - platform.height / 2 + 1) continue;
    const halfSpan = (player.width + (platform.collider?.width ?? platform.width)) / 2;
    if (oldX <= platform.x - halfSpan) player.x = platform.x - halfSpan;
    else if (oldX >= platform.x + halfSpan) player.x = platform.x + halfSpan;
  }
  player.vy += 790 * dt;
  player.y += player.vy * dt;
  let floor = scene.height - 28;
  for (const platform of run.entities) {
    if (platform.kind !== 'platform' || platform.open || platform.isHidden) continue;
    const top = platform.y - platform.height / 2;
    if (bottom <= top + 1 && Math.abs(player.x - platform.x) < (player.width + platform.width) / 2) floor = Math.min(floor, top);
  }
  const wasGrounded = player.grounded;
  player.grounded = player.vy >= 0 && player.y + player.height / 2 >= floor;
  if (player.grounded) {
    player.y = floor - player.height / 2;
    player.vy = 0;
    if (!wasGrounded) events.push({ eventId: 'lands', subjectAssetId: hero?.assetId, subjectRole: 'hero' });
  }
  const contacts: string[] = [];
  for (const item of run.entities) {
    if (item.open || item.collected || !isActive(item, run) || !['zone', 'challenge', 'checkpoint'].includes(item.kind)) continue;
    const card = graph.nodes.find(node => node.id === item.nodeId && node.kind === 'challenge');
    const behavior = card && cardPreviewBehavior(card);
    const activated = run.activationTimes[item.id] ?? run.entryTime;
    if (card) {
      const limit = cardPreviewTimeLimit(card, graph.edges);
      const expired = 'expired:' + item.id;
      if (limit !== null && run.time - activated >= limit && !run.flags.includes(expired)) {
        run.flags.push(expired);
        follow(run, card.id, graph, item, [{ eventId: 'time_up', subjectRole: 'timer', targetInstanceId: item.id }]);
        if (run.sceneId !== scene.id || run.finished) return;
      }
    }
    if (behavior?.isSceneOnly) continue;
    const original = scene.placements.find(placement => placement.id === item.id);
    if (original && card && behavior) {
      const anchor = { x: original.x + (item.motionOffset?.x ?? 0), y: original.y + (item.motionOffset?.y ?? 0) };
      const age = Math.max(0, run.time - activated);
      Object.assign(item, challengeMotion(anchor, behavior, challengeSpeed(item, card, behavior), scene, age));
    }
    if (!overlaps(player, item)) {
      if (item.kind === 'challenge' && oldX !== player.x && (oldX < item.x && player.x >= item.x || oldX > item.x && player.x <= item.x)) {
        const crossing: RuntimeEventRecord[] = ['passes', 'avoids'].map(eventId => ({
          eventId, subjectAssetId: hero?.assetId, subjectRole: 'hero', targetAssetId: item.assetId, targetInstanceId: item.id, targetRole: 'hazard',
        }));
        if (activeActionId) follow(run, activeActionId, graph, item, crossing);
        if (run.sceneId !== scene.id || run.finished) return;
        if (item.nodeId) follow(run, item.nodeId, graph, item, crossing);
        if (run.sceneId !== scene.id || run.finished) return;
      }
      continue;
    }
    contacts.push(item.id);
    if (run.contacts.includes(item.id)) continue;
    if (item.kind === 'checkpoint') {
      run.checkpointId = item.id;
      run.checkpointVisits = (run.checkpointVisits ?? 0) + 1;
    }
    const flag = 'entered:' + item.id;
    if (!run.flags.includes(flag)) run.flags.push(flag);
    const contact: RuntimeEventRecord[] = [
      { eventId: 'touches', subjectAssetId: hero?.assetId, subjectRole: 'hero', targetAssetId: item.assetId, targetInstanceId: item.id, targetRole: 'hazard' },
      { eventId: 'hits', subjectAssetId: item.assetId, subjectInstanceId: item.id, subjectRole: 'hazard', targetAssetId: hero?.assetId, targetRole: 'hero' },
    ];
    if (item.kind === 'zone') contact.push({ eventId: 'enters_zone', subjectAssetId: hero?.assetId, subjectRole: 'hero', targetInstanceId: item.id });
    if (run.guardUntil && run.time < run.guardUntil) contact.push({ eventId: 'blocks', subjectAssetId: hero?.assetId, subjectRole: 'hero', targetAssetId: item.assetId, targetInstanceId: item.id });
    if (behavior?.pattern === 'collectible') {
      contact.push({ eventId: 'is_collected', subjectAssetId: item.assetId, subjectInstanceId: item.id, subjectRole: 'hazard', targetAssetId: hero?.assetId, targetRole: 'hero' });
    }
    const handled = item.nodeId ? follow(run, item.nodeId, graph, item, contact) : false;
    if (handled && contact.some(event => event.eventId === 'is_collected')) {
      item.collected = true;
      if (item.assetId) run.sound = { id: item.id + ':' + run.time, assetId: item.assetId };
    }
    if (run.sceneId !== scene.id) return;
    if (!handled) checkSceneExit(run, scene, graph, item, contact);
    if (run.sceneId !== scene.id) return;
    if (!handled) follow(run, null, graph, item, contact);
    if (run.sceneId !== scene.id) return;
  }
  run.contacts = contacts;
  if (activeActionId && events.length) follow(run, activeActionId, graph, undefined, events);
  checkSceneExit(run, scene, graph);
  if (run.hp <= 0) run.finished = 'defeat';
}

export function sceneCamera(scene: Scene, run: StageRun) {
  return run.lockedCameraX ?? cameraX(scene.width, run.player.x);
}

export function isActive(item: Placement, run: StageRun): boolean {
  return !item.isHidden && (!item.activationId || run.flags.includes('active:' + item.id));
}
