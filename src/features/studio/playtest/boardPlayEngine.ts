import {
  getEventSpec,
  getSimulatedEventKey,
  normalizeEventId,
  type EdgeConditionClause,
  type EdgeConditionGroup,
  type EventConditionClause,
  type PropertyConditionClause,
} from '../design-board/arrowConditionModel';
import {
  NODE_CATALOG,
  extractSpeakerFromText,
  formatActionControlKey,
  getNodeAssetIds,
  inferCardFieldsFromText,
  parseOutcomeDeltasFromText,
  resolveEdgeType,
  type ActionControlConfig,
  type ActionMechanic,
  type BoardEdge,
  type BoardNode,
  type ChallengePattern,
  type ChallengeSpeed,
  type ChallengeVisual,
  type OutcomeVisualKind,
  type PlaybackSettings,
  type SceneTheme,
  type SubtitlePosition,
} from '../design-board/studioModel';
import {
  evaluateNumberFormula,
  type NumericFormulaSymbol,
  type ScopedStateVariable,
} from '../properties/stateModel';

export interface PlayStats {
  hp: number;
  score: number;
}

export const INITIAL_PLAY_STATS: PlayStats = {
  hp: 3,
  score: 0,
};

export interface PlaySpatialSnapshot {
  heroX: number;
  heroY: number;
  groundY: number;
  heroVx: number;
  heroVy: number;
  onGround: boolean;
  shieldTimer: number;
  dodgeTimer: number;
  hasHazard: boolean;
  hazardX: number;
  hazardY: number;
  hazardVx: number;
  hazardVy: number;
  hazardKind?: ChallengePattern;
  hazardResolved?: boolean;
}

export interface RuntimeEventRecord {
  subjectInstanceId?: string;
  targetInstanceId?: string;
  eventId: string;
  subjectAssetId?: string;
  subjectRole?: 'hero' | 'hazard' | 'projectile' | 'timer';
  targetAssetId?: string;
  targetRole?: 'hero' | 'hazard' | 'projectile' | 'timer';
}

export interface PlayRuntimeContext {
  /** Automatic gameplay/physics events triggered during the active step */
  runtimeEvents?: Set<string>;
  /** Entity-scoped runtime event records triggered during the active step */
  eventRecords?: RuntimeEventRecord[];
  /** Bound Asset ID of the current player/hero sprite on stage */
  heroAssetId?: string;
  /** Bound Asset ID of the current challenge hazard/collectible on stage */
  hazardAssetId?: string;
  /** Simulated custom event toggles flipped by the player in Play sidebar */
  simulatedEvents?: Record<string, boolean>;
  /** Current 2D spatial/physics snapshot for continuous spatial events */
  spatial?: PlaySpatialSnapshot;
  /** Numeric card parameters available for formula evaluation */
  numericParameters?: NumericFormulaSymbol[];
}

export interface ConditionEvaluation {
  hasCondition: boolean;
  raw: string;
  kind: 'none' | 'numeric' | 'variable' | 'flag' | 'structured';
  passed: boolean;
  metric?: 'hp' | 'score';
  matchedVariableId?: string;
}

export interface EvaluatedEdge {
  edge: BoardEdge;
  target: BoardNode;
  evaluation: ConditionEvaluation;
  isLoop: boolean;
}

const ZH_DIGIT_MAP: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function parseLooseNumber(token: string): number | null {
  const trimmed = token.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed in ZH_DIGIT_MAP ? ZH_DIGIT_MAP[trimmed] : null;
}

function stripQuotes(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('“') && trimmed.endsWith('”'))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseLooseBool(token: string): boolean | null {
  const low = stripQuotes(token).toLowerCase();
  if (['true', '1', 'yes', 'on', '是', '真', '开启', '打开'].includes(low)) return true;
  if (['false', '0', 'no', 'off', '否', '假', '关闭', '未打开'].includes(low)) return false;
  return null;
}

function matchScopedVariable(
  normalized: string,
  scopedVariables: ScopedStateVariable[],
): { entry: ScopedStateVariable; rest: string; negatedPrefix: boolean } | null {
  if (scopedVariables.length === 0) return null;

  const cleaned = normalized
    .replace(/^(?:当|如果|若|if|when)\s*/i, '')
    .trim();

  const negatedPrefix = /^(?:!|not\s+|非|没有|未)/i.test(cleaned);
  const body = negatedPrefix
    ? cleaned.replace(/^(?:!|not\s+|非|没有|未)\s*/i, '').trim()
    : cleaned;

  // Prefer longest key match first (so "Cat.HP" beats "HP")
  const candidates: { key: string; entry: ScopedStateVariable }[] = [];
  for (const entry of scopedVariables) {
    if (entry.fullKey.trim()) {
      candidates.push({ key: entry.fullKey.trim(), entry });
    }
    if (entry.variable.name.trim() && entry.variable.name.trim() !== entry.fullKey.trim()) {
      candidates.push({ key: entry.variable.name.trim(), entry });
    }
  }
  candidates.sort((a, b) => b.key.length - a.key.length);

  const bodyLower = body.toLowerCase();
  for (const { key, entry } of candidates) {
    const keyLower = key.toLowerCase();
    if (!bodyLower.startsWith(keyLower)) continue;
    const after = body.slice(key.length);
    // Ensure boundary so "HP" doesn't accidentally eat "HPMax"
    if (after.length > 0 && /^[a-zA-Z0-9_]/.test(after) && /^[a-zA-Z0-9_]+$/.test(key)) {
      continue;
    }
    return { entry, rest: after.trim(), negatedPrefix };
  }
  return null;
}

