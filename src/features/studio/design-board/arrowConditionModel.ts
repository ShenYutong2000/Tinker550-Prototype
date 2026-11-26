import type { AssetCategoryId, AssetItem } from '../asset-library/assetLibraryModel';
import type { Language } from '../../../shared/i18n';
import type { ScopedStateVariable, StateVariableType } from '../properties/stateModel';
import type { BoardEdge, BoardNode } from './studioModel';

export type ConditionCategory = 'event' | 'property';
export type ConditionCombinator = 'AND' | 'OR';

export type ActionCategoryKey =
  | 'jump'
  | 'shoot_attack'
  | 'shield_block'
  | 'drag'
  | 'crouch'
  | 'dash_dodge'
  | 'move'
  | 'generic';

export type EventGroupId =
  | 'touch_interact'
  | 'move_position'
  | 'start_finish'
  | 'change_progress';

export type EventTargetMode = 'none' | 'optional' | 'required' | 'distance_target';

export type EventSubjectRole =
  | 'char_item'
  | 'char_only'
  | 'char_item_ui'
  | 'timer_scene';

export type EventTargetRole =
  | 'char_item'
  | 'char_only'
  | 'item_only';

export interface EventSpec {
  id: string;
  group: EventGroupId;
  labelEn: string;
  labelZh: string;
  verbEn: string;
  verbZh: string;
  subjectRole: EventSubjectRole;
  targetMode: EventTargetMode;
  targetRole?: EventTargetRole;
  /** All 14 core events run automatically in Play 2D stage */
  runtimeMode: 'auto';
  /** Optional preposition rendered before Target B in English summary (e.g. "on", "by") */
  prepEn?: string;
  /** Optional preposition rendered before Target B in Chinese summary (e.g. "在", "被") */
  prepZh?: string;
  keywords: string[];
}

export interface EventConditionClause {
  id: string;
  kind: 'event';
  subjectAssetId?: string;
  subjectLabel: string;
  subjectKind?: 'asset' | 'action' | 'scene' | 'custom';
  eventId: string;
  /** Used when eventId === 'custom' */
  customEventText?: string;
  targetMode: EventTargetMode;
  targetId?: string;
  targetLabel?: string;
  targetKind?: 'asset' | 'action' | 'look' | 'position' | 'custom';
  distance?: number;
}

export type PropertyComparator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'is_yes'
  | 'is_no'
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'is_empty';

export type PropertyValueMode = 'literal' | 'property' | 'formula';

export interface PropertyConditionClause {
  id: string;
  kind: 'property';
  propertyId: string;
  propertyType: StateVariableType;
  comparator: PropertyComparator;
  valueMode: PropertyValueMode;
  literalValue?: string;
  comparePropertyId?: string;
  formulaExpression?: string;
}

export type EdgeConditionClause = EventConditionClause | PropertyConditionClause;

export interface EdgeConditionGroup {
  combinator: ConditionCombinator;
  clauses: EdgeConditionClause[];
}

