import type { VisualEffectItem } from '../asset-library/effects/visualEffectsModel';
import type { EdgeConditionGroup } from './arrowConditionModel';
import type { Language } from '../../../shared/i18n';

export type NodeKind =
  | 'narration'
  | 'dialogue'
  | 'challenge'
  | 'action'
  | 'outcome'
  | 'group'
  | 'draft';

export type CardFamily = 'narrative' | 'gameplay' | 'group' | 'draft';

export type SubtitlePosition = 'bottom' | 'top';
export type SceneTheme = 'neutral' | 'meadow' | 'night' | 'space' | 'ocean' | 'cavern';
export type ChallengePattern = 'ground-hazard' | 'falling-hazard' | 'collectible';
export type ChallengeSpeed = 'slow' | 'normal' | 'fast';
export type ChallengeVisual = 'spark' | 'rock' | 'coin' | 'creature' | 'spike';
export type ActionMechanic = 'jump' | 'shield' | 'dodge' | 'ability';
export type OutcomeVisualKind = 'none' | 'celebrate' | 'hurt' | 'victory' | 'defeat';

/** Playback configuration for Narration & Dialogue cards */
export type PlaybackMode = 'click' | 'key' | 'auto';

export interface PlaybackSettings {
  mode: PlaybackMode;
  /** Used when mode === 'key', e.g. 'Space', 'Enter', 'E' */
  key?: string;
  /** Used when mode === 'auto', duration in seconds */
  durationSec?: number;
}

/** Dynamic parameter item for Challenge / Action / Outcome cards */
export interface CardParameterItem {
  exposeOnStage?: boolean;
  id: string;
  name: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}

/** Challenge card optional Related Behavior */
export interface ChallengeBehaviorConfig {
  mode: 'template' | 'custom';
  direction?: string;
  action?: string;
  customText?: string;
}

/** Action card 3-part Control configuration */
export type ControlDevice = 'keyboard' | 'mouse';
export type ControlInteractionType =
  | 'press'
  | 'hold'
  | 'release'
  | 'double-click'
  | 'drag';

export interface ActionControlConfig {
  device: ControlDevice;
  /** Keyboard: 'Space' | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'W' | 'A' | 'S' | 'D' | 'custom'
   *  Mouse: 'Left Button' | 'Right Button' | 'Mouse Position' */
  input: string;
  /** Custom keyboard key when input === 'custom' */
  customKey?: string;
  interactionType: ControlInteractionType;
}

/** Outcome card Related Properties rule (4 types × 4 operations) */
export type NumberPropertyOp = 'set' | 'formula' | 'random' | 'reset';
export type BooleanPropertyOp = 'set' | 'toggle' | 'formula' | 'reset';
export type ChoicePropertyOp = 'set' | 'random' | 'reset' | 'step';
export type TextPropertyOp = 'set' | 'clear' | 'reset' | 'append';
export type OutcomePropertyOp =
  | NumberPropertyOp
  | BooleanPropertyOp
  | ChoicePropertyOp
  | TextPropertyOp;

export interface OutcomePropertyRule {
  id: string;
  /** References StateVariable.id */
  variableId: string;
  op: OutcomePropertyOp;
  /** Number set */
  numberValue?: number;
  /** Number random */
  randomMin?: number;
  randomMax?: number;
  /** Number / Boolean formula string */
  formula?: string;
  /** Boolean set */
  booleanValue?: boolean;
  /** Choice set */
  choiceValue?: string;
  /** Choice step (Previous / Next) */
  stepDirection?: 'next' | 'previous';
  stepWrap?: 'stay' | 'loop';
  /** Text set / append */
  textValue?: string;
}

/** Structured front-of-card fill-in prompt state for Challenge / Action / Outcome */
export interface CardPromptInput {
  mode: 'template' | 'custom';
  // Challenge: 2 switchable templates
  challengeTemplate?: 'obstacle-action' | 'scene-limit';
  obstacle?: string;
  obstacleAssetId?: string;
  obstacleAction?: string;
  sceneName?: string;
  sceneAssetId?: string;
  sceneLimit?: string;
  // Action: Player uses [character] to [action]
  actorName?: string;
  actorAssetId?: string;
  playerAction?: string;
  // Outcome: [target asset or property] will [change]
  outcomeMode?: 'property' | 'visual';
  outcomeTargetLabel?: string;
  outcomeTargetKind?: 'asset' | 'variable' | 'custom';
  outcomeTargetRef?: string;
  outcomeChange?: string;
}

export interface InferenceVariableOption {
  variable: {
    id: string;
    name: string;
    type: 'number' | 'boolean' | 'choice' | 'text';
    initialValue: number | boolean | string;
    options?: string[];
    ordered?: boolean;
  };
  fullKey: string;
  assetId?: string;
}

export interface CardInferenceContext {
  promptInput?: CardPromptInput;
  scopedVariables?: InferenceVariableOption[];
}

/**
 * Structured adjustable attributes per playable card type.
 * Auto-populated live as the student fills in the card; manually overridable at any time.
 */
export interface CardFieldConfig {
  stageScoreFormula?: string;
  stageTargetEffect?: 'open' | 'collect' | 'lock-camera' | 'follow-camera';
  visualOutcome?: { assetId:string; effect:VisualEffectItem; duration:number; restore:boolean };
  // Narration & Dialogue
  subtitlePosition?: SubtitlePosition;
  sceneTheme?: SceneTheme;
  playbackSettings?: PlaybackSettings;
  // Challenge
  challengePattern?: ChallengePattern;
  challengeSpeed?: ChallengeSpeed;
  challengeVisual?: ChallengeVisual;
  relatedBehavior?: ChallengeBehaviorConfig | null;
  // Action
  actionMechanic?: ActionMechanic;
  keyBinding?: string;
  actionControl?: ActionControlConfig;
  // Outcome
  scoreDelta?: number;
  hpDelta?: number;
  outcomeVisual?: OutcomeVisualKind;
  relatedProperties?: OutcomePropertyRule[];
  // Shared numeric parameters (Challenge / Action / Outcome)
  relatedParameters?: CardParameterItem[];
}

export interface BoardNode {
  stageAuthored?: boolean;
  stageTemplate?: boolean;
  stageResetOnEntry?: boolean;
  id: string;
  kind: NodeKind;
  /** Preserved for upcoming deeper nested sub-layers */
  parentId: string | null;
  /** Optional short header (Dialogue speaker name or Draft sticky title) */
  title: string;
  /** Primary one-sentence experience content (auto-composed from promptInput or typed directly) */
  note: string;
  /** Legacy primary asset ID (kept synced with assetIds[0] for backward compatibility) */
  assetId?: string;
  /** Multi-asset binding IDs from My Game Assets */
  assetIds?: string[];
  /** Structured fill-in prompt data for Challenge / Action / Outcome cards */
  promptInput?: CardPromptInput;
  /** Structured core gameplay/presentation fields (auto-derived from note or manually tuned) */
  fields: CardFieldConfig;
  /** Keys manually edited by the student so auto-mapping never overwrites them */
  manualFields: (keyof CardFieldConfig)[];
  x: number;
  y: number;
  /** Sequential or custom human-readable Group identifier (e.g. G1, L1-Forest) */
  groupCode?: string;
  /** Shared definition ID for purely reused Groups; synced across instances with the same groupDefId */
  groupDefId?: string;
  /** Stable key matching corresponding child nodes across synced Group reuse instances */
  syncKey?: string;
  /** Expanded container width (for kind === 'group') */
  width?: number;
  /** Expanded container height (for kind === 'group') */
  height?: number;
  /** Collapsed toggle (for kind === 'group') */
  collapsed?: boolean;
  /** Optional Available When human-readable summary (for kind === 'group') */
  availableWhen?: string;
  /** Optional Available When structured Event/Property condition group (for kind === 'group') */
  availableWhenGroup?: EdgeConditionGroup;
}

export type EdgeType = 'association' | 'flow';

export interface BoardEdge {
  id: string;
  /** Upstream source node ID, or null for a standalone trigger arrow from open space */
  fromId: string | null;
  toId: string;
  /** Semantic link kind: 'association' (no arrow, e.g. Challenge-Action) vs 'flow' (with arrow, progression) */
  edgeType?: EdgeType;
  /** World-space offset from target node top-left to the trigger origin dot (when fromId === null) */
  entryOffset?: { dx: number; dy: number };
  /** Human-readable condition summary displayed on the arrow/line midpoint */
  condition?: string;
  /** Structured multi-clause AND/OR condition definition (Event or Property) */
  conditionGroup?: EdgeConditionGroup;
  /** Optional shared condition group key so multiple flow branches share one condition hub */
  sharedConditionId?: string;
}