function evaluatePropertyClause(
  clause: PropertyConditionClause,
  scopedVariables: ScopedStateVariable[],
  numericParameters: NumericFormulaSymbol[],
): boolean {
  const entry = scopedVariables.find((v) => v.variable.id === clause.propertyId);
  if (!entry) return false;
  const { variable, playValue } = entry;

  if (variable.type === 'number') {
    const actual = Number(playValue);
    let threshold: number | null = null;
    if (clause.valueMode === 'property' && clause.comparePropertyId) {
      const rhsEntry = scopedVariables.find((v) => v.variable.id === clause.comparePropertyId);
      if (rhsEntry && rhsEntry.variable.type === 'number') {
        threshold = Number(rhsEntry.playValue);
      }
    } else if (clause.valueMode === 'formula') {
      const res = evaluateNumberFormula(
        clause.formulaExpression ?? '',
        scopedVariables,
        numericParameters,
      );
      if (res.ok) threshold = res.value;
    } else {
      const rawNum = Number(clause.literalValue);
      if ((clause.literalValue ?? '').trim() !== '' && Number.isFinite(rawNum)) {
        threshold = rawNum;
      }
    }
    if (threshold === null || !Number.isFinite(actual)) return false;
    switch (clause.comparator) {
      case '=':
        return actual === threshold;
      case '!=':
        return actual !== threshold;
      case '>':
        return actual > threshold;
      case '<':
        return actual < threshold;
      case '>=':
        return actual >= threshold;
      case '<=':
        return actual <= threshold;
      default:
        return false;
    }
  }

  if (variable.type === 'boolean') {
    const actual = Boolean(playValue);
    if (clause.comparator === 'is_yes') return actual === true;
    if (clause.comparator === 'is_no') return actual === false;
    return false;
  }

  if (variable.type === 'choice') {
    const actual = String(playValue ?? '').trim().toLowerCase();
    let expected = String(clause.literalValue ?? '').trim().toLowerCase();
    if (clause.valueMode === 'property' && clause.comparePropertyId) {
      const rhsEntry = scopedVariables.find((v) => v.variable.id === clause.comparePropertyId);
      expected = String(rhsEntry?.playValue ?? '').trim().toLowerCase();
    }
    if (clause.comparator === '!=') return actual !== expected;
    return actual === expected;
  }

  // Text variable
  const actualRaw = String(playValue ?? '');
  const actual = actualRaw.trim().toLowerCase();
  if (clause.comparator === 'is_empty') {
    return actual.length === 0;
  }
  let expected = String(clause.literalValue ?? '').trim().toLowerCase();
  if (clause.valueMode === 'property' && clause.comparePropertyId) {
    const rhsEntry = scopedVariables.find((v) => v.variable.id === clause.comparePropertyId);
    expected = String(rhsEntry?.playValue ?? '').trim().toLowerCase();
  }
  switch (clause.comparator) {
    case 'equals':
    case '=':
      return actual === expected;
    case 'not_equals':
    case '!=':
      return actual !== expected;
    case 'contains':
      return expected.length > 0 && actual.includes(expected);
    default:
      return false;
  }
}

function matchesConditionEntity(
  expectedId: string | undefined,
  expectedKind: string | undefined,
  actualAssetId: string | undefined,
  actualRole: RuntimeEventRecord['subjectRole'] | undefined,
): boolean {
  if (!expectedId) return true;
  if (expectedKind === 'scene' && expectedId === 'timer') {
    return actualRole === 'timer';
  }
  if (actualAssetId) {
    return actualAssetId === expectedId;
  }
  return false;
}

function evaluateEventClause(
  clause: EventConditionClause,
  runtimeCtx?: PlayRuntimeContext,
): boolean {
  const simMap = runtimeCtx?.simulatedEvents ?? {};
  const normalizedId = clause.eventId === 'custom' ? 'custom' : normalizeEventId(clause.eventId);
  const spec = normalizedId === 'custom' ? undefined : getEventSpec(normalizedId);
  const simKey = getSimulatedEventKey(clause);

  // Explicit manual toggle override in Play sidebar
  if (simMap[simKey]) return true;

  if (normalizedId === 'custom') {
    return Boolean(simMap[simKey]);
  }

  const records = runtimeCtx?.eventRecords ?? [];
  const events = runtimeCtx?.runtimeEvents;
  const spatial = runtimeCtx?.spatial;
  const heroAssetId = runtimeCtx?.heroAssetId;
  const hazardAssetId = runtimeCtx?.hazardAssetId;

  const subjectSpecified = Boolean(
    clause.subjectAssetId &&
      (clause.subjectKind === 'asset' || clause.subjectKind === 'scene'),
  );
  const targetSpecified = Boolean(
    spec &&
      spec.targetMode !== 'none' &&
      clause.targetId &&
      clause.targetKind === 'asset',
  );

  // Check recorded entity-scoped events first
  for (const rec of records) {
    if (normalizeEventId(rec.eventId) !== normalizedId) continue;
    const subjOk =
      !subjectSpecified ||
      matchesConditionEntity(
        clause.subjectAssetId,
        clause.subjectKind,
        rec.subjectAssetId,
        rec.subjectRole,
      );
    if (!subjOk) continue;

    const tgtOk =
      !targetSpecified ||
      matchesConditionEntity(
        clause.targetId,
        clause.targetKind,
        rec.targetAssetId,
        rec.targetRole,
      );
    if (tgtOk) return true;
  }

  // Fallback for legacy/unscoped tests if no scoped records matched and neither entity is specified
  if (!subjectSpecified && !targetSpecified && events?.has(normalizedId)) {
    return true;
  }

  if (!spatial) return false;

  const heroCenterY = spatial.heroY - 22;
  const hasActiveHazard = spatial.hasHazard && !spatial.hazardResolved;

  const heroMatchesSubject =
    !subjectSpecified ||
    (heroAssetId !== undefined && clause.subjectAssetId === heroAssetId);
  const hazardMatchesSubject =
    !subjectSpecified ||
    (hazardAssetId !== undefined && clause.subjectAssetId === hazardAssetId);
  const heroMatchesTarget =
    !targetSpecified ||
    (heroAssetId !== undefined && clause.targetId === heroAssetId);
  const hazardMatchesTarget =
    !targetSpecified ||
    (hazardAssetId !== undefined && clause.targetId === hazardAssetId);

  switch (normalizedId) {
    case 'jumps':
      return heroMatchesSubject && !spatial.onGround && spatial.heroVy < 0;
    case 'lands':
      return (
        heroMatchesSubject &&
        spatial.onGround &&
        Boolean(events?.has('was_airborne'))
      );
    case 'blocks':
      return heroMatchesSubject && spatial.shieldTimer > 0 && hasActiveHazard && hazardMatchesTarget && Math.hypot(spatial.hazardX - spatial.heroX, spatial.hazardY - heroCenterY) < 48;
    case 'touches': {
      if (!hasActiveHazard) return false;
      const touching =
        Math.hypot(spatial.hazardX - spatial.heroX, spatial.hazardY - heroCenterY) < 38;
      if (!touching) return false;
      return (
        (heroMatchesSubject && hazardMatchesTarget) ||
        (hazardMatchesSubject && heroMatchesTarget)
      );
    }
    default:
      return false;
  }
}

