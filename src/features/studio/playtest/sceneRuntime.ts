import type { RunningVisual } from '../asset-library/effects/visualEffectsModel';
import type { AssetItem } from '../asset-library/assetLibraryModel';
import { areActionsInSameComboFrame, getAncestorGroupIds, getComboFramesForAction, isDescendantOf, resolveEdgeType, type BoardComboFrame, type BoardEdge, type BoardNode } from '../design-board/studioModel';
import { getSimulatedEventKey } from '../design-board/arrowConditionModel';
import { applyOutcomePropertyRule, clampNumberValue, evaluateNumberFormula, type ScopedStateVariable, type StateVariableValue } from '../properties/stateModel';
import { computeLoopEdgeIds, evaluateEdgeCondition, evaluateGroupAvailability, findStartNodeId, getGroupLocalRoots, getPlayableNodes, INITIAL_PLAY_STATS, resolveActionConfig, resolveOutcomeConfig, resolvePlaybackSettings, type RuntimeEventRecord } from './boardPlayEngine';
import { cardPreviewBehavior, cardPreviewTimeLimit, challengeMotion, challengeSpeed } from './cardPreviewMotion';
import { cameraX, exposedParameters, overlaps, resolveStageParameter, type Placement, type Scene, type StageParameterSource } from './stageProject';

export interface StageVerdict {
  edgeId: string;
  nodeId?: string;
  objectId?: string;
  passed: boolean;
  at: number;
  clauses: { id: string; passed: boolean; actual?: string | number | boolean }[];
  scoreBefore: number;
  scoreAfter: number;
  parameters?: { id: string; name: string; value: number; source: StageParameterSource; assetName?: string }[];
  propertyChanges?: { id: string; name: string; before: StateVariableValue; after: StateVariableValue }[];
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
  guardedChallenges: Set<string>;
  edgeId?: string;
  edgeTime?: number;
  firedEdges: Record<string, number>;
  actionChoices: Record<string, string>;
  activeActions: Record<string, { ownerId?: string; at: number; resolved?: boolean }>;
  visualOutcomes: Record<string, RunningVisual>;
  pendingOutcomes: { nodeId: string; sceneId: string; objectId?: string; until: number }[];
  message?: { key: 'formula' | 'outcome'; at: number };
  checkpointId?: string;
  checkpointVisits?: number;
  overlayId?: string;
  overlayQueue: string[];
  overlayTime: number;
  groupId?: string;
  unlockedGroups: string[];
  waitingGroups: string[];
  actionId?: string;
  actionOwnerId?: string;
  actionTime: number;
  guardUntil?: number;
  dodge?: { until: number; velocity: number };
  waves: { x: number; y: number; direction: number; actionId: string; ownerId?: string }[];
  lockedCameraX?: number;
  focusedObjectId?: string;
  sound?: { id: string; assetId: string };
  finished?: 'victory' | 'defeat' | 'neutral';
  endText?: string;
}

export type StageInput = {
  left: boolean;
  right: boolean;
  keys: Set<string>;
  held?: Set<string>;
  released?: Set<string>;
  actionId?: string;
};
type Graph = { nodes: BoardNode[]; edges: BoardEdge[]; scenes: Scene[]; comboFrames?: BoardComboFrame[]; assets?: AssetItem[] };

export function setStageEntityHidden(run: StageRun, item: StageEntity, hidden: boolean | undefined) {
  item.isHidden = hidden;
  if (hidden) {
    item.hiddenSince ??= run.time;
    run.contacts = run.contacts.filter(id => id !== item.id);
    run.flags = run.flags.filter(flag => flag !== 'appeared:' + item.id);
  } else if (item.hiddenSince !== undefined) {
    const activated = run.activationTimes[item.id] ?? run.entryTime;
    run.activationTimes[item.id] = activated + Math.max(0, run.time - Math.max(activated, item.hiddenSince));
    item.hiddenSince = undefined;
  }
}

export function stageEditPose(placement: Placement, active?: StageEntity, trialOffset?: Pick<Partial<Placement>, 'x' | 'y'>, trialEditing = false): StageEntity {
  if (!active) return placement;
  if (trialEditing) return active;
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
    guardedChallenges: previous?.guardedChallenges ?? new Set(),
    edgeId: previous?.edgeId, edgeTime: previous?.edgeTime, firedEdges: previous?.firedEdges ?? {}, groupId: scene.entryGroupId,
    actionChoices: {}, activeActions: {}, visualOutcomes: previous?.visualOutcomes ?? {}, waves: [],
    unlockedGroups: previous?.unlockedGroups ?? [], waitingGroups: previous?.waitingGroups ?? [],
    pendingOutcomes: previous?.pendingOutcomes ?? [], overlayQueue: [], overlayTime: 0, actionTime: -1,
    overlayId: undefined, actionId: undefined, actionOwnerId: undefined, checkpointId: undefined, checkpointVisits: undefined,
    lockedCameraX: undefined, focusedObjectId: undefined, guardUntil: undefined, dodge: undefined,
    message: undefined, sound: undefined, finished: undefined, endText: undefined,
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
  restored.firedEdges = {};
  restored.sound = undefined;
  return restored;
}