export interface BoardComboFrame {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export const COMBO_FRAME_DEFAULT_WIDTH = 320;
export const COMBO_FRAME_DEFAULT_HEIGHT = 280;
export const COMBO_FRAME_MIN_WIDTH = 220;
export const COMBO_FRAME_MIN_HEIGHT = 150;

export function inferDefaultEdgeType(
  fromNode: Pick<BoardNode, 'kind'> | undefined | null,
  toNode: Pick<BoardNode, 'kind'> | undefined | null,
): EdgeType {
  if (!fromNode || !toNode) return 'flow';
  if (
    (fromNode.kind === 'challenge' && toNode.kind === 'action') ||
    (fromNode.kind === 'action' && toNode.kind === 'challenge')
  ) {
    return 'association';
  }
  return 'flow';
}

export function resolveEdgeType(
  edge: Pick<BoardEdge, 'fromId' | 'toId' | 'edgeType'>,
  nodeMap: Map<string, Pick<BoardNode, 'kind'>>,
): EdgeType {
  if (edge.fromId === null) return 'flow';
  if (edge.edgeType === 'association' || edge.edgeType === 'flow') {
    return edge.edgeType;
  }
  return inferDefaultEdgeType(nodeMap.get(edge.fromId), nodeMap.get(edge.toId));
}

export interface OnboardingChecklist {
  addedFirstCard: boolean;
  connectedCards: boolean;
  testedInPlay: boolean;
}

export type SpotlightStage = 'focus-build' | 'focus-play' | 'free';

export const CARD_WIDTH = 268;
export const CARD_EXPANDED_WIDTH = 352;
export const CARD_HEIGHT = 136;
export const DRAFT_WIDTH = 236;
export const DRAFT_HEIGHT = 132;

export const GROUP_DEFAULT_WIDTH = 520;
export const GROUP_DEFAULT_HEIGHT = 320;
export const GROUP_MIN_WIDTH = 300;
export const GROUP_MIN_HEIGHT = 180;
export const GROUP_COLLAPSED_WIDTH = 268;
export const GROUP_COLLAPSED_HEIGHT = 96;
export const GROUP_HEADER_HEIGHT = 44;

// Preserved layout constants for future nested sub-layer support
export const PARENT_WIDTH = 284;
export const PARENT_HEADER_HEIGHT = 76;
export const CHILD_WIDTH = 232;
export const CHILD_HEIGHT = 96;
export const CHILD_GAP = 12;

export function getNodeAssetIds(node: Pick<BoardNode, 'assetId' | 'assetIds'>): string[] {
  if (Array.isArray(node.assetIds)) {
    return node.assetIds;
  }
  return node.assetId ? [node.assetId] : [];
}

export function getNodeDimensions(node: BoardNode) {
  if (node.kind === 'draft') {
    return { width: DRAFT_WIDTH, height: DRAFT_HEIGHT };
  }
  if (node.kind === 'group') {
    if (node.collapsed) {
      return { width: GROUP_COLLAPSED_WIDTH, height: GROUP_COLLAPSED_HEIGHT };
    }
    return {
      width: Math.max(GROUP_MIN_WIDTH, node.width ?? GROUP_DEFAULT_WIDTH),
      height: Math.max(GROUP_MIN_HEIGHT, node.height ?? GROUP_DEFAULT_HEIGHT),
    };
  }
  return { width: CARD_WIDTH, height: CARD_HEIGHT };
}

export function isActionInsideComboFrame(
  node: BoardNode,
  frame: BoardComboFrame,
): boolean {
  if (node.kind !== 'action') return false;
  const dim = getNodeDimensions(node);
  const cx = node.x + dim.width / 2;
  const cy = node.y + 108;
  return (
    cx >= frame.x &&
    cx <= frame.x + frame.width &&
    cy >= frame.y &&
    cy <= frame.y + frame.height
  );
}

export function getComboFramesForAction(
  actionId: string,
  nodes: BoardNode[],
  comboFrames: BoardComboFrame[],
): BoardComboFrame[] {
  const node = nodes.find((n) => n.id === actionId && n.kind === 'action');
  if (!node || comboFrames.length === 0) return [];
  return comboFrames.filter((frame) => isActionInsideComboFrame(node, frame));
}

export function areActionsInSameComboFrame(
  actionIdA: string,
  actionIdB: string,
  nodes: BoardNode[],
  comboFrames: BoardComboFrame[],
): boolean {
  if (actionIdA === actionIdB) return true;
  const nodeA = nodes.find((n) => n.id === actionIdA && n.kind === 'action');
  const nodeB = nodes.find((n) => n.id === actionIdB && n.kind === 'action');
  if (!nodeA || !nodeB) return false;
  return comboFrames.some(
    (frame) =>
      isActionInsideComboFrame(nodeA, frame) &&
      isActionInsideComboFrame(nodeB, frame),
  );
}

export function getCombinableSiblingActions(
  actionId: string,
  nodes: BoardNode[],
  comboFrames: BoardComboFrame[],
): BoardNode[] {
  const frames = getComboFramesForAction(actionId, nodes, comboFrames);
  if (frames.length === 0) return [];
  const seen = new Set<string>([actionId]);
  const siblings: BoardNode[] = [];
  for (const node of nodes) {
    if (node.kind !== 'action' || seen.has(node.id)) continue;
    if (frames.some((frame) => isActionInsideComboFrame(node, frame))) {
      seen.add(node.id);
      siblings.push(node);
    }
  }
  return siblings;
}

export function getNodeDepth(
  nodeId: string,
  nodeMap: Map<string, BoardNode>,
): number {
  let depth = 0;
  let curr = nodeMap.get(nodeId);
  const visited = new Set<string>([nodeId]);
  while (curr?.parentId) {
    if (visited.has(curr.parentId)) break;
    visited.add(curr.parentId);
    const parent = nodeMap.get(curr.parentId);
    if (!parent) break;
    depth += 1;
    curr = parent;
  }
  return depth;
}

export function isDescendantOf(
  candidateId: string,
  potentialAncestorId: string,
  nodeMap: Map<string, BoardNode>,
): boolean {
  let curr = nodeMap.get(candidateId);
  const visited = new Set<string>([candidateId]);
  while (curr?.parentId) {
    if (curr.parentId === potentialAncestorId) return true;
    if (visited.has(curr.parentId)) break;
    visited.add(curr.parentId);
    curr = nodeMap.get(curr.parentId);
  }
  return false;
}

export function getAncestorGroupIds(
  nodeId: string,
  nodeMap: Map<string, BoardNode>,
): string[] {
  const ancestors: string[] = [];
  let curr = nodeMap.get(nodeId);
  const visited = new Set<string>([nodeId]);
  while (curr?.parentId) {
    if (visited.has(curr.parentId)) break;
    visited.add(curr.parentId);
    const parent = nodeMap.get(curr.parentId);
    if (!parent) break;
    ancestors.push(parent.id);
    curr = parent;
  }
  return ancestors;
}

export function getCollapsedAncestorGroup(
  nodeId: string,
  nodeMap: Map<string, BoardNode>,
): BoardNode | null {
  let collapsedTop: BoardNode | null = null;
  let curr = nodeMap.get(nodeId);
  const visited = new Set<string>([nodeId]);
  while (curr?.parentId) {
    if (visited.has(curr.parentId)) break;
    visited.add(curr.parentId);
    const parent = nodeMap.get(curr.parentId);
    if (!parent) break;
    if (parent.kind === 'group' && parent.collapsed) {
      collapsedTop = parent;
    }
    curr = parent;
  }
  return collapsedTop;
}

export function getDescendantNodeIds(
  rootId: string,
  nodes: BoardNode[],
): string[] {
  const result: string[] = [];
  const childrenByParent = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = childrenByParent.get(n.parentId) ?? [];
    list.push(n.id);
    childrenByParent.set(n.parentId, list);
  }
  const queue = [...(childrenByParent.get(rootId) ?? [])];
  const seen = new Set<string>([rootId]);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    for (const childId of childrenByParent.get(id) ?? []) {
      if (!seen.has(childId)) queue.push(childId);
    }
  }
  return result;
}

export function getGroupDefId(
  node: Pick<BoardNode, 'id' | 'groupDefId'>,
): string {
  return node.groupDefId?.trim() || node.id;
}

export function getNextGroupCode(
  nodes: Pick<BoardNode, 'id' | 'kind' | 'groupCode' | 'groupDefId'>[],
): string {
  let maxNum = 0;
  const distinctDefs = new Set<string>();
  for (const n of nodes) {
    if (n.kind !== 'group') continue;
    distinctDefs.add(getGroupDefId(n));
    const match = n.groupCode?.match(/^G(\d+)$/i);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }
  return `G${Math.max(maxNum, distinctDefs.size) + 1}`;
}

export function resolveGroupCode(
  node: Pick<BoardNode, 'id' | 'kind' | 'groupCode' | 'groupDefId'>,
  nodes: Pick<BoardNode, 'id' | 'kind' | 'groupCode' | 'groupDefId'>[],
): string {
  if (node.groupCode?.trim()) return node.groupCode.trim();
  const defId = getGroupDefId(node);
  const seenDefs = new Map<string, number>();
  for (const n of nodes) {
    if (n.kind !== 'group') continue;
    const dId = getGroupDefId(n);
    if (!seenDefs.has(dId)) {
      seenDefs.set(dId, seenDefs.size + 1);
    }
    if (dId === defId) {
      return `G${seenDefs.get(dId)!}`;
    }
  }
  return 'G1';
}

export function isGroupCodeTaken(
  candidateCode: string,
  nodes: BoardNode[],
  excludeDefId?: string,
): boolean {
  const normalized = candidateCode.trim().toLowerCase();
  if (!normalized) return false;
  for (const n of nodes) {
    if (n.kind !== 'group') continue;
    if (excludeDefId && getGroupDefId(n) === excludeDefId) continue;
    if (resolveGroupCode(n, nodes).trim().toLowerCase() === normalized) {
      return true;
    }
  }
  return false;
}

export function findOwningSharedGroupId(
  nodeId: string,
  nodes: BoardNode[],
): string | null {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const defCounts = new Map<string, number>();
  for (const n of nodes) {
    if (n.kind !== 'group') continue;
    const defId = getGroupDefId(n);
    defCounts.set(defId, (defCounts.get(defId) ?? 0) + 1);
  }
  let curr = nodeMap.get(nodeId);
  const visited = new Set<string>();
  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id);
    if (curr.kind === 'group' && (defCounts.get(getGroupDefId(curr)) ?? 0) > 1) {
      return curr.id;
    }
    curr = curr.parentId ? nodeMap.get(curr.parentId) : undefined;
  }
  return null;
}

function cloneEdgeConditionGroup(
  group: EdgeConditionGroup | undefined,
): EdgeConditionGroup | undefined {
  if (!group) return undefined;
  return {
    combinator: group.combinator,
    clauses: group.clauses.map((c) => ({ ...c })),
  };
}

function cloneNodeFields(fields: CardFieldConfig): CardFieldConfig {
  return {
    ...fields,
    relatedParameters: fields.relatedParameters
      ? fields.relatedParameters.map((p) => ({ ...p }))
      : undefined,
    relatedProperties: fields.relatedProperties
      ? fields.relatedProperties.map((r) => ({ ...r }))
      : undefined,
  };
}

/**
 * Duplicates a Group as a brand-new independent Group (new ID & new groupDefId),
 * OR places a linked reuse instance sharing the same groupCode & groupDefId.
 */