export function evaluateEdgeConditionGroup(
  group: EdgeConditionGroup,
  scopedVariables: ScopedStateVariable[],
  runtimeCtx?: PlayRuntimeContext,
  fallbackRaw = '',
): ConditionEvaluation {
  if (!group || group.clauses.length === 0) {
    return { hasCondition: false, raw: '', kind: 'none', passed: true };
  }

  const numericParams = runtimeCtx?.numericParameters ?? [];
  const results = group.clauses.map((clause: EdgeConditionClause) =>
    clause.kind === 'event'
      ? evaluateEventClause(clause, runtimeCtx)
      : evaluatePropertyClause(clause, scopedVariables, numericParams),
  );

  const passed =
    group.combinator === 'OR' ? results.some(Boolean) : results.every(Boolean);

  return {
    hasCondition: true,
    raw: fallbackRaw,
    kind: 'structured',
    passed,
  };
}

export function evaluateEdgeCondition(
  condition: string | undefined,
  stats: PlayStats,
  customFlags: Record<string, boolean>,
  scopedVariables: ScopedStateVariable[] = [],
  conditionGroup?: EdgeConditionGroup,
  runtimeCtx?: PlayRuntimeContext,
): ConditionEvaluation {
  const raw = (condition ?? '').trim();
  if (conditionGroup && conditionGroup.clauses.length > 0) {
    return evaluateEdgeConditionGroup(conditionGroup, scopedVariables, runtimeCtx, raw);
  }
  if (!raw) {
    return { hasCondition: false, raw: '', kind: 'none', passed: true };
  }

  const normalized = raw
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/＝/g, '=')
    .replace(/＞/g, '>')
    .replace(/＜/g, '<')
    .replace(/大于等于|不少于|至少/g, '>=')
    .replace(/小于等于|不超过|最多/g, '<=')
    .replace(/不等于|不是|不为/g, '!=')
    .replace(/大于|超过|高于/g, '>')
    .replace(/小于|低于|不足/g, '<')
    .replace(/等于|达到|满|为|是/g, '==');

  // 1. Evaluate against defined Global & Asset StateVariables first
  const varMatch = matchScopedVariable(normalized, scopedVariables);
  if (varMatch) {
    const { entry, rest, negatedPrefix } = varMatch;
    const { variable, playValue } = entry;

    if (variable.type === 'number') {
      const opMatch = rest.match(
        /^(>=|<=|!=|==|=|>|<)\s*(-?\d+(?:\.\d+)?|[零一二两三四五六七八九十])/,
      );
      if (opMatch) {
        const op = opMatch[1];
        const threshold = parseLooseNumber(opMatch[2]);
        if (threshold !== null) {
          const actual = Number(playValue);
          let passed = false;
          switch (op) {
            case '>':
              passed = actual > threshold;
              break;
            case '>=':
              passed = actual >= threshold;
              break;
            case '<':
              passed = actual < threshold;
              break;
            case '<=':
              passed = actual <= threshold;
              break;
            case '!=':
              passed = actual !== threshold;
              break;
            case '=':
            case '==':
              passed = actual === threshold;
              break;
          }
          return {
            hasCondition: true,
            raw,
            kind: 'variable',
            passed,
            matchedVariableId: variable.id,
          };
        }
      }
    }

    if (variable.type === 'boolean') {
      const actual = Boolean(playValue);
      const opMatch = rest.match(/^(==|!=|=)\s*(.+)$/);
      if (opMatch) {
        const op = opMatch[1];
        const expected = parseLooseBool(opMatch[2]);
        if (expected !== null) {
          const passed = op === '!=' ? actual !== expected : actual === expected;
          return {
            hasCondition: true,
            raw,
            kind: 'variable',
            passed,
            matchedVariableId: variable.id,
          };
        }
      }
      // Bare variable name (e.g. "Door.isOpen" or "!Door.isOpen")
      return {
        hasCondition: true,
        raw,
        kind: 'variable',
        passed: negatedPrefix ? !actual : actual,
        matchedVariableId: variable.id,
      };
    }

    if (variable.type === 'text' || variable.type === 'choice') {
      const actual = String(playValue ?? '').trim().toLowerCase();
      const opMatch = rest.match(/^(==|!=|=)\s*(.+)$/);
      if (opMatch) {
        const op = opMatch[1];
        const expected = stripQuotes(opMatch[2]).toLowerCase();
        const passed = op === '!=' ? actual !== expected : actual === expected;
        return {
          hasCondition: true,
          raw,
          kind: 'variable',
          passed,
          matchedVariableId: variable.id,
        };
      }
      if (!rest) {
        const nonEmpty = actual.length > 0;
        return {
          hasCondition: true,
          raw,
          kind: 'variable',
          passed: negatedPrefix ? !nonEmpty : nonEmpty,
          matchedVariableId: variable.id,
        };
      }
    }
  }

  // 2. Legacy HP / Score natural-language expression fallback
  const isHp = /血量|血|生命|体力|\bhp\b|health|life/i.test(normalized);
  const isScore = /分数|得分|积分|星星|金币|\bscore\b|point|\bpts\b|star|coin/i.test(normalized);

  if (isHp || isScore) {
    const opMatch = normalized.match(
      /(>=|<=|!=|==|=|>|<)\s*(-?\d+(?:\.\d+)?|[零一二两三四五六七八九十])/,
    );
    if (opMatch) {
      const op = opMatch[1];
      const threshold = parseLooseNumber(opMatch[2]);
      if (threshold !== null) {
        const metric: 'hp' | 'score' = isHp ? 'hp' : 'score';
        const actual = metric === 'hp' ? stats.hp : stats.score;
        let passed = false;
        switch (op) {
          case '>':
            passed = actual > threshold;
            break;
          case '>=':
            passed = actual >= threshold;
            break;
          case '<':
            passed = actual < threshold;
            break;
          case '<=':
            passed = actual <= threshold;
            break;
          case '!=':
            passed = actual !== threshold;
            break;
          case '=':
          case '==':
            passed = actual === threshold;
            break;
        }
        return {
          hasCondition: true,
          raw,
          kind: 'numeric',
          passed,
          metric,
        };
      }
    }
  }

  return {
    hasCondition: true,
    raw,
    kind: 'flag',
    passed: Boolean(customFlags[raw]),
  };
}

