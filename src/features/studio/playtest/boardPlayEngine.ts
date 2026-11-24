import {
  NODE_CATALOG,
  extractSpeakerFromText,
  formatActionControlKey,
  getNodeAssetIds,
  inferCardFieldsFromText,
  parseOutcomeDeltasFromText,
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
import type { NumericFormulaSymbol, ScopedStateVariable } from '../properties/stateModel';

export interface PlayStats {
  hp: number;
  score: number;
}

export const INITIAL_PLAY_STATS: PlayStats = {
  hp: 3,
  score: 0,
};

export interface ConditionEvaluation {
  hasCondition: boolean;
  raw: string;
  kind: 'none' | 'numeric' | 'variable' | 'flag';
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

export function evaluateEdgeCondition(
  condition: string | undefined,
  stats: PlayStats,
  customFlags: Record<string, boolean>,
  scopedVariables: ScopedStateVariable[] = [],
): ConditionEvaluation {
  const raw = (condition ?? '').trim();
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
    if (!playableIds.has(edge.fromId) || !playableIds.has(edge.toId)) continue;
    const raw = (edge.condition ?? '').trim();
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
  return nodes.filter((n) => hasCardContent(n));
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
    if (!cond) continue;
    if (/血量|血|生命|体力|\bhp\b|health|life/i.test(cond)) usesHp = true;
    if (/分数|得分|积分|星星|金币|\bscore\b|point|\bpts\b|star|coin/i.test(cond))
      usesScore = true;
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

  let direction: ChallengeDirection;
  if (behavior === null || (isSceneTemplate && !behaviorText)) {
    direction = 'static';
  } else if (/来回|左右|往返|巡逻|摆动|摇摆|back\s*and\s*forth|patrol|oscillat|swing/.test(dirSource)) {
    direction = 'patrol';
  } else if (
    behaviorDirField === '右' ||
    behaviorDirField === 'r' ||
    /从左[往向到至]右|向右|往右|朝右|右移|右边|右侧|右方|\bright(?:ward|wards)?\b/.test(dirSource)
  ) {
    direction = 'right';
  } else if (
    behaviorDirField === '上' ||
    behaviorDirField === 'u' ||
    /从下[往向到至]上|向上|往上|朝上|上移|上方|上边|升起|上升|飞起|冒出|\bup(?:ward|wards)?\b|\bris(?:e|ing)\b|ascend/.test(
      dirSource,
    )
  ) {
    direction = 'up';
  } else if (
    behaviorDirField === '下' ||
    behaviorDirField === 'd' ||
    /从上[往向到至]下|向下|往下|朝下|下移|下方|下边|掉落|落下|掉下|下落|坠落|砸下|从天|天降|\bdown(?:ward|wards)?\b|\bfall(?:ing)?\b|\bdrop(?:ping)?\b|descend/.test(
      dirSource,
    )
  ) {
    direction = 'down';
  } else if (
    behaviorDirField === '左' ||
    behaviorDirField === 'l' ||
    /从右[往向到至]左|向左|往左|朝左|左移|左边|左侧|左方|\bleft(?:ward|wards)?\b|靠近|接近|追|逼近|toward|approach|chase/.test(
      dirSource,
    )
  ) {
    direction = 'left';
  } else if (/静止|不动|固定|原地|隐藏|存在|stationary|still|static|fixed|hidden|in\s+place/.test(dirSource)) {
    direction = 'static';
  } else if (basePattern === 'falling-hazard') {
    direction = 'down';
  } else {
    direction = 'left';
  }

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

  const nodeMap = new Map(playable.map((n) => [n.id, n]));
  const forwardIncoming = new Map<string, number>();
  playable.forEach((n) => forwardIncoming.set(n.id, 0));

  for (const edge of edges) {
    const from = nodeMap.get(edge.fromId);
    const to = nodeMap.get(edge.toId);
    if (!from || !to) continue;
    if (to.x + 120 < from.x) continue;
    forwardIncoming.set(to.id, (forwardIncoming.get(to.id) ?? 0) + 1);
  }

  const roots = playable.filter((n) => (forwardIncoming.get(n.id) ?? 0) === 0);
  const candidates = roots.length > 0 ? roots : playable;

  const kindPriority: Record<string, number> = {
    narration: 0,
    dialogue: 1,
    challenge: 2,
    action: 3,
    outcome: 4,
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
  const playable = nodes.filter((n) => NODE_CATALOG[n.kind].isPlayable);
  const nodeMap = new Map(playable.map((n) => [n.id, n]));
  const playableEdges = edges.filter(
    (e) => nodeMap.has(e.fromId) && nodeMap.has(e.toId),
  );

  const loopIds = new Set<string>();
  const startId = findStartNodeId(nodes, edges) ?? playable[0]?.id ?? null;
  if (!startId) return loopIds;

  const adj = new Map<string, BoardEdge[]>();
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
): EvaluatedEdge[] {
  const playableMap = new Map(getPlayableNodes(nodes).map((n) => [n.id, n]));
  const activeSet = new Set(activeNodeIds);
  const result: EvaluatedEdge[] = [];

  for (const edge of edges) {
    if (!activeSet.has(edge.fromId)) continue;
    const target = playableMap.get(edge.toId);
    if (!target) continue;
    result.push({
      edge,
      target,
      evaluation: evaluateEdgeCondition(edge.condition, stats, customFlags, scopedVariables),
      isLoop: loopEdgeIds.has(edge.id),
    });
  }

  result.sort((a, b) => a.target.y - b.target.y || a.target.x - b.target.x);
  return result;
}