export function createConditionClauseId(): string {
  return `cond-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// 4 Core Event Categories — 14 Concise, 100% Engine-Backed Events
// ---------------------------------------------------------------------------

export const EVENT_GROUP_META: Record<
  EventGroupId,
  { code: string; labelEn: string; labelZh: string }
> = {
  touch_interact: {
    code: 'A',
    labelEn: 'A. Touch & Interact',
    labelZh: 'A. 接触与互动',
  },
  move_position: {
    code: 'B',
    labelEn: 'B. Move & Position',
    labelZh: 'B. 移动与位置',
  },
  start_finish: {
    code: 'C',
    labelEn: 'C. Action & Spawn',
    labelZh: 'C. 动作与生成',
  },
  change_progress: {
    code: 'D',
    labelEn: 'D. Collect & Timer',
    labelZh: 'D. 收集与限时',
  },
};

export const EVENT_CATALOG: readonly EventSpec[] = [
  // A. Touch & Interact (5)
  {
    id: 'touches',
    group: 'touch_interact',
    labelEn: 'Touches',
    labelZh: '接触 / 碰撞',
    verbEn: 'touches',
    verbZh: '碰到了',
    subjectRole: 'char_item',
    targetMode: 'required',
    targetRole: 'char_item',
    runtimeMode: 'auto',
    keywords: ['touch', 'collide', 'overlap', 'reach', '接触', '碰到', '碰撞', '重叠', '到达'],
  },
  {
    id: 'hits',
    group: 'touch_interact',
    labelEn: 'Hits',
    labelZh: '击中 / 撞击',
    verbEn: 'hits',
    verbZh: '击中了',
    subjectRole: 'char_item',
    targetMode: 'required',
    targetRole: 'char_item',
    runtimeMode: 'auto',
    keywords: ['hit', 'strike', 'impact', 'attack', '命中', '击中', '撞击', '打中'],
  },
  {
    id: 'blocks',
    group: 'touch_interact',
    labelEn: 'Blocks',
    labelZh: '格挡成功',
    verbEn: 'blocks',
    verbZh: '挡住了',
    subjectRole: 'char_only',
    targetMode: 'optional',
    targetRole: 'char_item',
    runtimeMode: 'auto',
    keywords: ['block', 'shield', 'parry', 'defend', '格挡', '挡住', '护盾'],
  },
  {
    id: 'avoids',
    group: 'touch_interact',
    labelEn: 'Avoids',
    labelZh: '成功躲过',
    verbEn: 'avoids',
    verbZh: '躲过了',
    subjectRole: 'char_only',
    targetMode: 'optional',
    targetRole: 'char_item',
    runtimeMode: 'auto',
    keywords: ['avoid', 'dodge', 'evade', 'dash', '躲过', '闪避', '躲开'],
  },
  {
    id: 'is_clicked',
    group: 'touch_interact',
    labelEn: 'Is Clicked',
    labelZh: '被点击',
    verbEn: 'is clicked',
    verbZh: '被点击',
    subjectRole: 'char_item_ui',
    targetMode: 'none',
    runtimeMode: 'auto',
    keywords: ['click', 'tap', 'select', 'press', '点击', '选中', '按下'],
  },

  // B. Move & Position (4)
  {
    id: 'jumps',
    group: 'move_position',
    labelEn: 'Jumps',
    labelZh: '起跳',
    verbEn: 'jumps',
    verbZh: '起跳',
    subjectRole: 'char_only',
    targetMode: 'none',
    runtimeMode: 'auto',
    keywords: ['jump', 'leap', 'hop', '跳', '起跳'],
  },
  {
    id: 'lands',
    group: 'move_position',
    labelEn: 'Lands',
    labelZh: '落地',
    verbEn: 'lands',
    verbZh: '落地',
    subjectRole: 'char_only',
    targetMode: 'optional',
    targetRole: 'item_only',
    prepEn: 'on',
    prepZh: '在',
    runtimeMode: 'auto',
    keywords: ['land', 'ground', 'touchdown', '落地', '降落'],
  },
  {
    id: 'enters_zone',
    group: 'move_position',
    labelEn: 'Enters the trigger area',
    labelZh: '进入触发区',
    verbEn: 'enters the trigger area',
    verbZh: '进入触发区',
    subjectRole: 'char_only',
    targetMode: 'none',
    runtimeMode: 'auto',
    keywords: ['enter', 'zone', 'trigger', '进入', '区域'],
  },
  {
    id: 'passes',
    group: 'move_position',
    labelEn: 'Passes',
    labelZh: '越过',
    verbEn: 'passes',
    verbZh: '越过了',
    subjectRole: 'char_item',
    targetMode: 'required',
    targetRole: 'char_item',
    runtimeMode: 'auto',
    keywords: ['pass', 'cross', 'clear', 'over', '越过', '穿过', '跳过'],
  },
  {
    id: 'leaves_stage',
    group: 'move_position',
    labelEn: 'Leaves Stage',
    labelZh: '离开画面',
    verbEn: 'leaves stage',
    verbZh: '离开画面',
    subjectRole: 'char_item',
    targetMode: 'none',
    runtimeMode: 'auto',
    keywords: ['leave', 'exit', 'out of bounds', 'offscreen', '离开画面', '出界', '飞出'],
  },

  // C. Action & Spawn (3)
  {
    id: 'fires',
    group: 'start_finish',
    labelEn: 'Fires',
    labelZh: '发射',
    verbEn: 'fires',
    verbZh: '发射了',
    subjectRole: 'char_only',
    targetMode: 'optional',
    targetRole: 'item_only',
    runtimeMode: 'auto',
    keywords: ['fire', 'shoot', 'cast', 'projectile', '发射', '射击', '攻击'],
  },
  {
    id: 'appears',
    group: 'start_finish',
    labelEn: 'Appears',
    labelZh: '出现 / 生成',
    verbEn: 'appears',
    verbZh: '出现了',
    subjectRole: 'char_item',
    targetMode: 'none',
    runtimeMode: 'auto',
    keywords: ['appear', 'create', 'spawn', '出现', '生成', '创建'],
  },
  {
    id: 'disappears',
    group: 'start_finish',
    labelEn: 'Disappears',
    labelZh: '消失 / 移除',
    verbEn: 'disappears',
    verbZh: '消失了',
    subjectRole: 'char_item',
    targetMode: 'none',
    runtimeMode: 'auto',
    keywords: ['disappear', 'remove', 'destroy', '消失', '移除', '销毁'],
  },

  // D. Collect & Timer (2)
  {
    id: 'is_collected',
    group: 'change_progress',
    labelEn: 'Is Collected',
    labelZh: '被收集',
    verbEn: 'is collected',
    verbZh: '被收集',
    subjectRole: 'char_item',
    targetMode: 'optional',
    targetRole: 'char_only',
    prepEn: 'by',
    prepZh: '被',
    runtimeMode: 'auto',
    keywords: ['collect', 'pickup', 'coin', 'star', '收集', '捡到', '吃到'],
  },
  {
    id: 'time_up',
    group: 'change_progress',
    labelEn: 'Time Up',
    labelZh: '计时结束',
    verbEn: 'time is up',
    verbZh: '计时结束',
    subjectRole: 'timer_scene',
    targetMode: 'none',
    runtimeMode: 'auto',
    keywords: ['time', 'timer', 'countdown', 'timeout', 'limit', '计时', '倒计时', '时间到', '限时'],
  },
];

const LEGACY_EVENT_ALIASES: Record<string, string> = {
  stops_touching: 'touches',
  overlaps: 'touches',
  reaches: 'touches',
  is_near: 'touches',
  moves_toward: 'touches',
  attack_is_blocked: 'blocks',
  shield_is_hit: 'blocks',
  starts_blocking: 'blocks',
  stops_blocking: 'disappears',
  is_clicked_selected: 'is_clicked',
  starts_jumping: 'jumps',
  starts_falling: 'lands',
  stops_moving: 'lands',
  starts_moving: 'passes',
  starts_crouching: 'avoids',
  stops_crouching: 'avoids',
  starts_dashing: 'avoids',
  finishes_dashing: 'avoids',
  attack_is_avoided: 'avoids',
  passes_under: 'passes',
  is_far_from: 'leaves_stage',
  moves_away_from: 'leaves_stage',
  is_above: 'passes',
  is_below: 'touches',
  is_left_of: 'touches',
  is_right_of: 'touches',
  is_created: 'appears',
  is_removed: 'disappears',
  starts_attacking: 'fires',
  finishes_attacking: 'fires',
  creates_projectile: 'fires',
  shield_breaks: 'blocks',
};

export function normalizeEventId(eventId: string): string {
  return LEGACY_EVENT_ALIASES[eventId] ?? eventId;
}

export const EVENT_SPEC_MAP = new Map<string, EventSpec>(
  EVENT_CATALOG.map((spec) => [spec.id, spec]),
);

export function getEventSpec(eventId: string): EventSpec | undefined {
  if (eventId === 'custom') return undefined;
  return EVENT_SPEC_MAP.get(normalizeEventId(eventId));
}

// ---------------------------------------------------------------------------
// Upstream Action -> Top 3 Recommended Core Events
// ---------------------------------------------------------------------------

export const ACTION_TO_TOP3_EVENTS: Record<ActionCategoryKey, readonly string[]> = {
  jump: ['lands', 'passes', 'touches'],
  shoot_attack: ['fires', 'hits', 'disappears'],
  shield_block: ['blocks', 'touches', 'hits'],
  drag: ['touches', 'is_clicked', 'is_collected'],
  crouch: ['avoids', 'passes', 'touches'],
  dash_dodge: ['avoids', 'passes', 'touches'],
  move: ['touches', 'passes', 'leaves_stage'],
  generic: ['touches', 'hits', 'is_collected'],
};

export function detectUpstreamActionCategory(node: BoardNode | undefined): ActionCategoryKey {
  if (!node) return 'generic';
  const text = `${node.promptInput?.playerAction ?? ''} ${node.note}`.trim().toLowerCase();

  if (node.kind === 'action') {
    if (/跳|跳跃|蹦|跃|jump|hop|leap/.test(text) || node.fields.actionMechanic === 'jump') {
      return 'jump';
    }
    if (/挡|盾|防|格挡|护盾|抵挡|保护|block|shield|guard|defend|parry/.test(text) || node.fields.actionMechanic === 'shield') {
      return 'shield_block';
    }
    if (/拖|拽|拉|drag|drop|pull/.test(text) || node.fields.actionControl?.interactionType === 'drag') {
      return 'drag';
    }
    if (/蹲|下蹲|滑铲|俯身|crouch|duck|slide/.test(text)) {
      return 'crouch';
    }
    if (/冲刺|加速|闪避|翻滚|dash|sprint|dodge|roll/.test(text)) {
      return 'dash_dodge';
    }
    if (/发射|射击|攻击|打|投掷|扔|施法|火球|激光|波|shoot|blast|fire|laser|attack|wave|cast|throw/.test(text)) {
      return 'shoot_attack';
    }
    if (/移动|走|跑|向左|向右|向上|向下|前进|后退|move|walk|run|\bleft\b|\bright\b|\bup\b|\bdown\b/.test(text)) {
      return 'move';
    }
    if (node.fields.actionMechanic === 'dodge') return 'dash_dodge';
    if (node.fields.actionMechanic === 'ability') return 'shoot_attack';
  }

  return 'generic';
}

export function getRecommendedEventsForNode(
  fromNode: BoardNode | undefined,
  _nodes: BoardNode[],
): EventSpec[] {
  const cat = detectUpstreamActionCategory(fromNode);
  const ids = ACTION_TO_TOP3_EVENTS[cat];
  const picked: EventSpec[] = [];
  for (const id of ids) {
    const spec = getEventSpec(id);
    if (spec) picked.push(spec);
  }
  if (picked.length < 3) {
    for (const fallbackId of ACTION_TO_TOP3_EVENTS.generic) {
      if (picked.length >= 3) break;
      const spec = getEventSpec(fallbackId);
      if (spec && !picked.some((p) => p.id === spec.id)) {
        picked.push(spec);
      }
    }
  }
  return picked.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Offline Custom Event Input Hint Checker (No live AI calls)
// ---------------------------------------------------------------------------

export function evaluateCustomEventHint(
  rawText: string,
  lang: Language,
): { tone: 'warn' | 'info'; text: string } | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const isZh = lang === 'zh';

  if (/^(?:\d+|[a-zA-Z])$/.test(trimmed) || trimmed.length < 2) {
    return {
      tone: 'warn',
      text: isZh
        ? '这个输入太简短啦，试试写成一件具体的事（例如“收集到所有金币”）或直接从列表点选。'
        : 'Too short — try writing a specific event (e.g. "collects all coins") or pick one from the list.',
    };
  }

  if (/[><=≠≥≤]/.test(trimmed) || /\b(?:is yes|is no|equals|contains)\b/i.test(trimmed)) {
    return {
      tone: 'info',
      text: isZh
        ? '提示：数值或属性判断更适合切换到「某属性满足条件」这一类来配置哦。'
        : 'Tip: Comparisons like > or = work best under "When something meets a condition".',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Attachment 3: Unit-Aware Property Comparators
// ---------------------------------------------------------------------------

export interface ComparatorOption {
  value: PropertyComparator;
  labelEn: string;
  labelZh: string;
  symbol: string;
  hidesRightValue?: boolean;
}

export const NUMBER_COMPARATORS: readonly ComparatorOption[] = [
  { value: '=', labelEn: '=', labelZh: '=', symbol: '=' },
  { value: '!=', labelEn: '≠', labelZh: '≠', symbol: '≠' },
  { value: '>', labelEn: '>', labelZh: '>', symbol: '>' },
  { value: '<', labelEn: '<', labelZh: '<', symbol: '<' },
  { value: '>=', labelEn: '≥', labelZh: '≥', symbol: '≥' },
  { value: '<=', labelEn: '≤', labelZh: '≤', symbol: '≤' },
];

export const BOOLEAN_COMPARATORS: readonly ComparatorOption[] = [
  { value: 'is_yes', labelEn: 'Is Yes', labelZh: '为 是 (Is Yes)', symbol: '= Yes', hidesRightValue: true },
  { value: 'is_no', labelEn: 'Is No', labelZh: '为 否 (Is No)', symbol: '= No', hidesRightValue: true },
];

export const CHOICE_COMPARATORS: readonly ComparatorOption[] = [
  { value: '=', labelEn: '=', labelZh: '=', symbol: '=' },
  { value: '!=', labelEn: '≠', labelZh: '≠', symbol: '≠' },
];

export const TEXT_COMPARATORS: readonly ComparatorOption[] = [
  { value: 'equals', labelEn: 'Equals', labelZh: '等于 (Equals)', symbol: '=' },
  { value: 'not_equals', labelEn: 'Not Equals', labelZh: '不等于 (Not Equals)', symbol: '≠' },
  { value: 'contains', labelEn: 'Contains', labelZh: '包含 (Contains)', symbol: '∋' },
  { value: 'is_empty', labelEn: 'Is Empty', labelZh: '为空 (Is Empty)', symbol: '∅', hidesRightValue: true },
];

export function getComparatorsForType(type: StateVariableType): readonly ComparatorOption[] {
  switch (type) {
    case 'number':
      return NUMBER_COMPARATORS;
    case 'boolean':
      return BOOLEAN_COMPARATORS;
    case 'choice':
      return CHOICE_COMPARATORS;
    case 'text':
      return TEXT_COMPARATORS;
  }
}

export function getDefaultComparatorForType(type: StateVariableType): PropertyComparator {
  switch (type) {
    case 'number':
      return '>=';
    case 'boolean':
      return 'is_yes';
    case 'choice':
      return '=';
    case 'text':
      return 'equals';
  }
}

// ---------------------------------------------------------------------------
// Asset / Subject / Target Filtering Helpers
// ---------------------------------------------------------------------------

export function getAllowedSubjectCategories(role: EventSubjectRole): AssetCategoryId[] {
  switch (role) {
    case 'char_only':
      return ['characters'];
    case 'char_item':
      return ['characters', 'objects'];
    case 'char_item_ui':
      return ['characters', 'objects', 'interface'];
    case 'timer_scene':
      return ['backgrounds', 'interface'];
  }
}

export function getAllowedTargetCategories(role: EventTargetRole | undefined): AssetCategoryId[] {
  switch (role) {
    case 'char_only':
      return ['characters'];
    case 'item_only':
      return ['objects'];
    case 'char_item':
    default:
      return ['characters', 'objects'];
  }
}

export function getUpstreamPrimaryAsset(
  fromNode: BoardNode | undefined,
  assetItems: AssetItem[],
): AssetItem | undefined {
  if (!fromNode) return undefined;
  const assetMap = new Map(assetItems.map((a) => [a.id, a]));
  const ids = Array.isArray(fromNode.assetIds)
    ? fromNode.assetIds
    : fromNode.assetId
      ? [fromNode.assetId]
      : [];
  for (const id of ids) {
    const a = assetMap.get(id);
    if (a) return a;
  }
  const actorId = fromNode.promptInput?.actorAssetId || fromNode.promptInput?.obstacleAssetId;
  if (actorId && assetMap.has(actorId)) {
    return assetMap.get(actorId);
  }
  const nameHint =
    fromNode.promptInput?.actorName?.trim() ||
    fromNode.promptInput?.obstacle?.trim() ||
    (fromNode.kind === 'dialogue' ? fromNode.title.trim() : '');
  if (nameHint) {
    return assetItems.find(
      (a) => a.name.trim().toLowerCase() === nameHint.toLowerCase(),
    );
  }
  return undefined;
}

export function getUpstreamBoundAssetIds(fromNode: BoardNode | undefined): Set<string> {
  const ids = new Set<string>();
  if (!fromNode) return ids;
  if (Array.isArray(fromNode.assetIds)) {
    fromNode.assetIds.forEach((id) => ids.add(id));
  } else if (fromNode.assetId) {
    ids.add(fromNode.assetId);
  }
  if (fromNode.promptInput?.actorAssetId) ids.add(fromNode.promptInput.actorAssetId);
  if (fromNode.promptInput?.obstacleAssetId) ids.add(fromNode.promptInput.obstacleAssetId);
  if (fromNode.promptInput?.sceneAssetId) ids.add(fromNode.promptInput.sceneAssetId);
  if (
    fromNode.promptInput?.outcomeTargetKind === 'asset' &&
    fromNode.promptInput.outcomeTargetRef
  ) {
    ids.add(fromNode.promptInput.outcomeTargetRef);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Summary Formatting (for Edge Midpoint Badge & Play UI)
// ---------------------------------------------------------------------------

export function formatEventClauseSummary(
  clause: EventConditionClause,
  lang: Language,
): string {
  const isZh = lang === 'zh';
  const subj = clause.subjectLabel.trim() || (isZh ? '对象' : 'Object');

  if (clause.eventId === 'custom') {
    const custom = (clause.customEventText ?? '').trim();
    if (!custom) return subj;
    return isZh ? `${subj} ${custom}` : `${subj} ${custom}`;
  }

  const spec = getEventSpec(clause.eventId);
  if (!spec) {
    return `${subj} ${clause.eventId}`;
  }

  const verb = isZh ? spec.verbZh : spec.verbEn;
  if (spec.targetMode === 'none') {
    return `${subj} ${verb}`;
  }

  const tgt = clause.targetLabel?.trim();
  if (!tgt) {
    // Optional Target B left as "Any"
    return `${subj} ${verb}`;
  }

  if (isZh) {
    const prep = spec.prepZh ? `${spec.prepZh} ` : '';
    return `${subj} ${verb} ${prep}${tgt}`.replace(/\s+/g, ' ').trim();
  }
  const prep = spec.prepEn ? `${spec.prepEn} ` : '';
  return `${subj} ${verb} ${prep}${tgt}`.replace(/\s+/g, ' ').trim();
}

export function formatPropertyClauseSummary(
  clause: PropertyConditionClause,
  scopedVariables: ScopedStateVariable[],
  lang: Language,
): string {
  const isZh = lang === 'zh';
  const entry = scopedVariables.find((v) => v.variable.id === clause.propertyId);
  const propKey = entry?.fullKey ?? (isZh ? '属性' : 'Property');
  const comps = getComparatorsForType(entry?.variable.type ?? clause.propertyType);
  const compMeta = comps.find((c) => c.value === clause.comparator);

  if (clause.comparator === 'is_yes') {
    return isZh ? `${propKey} 为 是` : `${propKey} is Yes`;
  }
  if (clause.comparator === 'is_no') {
    return isZh ? `${propKey} 为 否` : `${propKey} is No`;
  }
  if (clause.comparator === 'is_empty') {
    return isZh ? `${propKey} 为空` : `${propKey} is empty`;
  }

  const opSymbol = isZh
    ? compMeta?.labelZh.split(' ')[0] ?? compMeta?.symbol ?? '='
    : compMeta?.labelEn ?? compMeta?.symbol ?? '=';

  let rhs = '';
  if (clause.valueMode === 'property' && clause.comparePropertyId) {
    const other = scopedVariables.find((v) => v.variable.id === clause.comparePropertyId);
    rhs = other?.fullKey ?? '';
  } else if (clause.valueMode === 'formula') {
    rhs = (clause.formulaExpression ?? '').trim();
  } else {
    rhs = (clause.literalValue ?? '').trim();
  }

  if (!rhs) rhs = '?';
  return `${propKey} ${opSymbol} ${rhs}`;
}

export function formatConditionGroupSummary(
  group: EdgeConditionGroup | undefined,
  scopedVariables: ScopedStateVariable[],
  lang: Language,
): string {
  if (!group || group.clauses.length === 0) return '';
  const parts = group.clauses
    .map((c) =>
      c.kind === 'event'
        ? formatEventClauseSummary(c, lang)
        : formatPropertyClauseSummary(c, scopedVariables, lang),
    )
    .filter(Boolean);
  if (parts.length === 0) return '';
  const joiner =
    group.combinator === 'OR'
      ? lang === 'zh'
        ? ' 或 '
        : ' OR '
      : lang === 'zh'
        ? ' 且 '
        : ' AND ';
  return parts.join(joiner);
}

// ---------------------------------------------------------------------------
// Simulated Event Extraction for Play Sidebar Toggles
// ---------------------------------------------------------------------------

export interface SimulatedEventDescriptor {
  key: string;
  label: string;
  eventId: string;
}

export function getSimulatedEventKey(clause: EventConditionClause): string {
  if (clause.eventId === 'custom') {
    return `custom:${(clause.subjectLabel || '').trim()}:${(clause.customEventText || '').trim()}`;
  }
  return `evt:${clause.eventId}:${clause.subjectAssetId || clause.subjectLabel || 'any'}:${clause.targetId || clause.targetLabel || 'any'}`;
}

export function extractSimulatedEventsFromEdges(
  nodes: BoardNode[],
  edges: BoardEdge[],
  playableIds: Set<string>,
  lang: Language,
): SimulatedEventDescriptor[] {
  const seen = new Set<string>();
  const result: SimulatedEventDescriptor[] = [];

  const collectFromGroup = (group: EdgeConditionGroup | undefined) => {
    if (!group) return;
    for (const clause of group.clauses) {
      if (clause.kind !== 'event') continue;
      const needsSimulator = clause.eventId === 'custom';
      if (!needsSimulator) continue;
      const key = getSimulatedEventKey(clause);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        key,
        label: formatEventClauseSummary(clause, lang),
        eventId: clause.eventId,
      });
    }
  };

  for (const edge of edges) {
    if (!playableIds.has(edge.toId)) continue;
    if (edge.fromId !== null && !playableIds.has(edge.fromId)) continue;
    collectFromGroup(edge.conditionGroup);
  }

  for (const node of nodes) {
    if (node.kind !== 'group' || !playableIds.has(node.id)) continue;
    collectFromGroup(node.availableWhenGroup);
  }

  return result;
}