export function extractCustomFlagConditions(
  nodes: BoardNode[],
  edges: BoardEdge[],
  scopedVariables: ScopedStateVariable[] = [],
): string[] {
  const playableIds = new Set(getPlayableNodes(nodes).map((n) => n.id));
  const seen = new Set<string>();
  const dummyStats: PlayStats = { hp: 3, score: 0 };

  for (const edge of edges) {
    if (!playableIds.has(edge.toId)) continue;
    if (edge.fromId !== null && !playableIds.has(edge.fromId)) continue;
    if (edge.conditionGroup && edge.conditionGroup.clauses.length > 0) continue;
    const raw = (edge.condition ?? '').trim();
    if (!raw || seen.has(raw)) continue;
    const check = evaluateEdgeCondition(raw, dummyStats, {}, scopedVariables);
    if (check.kind === 'flag') seen.add(raw);
  }
  for (const node of nodes) {
    if (node.kind !== 'group' || !playableIds.has(node.id)) continue;
    if (node.availableWhenGroup && node.availableWhenGroup.clauses.length > 0) continue;
    const raw = (node.availableWhen ?? '').trim();
    if (!raw || seen.has(raw)) continue;
    const check = evaluateEdgeCondition(raw, dummyStats, {}, scopedVariables);
    if (check.kind === 'flag') seen.add(raw);
  }
  return Array.from(seen);
}

/**
 * Checks whether a playable card actually has student-authored content or configured fields/asset.
 */
export function hasCardContent(node: BoardNode): boolean {
  if (!NODE_CATALOG[node.kind].isPlayable) return false;
  if (node.kind === 'group') {
    return Boolean(
      node.title.trim() ||
        node.note.trim() ||
        node.availableWhen?.trim() ||
        node.availableWhenGroup?.clauses.length,
    );
  }
  if (node.fields.visualOutcome?.assetId) return true;
  if (node.note.trim().length > 0) return true;
  if (node.title.trim().length > 0) return true;
  if (node.manualFields.length > 0) return true;
  if (getNodeAssetIds(node).length > 0) return true;
  if ((node.fields.relatedProperties?.length ?? 0) > 0) return true;
  if (node.promptInput) {
    const p = node.promptInput;
    if (
      p.obstacle?.trim() ||
      p.obstacleAction?.trim() ||
      p.sceneName?.trim() ||
      p.sceneLimit?.trim() ||
      p.playerAction?.trim() ||
      p.outcomeTargetLabel?.trim() ||
      p.outcomeChange?.trim()
    ) {
      return true;
    }
  }
  return false;
}

export function getPlayableNodes(nodes: BoardNode[]): BoardNode[] {
  const directPlayable = new Set(nodes.filter((n) => hasCardContent(n)).map((n) => n.id));
  // Also mark any Group as playable if it contains at least one playable descendant
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (n.parentId && directPlayable.has(n.id) && !directPlayable.has(n.parentId)) {
        const parent = nodes.find((p) => p.id === n.parentId);
        if (parent && parent.kind === 'group') {
          directPlayable.add(parent.id);
          changed = true;
        }
      }
    }
  }
  return nodes.filter((n) => directPlayable.has(n.id));
}

export function evaluateGroupAvailability(
  groupNode: BoardNode,
  nodes: BoardNode[],
  stats: PlayStats,
  customFlags: Record<string, boolean>,
  scopedVariables: ScopedStateVariable[] = [],
  runtimeCtx?: PlayRuntimeContext,
): ConditionEvaluation {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const chain: BoardNode[] = [];
  let curr: BoardNode | undefined = groupNode;
  const seen = new Set<string>();
  while (curr && curr.kind === 'group' && !seen.has(curr.id)) {
    seen.add(curr.id);
    chain.unshift(curr);
    curr = curr.parentId ? nodeMap.get(curr.parentId) : undefined;
  }

  let firstCondEval: ConditionEvaluation | null = null;
  for (const grp of chain) {
    const ev = evaluateEdgeCondition(
      grp.availableWhen,
      stats,
      customFlags,
      scopedVariables,
      grp.availableWhenGroup,
      runtimeCtx,
    );
    if (ev.hasCondition) {
      if (!firstCondEval) firstCondEval = ev;
      if (!ev.passed) {
        return ev;
      }
    }
  }

  return (
    firstCondEval ?? {
      hasCondition: false,
      raw: '',
      kind: 'none',
      passed: true,
    }
  );
}