export function cloneGroupSubtree(
  rootId: string,
  mode: 'duplicate' | 'reuse',
  nodes: BoardNode[],
  edges: BoardEdge[],
  lang: Language,
): {
  nodes: BoardNode[];
  edges: BoardEdge[];
  createdRootId: string | null;
} {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const root = nodeMap.get(rootId);
  if (!root) {
    return { nodes, edges, createdRootId: null };
  }

  const descIds = root.kind === 'group' ? getDescendantNodeIds(root.id, nodes) : [];
  const subtreeIds = [root.id, ...descIds];
  const subtreeSet = new Set(subtreeIds);
  const idMap = new Map<string, string>();
  const ts = Date.now().toString(36);

  for (const origId of subtreeIds) {
    const orig = nodeMap.get(origId);
    if (!orig) continue;
    const rand = Math.random().toString(36).slice(2, 6);
    idMap.set(origId, `n-${orig.kind}-${ts}-${rand}`);
  }

  const sharedDefId = mode === 'reuse' ? getGroupDefId(root) : undefined;
  const sharedRootCode =
    mode === 'reuse' && root.kind === 'group'
      ? resolveGroupCode(root, nodes)
      : undefined;

  // Ensure source root and descendants have stable groupDefId & syncKey when entering reuse mode
  const baseNodes =
    mode === 'reuse' && root.kind === 'group'
      ? nodes.map((n) => {
          if (n.id === root.id) {
            return {
              ...n,
              groupDefId: sharedDefId,
              groupCode: sharedRootCode,
            };
          }
          if (subtreeSet.has(n.id) && !n.syncKey) {
            return { ...n, syncKey: n.id };
          }
          return n;
        })
      : nodes;

  const baseNodeMap = new Map(baseNodes.map((n) => [n.id, n]));
  const clones: BoardNode[] = [];

  for (const origId of subtreeIds) {
    const orig = baseNodeMap.get(origId);
    const nextId = idMap.get(origId);
    if (!orig || !nextId) continue;

    const nextParentId =
      origId === root.id
        ? orig.parentId
        : orig.parentId && idMap.has(orig.parentId)
          ? idMap.get(orig.parentId)!
          : orig.parentId;

    let nextGroupCode = orig.groupCode;
    let nextGroupDefId = orig.groupDefId;
    let nextTitle = orig.title;
    let nextSyncKey = orig.syncKey;

    if (mode === 'duplicate') {
      if (orig.kind === 'group') {
        nextGroupDefId = nextId;
        nextGroupCode = getNextGroupCode([...baseNodes, ...clones]);
        if (origId === root.id && orig.title.trim()) {
          nextTitle = `${orig.title.trim()} (${lang === 'zh' ? '副本' : 'Copy'})`;
        }
      }
      nextSyncKey = undefined;
    } else {
      // Reuse mode: root shares groupDefId & groupCode; descendants share syncKey
      if (origId === root.id && orig.kind === 'group') {
        nextGroupDefId = sharedDefId;
        nextGroupCode = sharedRootCode;
      } else {
        nextSyncKey = orig.syncKey || orig.id;
        if (orig.kind === 'group') {
          nextGroupDefId = nextId;
        }
      }
    }

    clones.push({
      ...orig,
      id: nextId,
      parentId: nextParentId,
      groupCode: nextGroupCode,
      groupDefId: nextGroupDefId,
      syncKey: nextSyncKey,
      title: nextTitle,
      assetIds: orig.assetIds ? [...orig.assetIds] : undefined,
      promptInput: orig.promptInput ? { ...orig.promptInput } : undefined,
      fields: cloneNodeFields(orig.fields),
      manualFields: [...orig.manualFields],
      availableWhenGroup: cloneEdgeConditionGroup(orig.availableWhenGroup),
      x: orig.x + 52,
      y: orig.y + 52,
    });
  }

  const internalClonedEdges: BoardEdge[] = [];
  const clonedHubIds = new Map<string, string>();
  for (const e of edges) {
    if (!subtreeSet.has(e.toId) || (e.fromId !== null && !subtreeSet.has(e.fromId))) continue;
    const rand = Math.random().toString(36).slice(2, 6);
    let sharedConditionId: string | undefined;
    if (e.sharedConditionId) {
      sharedConditionId = clonedHubIds.get(e.sharedConditionId) ?? 'sc-' + crypto.randomUUID();
      clonedHubIds.set(e.sharedConditionId, sharedConditionId);
    }
    internalClonedEdges.push({
      ...e,
      id: `e-${ts}-${rand}`,
      fromId: e.fromId === null ? null : idMap.get(e.fromId)!,
      toId: idMap.get(e.toId)!,
      sharedConditionId,
      entryOffset: e.entryOffset ? { ...e.entryOffset } : undefined,
      conditionGroup: cloneEdgeConditionGroup(e.conditionGroup),
    });
  }

  return {
    nodes: [...baseNodes, ...clones],
    edges: [...edges, ...internalClonedEdges],
    createdRootId: idMap.get(root.id) ?? null,
  };
}

/**
 * Detaches one reused Group instance into an independent new Group with its own new ID.
 */
export function detachGroupInstance(
  groupId: string,
  nodes: BoardNode[],
): BoardNode[] {
  const target = nodes.find((n) => n.id === groupId && n.kind === 'group');
  if (!target) return nodes;
  const newCode = getNextGroupCode(nodes);
  const descSet = new Set(getDescendantNodeIds(groupId, nodes));
  return nodes.map((n) => {
    if (n.id === groupId) {
      return {
        ...n,
        groupDefId: n.id,
        groupCode: newCode,
      };
    }
    if (descSet.has(n.id)) {
      return {
        ...n,
        syncKey: undefined,
      };
    }
    return n;
  });
}

/**
 * Synchronizes a shared Group definition (metadata + internal subtree + internal edges)
 * from `sourceGroupId` to all other Group placements sharing the same `groupDefId`.
 */
export function propagateGroupDefinitionFrom(
  sourceGroupId: string,
  nodes: BoardNode[],
  edges: BoardEdge[],
): { nodes: BoardNode[]; edges: BoardEdge[] } {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const sourceGroup = nodeMap.get(sourceGroupId);
  if (!sourceGroup || sourceGroup.kind !== 'group') {
    return { nodes, edges };
  }

  const defId = getGroupDefId(sourceGroup);
  const siblingGroups = nodes.filter(
    (n) => n.kind === 'group' && n.id !== sourceGroupId && getGroupDefId(n) === defId,
  );
  if (siblingGroups.length === 0) {
    return { nodes, edges };
  }

  const sourceDescIds = getDescendantNodeIds(sourceGroupId, nodes);
  const sourceDescSet = new Set(sourceDescIds);
  const sourceDescSorted = sourceDescIds
    .map((id) => nodeMap.get(id))
    .filter((n): n is BoardNode => Boolean(n))
    .sort((a, b) => getNodeDepth(a.id, nodeMap) - getNodeDepth(b.id, nodeMap));

  // Ensure every source descendant has a syncKey
  const normalizedSyncKey = new Map<string, string>();
  for (const d of sourceDescSorted) {
    normalizedSyncKey.set(d.id, d.syncKey || d.id);
  }

  const sourceInternalEdges = edges.filter(
    (e) =>
      (e.fromId === null && sourceDescSet.has(e.toId)) ||
      (e.fromId !== null && sourceDescSet.has(e.fromId) && sourceDescSet.has(e.toId)),
  );

  const removedNodeIds = new Set<string>();
  const addedNodes: BoardNode[] = [];
  const updatedGroupMetadata = new Map<string, Partial<BoardNode>>();
  const updatedTargetDescendants = new Map<string, BoardNode>();
  const targetOldDescSets: Set<string>[] = [];
  const rebuiltInternalEdges: BoardEdge[] = [];
  const ts = Date.now().toString(36);

  for (const targetGrp of siblingGroups) {
    updatedGroupMetadata.set(targetGrp.id, {
      groupDefId: defId,
      groupCode: sourceGroup.groupCode,
      title: sourceGroup.title,
      note: sourceGroup.note,
    });

    const tDescIds = getDescendantNodeIds(targetGrp.id, nodes);
    const tDescSet = new Set(tDescIds);
    targetOldDescSets.push(tDescSet);

    const existingBySyncKey = new Map<string, BoardNode>();
    for (const tid of tDescIds) {
      const td = nodeMap.get(tid);
      if (td) {
        existingBySyncKey.set(td.syncKey || td.id, td);
      }
    }

    const srcToTargetId = new Map<string, string>([[sourceGroupId, targetGrp.id]]);
    const matchedTargetIds = new Set<string>();

    for (const srcDesc of sourceDescSorted) {
      const sKey = normalizedSyncKey.get(srcDesc.id)!;
      const existing = existingBySyncKey.get(sKey);
      const targetId =
        existing?.id ?? `n-${srcDesc.kind}-${ts}-${Math.random().toString(36).slice(2, 6)}`;
      srcToTargetId.set(srcDesc.id, targetId);
      if (existing) matchedTargetIds.add(existing.id);

      const targetParentId =
        (srcDesc.parentId ? srcToTargetId.get(srcDesc.parentId) : undefined) ??
        targetGrp.id;
      const relX = srcDesc.x - sourceGroup.x;
      const relY = srcDesc.y - sourceGroup.y;

      const syncedNode: BoardNode = {
        ...srcDesc,
        id: targetId,
        parentId: targetParentId,
        syncKey: sKey,
        groupDefId: srcDesc.kind === 'group' ? targetId : srcDesc.groupDefId,
        x: targetGrp.x + relX,
        y: targetGrp.y + relY,
        collapsed: existing ? existing.collapsed : srcDesc.collapsed,
        assetIds: srcDesc.assetIds ? [...srcDesc.assetIds] : undefined,
        promptInput: srcDesc.promptInput ? { ...srcDesc.promptInput } : undefined,
        fields: cloneNodeFields(srcDesc.fields),
        manualFields: [...srcDesc.manualFields],
        availableWhenGroup: cloneEdgeConditionGroup(srcDesc.availableWhenGroup),
      };

      if (existing) {
        updatedTargetDescendants.set(existing.id, syncedNode);
      } else {
        addedNodes.push(syncedNode);
      }
    }

    for (const oldId of tDescIds) {
      if (!matchedTargetIds.has(oldId)) {
        removedNodeIds.add(oldId);
      }
    }

    // Preserve existing internal edge IDs where endpoint pairs match
    const existingTargetEdges = edges.filter(
      (e) =>
        (e.fromId === null && tDescSet.has(e.toId)) ||
        (e.fromId !== null && tDescSet.has(e.fromId) && tDescSet.has(e.toId)),
    );
    const usedEdgeIds = new Set<string>();
    const targetEdgeIds = new Set(existingTargetEdges.map(edge => edge.id));
    const usedHubIds = new Set(edges.filter(edge => !targetEdgeIds.has(edge.id)).map(edge => edge.sharedConditionId));
    const targetHubIds = new Map<string, string>();

    for (const srcEdge of sourceInternalEdges) {
      const mappedFrom =
        srcEdge.fromId === null ? null : (srcToTargetId.get(srcEdge.fromId) ?? null);
      const mappedTo = srcToTargetId.get(srcEdge.toId);
      if (!mappedTo) continue;
      if (srcEdge.fromId !== null && !mappedFrom) continue;

      const existingMatch = existingTargetEdges.find(
        (te) =>
          !usedEdgeIds.has(te.id) &&
          te.fromId === mappedFrom &&
          te.toId === mappedTo,
      );
      const edgeId =
        existingMatch?.id ?? `e-${ts}-${Math.random().toString(36).slice(2, 6)}`;
      usedEdgeIds.add(edgeId);

      let sharedConditionId: string | undefined;
      if (srcEdge.sharedConditionId) {
        sharedConditionId = targetHubIds.get(srcEdge.sharedConditionId);
        if (!sharedConditionId) {
          const existingHubId = existingMatch?.sharedConditionId;
          sharedConditionId = existingHubId && !usedHubIds.has(existingHubId) ? existingHubId : 'sc-' + crypto.randomUUID();
          targetHubIds.set(srcEdge.sharedConditionId, sharedConditionId);
          usedHubIds.add(sharedConditionId);
        }
      }
      rebuiltInternalEdges.push({
        ...srcEdge,
        id: edgeId,
        fromId: mappedFrom,
        toId: mappedTo,
        sharedConditionId,
        entryOffset: srcEdge.entryOffset ? { ...srcEdge.entryOffset } : undefined,
        conditionGroup: cloneEdgeConditionGroup(srcEdge.conditionGroup),
      });
    }
  }

  const nextNodes: BoardNode[] = [];
  for (const n of nodes) {
    if (removedNodeIds.has(n.id)) continue;
    if (n.id === sourceGroupId) {
      nextNodes.push({ ...n, groupDefId: defId });
    } else if (sourceDescSet.has(n.id)) {
      nextNodes.push({ ...n, syncKey: normalizedSyncKey.get(n.id) });
    } else if (updatedGroupMetadata.has(n.id)) {
      nextNodes.push({ ...n, ...updatedGroupMetadata.get(n.id) });
    } else if (updatedTargetDescendants.has(n.id)) {
      nextNodes.push(updatedTargetDescendants.get(n.id)!);
    } else {
      nextNodes.push(n);
    }
  }
  nextNodes.push(...addedNodes);

  const nextNodeIdSet = new Set(nextNodes.map((n) => n.id));
  const isOldTargetInternalEdge = (e: BoardEdge) =>
    targetOldDescSets.some(
      (set) =>
        (e.fromId === null && set.has(e.toId)) ||
        (e.fromId !== null && set.has(e.fromId) && set.has(e.toId)),
    );

  const preservedEdges = edges.filter(
    (e) =>
      !isOldTargetInternalEdge(e) &&
      nextNodeIdSet.has(e.toId) &&
      (e.fromId === null || nextNodeIdSet.has(e.fromId)),
  );

  return {
    nodes: nextNodes,
    edges: [...preservedEdges, ...rebuiltInternalEdges],
  };
}