export function syncRunScenes(run: StageRun, previous: Scene[], next: Scene[], trial?: ReadonlyMap<string, Partial<Placement>>) {
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
      const trialPatch = id === run.sceneId ? trial?.get(placement.id) : undefined;
      for (const key of Object.keys({ ...old, ...placement }) as (keyof Placement)[]) {
        if (key === 'x' || key === 'y' || trialPatch && Object.hasOwn(trialPatch, key) || Object.is(old[key], placement[key])) continue;
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
  if (run.overlayId) {
    if (run.overlayId !== node.id && !run.overlayQueue.includes(node.id)) run.overlayQueue.push(node.id);
    return;
  }
  run.overlayId = node.id;
  run.overlayTime = run.time;
}

function symbols(graph: Pick<Graph, 'nodes' | 'assets'>, object?: Placement) {
  const source = graph.nodes.find(node => node.id === object?.nodeId);
  const asset = graph.assets?.find(item => item.id === object?.assetId);
  const nodes = source ? [source, ...graph.nodes.filter(node => node !== source)] : graph.nodes;
  const parameters = nodes.flatMap(node => node.fields.relatedParameters?.map(parameter => ({
    key: parameter.name,
    value: object && node.id === source?.id && parameter.exposeOnStage ? resolveStageParameter(parameter, object, asset).value : parameter.value,
    source: 'parameter' as const,
  })) ?? []);
  if (object) parameters.unshift(
    { key: 'StageWidth', value: object.width, source: 'parameter' },
    { key: 'StageHeight', value: object.height, source: 'parameter' },
  );
  return parameters;
}

export function calculateStageReward(node: BoardNode, nodes: BoardNode[], variables: ScopedStateVariable[], object?: Placement, assets?: AssetItem[]) {
  const formula = node.fields.stageScoreFormula?.trim();
  const result = formula ? evaluateNumberFormula(formula, variables, symbols({ nodes, assets }, object)) : undefined;
  return { formula, value: result?.ok ? result.value : resolveOutcomeConfig(node).scoreDelta, valid: !result || result.ok };
}

function stageEventContext(events: RuntimeEventRecord[], assets?: AssetItem[]) {
  const ruleIds = (id?: string) => id ? assets?.find(asset => asset.id === id)?.stagePreset?.ruleAssetIds : undefined;
  return {
    eventRecords: events.map(event => ({
      ...event, subjectRuleAssetIds: ruleIds(event.subjectAssetId), targetRuleAssetIds: ruleIds(event.targetAssetId),
    })),
    runtimeEvents: new Set(events.map(event => event.eventId)),
  };
}

function evaluate(run: StageRun, edge: BoardEdge, graph: Graph, object: Entity | undefined, events: RuntimeEventRecord[], record = true) {
  const scene = graph.scenes.find(item => item.id === run.sceneId);
  const hero = scene?.placements.find(item => item.id === scene.entrySpawnId);
  const asset = object && graph.assets?.find(item => item.id === object.assetId);
  const customFlags = Object.fromEntries(run.flags.map(flag => [flag, true]));
  const context = {
    ...stageEventContext(events, graph.assets),
    simulatedEvents: customFlags, numericParameters: symbols(graph, object), heroAssetId: hero?.assetId, hazardAssetId: object?.assetId,
  };
  const stats = { score: run.score, hp: run.hp };
  const passed = evaluateEdgeCondition(edge.condition, stats, customFlags, run.variables, edge.conditionGroup, context).passed;
  const verdict: StageVerdict = {
    edgeId: edge.id, nodeId: edge.fromId ?? undefined, objectId: object?.id, passed, at: run.time,
    clauses: edge.conditionGroup?.clauses.map(clause => ({
      id: clause.id,
      actual: clause.kind === 'property' ? run.variables.find(entry => entry.variable.id === clause.propertyId)?.playValue : undefined,
      passed: evaluateEdgeCondition('', stats, customFlags, run.variables, { combinator: 'AND', clauses: [clause] }, context).passed,
    })) ?? [],
    scoreBefore: run.score, scoreAfter: run.score,
    parameters: object && exposedParameters(graph.nodes, object).map(parameter => {
      const { value, source, assetName } = resolveStageParameter(parameter, object, asset);
      return { id: parameter.id, name: parameter.name, value, source, assetName };
    }),
  };
  if (record) run.verdicts[(object?.id ?? '') + ':' + edge.id] = verdict;
  return verdict;
}

function canEnterGroup(run: StageRun, graph: Graph, group: BoardNode, events: RuntimeEventRecord[] = []) {
  const flags = Object.fromEntries(run.flags.map(flag => [flag, true]));
  return evaluateGroupAvailability(group, graph.nodes, { score: run.score, hp: run.hp }, flags, run.variables, {
    ...stageEventContext(events, graph.assets),
    simulatedEvents: flags, numericParameters: symbols(graph),
  }).passed;
}

function markEdge(run: StageRun, id: string) {
  run.edgeId = id;
  run.edgeTime = run.time;
  run.firedEdges[id] = run.time;
}

type FollowOptions = {
  allPassing?: boolean;
  acceptEdge?: (edge: BoardEdge) => boolean;
  onMatch?: (edge: BoardEdge) => void;
};

const hasCondition = (edge: BoardEdge) => Boolean(edge.condition?.trim() || edge.conditionGroup?.clauses.length);
const reactiveKey = (id: string, item: Entity) => 'reactive:' + item.id + ':' + id;

function isInUnlockedChapter(run: StageRun, nodeId: string, nodeMap: Map<string, BoardNode>) {
  return getAncestorGroupIds(nodeId, nodeMap).every(id => run.unlockedGroups.includes(id));
}

function follow(run: StageRun, nodeId: string | null, graph: Graph, object: Entity | undefined, events: RuntimeEventRecord[], visited = new Set<string>(), options: FollowOptions = {}): boolean {
  if (object?.isHidden) return false;
  if (nodeId && visited.has(nodeId)) return false;
  if (nodeId) visited.add(nodeId);
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
  if (nodeId && !isInUnlockedChapter(run, nodeId, nodeMap)) return false;
  const sceneId = run.sceneId;
  const passing = graph.edges.flatMap(edge => {
    if (edge.fromId !== nodeId || options.acceptEdge?.(edge) === false || visited.has(edge.toId) || resolveEdgeType(edge, nodeMap) !== 'flow') return [];
    if (object && run.flags.includes(reactiveKey(edge.id, object))) return [];
    const node = nodeMap.get(edge.toId);
    if (!node || node.kind === 'draft' || node.stageTemplate) return [];
    if (nodeId === null) {
      if (run.flags.includes('entry:' + edge.id) || node.kind === 'group' && run.unlockedGroups.includes(node.id)) return [];
      if (!hasCondition(edge) && edge.edgeType !== 'flow') return [];
      if (!isInUnlockedChapter(run, node.id, nodeMap)) return [];
    }
    if (node.kind === 'challenge') {
      const targets = run.entities.filter(item => item.nodeId === node.id && (!item.activationId || item.activationId === object?.id));
      if (targets.length > 0 && targets.every(item => item.isHidden)) return [];
    }
    const verdict = evaluate(run, edge, graph, object, events);
    return verdict.passed ? [{ edge, node, verdict }] : [];
  });
  if (!passing.length) return false;
  const outcomes = nodeId !== null && nodeMap.get(nodeId)?.kind !== 'group'
    ? passing.filter(({ node }) => node.kind === 'outcome' && node.promptInput?.outcomeMode) : [];
  const selected = options.allPassing || nodeId === null ? passing : outcomes.length > 1 ? outcomes
    : passing.filter(item => item === passing[0] || !!item.edge.sharedConditionId && item.edge.sharedConditionId === passing[0].edge.sharedConditionId);
  const executed = new Set<string>();
  for (const { edge, node, verdict } of selected) {
    if (nodeId === null) run.flags.push('entry:' + edge.id);
    if (node.kind === 'group' && !canEnterGroup(run, graph, node, events)) {
      if (!run.waitingGroups.includes(node.id)) run.waitingGroups.push(node.id);
      options.onMatch?.(edge);
      continue;
    }
    options.onMatch?.(edge);
    markEdge(run, edge.id);
    if (executed.has(node.id)) continue;
    executed.add(node.id);
    if (node.kind === 'outcome') {
      const mode = node.promptInput?.outcomeMode;
      if (mode === 'visual') {
        const visual = node.fields.visualOutcome;
        if (!visual?.assetId) {
          run.message = { key: 'outcome', at: run.time };
          continue;
        }
        if (!run.pendingOutcomes.some(item => item.nodeId === node.id && item.objectId === object?.id)) {
          const duration = Math.max(0.016, visual.duration);
          const effect = { effect: visual.effect, start: run.time, duration, restore: visual.restore };
          run.visualOutcomes[visual.assetId] = effect;
          for (const asset of graph.assets ?? []) {
            if (asset.stagePreset?.ruleAssetIds.includes(visual.assetId)) run.visualOutcomes[asset.id] = effect;
          }
          run.pendingOutcomes.push({ nodeId: node.id, sceneId: run.sceneId, objectId: object?.id, until: run.time + duration });
        }
        continue;
      }
      const outcome = resolveOutcomeConfig(node);
      const allRules = node.fields.relatedProperties ?? [];
      const rules = mode === 'property' ? allRules.slice(0, 1) : allRules;
      const rule = rules[0];
      if (mode === 'property' && !rule && !node.fields.stageScoreFormula && !node.fields.stageTargetEffect) {
        run.message = { key: 'outcome', at: run.time };
        continue;
      }
      if (mode === 'property' && rule && (!run.variables.some(entry => entry.variable.id === rule.variableId && !entry.variable.stageParameterId)
        || rule.op === 'formula' && !rule.formula?.trim())) {
        run.message = { key: 'formula', at: run.time };
        continue;
      }
      const params = symbols(graph, object);
      const reward = calculateStageReward(node, graph.nodes, run.variables, object, graph.assets);
      const scoreDelta = mode === 'property' && !reward.formula ? 0 : reward.value;
      const hpDelta = mode === 'property' ? 0 : outcome.hpDelta;
      run.score = Math.max(0, run.score + scoreDelta);
      run.hp = Math.max(0, run.hp + hpDelta);
      for (const rule of rules) {
        const entry = run.variables.find(variable => variable.variable.id === rule.variableId);
        if (!entry || entry.variable.stageParameterId) continue;
        const before = entry.playValue;
        entry.playValue = applyOutcomePropertyRule(rule, entry, run.variables, params);
        if (entry.playValue !== before) {
          (verdict.propertyChanges ??= []).push({
            id: entry.variable.id, name: entry.fullKey, before, after: entry.playValue,
          });
        }
      }
      for (const entry of run.variables) {
        if (entry.variable.type !== 'number' || entry.variable.stageParameterId || rules.some(rule => rule.variableId === entry.variable.id)) continue;
        const name = entry.variable.name;
        const delta = /血量|血|生命|体力|\bhp\b|health|life/i.test(name) ? hpDelta
          : /分数|得分|积分|星星|金币|\bscore\b|point|\bpts\b|star|coin/i.test(name) ? scoreDelta : 0;
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
      if (!mode && (outcome.visual === 'victory' || outcome.visual === 'defeat')) run.finished = outcome.visual;
      if (!run.finished) follow(run, node.id, graph, object, [], new Set(visited), { allPassing: mode === 'property' });
    } else if (node.kind === 'narration' || node.kind === 'dialogue') {
      setOverlay(run, node);
    } else if (node.kind === 'action') {
      const flag = 'action:' + node.id;
      if (!run.flags.includes(flag)) run.flags.push(flag);
    } else if (node.kind === 'group') {
      focusStageChapter(run, node.id, graph, true);
    } else {
      for (const target of run.entities.filter(item => !item.isHidden && item.nodeId === node.id && (!item.activationId || item.activationId === object?.id))) {
        if (run.flags.includes('active:' + target.id)) continue;
        run.flags.push('active:' + target.id);
        run.activationTimes[target.id] = run.time;
      }
      follow(run, node.id, graph, object, [], new Set(visited));
    }
    if (run.sceneId !== sceneId || run.finished) break;
  }
  return true;
}

export function enterGroup(run: StageRun, groupId: string, graph: Graph) {
  run.groupId = groupId;
  const visited = new Set<string>();
  const unlock = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    if (!run.unlockedGroups.includes(id)) run.unlockedGroups.push(id);
    const flag = 'chapter-opening:' + id;
    if (!run.flags.includes(flag)) {
      run.flags.push(flag);
      for (const root of getGroupLocalRoots(id, graph.nodes, graph.edges)) {
        if (root.kind === 'dialogue' || root.kind === 'narration') setOverlay(run, root);
        else if (root.kind === 'action' && !run.flags.includes('action:' + root.id)) run.flags.push('action:' + root.id);
        else if (root.kind === 'group') {
          if (canEnterGroup(run, graph, root)) unlock(root.id);
          else if (!run.waitingGroups.includes(root.id)) run.waitingGroups.push(root.id);
        }
      }
    }
  };
  unlock(groupId);
}

export function focusStageChapter(run: StageRun, groupId: string, graph: Graph, entering = false) {
  if (!entering && !run.unlockedGroups.includes(groupId)) return;
  const destination = graph.scenes.find(scene => scene.id !== run.sceneId && scene.entryGroupId === groupId);
  if (destination) {
    enterScene(run, destination, graph);
    if (entering && graph.nodes.find(node => node.id === groupId)?.stageResetOnEntry) {
      run.score = INITIAL_PLAY_STATS.score;
      run.hp = INITIAL_PLAY_STATS.hp;
      run.variables = run.variables.map(entry => ({ ...entry, playValue: entry.variable.initialValue }));
    }
  } else {
    run.overlayId = undefined;
    run.focusedObjectId = undefined;
    enterGroup(run, groupId, graph);
  }
}

export function beginSceneRules(run: StageRun, scene: Scene, graph: Graph) {
  syncStageRules(run, graph);
  if (scene.entryGroupId) {
    enterGroup(run, scene.entryGroupId, graph);
    return;
  }
  if (scene.id !== graph.scenes[0]?.id) return;
  const nodes = graph.nodes.filter(node => !node.stageTemplate);
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const roots = getPlayableNodes(nodes).filter(node => node.kind === 'group' && !node.parentId &&
    graph.edges.some(edge => edge.fromId === node.id || edge.toId === node.id ||
      Boolean(edge.fromId && isDescendantOf(edge.fromId, node.id, nodeMap)) || isDescendantOf(edge.toId, node.id, nodeMap)) &&
    !graph.edges.some(edge => edge.toId === node.id && edge.fromId !== node.id && resolveEdgeType(edge, nodeMap) === 'flow'))
    .sort((a, b) => Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x);
  for (const root of roots) {
    if (canEnterGroup(run, graph, root)) run.unlockedGroups.push(root.id);
    else run.waitingGroups.push(root.id);
  }
  if (run.unlockedGroups.length) {
    enterGroup(run, run.unlockedGroups[0], graph);
    return;
  }
  const start = findStartNodeId(nodes, graph.edges);
  const opening = graph.nodes.find(node => node.id === start)
    ?? (!graph.edges.length ? getPlayableNodes(nodes).find(node => node.kind === 'narration' || node.kind === 'dialogue') : undefined);
  if (opening?.kind === 'group' && canEnterGroup(run, graph, opening)) enterGroup(run, opening.id, graph);
  if (opening?.kind === 'action') run.flags.push('action:' + opening.id);
  if (opening?.kind === 'dialogue' || opening?.kind === 'narration') setOverlay(run, opening);
}

export function syncStageRules(run: StageRun, graph: Graph) {
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
  const loops = computeLoopEdgeIds(graph.nodes, graph.edges);
  run.guardedChallenges = new Set(graph.edges.filter(edge => edge.edgeType === 'flow'
    && nodeMap.get(edge.toId)?.kind === 'challenge' && !loops.has(edge.id)).map(edge => edge.toId));
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
  const advanced = follow(run, node.id, graph, undefined, []);
  if (!advanced && graph.edges.length === 0) {
    const playable = getPlayableNodes(graph.nodes);
    const next = playable[playable.findIndex(item => item.id === node.id) + 1];
    if (next?.kind === 'narration' || next?.kind === 'dialogue') setOverlay(run, next);
  }
  while (!run.overlayId && run.overlayQueue.length) {
    const id = run.overlayQueue.shift();
    const queued = graph.nodes.find(card => card.id === id);
    if (queued) setOverlay(run, queued);
  }
  if (!advanced && !run.overlayId && !run.pendingOutcomes.length && !run.waitingGroups.length && !run.finished
    && !run.entities.some(item => item.kind === 'challenge' && !item.collected && !item.open && isActive(item, run))
    && !graph.edges.some(edge => edge.fromId === null && !run.flags.includes('entry:' + edge.id))) {
    run.finished = 'neutral';
    run.endText = node.note;
  }
}

export function clickStageObject(run: StageRun, graph: Graph, x: number, y: number) {
  if (run.overlayId || run.finished) return;
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
  const object = [...run.entities].reverse().find(item => item.kind === 'challenge' &&
    !item.open && !item.collected && isActive(item, run) &&
    (!item.nodeId || isInUnlockedChapter(run, item.nodeId, nodeMap)) &&
    !graph.nodes.some(node => node.id === item.nodeId && node.kind === 'challenge' && cardPreviewBehavior(node).isSceneOnly) &&
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
  if (run.overlayId || run.finished) return;
  follow(run, null, graph, undefined, []);
  const scene = graph.scenes.find(item => item.id === run.sceneId);
  if (scene) checkSceneExit(run, scene, graph);
}

export function checkSceneExit(run: StageRun, scene: Scene, graph: Graph, object?: Entity, events: RuntimeEventRecord[] = []) {
  const groupId = run.groupId ?? scene.entryGroupId;
  if (!groupId || run.overlayId || run.finished) return false;
  const groups = [groupId, ...run.unlockedGroups.filter(id => id !== groupId &&
    !graph.scenes.some(other => other.id !== scene.id && other.entryGroupId === id))];
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
  for (const id of groups) {
    const progressionFlag = 'exit:' + scene.id + ':' + id;
    if (run.flags.includes(progressionFlag)) continue;
    const challenges = run.entities.filter(item => item.kind === 'challenge' && !item.isHidden
      && (id === scene.entryGroupId || item.nodeId && isDescendantOf(item.nodeId, id, nodeMap)));
    const completed = challenges.length > 0 && challenges.every(item => item.collected || item.open);
    if (follow(run, id, graph, object, events, new Set(), {
      acceptEdge: edge => hasCondition(edge) || completed,
      onMatch: () => run.flags.push(progressionFlag),
    })) return true;
  }
  return false;
}

export function getStageActionControls(run: StageRun, graph: Graph) {
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
  const frames = graph.comboFrames ?? [];
  const result = graph.nodes.flatMap(action => {
    if (action.kind !== 'action' || action.stageTemplate || !isInUnlockedChapter(run, action.id, nodeMap)) return [];
    const entries = graph.edges.flatMap<{ edge?: BoardEdge; owner?: StageEntity; ownerKey: string; passed: boolean }>(edge => {
      const forward = edge.toId === action.id;
      const reverse = edge.fromId === action.id && resolveEdgeType(edge, nodeMap) === 'association';
      if (!forward && !reverse) return [];
      const source = forward ? edge.fromId : edge.toId;
      const owners = source && isInUnlockedChapter(run, source, nodeMap)
        ? run.entities.filter(item => item.nodeId === source && !item.open && !item.collected && isActive(item, run)) : [];
      const groupAction = forward && source !== null && run.groupId === source;
      return owners.length ? owners.map(owner => ({ edge, owner, ownerKey: owner.id, passed: evaluate(run, edge, graph, owner, [], false).passed }))
        : groupAction ? [{ edge, owner: undefined, ownerKey: source, passed: evaluate(run, edge, graph, undefined, [], false).passed }] : [];
    });
    const frame = getComboFramesForAction(action.id, graph.nodes, frames)[0];
    const standalone = run.flags.includes('action:' + action.id) || frame && graph.nodes.some(node =>
      run.flags.includes('action:' + node.id) && areActionsInSameComboFrame(action.id, node.id, graph.nodes, frames));
    if (!entries.length && standalone) entries.push({ ownerKey: frame?.id ?? action.parentId ?? action.id, passed: true });
    return entries.map(entry => {
      const chosen = run.actionChoices[entry.ownerKey];
      return {
        ...entry, action, config: resolveActionConfig(action), frame,
        id: action.id + ':' + entry.ownerKey,
        locked: Boolean(chosen && !areActionsInSameComboFrame(action.id, chosen, graph.nodes, frames)),
      };
    });
  });
  return result.map(control => ({
    ...control,
    exclusive: result.some(other => other.ownerKey === control.ownerKey
      && !areActionsInSameComboFrame(other.action.id, control.action.id, graph.nodes, frames)),
  }));
}

function applyStageActions(run: StageRun, graph: Graph, scene: Scene, input: StageInput, hero: Placement | undefined) {
  if (!input.keys.size && !input.released?.size && !input.actionId) return;
  const controls = getStageActionControls(run, graph);
  const candidates = controls.filter((candidate, index) => {
    if (!candidate.passed || candidate.locked) return false;
    if (input.actionId) return candidate.id === input.actionId;
    if (index < 4 && input.keys.has(String(index + 1))) return true;
    const { control } = candidate.config;
    const key = (control.input === 'custom' ? control.customKey : control.input)?.toLowerCase();
    if (!key) return false;
    if (control.interactionType === 'release') return input.released?.has(key);
    if (control.interactionType === 'double-click' || control.interactionType === 'drag') {
      return input.keys.has(control.interactionType + ':' + key);
    }
    return input.keys.has(key) || control.interactionType === 'hold' && input.keys.has('repeat:' + key);
  });
  const used = new Set<string>();
  for (const candidate of candidates) {
    const { action, owner, ownerKey, edge, config } = candidate;
    const chosen = run.actionChoices[ownerKey];
    if (used.has(action.id) || chosen && !areActionsInSameComboFrame(action.id, chosen, graph.nodes, graph.comboFrames ?? [])) continue;
    used.add(action.id);
    run.actionChoices[ownerKey] = action.id;
    if (edge) {
      evaluate(run, edge, graph, owner, []);
      markEdge(run, edge.id);
    }
    const actionEvents: RuntimeEventRecord[] = [];
    if (config.mechanic === 'jump' && run.player.grounded) {
      const height = action.fields.relatedParameters?.find(parameter => /jump|height|跳|高/i.test(parameter.name))?.value;
      run.player.vy = -335 * (height && height > 0 ? Math.max(.65, Math.min(1.5, height / 120)) : 1);
      run.player.grounded = false;
      actionEvents.push({ eventId: 'jumps', subjectAssetId: hero?.assetId, subjectRole: 'hero' });
    } else if (config.mechanic === 'dodge') {
      const direction = input.left || (owner && owner.x < run.player.x) ? -1 : 1;
      run.dodge = { until: run.time + .52, velocity: direction * 190 };
    } else if (config.mechanic === 'ability') {
      const direction = owner && owner.x < run.player.x ? -1 : 1;
      run.waves.push({ x: run.player.x + 20 * direction, y: run.player.y, direction, actionId: action.id, ownerId: owner?.id });
      actionEvents.push({
        eventId: 'fires', subjectAssetId: hero?.assetId, subjectRole: 'hero', targetAssetId: owner?.assetId,
        targetInstanceId: owner?.id, targetRole: owner ? 'hazard' : undefined,
      });
    }
    else if (config.mechanic === 'shield') run.guardUntil = run.time + .72;
    run.actionId = action.id;
    run.actionOwnerId = owner?.id;
    run.actionTime = run.time;
    const activation: StageRun['activeActions'][string] = { ownerId: owner?.id, at: run.time };
    run.activeActions[action.id] = activation;
    activation.resolved = follow(run, action.id, graph, owner, actionEvents);
    if (run.sceneId !== scene.id || run.finished) return;
  }
}

export function stepScene(run: StageRun, graph: Graph, input: StageInput, dt: number) {
  const scene = graph.scenes.find(item => item.id === run.sceneId);
  if (!scene || run.finished) return;
  run.time += dt;
  const completing = run.pendingOutcomes.filter(item => item.until <= run.time);
  for (const outcome of completing) {
    run.pendingOutcomes = run.pendingOutcomes.filter(item => item !== outcome);
    const entities = outcome.sceneId === run.sceneId ? run.entities : run.saved[outcome.sceneId];
    const object = entities?.find(item => item.id === outcome.objectId);
    follow(run, outcome.nodeId, graph, object, [], new Set(), { allPassing: true });
    if (run.sceneId !== scene.id || run.finished) return;
  }
  const overlay = graph.nodes.find(node => node.id === run.overlayId);
  if (overlay) {
    const playback = resolvePlaybackSettings(overlay);
    if (playback.mode === 'auto' && run.time - run.overlayTime >= (playback.durationSec ?? 3)) advanceOverlay(run, graph);
    return;
  }
  const entryResult = follow(run, null, graph, undefined, []);
  if (entryResult && (run.sceneId !== scene.id || run.overlayId || run.finished)) return;
  for (const groupId of [...run.waitingGroups]) {
    const group = graph.nodes.find(node => node.id === groupId);
    if (!group || !canEnterGroup(run, graph, group)) continue;
    run.waitingGroups = run.waitingGroups.filter(id => id !== groupId);
    focusStageChapter(run, groupId, graph, true);
    if (run.sceneId !== scene.id || run.overlayId) return;
  }
  const reactive = graph.edges.filter(edge => edge.fromId !== null && hasCondition(edge)
    && (!edge.conditionGroup?.clauses.length || edge.conditionGroup.clauses.some(clause =>
      clause.kind === 'property' || run.flags.includes(getSimulatedEventKey(clause)))));
  if (reactive.length) {
    const candidateIds = new Set(reactive.map(edge => edge.id));
    const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
    for (const item of run.entities) {
      if (item.kind !== 'challenge' || !item.nodeId || item.open || item.collected || !isActive(item, run)
        || !isInUnlockedChapter(run, item.nodeId, nodeMap)) continue;
      follow(run, item.nodeId, graph, item, [], new Set(), {
        acceptEdge: edge => candidateIds.has(edge.id) && nodeMap.get(edge.toId)?.kind !== 'action',
        onMatch: edge => run.flags.push(reactiveKey(edge.id, item)),
      });
      if (run.sceneId !== scene.id || run.overlayId || run.finished) return;
    }
    for (const [id, action] of Object.entries(run.activeActions)) {
      if (action.resolved) continue;
      const owner = run.entities.find(item => item.id === action.ownerId);
      if (action.ownerId && (!owner || !isActive(owner, run))) continue;
      action.resolved = follow(run, id, graph, owner, [], new Set(), { acceptEdge: edge => candidateIds.has(edge.id) });
      if (run.sceneId !== scene.id || run.overlayId || run.finished) return;
    }
  }
  const player = run.player;
  if (input.left || input.right) run.focusedObjectId = undefined;
  const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
  const hero = scene.placements.find(item => item.id === scene.entrySpawnId);
  const events: RuntimeEventRecord[] = [];
  if (hero?.assetId && !hero.isHidden && !run.flags.includes('appeared:' + hero.id)) {
    run.flags.push('appeared:' + hero.id);
    follow(run, null, graph, undefined, [{ eventId: 'appears', subjectRole: 'hero', subjectAssetId: hero.assetId }]);
    if (run.sceneId !== scene.id || run.overlayId || run.finished) return;
  }
  applyStageActions(run, graph, scene, input, hero);
  if (run.sceneId !== scene.id || run.finished) return;
  const activeActions = Object.entries(run.activeActions).filter(([, action]) => run.time - action.at < 2
    && (!action.ownerId || run.entities.some(item => item.id === action.ownerId && isActive(item, run))));
  const oldX = player.x;
  const bottom = player.y + player.height / 2;
  const velocity = run.dodge && run.dodge.until > run.time ? run.dodge.velocity : (Number(input.right) - Number(input.left)) * 145;
  player.x = Math.max(player.width / 2, Math.min(scene.width - player.width / 2, player.x + velocity * dt));
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
  for (const wave of [...run.waves]) {
    wave.x += wave.direction * 270 * dt;
    const target = run.entities.find(item => item.kind === 'challenge' && isActive(item, run)
      && (!item.nodeId || isInUnlockedChapter(run, item.nodeId, nodeMap))
      && !item.collected && !item.open && (!wave.ownerId || wave.ownerId === item.id)
      && overlaps({ x: wave.x, y: wave.y, width: 14, height: 10 }, item));
    if (target || wave.x < 0 || wave.x > scene.width) run.waves = run.waves.filter(item => item !== wave);
    if (!target) continue;
    follow(run, wave.actionId, graph, target, [{
      eventId: 'hits', subjectAssetId: hero?.assetId, subjectRole: 'hero',
      targetAssetId: target.assetId, targetInstanceId: target.id, targetRole: 'hazard',
    }], new Set(), { acceptEdge: hasCondition });
    if (run.sceneId !== scene.id || run.finished) return;
  }
  for (const item of run.entities) {
    if (item.open || item.collected || !isActive(item, run) || !['zone', 'challenge', 'checkpoint'].includes(item.kind)) continue;
    const source = item.nodeId ? nodeMap.get(item.nodeId) : undefined;
    const card = source?.kind === 'challenge' ? source : undefined;
    const enabled = !card || isInUnlockedChapter(run, card.id, nodeMap);
    const behavior = card && cardPreviewBehavior(card);
    if (card && enabled && !behavior?.isSceneOnly && !run.flags.includes('appeared:' + item.id)) {
      run.flags.push('appeared:' + item.id);
      const appearance: RuntimeEventRecord[] = [{
        eventId: 'appears', subjectRole: 'hazard', subjectAssetId: item.assetId, subjectInstanceId: item.id,
      }];
      follow(run, card.id, graph, item, appearance, new Set(), { acceptEdge: hasCondition });
      if (run.sceneId !== scene.id || run.overlayId || run.finished) return;
      follow(run, null, graph, item, appearance);
      if (run.sceneId !== scene.id || run.overlayId || run.finished) return;
    }
    const activated = run.activationTimes[item.id] ?? run.entryTime;
    if (card && enabled) {
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
    if (!enabled) continue;
    if (!overlaps(player, item)) {
      if (item.kind === 'challenge' && oldX !== player.x && (oldX < item.x && player.x >= item.x || oldX > item.x && player.x <= item.x)) {
        const crossing: RuntimeEventRecord[] = ['passes', 'avoids'].map(eventId => ({
          eventId, subjectAssetId: hero?.assetId, subjectRole: 'hero', targetAssetId: item.assetId, targetInstanceId: item.id, targetRole: 'hazard',
        }));
        for (const [actionId, action] of activeActions) {
          if (!action.ownerId || action.ownerId === item.id) follow(run, actionId, graph, item, crossing, new Set(), { acceptEdge: hasCondition });
        }
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
    if (contact.some(event => event.eventId === 'blocks')) {
      for (const [actionId, action] of activeActions) {
        if (!action.ownerId || action.ownerId === item.id) follow(run, actionId, graph, item, contact, new Set(), { acceptEdge: hasCondition });
      }
      if (run.sceneId !== scene.id || run.finished) return;
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
  if (activeActions.length && events.length) for (const [actionId, action] of activeActions) {
    follow(run, actionId, graph, run.entities.find(item => item.id === action.ownerId), events, new Set(), { acceptEdge: hasCondition });
  }
  checkSceneExit(run, scene, graph);
  if (run.hp <= 0) run.finished = 'defeat';
}

export function sceneCamera(scene: Scene, run: StageRun) {
  const focused = run.entities.find(item => item.id === run.focusedObjectId && !item.collected && isActive(item, run));
  return run.lockedCameraX ?? cameraX(scene.width, focused?.x ?? run.player.x);
}

export function isActive(item: Placement, run: StageRun): boolean {
  const waits = item.activationId || item.nodeId && run.guardedChallenges.has(item.nodeId);
  return !item.isHidden && (!waits || run.flags.includes('active:' + item.id));
}