/** Only authored edges enable execution; enclosing groups expose connected children. */
export function getConnectedPlayableNodeIds(nodes: BoardNode[], edges: BoardEdge[]): Set<string> {
  const map = new Map(getPlayableNodes(nodes).map((node) => [node.id, node]));
  const connected = new Set<string>();
  for (const edge of edges) {
    if (!map.has(edge.toId) || (edge.fromId !== null && !map.has(edge.fromId))) continue;
    connected.add(edge.toId);
    if (edge.fromId !== null) connected.add(edge.fromId);
  }
  for (const id of [...connected]) {
    let parentId = map.get(id)?.parentId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      if (map.has(parentId)) connected.add(parentId);
      parentId = map.get(parentId)?.parentId;
    }
  }
  return connected;
}

export function getGroupLocalRoots(
  groupId: string,
  nodes: BoardNode[],
  edges: BoardEdge[],
): BoardNode[] {
  const playable = getPlayableNodes(nodes);
  const connected = getConnectedPlayableNodeIds(nodes, edges);
  const directChildren = playable.filter((n) => n.parentId === groupId && connected.has(n.id));
  if (directChildren.length === 0) return [];

  const allNodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childIds = new Set(directChildren.map((n) => n.id));
  const incomingCounts = new Map<string, number>();
  const guardedByEntryTrigger = new Set<string>();
  const associatedActionIds = new Set<string>();
  directChildren.forEach((n) => incomingCounts.set(n.id, 0));

  for (const edge of edges) {
    if (edge.fromId === null && childIds.has(edge.toId)) {
      guardedByEntryTrigger.add(edge.toId);
      continue;
    }
    if (
      edge.fromId &&
      childIds.has(edge.fromId) &&
      childIds.has(edge.toId) &&
      edge.fromId !== edge.toId
    ) {
      const from = directChildren.find((n) => n.id === edge.fromId);
      const to = directChildren.find((n) => n.id === edge.toId);
      if (!from || !to) continue;
      if (resolveEdgeType(edge, allNodeMap) === 'association') {
        if (from.kind === 'challenge' && to.kind === 'action') {
          associatedActionIds.add(to.id);
        } else if (from.kind === 'action' && to.kind === 'challenge') {
          associatedActionIds.add(from.id);
        }
        continue;
      }
      // Ignore backward loop edges when identifying entry roots
      if (to.x + 120 < from.x) continue;
      incomingCounts.set(edge.toId, (incomingCounts.get(edge.toId) ?? 0) + 1);
    }
  }

  const roots = directChildren.filter(
    (n) =>
      (incomingCounts.get(n.id) ?? 0) === 0 &&
      !guardedByEntryTrigger.has(n.id) &&
      !associatedActionIds.has(n.id),
  );
  const fallbackRoots = directChildren.filter(
    (n) => (incomingCounts.get(n.id) ?? 0) === 0 && !guardedByEntryTrigger.has(n.id),
  );
  const candidates =
    roots.length > 0
      ? roots
      : fallbackRoots.length > 0
        ? fallbackRoots
        : guardedByEntryTrigger.size > 0
          ? []
          : [directChildren[0]];

  return [...candidates].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 40) return a.y - b.y;
    return a.x - b.x;
  });
}

/**
 * Collects all numeric Related Parameters across cards so Outcome Number Formulas
 * can reference parameters across objects/cards.
 */
export function collectNumericBoardParameters(nodes: BoardNode[]): NumericFormulaSymbol[] {
  const symbols: NumericFormulaSymbol[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    for (const param of node.fields.relatedParameters ?? []) {
      const name = param.name.trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      symbols.push({
        key: name,
        value: Number.isFinite(param.value) ? param.value : 0,
        source: 'parameter',
      });
    }
  }
  return symbols;
}

/**
 * Dynamically detects whether the student's design actually uses HP and/or Score.
 * Blank boards have usesHp = false and usesScore = false so NO pre-baked HUD appears!
 */
export function detectUsedStats(
  nodes: BoardNode[],
  edges: BoardEdge[],
): { usesHp: boolean; usesScore: boolean } {
  let usesHp = false;
  let usesScore = false;

  for (const node of nodes) {
    if (!NODE_CATALOG[node.kind].isPlayable) continue;
    if (node.kind === 'outcome') {
      const cfg = resolveOutcomeConfig(node);
      const parsed = parseOutcomeDeltasFromText(node.note);
      if (
        cfg.hpDelta !== 0 ||
        parsed.mentionsHp ||
        (node.fields.hpDelta !== undefined && node.fields.hpDelta !== 0)
      ) {
        usesHp = true;
      }
      if (
        cfg.scoreDelta !== 0 ||
        parsed.mentionsScore ||
        (node.fields.scoreDelta !== undefined && node.fields.scoreDelta !== 0)
      ) {
        usesScore = true;
      }
    }
  }

  for (const edge of edges) {
    const cond = (edge.condition ?? '').trim();
    if (cond) {
      if (/血量|血|生命|体力|\bhp\b|health|life/i.test(cond)) usesHp = true;
      if (/分数|得分|积分|星星|金币|\bscore\b|point|\bpts\b|star|coin/i.test(cond))
        usesScore = true;
    }
  }

  return { usesHp, usesScore };
}