export function computeChildSlotInParent(parent: BoardNode, slotIndex: number) {
  return {
    x: parent.x + Math.round((PARENT_WIDTH - CHILD_WIDTH) / 2),
    y: parent.y + PARENT_HEADER_HEIGHT + 12 + slotIndex * (CHILD_HEIGHT + CHILD_GAP),
  };
}

export interface NodeCatalogEntry {
  family: CardFamily;
  isPlayable: boolean;
  surfaceBg: string;
  headerBg: string;
  borderColor: string;
  accentColor: string;
  shapeClass: string;
  headerShapeClass: string;
  labelEn: string;
  labelZh: string;
  shortHintEn: string;
  shortHintZh: string;
  placeholderEn: string;
  placeholderZh: string;
  defaultAssetCategory?: 'characters' | 'objects' | 'backgrounds' | 'effects' | 'interface';
}

export const NODE_CATALOG: Record<NodeKind, NodeCatalogEntry> = {
  narration: {
    family: 'narrative',
    isPlayable: true,
    surfaceBg: '#FFFBEB',
    headerBg: '#FEF3C7',
    borderColor: '#F59E0B',
    accentColor: '#B45309',
    shapeClass: 'rounded-[18px]',
    headerShapeClass: 'rounded-t-[16px]',
    labelEn: 'Narration',
    labelZh: '旁白卡',
    shortHintEn: 'One narration text beat shown in-game',
    shortHintZh: '游戏画面里的一次旁白展示单元',
    placeholderEn: 'Write the narration shown on screen...',
    placeholderZh: '输入展现在游戏中的旁白内容...',
    defaultAssetCategory: 'backgrounds',
  },
  dialogue: {
    family: 'narrative',
    isPlayable: true,
    surfaceBg: '#FFF1F2',
    headerBg: '#FFE4E6',
    borderColor: '#F43F5E',
    accentColor: '#BE123C',
    shapeClass: 'rounded-[18px]',
    headerShapeClass: 'rounded-t-[16px]',
    labelEn: 'Dialogue',
    labelZh: '对话卡',
    shortHintEn: 'One spoken character line in-game',
    shortHintZh: '游戏画面里的一帧角色对话单元',
    placeholderEn: 'Write what this character says...',
    placeholderZh: '输入该角色在这一帧说的话...',
    defaultAssetCategory: 'characters',
  },
  challenge: {
    family: 'gameplay',
    isPlayable: true,
    surfaceBg: '#EEF2FF',
    headerBg: '#E0E7FF',
    borderColor: '#6366F1',
    accentColor: '#4338CA',
    shapeClass: 'rounded-lg',
    headerShapeClass: 'rounded-t-[6px]',
    labelEn: 'Challenge',
    labelZh: '挑战卡',
    shortHintEn: 'A specific obstacle, constraint, or task',
    shortHintZh: '玩家需要应对的一个具体障碍、限制或任务',
    placeholderEn: 'e.g. A log slides toward the cat / Mines are hidden on the board...',
    placeholderZh: '例：木头不断向小猫靠近 / 棋盘中隐藏着地雷...',
    defaultAssetCategory: 'objects',
  },
  action: {
    family: 'gameplay',
    isPlayable: true,
    surfaceBg: '#F0F9FF',
    headerBg: '#E0F2FE',
    borderColor: '#0EA5E9',
    accentColor: '#0369A1',
    shapeClass: 'rounded-lg',
    headerShapeClass: 'rounded-t-[6px]',
    labelEn: 'Action',
    labelZh: '动作卡',
    shortHintEn: 'A concrete move the player can perform',
    shortHintZh: '玩家可执行的一个具体动作（如跳跃、下蹲、射击）',
    placeholderEn: 'e.g. Jump over / Crouch / Shoot (use a concrete action)...',
    placeholderZh: '例：跳跃 / 下蹲 / 发射（填写具体动作，避免写“躲避”）...',
    defaultAssetCategory: 'characters',
  },
  outcome: {
    family: 'gameplay',
    isPlayable: true,
    surfaceBg: '#ECFDF5',
    headerBg: '#D1FAE5',
    borderColor: '#10B981',
    accentColor: '#047857',
    shapeClass: 'rounded-lg',
    headerShapeClass: 'rounded-t-[6px]',
    labelEn: 'Outcome',
    labelZh: '结果卡',
    shortHintEn: 'One main game change caused by an action',
    shortHintZh: '一次操作引发的一个主要结果变化',
    placeholderEn: 'e.g. Cat HP -1 / Hit monster disappears...',
    placeholderZh: '例：小猫生命值 -1 / 被击中的怪兽消失...',
    defaultAssetCategory: 'effects',
  },
  group: {
    family: 'group',
    isPlayable: true,
    surfaceBg: 'rgba(241, 245, 249, 0.72)',
    headerBg: '#FFFFFF',
    borderColor: '#94A3B8',
    accentColor: '#334155',
    shapeClass: 'rounded-2xl',
    headerShapeClass: 'rounded-t-[14px]',
    labelEn: 'Group',
    labelZh: '机制组 Group',
    shortHintEn: 'Parallel container for mechanisms, chapters, or quests',
    shortHintZh: '容纳多条平行机制、关卡或支线探索的命名容器',
    placeholderEn: 'Group name (e.g. Level 1, Forest Exploration)...',
    placeholderZh: '输入容器名称（如：Level 1、森林探索）...',
  },
  draft: {
    family: 'draft',
    isPlayable: false,
    surfaceBg: '#F1F5F9',
    headerBg: '#E2E8F0',
    borderColor: '#CBD5E1',
    accentColor: '#64748B',
    shapeClass: 'rounded-sm',
    headerShapeClass: 'rounded-t-[2px]',
    labelEn: 'Draft Sticky',
    labelZh: '草稿便签',
    shortHintEn: 'Rough notes excluded from Play',
    shortHintZh: '记录未成型想法，不进入试玩',
    placeholderEn: 'Jot down rough ideas (one per line)...',
    placeholderZh: '每行写一条未成型的灵感...',
  },
};