export function resolvePlaybackSettings(node: BoardNode): PlaybackSettings {
  const inferred = inferCardFieldsFromText(node.kind, node.note).playbackSettings;
  const raw = node.fields.playbackSettings ?? inferred;
  return {
    mode: raw?.mode ?? 'click',
    key: raw?.key?.trim() || 'Space',
    durationSec:
      typeof raw?.durationSec === 'number' && Number.isFinite(raw.durationSec) && raw.durationSec > 0
        ? raw.durationSec
        : 3,
  };
}

export function resolveSubtitlePosition(node: BoardNode): SubtitlePosition {
  return (
    node.fields.subtitlePosition ??
    inferCardFieldsFromText('narration', node.note).subtitlePosition ??
    'bottom'
  );
}

export function resolveSceneTheme(node: BoardNode): SceneTheme {
  return (
    node.fields.sceneTheme ??
    inferCardFieldsFromText('narration', node.note).sceneTheme ??
    'neutral'
  );
}

export function resolveDialogueContent(node: BoardNode): {
  speaker: string;
  body: string;
} {
  const parsed = extractSpeakerFromText(node.note);
  return {
    speaker: node.title.trim() || parsed.speaker,
    body: parsed.body || node.note.trim(),
  };
}

export type ChallengeDirection = 'left' | 'right' | 'down' | 'up' | 'patrol' | 'static';

function matchChallengeDirection(text: string): ChallengeDirection | undefined {
  if (/来回|左右|往返|巡逻|摆动|摇摆|back\s*and\s*forth|patrol|oscillat|swing/.test(text)) return 'patrol';
  if (text === '右' || text === 'r' || /从左[往向到至]右|向右|往右|朝右|右移|右边|右侧|右方|\bright(?:ward|wards)?\b/.test(text)) return 'right';
  if (text === '上' || text === 'u' || /从下[往向到至]上|向上|往上|朝上|上移|上方|上边|升起|上升|飞起|冒出|\bup(?:ward|wards)?\b|\bris(?:e|ing)\b|ascend/.test(text)) return 'up';
  if (text === '下' || text === 'd' || /从上[往向到至]下|向下|往下|朝下|下移|下方|下边|掉落|落下|掉下|下落|坠落|砸下|从天|天降|\bdown(?:ward|wards)?\b|\bfall(?:ing)?\b|\bdrop(?:ping)?\b|descend/.test(text)) return 'down';
  if (text === '左' || text === 'l' || /从右[往向到至]左|向左|往左|朝左|左移|左边|左侧|左方|\bleft(?:ward|wards)?\b|靠近|接近|追|逼近|toward|approach|chase/.test(text)) return 'left';
  if (/静止|不动|固定|原地|隐藏|存在|stationary|still|static|fixed|hidden|in\s+place/.test(text)) return 'static';
}

export function resolveChallengeConfig(node: BoardNode): {
  pattern: ChallengePattern;
  direction: ChallengeDirection;
  speed: ChallengeSpeed;
  speedMultiplier: number;
  visual: ChallengeVisual;
  bounces: boolean;
  rotates: boolean;
  isSceneOnly: boolean;
} {
  const inferred = inferCardFieldsFromText('challenge', node.note, 'en', {
    promptInput: node.promptInput,
  });
  const basePattern =
    node.fields.challengePattern ?? inferred.challengePattern ?? 'ground-hazard';
  const speed = node.fields.challengeSpeed ?? inferred.challengeSpeed ?? 'normal';
  const visual = node.fields.challengeVisual ?? inferred.challengeVisual ?? 'spark';

  // Prefer explicit relatedBehavior (whether manually tuned bottom-up or auto-inferred)
  const behavior =
    node.fields.relatedBehavior !== undefined
      ? node.fields.relatedBehavior
      : inferred.relatedBehavior;

  const isSceneTemplate =
    node.promptInput?.mode !== 'custom' &&
    node.promptInput?.challengeTemplate === 'scene-limit';

  const behaviorDirField =
    behavior && behavior.mode !== 'custom' ? (behavior.direction ?? '').trim().toLowerCase() : '';
  const behaviorText = behavior
    ? behavior.mode === 'custom'
      ? (behavior.customText ?? '').trim()
      : `${behavior.direction ?? ''} ${behavior.action ?? ''}`.trim()
    : '';
  const fallbackText =
    node.promptInput?.mode !== 'custom'
      ? (isSceneTemplate
          ? node.promptInput?.sceneLimit ?? ''
          : node.promptInput?.obstacleAction ?? '') || node.note
      : node.note;
  const dirSource = (behaviorText || fallbackText).toLowerCase();

  const direction: ChallengeDirection = behavior === null || (isSceneTemplate && !behaviorText)
    ? 'static'
    : matchChallengeDirection(behaviorDirField) ?? matchChallengeDirection(dirSource) ?? (basePattern === 'falling-hazard' ? 'down' : 'left');

  const pattern: ChallengePattern =
    basePattern === 'collectible'
      ? 'collectible'
      : direction === 'down'
        ? 'falling-hazard'
        : 'ground-hazard';

  // Sync speedMultiplier with relatedParameters "Move Speed" if edited
  const moveParam = (node.fields.relatedParameters ?? []).find((p) =>
    /speed|速度/i.test(p.name),
  );
  const speedMultiplier =
    moveParam && Number.isFinite(moveParam.value) && moveParam.value > 0
      ? Math.max(0.35, Math.min(2.6, moveParam.value / 3))
      : speed === 'fast'
        ? 1.42
        : speed === 'slow'
          ? 0.68
          : 1.0;

  const bounces = /弹|跳|跃|bounce|hop|jump/i.test(dirSource);
  const rotates = /滚|转|旋|roll|spin|rotate/i.test(dirSource);
  const isSceneOnly = isSceneTemplate && direction === 'static';

  return {
    pattern,
    direction,
    speed,
    speedMultiplier,
    visual,
    bounces,
    rotates,
    isSceneOnly,
  };
}