export function createParameterId(): string {
  return `param-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createOutcomeRuleId(): string {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createDefaultPromptInput(kind: NodeKind): CardPromptInput | undefined {
  if (kind === 'challenge') {
    return {
      mode: 'template',
      challengeTemplate: 'obstacle-action',
      obstacle: '',
      obstacleAction: '',
      sceneName: '',
      sceneLimit: '',
    };
  }
  if (kind === 'action') {
    return {
      mode: 'template',
      actorName: '',
      playerAction: '',
    };
  }
  if (kind === 'outcome') {
    return {
      mode: 'template',
      outcomeTargetLabel: '',
      outcomeTargetKind: 'custom',
      outcomeChange: '',
    };
  }
  return undefined;
}

/**
 * Composes a clean natural-language summary sentence from structured fill-in prompt fields
 * so `node.note` always stays in sync for Play stage, search, and auto-inference.
 */
export function composeNoteFromPromptInput(
  kind: NodeKind,
  prompt: CardPromptInput | undefined,
  lang: Language,
): string {
  if (!prompt || prompt.mode === 'custom') return '';
  const isZh = lang === 'zh';

  if (kind === 'challenge') {
    const tpl = prompt.challengeTemplate ?? 'obstacle-action';
    if (tpl === 'scene-limit') {
      const scene = (prompt.sceneName ?? '').trim();
      const limit = (prompt.sceneLimit ?? '').trim();
      if (!scene && !limit) return '';
      if (isZh) {
        if (scene && limit) return `${scene}存在${limit}`;
        return scene || limit;
      }
      if (scene && limit) return `${scene} has ${limit}`;
      return scene || limit;
    }
    const obs = (prompt.obstacle ?? '').trim();
    const act = (prompt.obstacleAction ?? '').trim();
    if (!obs && !act) return '';
    if (isZh) {
      if (obs && act) return `${obs}正在${act}`;
      return obs || act;
    }
    if (obs && act) return `${obs} is ${act}`;
    return obs || act;
  }

  if (kind === 'action') {
    const actor = (prompt.actorName ?? '').trim();
    const act = (prompt.playerAction ?? '').trim();
    if (!actor && !act) return '';
    if (isZh) {
      if (actor && act) return `玩家通过${actor}${act}`;
      return act || actor;
    }
    if (actor && act) return `Player uses ${actor} to ${act}`;
    return act || actor;
  }

  if (kind === 'outcome') {
    const target = (prompt.outcomeTargetLabel ?? '').trim();
    const change = (prompt.outcomeChange ?? '').trim();
    if (!target && !change) return '';
    if (isZh) {
      if (target && change) return `${target}会${change}`;
      return target || change;
    }
    if (target && change) return `${target} will ${change}`;
    return target || change;
  }

  return '';
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

function parseLooseDigit(token: string): number | null {
  const t = token.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t in ZH_DIGIT_MAP ? ZH_DIGIT_MAP[t] : null;
}

export function extractSpeakerFromText(text: string): {
  speaker: string;
  body: string;
} {
  const trimmed = text.trim();
  const match = trimmed.match(/^([^\s:：，,。.!！?？]{1,14})[:：]\s*(.+)$/);
  if (match) {
    return { speaker: match[1].trim(), body: match[2].trim() };
  }
  return { speaker: '', body: trimmed };
}

export function parseOutcomeDeltasFromText(text: string): {
  hpDelta: number;
  scoreDelta: number;
  mentionsHp: boolean;
  mentionsScore: boolean;
} {
  let hpDelta = 0;
  let scoreDelta = 0;
  const src = text.trim();
  if (!src) {
    return { hpDelta: 0, scoreDelta: 0, mentionsHp: false, mentionsScore: false };
  }

  const mentionsScore =
    /score|pts|points?|coin|star|分数|得分|积分|加分|扣分|金币|星星|宝石/i.test(src);
  const mentionsHp =
    /\bhp\b|health|life|heart|damage|hurt|血|生命|体力|扣血|掉血|回血|受伤/i.test(src);

  const scoreDirect = src.match(
    /(?:score|pts|points?|分数|得分|积分|星星|金币)\s*([+-])\s*(\d+)/i,
  );
  if (scoreDirect) {
    const val = Number(scoreDirect[2]);
    scoreDelta += scoreDirect[1] === '-' ? -val : val;
  } else {
    const scoreSignedBefore = src.match(
      /([+-])\s*(\d+)\s*(?:score|pts|points?|分|星|金币)/i,
    );
    if (scoreSignedBefore) {
      const val = Number(scoreSignedBefore[2]);
      scoreDelta += scoreSignedBefore[1] === '-' ? -val : val;
    } else {
      const zhAddScore = src.match(
        /(?:加|得|获得|得到|赚|收获)\s*(\d+|[一二两三四五六七八九十])\s*(?:分|点分|积分|颗星|金币|枚金币)/,
      );
      const zhSubScore = src.match(
        /(?:扣|减|减少|失去)\s*(\d+|[一二两三四五六七八九十])\s*(?:分|点分|积分)/,
      );
      const enAddScore = src.match(/(?:gain|get|add|earn)\s+(\d+)\s*(?:score|pts|points?)/i);
      const enSubScore = src.match(/(?:lose|minus|subtract)\s+(\d+)\s*(?:score|pts|points?)/i);
      if (zhAddScore) scoreDelta += parseLooseDigit(zhAddScore[1]) ?? 0;
      if (zhSubScore) scoreDelta -= parseLooseDigit(zhSubScore[1]) ?? 0;
      if (enAddScore) scoreDelta += Number(enAddScore[1]);
      if (enSubScore) scoreDelta -= Number(enSubScore[1]);
    }
  }
  if (scoreDelta === 0 && /加分|得分|吃到金币|拿到星星|gain score|get point/i.test(src)) {
    scoreDelta = 1;
  }
  if (scoreDelta === 0 && /扣分|lose point/i.test(src)) {
    scoreDelta = -1;
  }

  const hpDirect = src.match(/(?:\bhp\b|health|life|血量|血|生命|体力)\s*([+-])\s*(\d+)/i);
  if (hpDirect) {
    const val = Number(hpDirect[2]);
    hpDelta += hpDirect[1] === '-' ? -val : val;
  } else {
    const hpSignedBefore = src.match(
      /([+-])\s*(\d+)\s*(?:\bhp\b|health|life|血|点血|滴血|生命)/i,
    );
    if (hpSignedBefore) {
      const val = Number(hpSignedBefore[2]);
      hpDelta += hpSignedBefore[1] === '-' ? -val : val;
    } else {
      const zhSubHp = src.match(
        /(?:扣|减|减少|失去|损失|掉)\s*(\d+|[一二两三四五六七八九十])\s*(?:点|滴|格)?(?:血|血量|生命|体力)/,
      );
      const zhAddHp = src.match(
        /(?:加|回|恢复|回复|增加)\s*(\d+|[一二两三四五六七八九十])\s*(?:点|滴|格)?(?:血|血量|生命|体力)/,
      );
      const enSubHp = src.match(/(?:lose|take|minus)\s+(\d+)\s*(?:hp|health|damage|life)/i);
      const enAddHp = src.match(/(?:heal|gain|restore)\s+(\d+)\s*(?:hp|health|life)/i);
      if (zhSubHp) hpDelta -= parseLooseDigit(zhSubHp[1]) ?? 0;
      if (zhAddHp) hpDelta += parseLooseDigit(zhAddHp[1]) ?? 0;
      if (enSubHp) hpDelta -= Number(enSubHp[1]);
      if (enAddHp) hpDelta += Number(enAddHp[1]);
    }
  }
  if (hpDelta === 0 && /扣血|掉血|受伤|被撞|被砸|take damage|lose hp|get hurt/i.test(src)) {
    hpDelta = -1;
  } else if (hpDelta === 0 && /回血|加血|恢复生命|heal|restore hp/i.test(src)) {
    hpDelta = 1;
  }

  return { hpDelta, scoreDelta, mentionsHp, mentionsScore };
}

export function getDefaultKeyForMechanic(mechanic: ActionMechanic): string {
  switch (mechanic) {
    case 'jump':
      return 'Space';
    case 'shield':
      return 'Shift';
    case 'dodge':
      return 'D';
    case 'ability':
      return 'F';
  }
}

export function formatActionControlKey(control: ActionControlConfig | undefined): string {
  if (!control) return 'Space';
  if (control.device === 'mouse') {
    return control.input || 'Left Button';
  }
  if (control.input === 'custom') {
    return (control.customKey ?? '').trim() || 'E';
  }
  return control.input || 'Space';
}

export function formatBehaviorSummary(
  behavior: ChallengeBehaviorConfig | null | undefined,
  lang: Language,
): string {
  if (!behavior) return '';
  if (behavior.mode === 'custom') return (behavior.customText ?? '').trim();
  const dir = (behavior.direction ?? '').trim();
  const act = (behavior.action ?? '').trim();
  if (!dir && !act) return '';
  if (lang === 'zh') {
    if (dir && act) return `${dir}${act}`;
    return dir || act;
  }
  if (dir && act) return `${act} ${dir}`;
  return act || dir;
}

export function formatOutcomeRuleSummary(
  rule: OutcomePropertyRule,
  entry: InferenceVariableOption,
  lang: Language,
): string {
  const isZh = lang === 'zh';
  const t = entry.variable.type;

  if (rule.op === 'reset') {
    return isZh ? '重置为初始值' : 'reset to initial';
  }

  if (t === 'number') {
    if (rule.op === 'set') {
      const val = rule.numberValue ?? 0;
      return isZh ? `设为 ${val}` : `be set to ${val}`;
    }
    if (rule.op === 'random') {
      const min = rule.randomMin ?? 1;
      const max = rule.randomMax ?? 5;
      return isZh ? `随机 ${min}~${max}` : `become random ${min}–${max}`;
    }
    if (rule.op === 'formula') {
      const raw = (rule.formula ?? '').trim();
      if (!raw) return isZh ? '按公式更新' : 'update by formula';
      // Compact shorthand when formula starts with this variable's own key, e.g. "Cat.HP - 1" -> "- 1"
      if (raw.toLowerCase().startsWith(entry.fullKey.toLowerCase())) {
        const rest = raw.slice(entry.fullKey.length).trim();
        if (/^[+\-*/]/.test(rest)) return rest;
      }
      return `= ${raw}`;
    }
  }

  if (t === 'boolean') {
    if (rule.op === 'toggle') return isZh ? '切换开关状态' : 'toggle';
    if (rule.op === 'set') {
      const v = rule.booleanValue !== false;
      return isZh ? `变为 ${v ? '是' : '否'}` : `become ${v ? 'True' : 'False'}`;
    }
    if (rule.op === 'formula') {
      const raw = (rule.formula ?? '').trim();
      return raw ? `= ${raw}` : isZh ? '按条件更新' : 'update by condition';
    }
  }

  if (t === 'choice') {
    if (rule.op === 'random') return isZh ? '随机切换选项' : 'switch randomly';
    if (rule.op === 'step') {
      const prev = rule.stepDirection === 'previous';
      return isZh ? (prev ? '切到上一项' : '切到下一项') : prev ? 'step to previous' : 'step to next';
    }
    if (rule.op === 'set') {
      const v = (rule.choiceValue ?? '').trim();
      return v ? (isZh ? `变为 ${v}` : `become ${v}`) : isZh ? '切换选项' : 'change option';
    }
  }

  if (t === 'text') {
    if (rule.op === 'clear') return isZh ? '清空文本' : 'be cleared';
    if (rule.op === 'append') {
      const v = (rule.textValue ?? '').trim();
      return v ? (isZh ? `追加 “${v}”` : `append "${v}"`) : isZh ? '追加文本' : 'append text';
    }
    if (rule.op === 'set') {
      const v = (rule.textValue ?? '').trim();
      return v ? (isZh ? `变为 “${v}”` : `become "${v}"`) : isZh ? '修改文本' : 'update text';
    }
  }

  return '';
}

function inferOutcomePropertyRule(
  entry: InferenceVariableOption,
  changeText: string,
  fullNote: string,
): OutcomePropertyRule {
  const { variable, fullKey } = entry;
  const raw = (changeText || fullNote).trim();
  const s = raw.toLowerCase();

  if (variable.type === 'number') {
    const base: OutcomePropertyRule = {
      id: `auto-prop-${variable.id}`,
      variableId: variable.id,
      op: 'formula',
      formula: `${fullKey} - 1`,
      numberValue: Number(variable.initialValue) || 0,
      randomMin: 1,
      randomMax: 5,
    };

    if (/重置|恢复初始|归位|reset/.test(s)) {
      return { ...base, op: 'reset' };
    }

    const randMatch = raw.match(/(?:随机|random)[^\d-]*(-?\d+(?:\.\d+)?)\s*(?:[-~到至]|to)\s*(-?\d+(?:\.\d+)?)/i);
    if (randMatch) {
      return {
        ...base,
        op: 'random',
        randomMin: Number(randMatch[1]),
        randomMax: Number(randMatch[2]),
      };
    }
    if (/随机|random/.test(s)) {
      return { ...base, op: 'random', randomMin: 1, randomMax: 6 };
    }

    const setMatch = raw.match(/(?:设为|设置为|变为|变成|改为|归零|清零|set\s+to|become|equals?|=)\s*(-?\d+(?:\.\d+)?)/i);
    if (setMatch) {
      return { ...base, op: 'set', numberValue: Number(setMatch[1]) };
    }
    if (/归零|清零|变为\s*0|变成\s*0/.test(s)) {
      return { ...base, op: 'set', numberValue: 0 };
    }

    const opNumMatch = raw.match(/([+\-*/])\s*(\d+(?:\.\d+)?)/);
    if (opNumMatch) {
      return {
        ...base,
        op: 'formula',
        formula: `${fullKey} ${opNumMatch[1]} ${opNumMatch[2]}`,
      };
    }

    if (/翻倍|加倍|double|x\s*2/i.test(s)) {
      return { ...base, op: 'formula', formula: `${fullKey} * 2` };
    }
    if (/减半|一半|half/i.test(s)) {
      return { ...base, op: 'formula', formula: `${fullKey} / 2` };
    }

    const zhAdd = raw.match(/(?:增加|加上|加|得|获得|提升|回复|恢复|回)\s*(\d+(?:\.\d+)?|[一二两三四五六七八九十])/);
    if (zhAdd) {
      const n = parseLooseDigit(zhAdd[1]);
      if (n !== null) return { ...base, op: 'formula', formula: `${fullKey} + ${n}` };
    }
    const zhSub = raw.match(/(?:减少|减去|减|扣|扣除|掉|失去|损失|降低)\s*(\d+(?:\.\d+)?|[一二两三四五六七八九十])/);
    if (zhSub) {
      const n = parseLooseDigit(zhSub[1]);
      if (n !== null) return { ...base, op: 'formula', formula: `${fullKey} - ${n}` };
    }
    const enAdd = raw.match(/(?:increase|add|gain|plus|heal|restore)(?:\s+by)?\s+(\d+(?:\.\d+)?)/i);
    if (enAdd) {
      return { ...base, op: 'formula', formula: `${fullKey} + ${enAdd[1]}` };
    }
    const enSub = raw.match(/(?:decrease|minus|subtract|lose|drop|reduce)(?:\s+by)?\s+(\d+(?:\.\d+)?)/i);
    if (enSub) {
      return { ...base, op: 'formula', formula: `${fullKey} - ${enSub[1]}` };
    }

    if (/增加|加分|得分|回血|恢复|提升|increase|gain|heal|plus|add/.test(s)) {
      return { ...base, op: 'formula', formula: `${fullKey} + 1` };
    }
    if (/减少|扣|掉|受伤|损失|decrease|lose|damage|hurt|minus/.test(s)) {
      return { ...base, op: 'formula', formula: `${fullKey} - 1` };
    }

    // If user typed a pure number like "10" in the change box
    const loneNum = raw.match(/^(-?\d+(?:\.\d+)?)$/);
    if (loneNum) {
      return { ...base, op: 'set', numberValue: Number(loneNum[1]) };
    }

    return { ...base, op: 'formula', formula: '' };
  }

  if (variable.type === 'boolean') {
    const base: OutcomePropertyRule = {
      id: `auto-prop-${variable.id}`,
      variableId: variable.id,
      op: 'set',
      booleanValue: true,
      formula: fullKey,
    };
    if (/重置|恢复初始|reset/.test(s)) return { ...base, op: 'reset' };
    if (/切换|翻转|反转|取反|toggle|flip/.test(s)) return { ...base, op: 'toggle' };
    if (/[<>!=]=?|\b(?:and|or|not)\b/i.test(raw)) {
      return { ...base, op: 'formula', formula: raw.replace(/^=\s*/, '') };
    }
    if (/false|否|关闭|关掉|取消|失去|禁用|锁上|未|off|disable|lock|remove/i.test(s)) {
      return { ...base, op: 'set', booleanValue: false };
    }
    if (/true|是|开启|启用|获得|打开|on|enable|unlock/i.test(s)) return {...base,op:'set',booleanValue:true};
    return {...base,op:'formula',formula:''};
  }

  if (variable.type === 'choice') {
    const options = variable.options ?? [];
    const base: OutcomePropertyRule = {
      id: `auto-prop-${variable.id}`,
      variableId: variable.id,
      op: 'set',
      choiceValue: options[0] ?? String(variable.initialValue ?? ''),
      stepDirection: 'next',
      stepWrap: 'stay',
    };
    if (/重置|恢复初始|reset/.test(s)) return { ...base, op: 'reset' };
    if (/随机|random/.test(s)) return { ...base, op: 'random' };
    if (variable.ordered && /上一个|上一项|降级|倒退|previous|prev|back/.test(s)) {
      return { ...base, op: 'step', stepDirection: 'previous', stepWrap: 'stay' };
    }
    if (variable.ordered && /下一个|下一项|升级|进阶|next|advance/.test(s)) {
      return { ...base, op: 'step', stepDirection: 'next', stepWrap: 'stay' };
    }
    const matchedOpt = options.find((opt) => opt.trim() && s.includes(opt.trim().toLowerCase()));
    if (matchedOpt) {
      return { ...base, op: 'set', choiceValue: matchedOpt };
    }
    return {...base,op:'formula',formula:''};
  }

  // Text variable
  const base: OutcomePropertyRule = {
    id: `auto-prop-${variable.id}`,
    variableId: variable.id,
    op: 'set',
    textValue: '',
  };
  if (/重置|恢复初始|reset/.test(s)) return { ...base, op: 'reset' };
  if (/清空|清除|删除文本|clear|empty/.test(s)) return { ...base, op: 'clear' };
  const appendMatch = raw.match(/(?:追加|加上|拼接|append)\s*[“"']?(.+?)[”"']?$/i);
  if (appendMatch) {
    return { ...base, op: 'append', textValue: appendMatch[1].trim() };
  }
  const setTextMatch = raw.match(/(?:设为|改为|变为|变成|显示|set\s+to|become)\s*[“"']?(.+?)[”"']?$/i);
  if (setTextMatch) {
    return { ...base, op: 'set', textValue: setTextMatch[1].trim() };
  }
  return { ...base, op: 'set', textValue: raw };
}

/**
 * Deterministic auto-inference from the card's front prompt & one-sentence description.
 * Populates context-aware defaults for Playback Settings, Related Behavior, 3-part Control,
 * Related Properties, and Related Parameters without overwriting any manual edits.
 */
export function inferCardFieldsFromText(
  kind: NodeKind,
  note: string,
  lang: Language = 'en',
  context?: CardInferenceContext,
): CardFieldConfig {
  const trimmed = note.trim();
  const prompt = context?.promptInput;
  const scopedVars = context?.scopedVariables ?? [];
  if (!trimmed && !prompt) return {};
  const s = trimmed.toLowerCase();
  const isZh = lang === 'zh';

  if (kind === 'narration' || kind === 'dialogue') {
    if (!trimmed) return {};
    const playbackSettings: PlaybackSettings = { mode: 'click', key: 'Space', durationSec: 3 };
    const autoSecMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds|秒)/i);
    if (/自动|auto/.test(s) && autoSecMatch) {
      playbackSettings.mode = 'auto';
      playbackSettings.durationSec = Math.max(0.5, Number(autoSecMatch[1]));
    } else if (/自动播放|auto-?play/.test(s)) {
      playbackSettings.mode = 'auto';
      playbackSettings.durationSec = 3;
    } else if (/空格|按.*键|press\s+space|press\s+enter|press\s+key/.test(s)) {
      playbackSettings.mode = 'key';
      playbackSettings.key = /enter|回车/.test(s) ? 'Enter' : 'Space';
    }

    if (kind === 'dialogue') {
      return { playbackSettings };
    }

    const subtitlePosition: SubtitlePosition = /顶部|上方|上面|\btop\b/.test(s)
      ? 'top'
      : 'bottom';

    let sceneTheme: SceneTheme = 'neutral';
    if (/太空|宇宙|星球|银河|飞船|星空|space|galaxy|planet|starship|cosmos/.test(s)) {
      sceneTheme = 'space';
    } else if (/海底|海洋|大海|水下|珊瑚|ocean|sea|underwater|coral/.test(s)) {
      sceneTheme = 'ocean';
    } else if (/火山|岩浆|地牢|洞窟|山洞|火焰山|lava|volcano|dungeon|cavern|cave/.test(s)) {
      sceneTheme = 'cavern';
    } else if (/草地|森林|阳光|白天|草原|花园|meadow|forest|sunny|day|garden|grass/.test(s)) {
      sceneTheme = 'meadow';
    } else if (/夜|夜晚|夜幕|黑夜|月亮|灯笼|黄昏|night|moon|lantern|twilight|dark/.test(s)) {
      sceneTheme = 'night';
    }

    return { subtitlePosition, sceneTheme, playbackSettings };
  }

  if (kind === 'challenge') {
    if (!trimmed) return {};

    const isSceneLimitTemplate =
      prompt?.mode !== 'custom' && prompt?.challengeTemplate === 'scene-limit';
    const rawActionClause =
      prompt?.mode !== 'custom' && prompt?.challengeTemplate === 'obstacle-action'
        ? (prompt.obstacleAction ?? '').trim()
        : '';
    const rawLimitClause = isSceneLimitTemplate ? (prompt?.sceneLimit ?? '').trim() : '';

    let challengePattern: ChallengePattern = 'ground-hazard';
    if (
      /收集|接住|捡|拿到|吃到|金币|星星|宝石|果实|宝箱|糖果|collect|catch|grab|coin|star|gem|fruit|candy|treasure/.test(
        s,
      )
    ) {
      challengePattern = 'collectible';
    } else if (
      /天上|空中|掉落|落下|掉下|砸下|从天|陨石|雨|雷|falling|drop|sky|meteor|rain|above/.test(
        s,
      )
    ) {
      challengePattern = 'falling-hazard';
    }

    let challengeSpeed: ChallengeSpeed = 'normal';
    if (/高速|很快|飞快|极快|极速|猛|急速|疾驰|fast|quick|rapid|swift/.test(s)) {
      challengeSpeed = 'fast';
    } else if (/缓慢|很慢|慢速|慢慢|轻轻|悠闲|slow|gentle|lazy/.test(s)) {
      challengeSpeed = 'slow';
    }

    let challengeVisual: ChallengeVisual = 'spark';
    if (/金币|星星|宝石|果实|宝箱|糖果|coin|star|gem|fruit|candy|collect/.test(s)) {
      challengeVisual = 'coin';
    } else if (/石头|巨石|陨石|岩石|冰块|石块|木头|圆木|rock|meteor|boulder|stone|ice|log|wood/.test(s)) {
      challengeVisual = 'rock';
    } else if (/怪|敌人|史莱姆|龙|幽灵|机器人|小怪|boss|monster|enemy|slime|ghost|robot/.test(s)) {
      challengeVisual = 'creature';
    } else if (/刺|尖刺|陷阱|地刺|荆棘|地雷|炸弹|spike|trap|thorn|mine|bomb/.test(s)) {
      challengeVisual = 'spike';
    }

    const hasMotionWord =
      /移动|靠近|接近|滚|飞|飘|掉|落|砸|冲|追|游|爬|跳|弹|发射|射出|滑|摆动|旋转|前进|后退|逼近|move|slide|roll|fall|drop|chase|approach|fly|float|bounce|shoot|swing|patrol|spin|rush|come/.test(
        s,
      );

    // Scene-limit template is static by default unless motion is explicitly mentioned
    const isStaticLimit =
      (isSceneLimitTemplate && !hasMotionWord) ||
      (/存在|隐藏|地雷|迷宫|限时|时间限制|禁区|棋盘|障碍墙|步数|视野|黑暗|hidden|mine|maze|time limit|countdown|board|wall|blocked|limit|only|trap/.test(
        s,
      ) &&
        !hasMotionWord);

    let relatedBehavior: ChallengeBehaviorConfig | null = null;
    const relatedParameters: CardParameterItem[] = [];

    // Wait until student writes an action clause when using Obstacle-Action template
    const hasOnlyObstacleName =
      prompt?.mode !== 'custom' &&
      prompt?.challengeTemplate === 'obstacle-action' &&
      Boolean(prompt.obstacle?.trim()) &&
      !rawActionClause;

    if (!isStaticLimit && !hasOnlyObstacleName) {
      const behaviorSource = rawActionClause || trimmed;
      const bs = behaviorSource.toLowerCase();

      let direction = '';
      const towardZh = behaviorSource.match(/(?:朝向|向着|向|往)([^，,。.\s]{1,8}?)(?=靠近|移动|滚|飞|冲|追|滑|逼近|发射|前进|跑|走)/);
      const towardEn = behaviorSource.match(/\b(?:toward|towards|at)\s+(?:the\s+)?([a-z0-9_-]+)/i);

      if (/来回|左右|往返|巡逻|摆动|back\s*and\s*forth|patrol|oscillat|swing/.test(bs)) {
        direction = isZh ? '来回' : 'back and forth';
      } else if (/从左[往向到至]右|向右|往右|朝右|右移|右边|右侧|右方|\bright(?:ward|wards)?\b/.test(bs)) {
        direction = isZh ? '向右' : 'right';
      } else if (/从右[往向到至]左|向左|往左|朝左|左移|左边|左侧|左方|\bleft(?:ward|wards)?\b/.test(bs)) {
        direction = isZh ? '向左' : 'left';
      } else if (/从上[往向到至]下|向下|往下|朝下|下移|下方|下边|掉落|落下|掉下|下落|坠落|砸下|从天|\bdown(?:ward|wards)?\b|\bfall(?:ing)?\b|\bdrop(?:ping)?\b/.test(bs)) {
        direction = isZh ? '向下' : 'downward';
      } else if (/从下[往向到至]上|向上|往上|朝上|上移|上方|上边|升起|上升|飞起|冒出|\bup(?:ward|wards)?\b|\bris(?:e|ing)\b/.test(bs)) {
        direction = isZh ? '向上' : 'upward';
      } else if (/随机|四处|random/.test(bs)) {
        direction = isZh ? '随机方向' : 'randomly';
      } else if (/静止|不动|固定|原地|stationary|still|static|fixed/.test(bs)) {
        direction = isZh ? '原地' : 'in place';
      } else if (towardZh) {
        direction = `朝向${towardZh[1]}`;
      } else if (towardEn) {
        direction = `toward ${towardEn[1]}`;
      } else if (/靠近|接近|追|逼近|approach|chase|follow/.test(bs)) {
        direction = isZh ? '朝向玩家' : 'toward player';
      } else if (hasMotionWord) {
        direction = isZh ? '向左' : 'left';
      }

      // Preserve the student's actual action words instead of replacing with a generic canned phrase
      let action = rawActionClause;
      if (action && direction) {
        // Strip leading duplicate direction phrase so direction + action reads naturally
        action = action
          .replace(/^(?:不断|持续|一直|慢慢|快速)?(?:从左[往向到至]右|从右[往向到至]左|从上[往向到至]下|从下[往向到至]上|向左|向右|向上|向下|往左|往右|往上|往下|朝左|朝右|朝上|朝下|来回|左右|往返|随机方向|原地)(?:边|侧|方)?/, '')
          .replace(/^(?:不断|持续|一直|慢慢|快速)?(?:朝向|向着|向|往)[^，,。.\s]{1,8}?(?=靠近|移动|滚|飞|冲|追|滑|逼近|发射|前进|跑|走)/, '')
          .replace(/\b(?:toward|towards)\s+(?:the\s+)?[a-z0-9_-]+/i, '')
          .replace(/\b(?:to the\s+)?(?:left(?:ward|wards)?|right(?:ward|wards)?|up(?:ward|wards)?|down(?:ward|wards)?|back\s+and\s+forth|in\s+place)\b/i, '')
          .trim();
      }
      if (!action) {
        if (/滚|roll/.test(bs)) action = isZh ? '滚动' : 'rolls';
        else if (/掉|落|砸|fall|drop/.test(bs)) action = isZh ? '下落' : 'falls';
        else if (/飞|飘|float|fly/.test(bs)) action = isZh ? '飞行' : 'flies';
        else if (/追|chase/.test(bs)) action = isZh ? '追击' : 'chases';
        else if (/弹|跳|bounce|jump/.test(bs)) action = isZh ? '弹跳' : 'bounces';
        else if (/射|发射|吐|shoot|fire/.test(bs)) action = isZh ? '发射攻击' : 'shoots';
        else if (/靠近|接近|滑|approach|slide/.test(bs)) action = isZh ? '靠近' : 'approaches';
        else action = rawActionClause || (isZh ? '移动' : 'moves');
      }

      relatedBehavior = {
        mode: 'template',
        direction,
        action,
      };

      const explicitSpeed = trimmed.match(/(?:速度|速率|speed)[^\d]*(\d+(?:\.\d+)?)/i);
      const speedDefault = explicitSpeed
        ? Number(explicitSpeed[1])
        : challengeSpeed === 'fast'
          ? 5
          : challengeSpeed === 'slow'
            ? 1.5
            : 3;

      if (hasMotionWord || rawActionClause) {
        relatedParameters.push({
          id: 'auto-move-speed',
          name: isZh ? '移动速度' : 'Move Speed',
          value: speedDefault,
          unit: isZh ? '格/秒' : 'u/s',
          min: 0.5,
          max: 15,
          step: 0.5,
        });
      }

      const intervalMatch = trimmed.match(/(?:每隔?|every)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|秒)/i);
      if (intervalMatch || /不断|持续|一直|波次|keep|continuously|spawn|wave/.test(s)) {
        relatedParameters.push({
          id: 'auto-spawn-interval',
          name: isZh ? '出现间隔' : 'Spawn Interval',
          value: intervalMatch ? Number(intervalMatch[1]) : 2,
          unit: 's',
          min: 0.5,
          max: 10,
          step: 0.5,
        });
      }
    } else if (isStaticLimit) {
      const limitSrc = rawLimitClause || trimmed;
      const timeMatch = limitSrc.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds|秒)/i);
      const stepMatch = limitSrc.match(/(\d+)\s*(?:步|次|回合|moves?|steps?|turns?)/i);
      const countMatch = limitSrc.match(/(\d+)\s*(?:个|颗|枚|座|道|处|mines?|bombs?|traps?|walls?)/i);

      if (timeMatch || /限时|倒计时|时间限制|time\s*limit|countdown|timer/.test(s)) {
        relatedParameters.push({
          id: 'auto-time-limit',
          name: isZh ? '限制时长' : 'Time Limit',
          value: timeMatch ? Number(timeMatch[1]) : 30,
          unit: 's',
          min: 5,
          max: 180,
          step: 5,
        });
      }
      if (stepMatch || /步数|最多走|moves?|steps?/.test(s)) {
        relatedParameters.push({
          id: 'auto-step-limit',
          name: isZh ? '步数限制' : 'Move Limit',
          value: stepMatch ? Number(stepMatch[1]) : 10,
          unit: isZh ? '步' : '',
          min: 1,
          max: 50,
          step: 1,
        });
      }
      if (countMatch || /地雷|炸弹|陷阱|障碍|mine|bomb|trap/.test(s)) {
        relatedParameters.push({
          id: 'auto-hazard-count',
          name: isZh ? '数量' : 'Hazard Count',
          value: countMatch ? Number(countMatch[1]) : 6,
          unit: isZh ? '个' : '',
          min: 1,
          max: 30,
          step: 1,
        });
      }
    }

    return {
      challengePattern,
      challengeSpeed,
      challengeVisual,
      relatedBehavior,
      relatedParameters: relatedParameters.length > 0 ? relatedParameters : undefined,
    };
  }

  if (kind === 'action') {
    const actionText =
      prompt?.mode !== 'custom' ? (prompt?.playerAction ?? '').trim() : trimmed;
    if (!actionText && !trimmed) return {};
    const targetText = actionText || trimmed;
    const sAct = targetText.toLowerCase();

    let actionMechanic: ActionMechanic = 'ability';
    let actionControl: ActionControlConfig = {
      device: 'keyboard',
      input: 'custom',
      customKey: 'E',
      interactionType: 'press',
    };
    const relatedParameters: CardParameterItem[] = [];

    const cooldownMatch = trimmed.match(/(?:冷却|间隔|cd|cooldown)[^\d]*(\d+(?:\.\d+)?)/i);
    const numMatch = targetText.match(/(\d+(?:\.\d+)?)/);

    if (/跳|跳跃|蹦|跃|jump|hop|leap/.test(sAct)) {
      actionMechanic = 'jump';
      actionControl = { device: 'keyboard', input: 'Space', interactionType: 'press' };
      relatedParameters.push({
        id: 'auto-jump-height',
        name: isZh ? '跳跃高度' : 'Jump Height',
        value: numMatch ? Math.max(40, Math.min(260, Number(numMatch[1]))) : 120,
        unit: 'px',
        min: 40,
        max: 260,
        step: 10,
      });
    } else if (/发射|射击|攻击|打|投掷|扔|施法|火球|激光|魔法|波|shoot|blast|fire|laser|attack|wave|cast|throw/.test(sAct)) {
      actionMechanic = 'ability';
      const usesMouse = /点击|鼠标|瞄准|click|mouse|aim/.test(s);
      actionControl = {
        device: usesMouse ? 'mouse' : 'keyboard',
        input: usesMouse ? 'Left Button' : 'custom',
        customKey: usesMouse ? undefined : 'F',
        interactionType: 'press',
      };
      relatedParameters.push(
        {
          id: 'auto-cooldown',
          name: isZh ? '冷却时间' : 'Cooldown',
          value: cooldownMatch ? Number(cooldownMatch[1]) : 0.5,
          unit: 's',
          min: 0.1,
          max: 5,
          step: 0.1,
        },
        {
          id: 'auto-projectile-speed',
          name: isZh ? '发射速度' : 'Projectile Speed',
          value: 8,
          unit: isZh ? '格/秒' : 'u/s',
          min: 1,
          max: 20,
          step: 1,
        },
      );
    } else if (/挡|盾|防|格挡|护盾|抵挡|保护|block|shield|guard|defend|parry/.test(sAct)) {
      actionMechanic = 'shield';
      actionControl = {
        device: 'keyboard',
        input: 'custom',
        customKey: 'Shift',
        interactionType: 'hold',
      };
      relatedParameters.push({
        id: 'auto-shield-duration',
        name: isZh ? '护盾时长' : 'Shield Duration',
        value: numMatch ? Number(numMatch[1]) : 1.5,
        unit: 's',
        min: 0.2,
        max: 6,
        step: 0.1,
      });
    } else if (/拖|拽|拉|画|瞄准|drag|pull|aim|draw/.test(sAct)) {
      actionMechanic = 'ability';
      actionControl = { device: 'mouse', input: 'Left Button', interactionType: 'drag' };
      relatedParameters.push({
        id: 'auto-drag-speed',
        name: isZh ? '拖拽灵敏度' : 'Drag Speed',
        value: 1,
        unit: 'x',
        min: 0.2,
        max: 3,
        step: 0.1,
      });
    } else if (/蹲|下蹲|滑铲|俯身|crouch|duck|slide/.test(sAct)) {
      actionMechanic = 'dodge';
      actionControl = { device: 'keyboard', input: 'ArrowDown', interactionType: 'hold' };
      relatedParameters.push({
        id: 'auto-crouch-speed',
        name: isZh ? '下蹲速度' : 'Crouch Speed',
        value: 2,
        unit: isZh ? '格/秒' : 'u/s',
        min: 0.5,
        max: 10,
        step: 0.5,
      });
    } else if (/冲刺|加速|闪避|翻滚|dash|sprint|dodge|roll/.test(sAct)) {
      actionMechanic = 'dodge';
      actionControl = {
        device: 'keyboard',
        input: 'custom',
        customKey: 'Shift',
        interactionType: 'press',
      };
      relatedParameters.push(
        {
          id: 'auto-dash-distance',
          name: isZh ? '冲刺距离' : 'Dash Distance',
          value: numMatch ? Number(numMatch[1]) : 90,
          unit: 'px',
          min: 20,
          max: 240,
          step: 10,
        },
        {
          id: 'auto-cooldown',
          name: isZh ? '冷却时间' : 'Cooldown',
          value: cooldownMatch ? Number(cooldownMatch[1]) : 1,
          unit: 's',
          min: 0.1,
          max: 5,
          step: 0.1,
        },
      );
    } else if (/移动|走|跑|向左|向右|向上|向下|前进|后退|move|walk|run|\bleft\b|\bright\b|\bup\b|\bdown\b/.test(sAct)) {
      actionMechanic = 'dodge';
      let dirKey = 'ArrowRight';
      if (/向左|\bleft\b/.test(sAct)) dirKey = 'ArrowLeft';
      else if (/向上|\bup\b/.test(sAct)) dirKey = 'ArrowUp';
      else if (/向下|\bdown\b/.test(sAct)) dirKey = 'ArrowDown';
      actionControl = { device: 'keyboard', input: dirKey, interactionType: 'hold' };
      relatedParameters.push({
        id: 'auto-move-speed',
        name: isZh ? '移动速度' : 'Move Speed',
        value: numMatch ? Number(numMatch[1]) : 5,
        unit: isZh ? '格/秒' : 'u/s',
        min: 0.5,
        max: 15,
        step: 0.5,
      });
    } else if (/点击|点开|翻开|挖|挖掘|拾取|捡|打开|选择|标记|插旗|放置|click|tap|dig|open|pick|select|flip|flag|place/.test(sAct)) {
      actionMechanic = 'ability';
      const isRight = /右键|标记|插旗|right|flag/.test(sAct);
      actionControl = {
        device: 'mouse',
        input: isRight ? 'Right Button' : 'Left Button',
        interactionType: 'press',
      };
      if (cooldownMatch) {
        relatedParameters.push({
          id: 'auto-cooldown',
          name: isZh ? '冷却时间' : 'Cooldown',
          value: Number(cooldownMatch[1]),
          unit: 's',
          min: 0.1,
          max: 5,
          step: 0.1,
        });
      }
    } else {
      // Genuine generic action: do NOT force Jump Height
      actionMechanic = 'ability';
      actionControl = {
        device: 'keyboard',
        input: 'custom',
        customKey: 'E',
        interactionType: 'press',
      };
      relatedParameters.push({
        id: 'auto-cooldown',
        name: isZh ? '冷却时间' : 'Cooldown',
        value: cooldownMatch ? Number(cooldownMatch[1]) : 0.5,
        unit: 's',
        min: 0,
        max: 10,
        step: 0.1,
      });
    }

    // Explicit input/interaction overrides from user wording
    if (/右键|right\s*(?:click|button)/.test(s)) {
      actionControl = { device: 'mouse', input: 'Right Button', interactionType: 'press' };
    } else if (/双击|double\s*click/.test(s)) {
      actionControl = { device: 'mouse', input: 'Left Button', interactionType: 'double-click' };
    } else if (/左键|鼠标点击|left\s*(?:click|button)/.test(s)) {
      actionControl = { device: 'mouse', input: 'Left Button', interactionType: 'press' };
    } else if (/空格|\bspace\b/.test(s)) {
      actionControl = { ...actionControl, device: 'keyboard', input: 'Space', customKey: undefined };
    }
    if (/按住|长按|\bhold\b/.test(s)) {
      actionControl = { ...actionControl, interactionType: 'hold' };
    } else if (/松开|释放|\brelease\b/.test(s)) {
      actionControl = { ...actionControl, interactionType: 'release' };
    }

    return {
      actionMechanic,
      keyBinding: formatActionControlKey(actionControl),
      actionControl,
      relatedParameters: relatedParameters.length > 0 ? relatedParameters : undefined,
    };
  }

  if (kind === 'outcome') {
    if (!trimmed) return {};
    const { hpDelta, scoreDelta } = parseOutcomeDeltasFromText(trimmed);
    let outcomeVisual: OutcomeVisualKind = 'none';
    if (/胜利|通关|赢|成功拿到|抵达终点|win|victory|cleared|escaped|complete/.test(s)) {
      outcomeVisual = 'victory';
    } else if (/失败|耗尽|死亡|结束|重来|game over|defeat|exhausted|reset|fail/.test(s)) {
      outcomeVisual = 'defeat';
    } else if (hpDelta < 0 || /受伤|撞|震退|击退|扣血|掉血|疼|hurt|hit|damage|knock/.test(s)) {
      outcomeVisual = 'hurt';
    } else if (
      scoreDelta > 0 ||
      hpDelta > 0 ||
      /成功|灯笼|亮起|特效|欢呼|闪耀|发光|奖励|消失|击败|flare|glow|cheer|sparkle|celebrat|success|bonus|disappear|defeated/.test(
        s,
      )
    ) {
      outcomeVisual = 'celebrate';
    }

    // Dynamically infer Related Properties from picked variable OR variable mentioned in text
    let matchedVar: InferenceVariableOption | undefined;
    if (prompt?.mode !== 'custom' && prompt?.outcomeTargetKind === 'variable' && prompt.outcomeTargetRef) {
      matchedVar = scopedVars.find((v) => v.variable.id === prompt.outcomeTargetRef);
    }
    if (!matchedVar && scopedVars.length > 0) {
      // Match longest fullKey or variable.name mentioned in the note
      const sorted = [...scopedVars].sort(
        (a, b) => b.fullKey.length - a.fullKey.length,
      );
      matchedVar = sorted.find(
        (v) =>
          s.includes(v.fullKey.toLowerCase()) ||
          (v.variable.name.trim().length >= 2 &&
            s.includes(v.variable.name.trim().toLowerCase())),
      );
    }

    const relatedProperties: OutcomePropertyRule[] = [];
    if (matchedVar) {
      const changeClause =
        prompt?.mode !== 'custom' ? (prompt?.outcomeChange ?? '').trim() : trimmed;
      relatedProperties.push(inferOutcomePropertyRule(matchedVar, changeClause, trimmed));
    }

    // Optional related parameters only when physical/timed consequence is mentioned
    const relatedParameters: CardParameterItem[] = [];
    const knockMatch = trimmed.match(/(?:击退|震退|撤退|弹开|弹飞|knockback|push|recoil|bounce)[^\d]*(\d+(?:\.\d+)?)/i);
    if (knockMatch || /击退|震退|撤退|弹开|弹飞|knockback|push|recoil|bounce/.test(s)) {
      relatedParameters.push({
        id: 'auto-knockback',
        name: isZh ? '击退距离' : 'Knockback Distance',
        value: knockMatch ? Number(knockMatch[1]) : 60,
        unit: 'px',
        min: 10,
        max: 240,
        step: 10,
      });
    }
    const durMatch = trimmed.match(/(?:眩晕|僵直|无敌|冷却|停顿|延迟|持续|stun|freeze|invincible|delay|duration)[^\d]*(\d+(?:\.\d+)?)/i);
    if (durMatch || /眩晕|僵直|无敌|停顿|延迟|stun|freeze|invincible|delay/.test(s)) {
      relatedParameters.push({
        id: 'auto-effect-duration',
        name: isZh ? '持续时间' : 'Duration',
        value: durMatch ? Number(durMatch[1]) : 0.8,
        unit: 's',
        min: 0.1,
        max: 5,
        step: 0.1,
      });
    }

    return {
      scoreDelta,
      hpDelta,
      outcomeVisual,
      relatedProperties: relatedProperties.length > 0 ? relatedProperties : undefined,
      relatedParameters: relatedParameters.length > 0 ? relatedParameters : undefined,
    };
  }

  return {};
}

/**
 * Merges auto-inferred fields into current card fields WITHOUT overwriting any field
 * that the student has explicitly set manually.
 */
export function mergeAutoFields(
  kind: NodeKind,
  note: string,
  current: CardFieldConfig,
  manualFields: (keyof CardFieldConfig)[],
  lang: Language = 'en',
  context?: CardInferenceContext,
): CardFieldConfig {
  const manualSet = new Set(manualFields);
  if (!note.trim()) {
    const kept: CardFieldConfig = {};
    manualSet.forEach((key) => {
      if (current[key] !== undefined) {
        (kept as Record<string, unknown>)[key] = current[key];
      }
    });
    return kept;
  }

  const inferred = inferCardFieldsFromText(kind, note, lang, context);
  const next: CardFieldConfig = { ...current };

  (Object.keys(inferred) as (keyof CardFieldConfig)[]).forEach((key) => {
    if (!manualSet.has(key)) {
      (next as Record<string, unknown>)[key] = inferred[key];
    }
  });

  // Clear auto-generated optional sections if the new text no longer calls for them
  if (!manualSet.has('relatedBehavior') && inferred.relatedBehavior === undefined) {
    delete next.relatedBehavior;
  }
  if (!manualSet.has('relatedParameters') && inferred.relatedParameters === undefined) {
    delete next.relatedParameters;
  }
  if (!manualSet.has('relatedProperties') && inferred.relatedProperties === undefined) {
    delete next.relatedProperties;
  }

  return next;
}

/**
 * Starts completely blank (from 0) so the student builds their game from scratch.
 */
export const INITIAL_NODES: BoardNode[] = [];
export const INITIAL_EDGES: BoardEdge[] = [];

export function getGuidancePrompt(
  stage: SpotlightStage,
  checklist: OnboardingChecklist,
  nodes: BoardNode[],
  lang: Language,
): { title: string; body: string } {
  const playableCount = nodes.filter((n) => NODE_CATALOG[n.kind].isPlayable).length;

  if (playableCount === 0 || stage === 'focus-build') {
    return lang === 'zh'
      ? {
          title: '从空白画板开始搭建你的游戏',
          body: '点击左下角「添加卡片」放上第一张体验卡，填写卡片内容，系统会自动匹配默认属性并同步到右侧 2D 舞台。',
        }
      : {
          title: 'Start from a truly blank board',
          body: 'Click "Add Card" to place your first card — fill in the prompt and watch attributes & the 2D stage sync live.',
        };
  }

  if (stage === 'focus-play' || !checklist.testedInPlay) {
    return lang === 'zh'
      ? {
          title: '写好描述后，点 Play 运行看看',
          body: '展开卡片可修改绑定素材、操控、参数与属性变化；连起箭头组织关系后，点击右侧「Play」试玩。',
        }
      : {
          title: 'Stage synced — press Play to run it',
          body: 'Expand any card to fine-tune assets, controls, parameters, or properties — connect arrows and press "Play".',
        };
  }

  if (!checklist.connectedCards) {
    return lang === 'zh'
      ? {
          title: '用箭头连接卡片之间的关系',
          body: '点击卡片右侧的连接圆点连向另一张卡；支持并联触发与串联顺序，右键箭头还可加条件。',
        }
      : {
          title: 'Connect cards with relationship arrows',
          body: 'Click a card’s right-side port to connect parallel or sequential flows — right-click any arrow to attach an "if" condition.',
        };
  }

  return lang === 'zh'
    ? {
        title: '边写、边展开微调、边试玩',
        body: '修改卡片描述即可自动匹配属性；点展开按钮可精细调整素材绑定、参数与属性规则，随时点 Play 验证。',
      }
    : {
        title: 'Write, expand to tune, and playtest live',
        body: 'Edit any card to auto-match defaults, expand it to customize assets, controls, or property rules, and press Play anytime.',
      };
}