export function resolveChallengeTimeLimitSec(
  node: BoardNode,
  edges: BoardEdge[],
): number | null {
  const inferred = inferCardFieldsFromText('challenge', node.note, 'en', {
    promptInput: node.promptInput,
  });
  const params =
    node.fields.relatedParameters !== undefined
      ? node.fields.relatedParameters
      : inferred.relatedParameters ?? [];
  const timeParam = params.find(
    (p) =>
      p.id === 'auto-time-limit' ||
      /time\s*limit|countdown|timer|时长|限时|倒计时/i.test(p.name),
  );
  if (timeParam && Number.isFinite(timeParam.value) && timeParam.value > 0) {
    return timeParam.value;
  }

  // Also activate a default countdown if an outgoing edge from this Challenge (or its associated Actions) waits on time_up
  const connectedActionIds = new Set(
    edges
      .filter((e) => e.fromId === node.id || e.toId === node.id)
      .map((e) => (e.fromId === node.id ? e.toId : e.fromId))
      .filter((id): id is string => Boolean(id)),
  );
  const checksTimeUp = edges.some((e) => {
    const isRelevant =
      e.fromId === node.id ||
      (e.fromId !== null && connectedActionIds.has(e.fromId)) ||
      (e.fromId === null && e.toId === node.id);
    if (!isRelevant) return false;
    return Boolean(
      e.conditionGroup?.clauses.some(
        (c) => c.kind === 'event' && normalizeEventId(c.eventId) === 'time_up',
      ),
    );
  });
  return checksTimeUp ? 10 : null;
}

export function resolveActionControl(node: BoardNode): ActionControlConfig {
  const inferred = inferCardFieldsFromText('action', node.note).actionControl;
  const control = node.fields.actionControl ?? inferred;
  if (control) return control;
  return {
    device: 'keyboard',
    input: node.fields.keyBinding || 'Space',
    interactionType: 'press',
  };
}

export function resolveActionConfig(node: BoardNode): {
  mechanic: ActionMechanic;
  keyBinding: string;
  control: ActionControlConfig;
} {
  const inferred = inferCardFieldsFromText('action', node.note);
  const mechanic = node.fields.actionMechanic ?? inferred.actionMechanic ?? 'jump';
  const control = resolveActionControl(node);
  const keyBinding =
    node.fields.actionControl !== undefined
      ? formatActionControlKey(control)
      : (node.fields.keyBinding ?? inferred.keyBinding ?? 'Space');
  return { mechanic, keyBinding, control };
}

export function resolveOutcomeConfig(node: BoardNode): {
  scoreDelta: number;
  hpDelta: number;
  visual: OutcomeVisualKind;
} {
  const inferred = inferCardFieldsFromText('outcome', node.note);
  const fallbackDeltas = parseOutcomeDeltasFromText(node.note);
  const scoreDelta =
    node.fields.scoreDelta !== undefined ? node.fields.scoreDelta : fallbackDeltas.scoreDelta;
  const hpDelta =
    node.fields.hpDelta !== undefined ? node.fields.hpDelta : fallbackDeltas.hpDelta;
  const visual = node.fields.outcomeVisual ?? inferred.outcomeVisual ?? 'none';
  return { scoreDelta, hpDelta, visual };
}

export function findStartNodeId(
  nodes: BoardNode[],
  edges: BoardEdge[],
): string | null {
  const playable = getPlayableNodes(nodes);
  if (playable.length === 0) return null;

  const allNodeMap = new Map(nodes.map((n) => [n.id, n]));
  const playableIds = new Set(playable.map((n) => n.id));
  const connected = getConnectedPlayableNodeIds(nodes, edges);
  const eligible = playable.filter((n) => connected.has(n.id));
  const topLevel = eligible.filter((n) => !n.parentId || !playableIds.has(n.parentId));
  const scopeNodes = topLevel.length > 0 ? topLevel : eligible;

  const nodeMap = new Map(scopeNodes.map((n) => [n.id, n]));
  const forwardIncoming = new Map<string, number>();
  const guardedByEntryTrigger = new Set<string>();
  const associatedActionIds = new Set<string>();
  scopeNodes.forEach((n) => forwardIncoming.set(n.id, 0));

  for (const edge of edges) {
    if (edge.fromId === null) {
      if (nodeMap.has(edge.toId)) guardedByEntryTrigger.add(edge.toId);
      continue;
    }
    const from = nodeMap.get(edge.fromId);
    const to = nodeMap.get(edge.toId);
    if (!from || !to) continue;
    if (resolveEdgeType(edge, allNodeMap) === 'association') {
      if (from.kind === 'challenge' && to.kind === 'action') {
        associatedActionIds.add(to.id);
      } else if (from.kind === 'action' && to.kind === 'challenge') {
        associatedActionIds.add(from.id);
      }
      continue;
    }
    if (to.x + 120 < from.x) continue;
    forwardIncoming.set(to.id, (forwardIncoming.get(to.id) ?? 0) + 1);
  }

  const roots = scopeNodes.filter(
    (n) =>
      (forwardIncoming.get(n.id) ?? 0) === 0 &&
      !guardedByEntryTrigger.has(n.id) &&
      !associatedActionIds.has(n.id),
  );
  const fallbackRoots = scopeNodes.filter(
    (n) => (forwardIncoming.get(n.id) ?? 0) === 0 && !guardedByEntryTrigger.has(n.id),
  );
  if (roots.length === 0 && fallbackRoots.length === 0 && guardedByEntryTrigger.size > 0) {
    return null;
  }
  const candidates =
    roots.length > 0 ? roots : fallbackRoots.length > 0 ? fallbackRoots : scopeNodes;

  const kindPriority: Record<string, number> = {
    group: 0,
    narration: 1,
    dialogue: 2,
    challenge: 3,
    action: 4,
    outcome: 5,
  };

  const sorted = [...candidates].sort((a, b) => {
    const pa = kindPriority[a.kind] ?? 9;
    const pb = kindPriority[b.kind] ?? 9;
    if (pa !== pb) return pa - pb;
    if (Math.abs(a.x - b.x) > 40) return a.x - b.x;
    return a.y - b.y;
  });

  return sorted[0]?.id ?? null;
}

export function computeLoopEdgeIds(
  nodes: BoardNode[],
  edges: BoardEdge[],
): Set<string> {
  const allNodeMap = new Map(nodes.map((n) => [n.id, n]));
  const playable = nodes.filter((n) => NODE_CATALOG[n.kind].isPlayable);
  const nodeMap = new Map(playable.map((n) => [n.id, n]));
  const playableEdges = edges.filter(
    (e): e is BoardEdge & { fromId: string } =>
      e.fromId !== null &&
      nodeMap.has(e.fromId) &&
      nodeMap.has(e.toId) &&
      resolveEdgeType(e, allNodeMap) === 'flow',
  );

  const loopIds = new Set<string>();
  const startId = findStartNodeId(nodes, edges) ?? playable[0]?.id ?? null;
  if (!startId) return loopIds;

  const adj = new Map<string, (BoardEdge & { fromId: string })[]>();
  for (const e of playableEdges) {
    const list = adj.get(e.fromId) ?? [];
    list.push(e);
    adj.set(e.fromId, list);
  }

  const state = new Map<string, 'visiting' | 'visited'>();
  const dfs = (u: string) => {
    state.set(u, 'visiting');
    for (const edge of adj.get(u) ?? []) {
      const vState = state.get(edge.toId);
      if (vState === 'visiting') {
        loopIds.add(edge.id);
      } else if (!vState) {
        dfs(edge.toId);
      }
    }
    state.set(u, 'visited');
  };

  dfs(startId);
  for (const node of playable) {
    if (!state.has(node.id)) dfs(node.id);
  }

  for (const edge of playableEdges) {
    const from = nodeMap.get(edge.fromId);
    const to = nodeMap.get(edge.toId);
    if (from && to && to.x + 120 < from.x && !loopIds.has(edge.id)) {
      const visited = new Set<string>([to.id]);
      const queue = [to.id];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (curr === from.id) {
          loopIds.add(edge.id);
          break;
        }
        for (const nextEdge of adj.get(curr) ?? []) {
          if (!visited.has(nextEdge.toId)) {
            visited.add(nextEdge.toId);
            queue.push(nextEdge.toId);
          }
        }
      }
    }
  }

  return loopIds;
}

export function getEvaluatedOutgoing(
  activeNodeIds: string[],
  nodes: BoardNode[],
  edges: BoardEdge[],
  stats: PlayStats,
  customFlags: Record<string, boolean>,
  loopEdgeIds: Set<string>,
  scopedVariables: ScopedStateVariable[] = [],
  runtimeCtx?: PlayRuntimeContext,
): EvaluatedEdge[] {
  const allNodeMap = new Map(nodes.map((n) => [n.id, n]));
  const playableMap = new Map(getPlayableNodes(nodes).map((n) => [n.id, n]));
  const activeSet = new Set(activeNodeIds);
  const result: EvaluatedEdge[] = [];

  for (const edge of edges) {
    if (!edge.fromId || !activeSet.has(edge.fromId)) continue;
    if (resolveEdgeType(edge, allNodeMap) !== 'flow') continue;
    const target = playableMap.get(edge.toId);
    if (!target) continue;
    result.push({
      edge,
      target,
      evaluation: evaluateEdgeCondition(
        edge.condition,
        stats,
        customFlags,
        scopedVariables,
        edge.conditionGroup,
        runtimeCtx,
      ),
      isLoop: loopEdgeIds.has(edge.id),
    });
  }

  result.sort((a, b) => a.target.y - b.target.y || a.target.x - b.target.x);
  return result;
}

/**
 * Resolves all playable Action cards associated with a given Challenge
 * (either via undirected 'association' links in any direction, or explicit flow edges Challenge -> Action).
 */
export function getAssociatedActionsForChallenge(
  challengeId: string,
  nodes: BoardNode[],
  edges: BoardEdge[],
  stats: PlayStats,
  customFlags: Record<string, boolean>,
  scopedVariables: ScopedStateVariable[] = [],
  runtimeCtx?: PlayRuntimeContext,
): { edge: BoardEdge; target: BoardNode; evaluation: ConditionEvaluation }[] {
  const allNodeMap = new Map(nodes.map((n) => [n.id, n]));
  const playableMap = new Map(getPlayableNodes(nodes).map((n) => [n.id, n]));
  const result: { edge: BoardEdge; target: BoardNode; evaluation: ConditionEvaluation }[] = [];
  const seenActionIds = new Set<string>();

  for (const edge of edges) {
    if (edge.fromId === null) continue;
    const kind = resolveEdgeType(edge, allNodeMap);
    let candidateAction: BoardNode | undefined;

    if (kind === 'association') {
      if (edge.fromId === challengeId) {
        candidateAction = playableMap.get(edge.toId);
      } else if (edge.toId === challengeId) {
        candidateAction = playableMap.get(edge.fromId);
      }
    } else if (edge.fromId === challengeId) {
      candidateAction = playableMap.get(edge.toId);
    }

    if (!candidateAction || candidateAction.kind !== 'action') continue;
    if (seenActionIds.has(candidateAction.id)) continue;
    seenActionIds.add(candidateAction.id);

    result.push({
      edge,
      target: candidateAction,
      evaluation: evaluateEdgeCondition(
        edge.condition,
        stats,
        customFlags,
        scopedVariables,
        edge.conditionGroup,
        runtimeCtx,
      ),
    });
  }

  result.sort((a, b) => a.target.y - b.target.y || a.target.x - b.target.x);
  return result;
}
