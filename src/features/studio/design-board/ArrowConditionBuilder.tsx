import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Link2,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type { AssetCategoryId, AssetItem } from '../asset-library/assetLibraryModel';
import {
  EVENT_CATALOG,
  EVENT_GROUP_META,
  createConditionClauseId,
  evaluateCustomEventHint,
  formatConditionGroupSummary,
  getAllowedSubjectCategories,
  getAllowedTargetCategories,
  getComparatorsForType,
  getDefaultComparatorForType,
  getEventSpec,
  getRecommendedEventsForNode,
  getUpstreamBoundAssetIds,
  getUpstreamPrimaryAsset,
  normalizeEventId,
  type ConditionCombinator,
  type EdgeConditionClause,
  type EdgeConditionGroup,
  type EventConditionClause,
  type EventGroupId,
  type EventSpec,
  type PropertyConditionClause,
  type PropertyValueMode,
} from './arrowConditionModel';
import { COPY, type Language } from '../../../shared/i18n';
import {
  evaluateNumberFormula,
  type NumericFormulaSymbol,
  type ScopedStateVariable,
} from '../properties/stateModel';
import type { BoardEdge, BoardNode, EdgeType } from './studioModel';

interface ArrowConditionBuilderProps {
  lang: Language;
  edge: BoardEdge;
  edgeType?: EdgeType;
  fromNode: BoardNode | undefined;
  nodes: BoardNode[];
  assetItems: AssetItem[];
  scopedVariables: ScopedStateVariable[];
  numericParameters: NumericFormulaSymbol[];
  siblingDonorEdges?: BoardEdge[];
  anchorX: number;
  anchorY: number;
  containerWidth: number;
  containerHeight: number;
  titleOverride?: string;
  onSave: (
    condition: string,
    conditionGroup: EdgeConditionGroup,
    options?: { scope?: 'single' | 'shared' },
  ) => void;
  onLinkSibling?: (donorEdgeId: string) => void;
  onClear: () => void;
  onClose: () => void;
}

const NUMBER_FORMULA_OPS = ['+', '-', '*', '/', '(', ')'] as const;
const EVENT_GROUP_ORDER: EventGroupId[] = [
  'touch_interact',
  'move_position',
  'start_finish',
  'change_progress',
];

function buildDefaultEventClause(
  fromNode: BoardNode | undefined,
  nodes: BoardNode[],
  assetItems: AssetItem[],
  lang: Language,
): EventConditionClause {
  const recommended = getRecommendedEventsForNode(fromNode, nodes);
  const defaultEvent = recommended[0] ?? getEventSpec('touches')!;
  const primaryAsset = getUpstreamPrimaryAsset(fromNode, assetItems);
  const allowedCats = getAllowedSubjectCategories(defaultEvent.subjectRole);
  const fallbackAsset =
    (primaryAsset && allowedCats.includes(primaryAsset.categoryId) ? primaryAsset : undefined) ??
    assetItems.find((a) => allowedCats.includes(a.categoryId));

  const isTimerScene = defaultEvent.subjectRole === 'timer_scene';

  return {
    id: createConditionClauseId(),
    kind: 'event',
    subjectAssetId: fallbackAsset?.id ?? (isTimerScene ? 'timer' : undefined),
    subjectLabel:
      fallbackAsset?.name ??
      (isTimerScene
        ? lang === 'zh'
          ? '倒计时'
          : 'Timer'
        : lang === 'zh'
          ? '角色'
          : 'Character'),
    subjectKind: fallbackAsset ? 'asset' : isTimerScene ? 'scene' : 'custom',
    eventId: defaultEvent.id,
    targetMode: defaultEvent.targetMode,
  };
}

function buildDefaultPropertyClause(
  fromNode: BoardNode | undefined,
  scopedVariables: ScopedStateVariable[],
): PropertyConditionClause {
  const boundIds = getUpstreamBoundAssetIds(fromNode);
  const prioritized =
    scopedVariables.find((v) => v.assetId && boundIds.has(v.assetId)) ?? scopedVariables[0];

  if (!prioritized) {
    return {
      id: createConditionClauseId(),
      kind: 'property',
      propertyId: '',
      propertyType: 'number',
      comparator: '>=',
      valueMode: 'literal',
      literalValue: '1',
    };
  }

  const t = prioritized.variable.type;
  return {
    id: createConditionClauseId(),
    kind: 'property',
    propertyId: prioritized.variable.id,
    propertyType: t,
    comparator: getDefaultComparatorForType(t),
    valueMode: 'literal',
    literalValue:
      t === 'number'
        ? String(Number(prioritized.variable.initialValue) || 0)
        : t === 'choice'
          ? prioritized.variable.options?.[0] ?? String(prioritized.variable.initialValue ?? '')
          : t === 'text'
            ? String(prioritized.variable.initialValue ?? '')
            : '',
    formulaExpression: t === 'number' ? prioritized.fullKey : undefined,
  };
}

// ---------------------------------------------------------------------------
// Viewport-Fixed Portal Dropdown (Never Clipped by Overflow Containers)
// ---------------------------------------------------------------------------

interface FloatingDropdownPortalProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  width: number;
  estimatedHeight?: number;
  onClose: () => void;
  children: ReactNode;
}

function FloatingDropdownPortal({
  open,
  anchorRef,
  width,
  estimatedHeight = 320,
  onClose,
  children,
}: FloatingDropdownPortalProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;
      const gap = 4;

      const clampedWidth = Math.min(width, vw - margin * 2);
      const left = Math.max(margin, Math.min(vw - clampedWidth - margin, rect.left));

      const spaceBelow = vh - rect.bottom - margin - gap;
      const spaceAbove = rect.top - margin - gap;
      const openUpward = spaceBelow < Math.min(240, estimatedHeight) && spaceAbove > spaceBelow;

      if (openUpward) {
        const maxH = Math.max(160, Math.min(estimatedHeight, spaceAbove));
        const actualH = menuRef.current
          ? Math.min(maxH, menuRef.current.offsetHeight || maxH)
          : maxH;
        const top = Math.max(margin, rect.top - gap - actualH);
        setPos({ left, top, maxH });
      } else {
        const maxH = Math.max(160, Math.min(estimatedHeight, spaceBelow));
        const top = Math.min(vh - margin - 120, rect.bottom + gap);
        setPos({ left, top, maxH });
      }
    };

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, estimatedHeight, open, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [anchorRef, onClose, open]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      data-board-overlay="true"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: `${Math.round(pos.left)}px`,
        top: `${Math.round(pos.top)}px`,
        width: `${Math.min(width, window.innerWidth - 16)}px`,
        maxHeight: `${Math.round(pos.maxH)}px`,
      }}
      className="z-[9999] bg-white rounded-xl border border-[#CBD5E1] shadow-[0_18px_42px_rgba(15,23,42,0.24)] flex flex-col overflow-hidden"
    >
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Compact Inline Searchable Picker Popover
// ---------------------------------------------------------------------------

interface InlineSubjectPickerProps {
  lang: Language;
  clause: EventConditionClause;
  spec: EventSpec | undefined;
  assetItems: AssetItem[];
  onChange: (patch: Partial<EventConditionClause>) => void;
}

function InlineSubjectPicker({
  lang,
  clause,
  spec,
  assetItems,
  onChange,
}: InlineSubjectPickerProps) {
  const ec = COPY[lang].studio.board.edgeCond;
  const b = COPY[lang].studio.board;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery('');
  }, [open]);

  const role = spec?.subjectRole ?? 'char_item';
  const allowedCategories = getAllowedSubjectCategories(role);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: {
      key: string;
      id?: string;
      label: string;
      kind: 'asset' | 'scene';
      groupLabel: string;
    }[] = [];

    const catLabel = (cat: AssetCategoryId) => {
      if (cat === 'characters') return b.assetCatCharacters;
      if (cat === 'objects') return b.assetCatObjects;
      if (cat === 'backgrounds') return b.assetCatBackgrounds;
      if (cat === 'interface') return b.assetCatInterface;
      return b.assetCatEffects;
    };

    if (role === 'timer_scene') {
      const timerLabel = lang === 'zh' ? '倒计时' : 'Timer';
      if (!q || timerLabel.toLowerCase().includes(q) || 'timer'.includes(q)) {
        list.push({
          key: 'scene:timer',
          id: 'timer',
          label: timerLabel,
          kind: 'scene',
          groupLabel: lang === 'zh' ? '时间 / 场景' : 'Timer / Scene',
        });
      }
    }

    for (const a of assetItems) {
      if (!allowedCategories.includes(a.categoryId)) continue;
      if (q && !a.name.toLowerCase().includes(q)) continue;
      list.push({
        key: `asset:${a.id}`,
        id: a.id,
        label: a.name,
        kind: 'asset',
        groupLabel: catLabel(a.categoryId),
      });
    }

    return list;
  }, [allowedCategories, assetItems, b, lang, query, role]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-2 rounded-lg bg-white border border-[#CBD5E1] hover:border-[#0284C7] text-[11px] font-semibold text-[#14244B] inline-flex items-center gap-1 cursor-pointer max-w-[136px] whitespace-nowrap"
      >
        <span className="truncate">{clause.subjectLabel || ec.subjectPick}</span>
        <ChevronDown className="w-3 h-3 text-[#64748B] shrink-0" aria-hidden="true" />
      </button>

      <FloatingDropdownPortal
        open={open}
        anchorRef={rootRef}
        width={240}
        estimatedHeight={280}
        onClose={() => setOpen(false)}
      >
        <div className="p-1.5 border-b border-[#F1F5F9] shrink-0">
          <div className="relative">
            <Search className="w-3 h-3 text-[#94A3B8] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) {
                  onChange({
                    subjectAssetId: undefined,
                    subjectLabel: query.trim(),
                    subjectKind: 'custom',
                  });
                  setOpen(false);
                }
              }}
              placeholder={ec.subjectSearchPh}
              className="w-full pl-6 pr-2 py-1 text-[11px] text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:outline-none focus:border-[#0284C7]"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-1">
          {candidates.map((item) => {
            const selected =
              (item.id && clause.subjectAssetId === item.id) ||
              (!clause.subjectAssetId && clause.subjectLabel === item.label);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onChange({
                    subjectAssetId: item.id,
                    subjectLabel: item.label,
                    subjectKind: item.kind,
                  });
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left text-[11px] flex items-center justify-between gap-2 cursor-pointer ${
                  selected
                    ? 'bg-[#F0F9FF] text-[#0369A1] font-semibold'
                    : 'text-[#334155] hover:bg-[#F8FAFC]'
                }`}
              >
                <span className="truncate">{item.label}</span>
                <span className="text-[10px] text-[#94A3B8] shrink-0">{item.groupLabel}</span>
              </button>
            );
          })}
          {query.trim() && (
            <button
              type="button"
              onClick={() => {
                onChange({
                  subjectAssetId: undefined,
                  subjectLabel: query.trim(),
                  subjectKind: 'custom',
                });
                setOpen(false);
              }}
              className="w-full px-2.5 py-1.5 text-left text-[11px] text-[#0369A1] font-semibold hover:bg-[#F0F9FF] border-t border-[#F1F5F9] cursor-pointer truncate"
            >
              + “{query.trim()}”
            </button>
          )}
          {candidates.length === 0 && !query.trim() && (
            <div className="px-3 py-2.5 text-[11px] text-[#94A3B8] text-center">
              {ec.noMatchingTarget}
            </div>
          )}
        </div>
      </FloatingDropdownPortal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Searchable Event Picker (Top 3 Recommended + 4 Categorized Groups + Custom)
// ---------------------------------------------------------------------------

interface InlineEventPickerProps {
  lang: Language;
  clause: EventConditionClause;
  fromNode: BoardNode | undefined;
  nodes: BoardNode[];
  onSelectEvent: (spec: EventSpec | null, customText?: string) => void;
}

function InlineEventPicker({
  lang,
  clause,
  fromNode,
  nodes,
  onSelectEvent,
}: InlineEventPickerProps) {
  const ec = COPY[lang].studio.board.edgeCond;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery('');
  }, [open]);

  const currentSpec = clause.eventId === 'custom' ? null : getEventSpec(clause.eventId);
  const currentEventId = currentSpec?.id ?? clause.eventId;
  const currentLabel =
    clause.eventId === 'custom'
      ? clause.customEventText || ec.eventPick
      : currentSpec
        ? lang === 'zh'
          ? currentSpec.verbZh
          : currentSpec.verbEn
        : ec.eventPick;

  const recommended = useMemo(
    () => getRecommendedEventsForNode(fromNode, nodes),
    [fromNode, nodes],
  );
  const customHint = useMemo(
    () => (query.trim() ? evaluateCustomEventHint(query, lang) : null),
    [lang, query],
  );

  const groupedEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EVENT_GROUP_ORDER.map((groupId) => {
      const items = EVENT_CATALOG.filter((spec) => {
        if (spec.group !== groupId) return false;
        if (!q) return true;
        return (
          spec.labelEn.toLowerCase().includes(q) ||
          spec.labelZh.toLowerCase().includes(q) ||
          spec.verbEn.toLowerCase().includes(q) ||
          spec.verbZh.toLowerCase().includes(q) ||
          spec.keywords.some((k) => k.toLowerCase().includes(q))
        );
      });
      return {
        groupId,
        label: lang === 'zh' ? EVENT_GROUP_META[groupId].labelZh : EVENT_GROUP_META[groupId].labelEn,
        items,
      };
    }).filter((g) => g.items.length > 0);
  }, [lang, query]);

  const trimmedQuery = query.trim();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-2.5 rounded-lg bg-[#F0F9FF] border border-[#7DD3FC] hover:border-[#0284C7] text-[11px] font-bold text-[#0369A1] inline-flex items-center gap-1 cursor-pointer max-w-[170px] whitespace-nowrap"
      >
        <Zap className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{currentLabel}</span>
        <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
      </button>

      <FloatingDropdownPortal
        open={open}
        anchorRef={rootRef}
        width={316}
        estimatedHeight={360}
        onClose={() => setOpen(false)}
      >
        <div className="p-2 border-b border-[#F1F5F9] space-y-1.5 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmedQuery) {
                  onSelectEvent(null, trimmedQuery);
                  setOpen(false);
                }
              }}
              placeholder={ec.eventSearchPh}
              className="w-full pl-7 pr-2 py-1 text-[11px] text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus:outline-none focus:bg-white focus:border-[#0284C7]"
            />
          </div>

          {customHint && (
            <div
              className={`flex items-start gap-1.5 px-2 py-1 rounded-md text-[10.5px] leading-snug ${
                customHint.tone === 'warn'
                  ? 'bg-[#FFFBEB] text-[#B45309]'
                  : 'bg-[#F0F9FF] text-[#0369A1]'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{customHint.text}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-1.5 space-y-2">
          {/* Top 3 Recommendations based on upstream Action */}
          {!trimmedQuery && recommended.length > 0 && (
            <div className="px-2 pb-1.5 border-b border-[#F1F5F9]">
              <div className="flex items-center gap-1 px-1 pb-1 text-[10px] font-semibold text-[#0369A1]">
                <Sparkles className="w-3 h-3 text-[#F59E0B]" aria-hidden="true" />
                <span>{ec.recommendedTag}</span>
              </div>
              <div className="space-y-0.5">
                {recommended.map((spec) => {
                  const isSelected = currentEventId === spec.id;
                  return (
                    <button
                      key={`rec-${spec.id}`}
                      type="button"
                      onClick={() => {
                        onSelectEvent(spec);
                        setOpen(false);
                      }}
                      className={`w-full px-2 py-1 rounded-lg text-left text-[11px] flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-[#E0F2FE] text-[#14244B] font-bold'
                          : 'bg-[#F8FAFC] hover:bg-[#F0F9FF] text-[#14244B] font-medium'
                      }`}
                    >
                      <span className="truncate">
                        {lang === 'zh' ? spec.labelZh : spec.labelEn}
                      </span>
                      <span className="text-[10px] font-mono text-[#64748B] shrink-0">
                        {spec.targetMode === 'optional'
                          ? '○'
                          : spec.targetMode === 'none'
                            ? '—'
                            : '●'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Core 4 Categories (14 Engine-Backed Events) */}
          {groupedEvents.map((grp) => (
            <div key={grp.groupId}>
              <div className="px-3 pb-0.5 text-[10px] font-semibold text-[#64748B]">
                {grp.label}
              </div>
              <div className="px-1.5 space-y-0.5">
                {grp.items.map((spec) => {
                  const isSelected = currentEventId === spec.id;
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => {
                        onSelectEvent(spec);
                        setOpen(false);
                      }}
                      className={`w-full px-2 py-1 rounded-md text-left text-[11px] flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-[#EFF6FF] text-[#0369A1] font-semibold'
                          : 'text-[#334155] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <span className="truncate">
                        {lang === 'zh' ? spec.labelZh : spec.labelEn}
                      </span>
                      <span className="text-[10px] font-mono text-[#94A3B8] shrink-0">
                        {spec.targetMode === 'optional'
                          ? '○'
                          : spec.targetMode === 'none'
                            ? '—'
                            : '●'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Custom Event Option */}
          {trimmedQuery && (
            <div className="px-1.5 pt-1 border-t border-[#F1F5F9]">
              <button
                type="button"
                onClick={() => {
                  onSelectEvent(null, trimmedQuery);
                  setOpen(false);
                }}
                className="w-full px-2 py-1.5 rounded-lg text-left text-[11px] font-semibold text-[#0369A1] bg-[#F0F9FF] hover:bg-[#E0F2FE] cursor-pointer truncate"
              >
                + {ec.useCustomEvent}: “{trimmedQuery}”
              </button>
            </div>
          )}
        </div>
      </FloatingDropdownPortal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target B Picker (Handles Required ●, Dashed Optional ○, Distance + Target B)
// ---------------------------------------------------------------------------

interface InlineTargetPickerProps {
  lang: Language;
  clause: EventConditionClause;
  spec: EventSpec | undefined;
  assetItems: AssetItem[];
  onChange: (patch: Partial<EventConditionClause>) => void;
}

function InlineTargetPicker({
  lang,
  clause,
  spec,
  assetItems,
  onChange,
}: InlineTargetPickerProps) {
  const ec = COPY[lang].studio.board.edgeCond;
  const b = COPY[lang].studio.board;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery('');
  }, [open]);

  const isOptional = spec?.targetMode === 'optional';
  const targetRole = spec?.targetRole ?? 'char_item';

  const candidates = useMemo(() => {
    if (!spec || spec.targetMode === 'none') return [];
    const q = query.trim().toLowerCase();
    const list: {
      key: string;
      id: string;
      label: string;
      kind: 'asset';
      groupLabel: string;
    }[] = [];

    const allowedCats = getAllowedTargetCategories(targetRole);
    for (const a of assetItems) {
      if (!allowedCats.includes(a.categoryId)) continue;
      if (q && !a.name.toLowerCase().includes(q)) continue;
      list.push({
        key: `asset:${a.id}`,
        id: a.id,
        label: a.name,
        kind: 'asset',
        groupLabel:
          a.categoryId === 'characters'
            ? b.assetCatCharacters
            : a.categoryId === 'objects'
              ? b.assetCatObjects
              : b.assetCatInterface,
      });
    }
    return list;
  }, [assetItems, b, query, spec, targetRole]);

  if (!spec || spec.targetMode === 'none') return null;

  const hasTarget = Boolean(clause.targetLabel?.trim());

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`h-7 px-2 rounded-lg text-[11px] inline-flex items-center gap-1 cursor-pointer max-w-[144px] whitespace-nowrap transition-colors ${
            isOptional && !hasTarget
              ? 'bg-[#F8FAFC] border border-dashed border-[#94A3B8] hover:border-[#0284C7] text-[#64748B] hover:text-[#0369A1] font-medium'
              : 'bg-white border border-[#CBD5E1] hover:border-[#0284C7] text-[#14244B] font-semibold'
          }`}
        >
          <span className="truncate">
            {hasTarget
              ? clause.targetLabel
              : isOptional
                ? ec.targetOptionalAny
                : ec.targetRequired}
          </span>
          <ChevronDown className="w-3 h-3 text-[#64748B] shrink-0" aria-hidden="true" />
        </button>

        <FloatingDropdownPortal
          open={open}
          anchorRef={rootRef}
          width={240}
          estimatedHeight={280}
          onClose={() => setOpen(false)}
        >
          <div className="p-1.5 border-b border-[#F1F5F9] shrink-0">
            <div className="relative">
              <Search className="w-3 h-3 text-[#94A3B8] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim()) {
                    onChange({
                      targetId: undefined,
                      targetLabel: query.trim(),
                      targetKind: 'custom',
                    });
                    setOpen(false);
                  }
                }}
                placeholder={ec.targetSearchPh}
                className="w-full pl-6 pr-2 py-1 text-[11px] text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-1">
            {isOptional && (
              <button
                type="button"
                onClick={() => {
                  onChange({ targetId: undefined, targetLabel: undefined, targetKind: undefined });
                  setOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left text-[11px] border-b border-[#F1F5F9] flex items-center justify-between cursor-pointer ${
                  !hasTarget
                    ? 'bg-[#F0F9FF] text-[#0369A1] font-semibold'
                    : 'text-[#64748B] hover:bg-[#F8FAFC]'
                }`}
              >
                <span>{ec.targetResetAny}</span>
                {!hasTarget && <Check className="w-3 h-3 text-[#0284C7]" />}
              </button>
            )}

            {candidates.map((item) => {
              const selected = clause.targetId === item.id && clause.targetLabel === item.label;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onChange({
                      targetId: item.id,
                      targetLabel: item.label,
                      targetKind: item.kind,
                    });
                    setOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 text-left text-[11px] flex items-center justify-between gap-2 cursor-pointer ${
                    selected
                      ? 'bg-[#F0F9FF] text-[#0369A1] font-semibold'
                      : 'text-[#334155] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="text-[10px] text-[#94A3B8] shrink-0">{item.groupLabel}</span>
                </button>
              );
            })}

            {query.trim() && (
              <button
                type="button"
                onClick={() => {
                  onChange({
                    targetId: undefined,
                    targetLabel: query.trim(),
                    targetKind: 'custom',
                  });
                  setOpen(false);
                }}
                className="w-full px-2.5 py-1.5 text-left text-[11px] font-semibold text-[#0369A1] hover:bg-[#F0F9FF] border-t border-[#F1F5F9] cursor-pointer truncate"
              >
                + “{query.trim()}”
              </button>
            )}

            {candidates.length === 0 && !query.trim() && (
              <div className="px-3 py-2.5 text-[11px] text-[#94A3B8] text-center">
                {ec.noMatchingTarget}
              </div>
            )}
          </div>
        </FloatingDropdownPortal>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category 2: Searchable Categorized Property Picker (Prioritizes Upstream Asset)
// ---------------------------------------------------------------------------

interface InlinePropertyPickerProps {
  lang: Language;
  selectedId: string;
  fromNode: BoardNode | undefined;
  scopedVariables: ScopedStateVariable[];
  filterType?: ScopedStateVariable['variable']['type'];
  placeholder?: string;
  onSelect: (entry: ScopedStateVariable) => void;
}

function InlinePropertyPicker({
  lang,
  selectedId,
  fromNode,
  scopedVariables,
  filterType,
  placeholder,
  onSelect,
}: InlinePropertyPickerProps) {
  const ec = COPY[lang].studio.board.edgeCond;
  const s = COPY[lang].studio.states;
  const b = COPY[lang].studio.board;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery('');
  }, [open]);

  const boundIds = useMemo(() => getUpstreamBoundAssetIds(fromNode), [fromNode]);
  const selected = scopedVariables.find((v) => v.variable.id === selectedId);

  const typeLabel = (t: ScopedStateVariable['variable']['type']) => {
    if (t === 'number') return s.typeNumber;
    if (t === 'boolean') return s.typeBoolean;
    if (t === 'choice') return s.typeChoice;
    return s.typeText;
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = filterType
      ? scopedVariables.filter((v) => v.variable.type === filterType)
      : scopedVariables;

    const matchesQuery = (v: ScopedStateVariable) =>
      !q ||
      v.fullKey.toLowerCase().includes(q) ||
      v.variable.name.toLowerCase().includes(q);

    const out: { key: string; label: string; items: ScopedStateVariable[] }[] = [];

    const upstreamItems = pool.filter(
      (v) => v.assetId && boundIds.has(v.assetId) && matchesQuery(v),
    );
    if (upstreamItems.length > 0) {
      out.push({ key: 'upstream', label: ec.propUpstreamGroup, items: upstreamItems });
    }

    const globalItems = pool.filter((v) => v.scope === 'global' && matchesQuery(v));
    if (globalItems.length > 0) {
      out.push({ key: 'global', label: s.groupGlobal, items: globalItems });
    }

    // Group remaining asset properties by individual asset so "Cat", "Log" show clearly
    const assetGroups = new Map<string, { label: string; items: ScopedStateVariable[] }>();
    for (const v of pool) {
      if (v.scope !== 'asset' || !v.assetId) continue;
      if (boundIds.has(v.assetId)) continue;
      if (!matchesQuery(v)) continue;
      const grp = assetGroups.get(v.assetId) ?? {
        label: v.assetName || s.groupCharacters,
        items: [],
      };
      grp.items.push(v);
      assetGroups.set(v.assetId, grp);
    }
    assetGroups.forEach((grp, id) => {
      out.push({ key: `asset-${id}`, label: grp.label, items: grp.items });
    });

    return out;
  }, [boundIds, ec.propUpstreamGroup, filterType, query, s, scopedVariables]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-2 rounded-lg bg-white border border-[#CBD5E1] hover:border-[#0284C7] text-[11px] font-semibold text-[#14244B] inline-flex items-center gap-1 cursor-pointer max-w-[164px] whitespace-nowrap"
      >
        <span className="truncate">{selected ? selected.fullKey : placeholder || ec.propPick}</span>
        {selected && !filterType && (
          <span className="text-[9.5px] font-normal text-[#64748B] shrink-0">
            · {typeLabel(selected.variable.type)}
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-[#64748B] shrink-0" aria-hidden="true" />
      </button>

      <FloatingDropdownPortal
        open={open}
        anchorRef={rootRef}
        width={268}
        estimatedHeight={290}
        onClose={() => setOpen(false)}
      >
        <div className="p-1.5 border-b border-[#F1F5F9] shrink-0">
          <div className="relative">
            <Search className="w-3 h-3 text-[#94A3B8] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={b.propSearchPh}
              className="w-full pl-6 pr-2 py-1 text-[11px] text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:outline-none focus:border-[#0284C7]"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-1">
          {groups.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11px] text-[#94A3B8]">
              {filterType ? ec.noMatchingProp : ec.propNone}
            </div>
          ) : (
            groups.map((grp) => (
              <div key={grp.key} className="mb-1 last:mb-0">
                <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold text-[#64748B]">
                  {grp.label}
                </div>
                {grp.items.map((entry) => {
                  const isSelected = entry.variable.id === selectedId;
                  return (
                    <button
                      key={entry.variable.id}
                      type="button"
                      onClick={() => {
                        onSelect(entry);
                        setOpen(false);
                      }}
                      className={`w-full px-2.5 py-1 text-left text-[11px] flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-[#EFF6FF] text-[#0369A1] font-semibold'
                          : 'text-[#334155] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <span className="truncate">{entry.fullKey}</span>
                      <span className="text-[10px] text-[#94A3B8] shrink-0">
                        {typeLabel(entry.variable.type)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </FloatingDropdownPortal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Floating Arrow Condition Builder
// ---------------------------------------------------------------------------

export function ArrowConditionBuilder({
  lang,
  edge,
  edgeType = 'flow',
  fromNode,
  nodes,
  assetItems,
  scopedVariables,
  numericParameters,
  siblingDonorEdges = [],
  anchorX,
  anchorY,
  containerWidth,
  containerHeight,
  titleOverride,
  onSave,
  onLinkSibling,
  onClear,
  onClose,
}: ArrowConditionBuilderProps) {
  const t = COPY[lang].studio.board;
  const ec = t.edgeCond;

  const canInheritSibling = edgeType === 'flow' && siblingDonorEdges.length > 0 && Boolean(onLinkSibling);
  const matchingSharedDonor = edge.sharedConditionId
    ? siblingDonorEdges.find((d) => d.sharedConditionId === edge.sharedConditionId)
    : undefined;
  const [inheritChecked, setInheritChecked] = useState<boolean>(
    () => Boolean(edge.sharedConditionId && matchingSharedDonor),
  );
  const [selectedDonorId, setSelectedDonorId] = useState<string>(
    () => matchingSharedDonor?.id ?? siblingDonorEdges[0]?.id ?? '',
  );

  const [group, setGroup] = useState<EdgeConditionGroup>(() => {
    if (edge.conditionGroup && edge.conditionGroup.clauses.length > 0) {
      return {
        combinator: edge.conditionGroup.combinator,
        clauses: edge.conditionGroup.clauses.map((c) =>
          c.kind === 'event' && c.eventId !== 'custom'
            ? { ...c, eventId: normalizeEventId(c.eventId) }
            : { ...c },
        ),
      };
    }
    return {
      combinator: 'AND',
      clauses: [buildDefaultEventClause(fromNode, nodes, assetItems, lang)],
    };
  });

  const numberTokens = useMemo(() => {
    const vars = scopedVariables
      .filter((v) => v.variable.type === 'number')
      .map((v) => ({ key: v.fullKey, label: v.fullKey }));
    const params = numericParameters.map((p) => ({ key: p.key, label: p.key }));
    return [...vars, ...params];
  }, [numericParameters, scopedVariables]);

  const updateClause = (id: string, next: EdgeConditionClause) => {
    setGroup((prev) => ({
      ...prev,
      clauses: prev.clauses.map((c) => (c.id === id ? next : c)),
    }));
  };

  const removeClause = (id: string) => {
    setGroup((prev) => {
      const remaining = prev.clauses.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        return {
          ...prev,
          clauses: [buildDefaultEventClause(fromNode, nodes, assetItems, lang)],
        };
      }
      return { ...prev, clauses: remaining };
    });
  };

  const switchCategory = (clause: EdgeConditionClause, nextCat: 'event' | 'property') => {
    if (clause.kind === nextCat) return;
    if (nextCat === 'event') {
      const fresh = buildDefaultEventClause(fromNode, nodes, assetItems, lang);
      updateClause(clause.id, { ...fresh, id: clause.id });
    } else {
      const fresh = buildDefaultPropertyClause(fromNode, scopedVariables);
      updateClause(clause.id, { ...fresh, id: clause.id });
    }
  };

  const toggleCombinator = () => {
    setGroup((prev) => ({
      ...prev,
      combinator: prev.combinator === 'AND' ? 'OR' : 'AND',
    }));
  };

  const setCombinator = (combinator: ConditionCombinator) => {
    setGroup((prev) => ({ ...prev, combinator }));
  };

  const handleAddClause = () => {
    setGroup((prev) => ({
      ...prev,
      clauses: [...prev.clauses, buildDefaultEventClause(fromNode, nodes, assetItems, lang)],
    }));
  };

  const summaryPreview = useMemo(
    () => formatConditionGroupSummary(group, scopedVariables, lang),
    [group, lang, scopedVariables],
  );

  // Clamp floating popover inside container bounds
  const popW = Math.min(540, Math.max(320, containerWidth - 24));
  const left = Math.max(12, Math.min(containerWidth - popW - 12, Math.round(anchorX - popW / 2)));
  const top = Math.max(12, Math.min(containerHeight - 280, Math.round(anchorY - 36)));

  const hasSavedCondition = Boolean(edge.condition?.trim() || edge.conditionGroup?.clauses.length);

  return (
    <div
      data-board-overlay="true"
      style={{ left: `${left}px`, top: `${top}px`, width: `${popW}px` }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className="absolute z-50 bg-white rounded-2xl border border-[#CBD5E1] shadow-[0_20px_48px_rgba(20,36,75,0.22)] flex flex-col overflow-visible"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#E2E8F0] flex items-center justify-between gap-2 bg-[#F8FAFC] rounded-t-2xl">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-xs font-bold text-[#14244B] whitespace-nowrap">
            {titleOverride || ec.headerTitle}
          </span>
          {group.clauses.length > 1 && (
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[#E2E8F0]/70">
              {(['AND', 'OR'] as const).map((comb) => (
                <button
                  key={comb}
                  type="button"
                  onClick={() => setCombinator(comb)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    group.combinator === comb
                      ? 'bg-[#14244B] text-white'
                      : 'text-[#475569] hover:text-[#14244B]'
                  }`}
                >
                  {comb}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasSavedCondition && (
            <button
              type="button"
              onClick={onClear}
              className="px-2 py-1 rounded-md text-[11px] font-semibold text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer whitespace-nowrap"
            >
              {t.clearCondition}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-6 h-6 rounded-md text-[#64748B] hover:text-[#14244B] hover:bg-[#E2E8F0]/60 flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Optional Sibling Condition Inheritance Checkbox (Unchecked by Default) */}
      {canInheritSibling && (
        <div className="px-3 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC]/70 space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={inheritChecked}
              onChange={(e) => {
                const next = e.target.checked;
                setInheritChecked(next);
                if (next && !selectedDonorId && siblingDonorEdges[0]) {
                  setSelectedDonorId(siblingDonorEdges[0].id);
                }
              }}
              className="w-3.5 h-3.5 rounded border-[#94A3B8] text-[#0284C7] focus:ring-[#0284C7] cursor-pointer"
            />
            <span className="text-[11px] font-semibold text-[#14244B]">
              {ec.inheritToggleLabel}
            </span>
          </label>

          {inheritChecked && (
            <div className="pl-5 space-y-1">
              <div className="text-[10px] font-medium text-[#64748B]">
                {ec.inheritPickPrompt}
              </div>
              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                {siblingDonorEdges.map((donor) => {
                  const targetNode = nodes.find((n) => n.id === donor.toId);
                  const targetLabel =
                    targetNode?.note.trim() ||
                    targetNode?.title.trim() ||
                    targetNode?.kind ||
                    donor.toId;
                  const isPicked = selectedDonorId === donor.id;
                  return (
                    <button
                      key={donor.id}
                      type="button"
                      onClick={() => setSelectedDonorId(donor.id)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center gap-2 transition-colors cursor-pointer ${
                        isPicked
                          ? 'bg-[#E0F2FE] border-[#38BDF8] text-[#0369A1] font-semibold'
                          : 'bg-white border-[#E2E8F0] hover:border-[#94A3B8] text-[#334155]'
                      }`}
                    >
                      <Link2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span className="truncate flex-1">
                        → {targetLabel}: {donor.condition}
                      </span>
                      {isPicked && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-[#64748B] leading-snug">
                {ec.inheritActiveNote}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Clause Rows (hidden while inheriting sibling condition directly) */}
      {!inheritChecked && (
        <div className="p-2.5 space-y-2 max-h-[340px] overflow-y-auto overscroll-contain">
          {group.clauses.map((clause, index) => (
          <div key={clause.id} className="space-y-1.5">
            {index > 0 && (
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-[#E2E8F0]" />
                <button
                  type="button"
                  onClick={toggleCombinator}
                  className="px-2 py-0.5 rounded-md bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] text-[10px] font-bold text-[#14244B] cursor-pointer whitespace-nowrap"
                >
                  {group.combinator === 'OR' ? ec.combineOr : ec.combineAnd}
                </button>
                <div className="h-px flex-1 bg-[#E2E8F0]" />
              </div>
            )}

            <div className="p-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/80 space-y-2">
              {/* Top Category Switch + Delete Clause */}
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center p-0.5 rounded-lg bg-[#E2E8F0]/65">
                  <button
                    type="button"
                    onClick={() => switchCategory(clause, 'event')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      clause.kind === 'event'
                        ? 'bg-white text-[#0369A1] shadow-2xs'
                        : 'text-[#64748B] hover:text-[#14244B]'
                    }`}
                  >
                    <Zap className="w-3 h-3" aria-hidden="true" />
                    <span>{ec.catEvent}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchCategory(clause, 'property')}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      clause.kind === 'property'
                        ? 'bg-white text-[#047857] shadow-2xs'
                        : 'text-[#64748B] hover:text-[#14244B]'
                    }`}
                  >
                    <SlidersHorizontal className="w-3 h-3" aria-hidden="true" />
                    <span>{ec.catProperty}</span>
                  </button>
                </div>

                {group.clauses.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeClause(clause.id)}
                    aria-label="Remove condition"
                    className="w-6 h-6 rounded-md text-[#94A3B8] hover:text-[#DC2626] hover:bg-[#FEE2E2] flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Category 1: Inline Event Block Row */}
              {clause.kind === 'event' && (
                <EventClauseRow
                  lang={lang}
                  clause={clause}
                  fromNode={fromNode}
                  nodes={nodes}
                  assetItems={assetItems}
                  onUpdate={(next) => updateClause(clause.id, next)}
                />
              )}

              {/* Category 2: Inline Property Condition Block Row */}
              {clause.kind === 'property' && (
                <PropertyClauseRow
                  lang={lang}
                  clause={clause}
                  fromNode={fromNode}
                  scopedVariables={scopedVariables}
                  numericParameters={numericParameters}
                  numberTokens={numberTokens}
                  onUpdate={(next) => updateClause(clause.id, next)}
                />
              )}
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Footer: Add Clause + Preview Summary + Save */}
      <div className="px-3 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC] rounded-b-2xl flex items-center justify-between gap-2">
        {!inheritChecked ? (
          <button
            type="button"
            onClick={handleAddClause}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-[#0369A1] hover:bg-[#E0F2FE] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{ec.addClause}</span>
          </button>
        ) : (
          <span className="text-[10.5px] font-medium text-[#0369A1] truncate">
            {ec.inheritToggleLabel}
          </span>
        )}

        <div className="min-w-0 flex-1 text-right">
          {!inheritChecked && summaryPreview && (
            <span className="text-[10.5px] font-medium text-[#64748B] truncate block">
              if {summaryPreview}
            </span>
          )}
        </div>

        {inheritChecked ? (
          <button
            type="button"
            onClick={() => {
              if (!selectedDonorId || !onLinkSibling) return;
              onLinkSibling(selectedDonorId);
            }}
            disabled={!selectedDonorId || !onLinkSibling}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              selectedDonorId && onLinkSibling
                ? 'bg-[#0284C7] hover:bg-[#0369A1] text-white cursor-pointer'
                : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{ec.inheritSaveBtn}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!summaryPreview) return;
              const detachedFromShared = Boolean(edge.sharedConditionId && !inheritChecked);
              onSave(
                summaryPreview,
                group,
                detachedFromShared ? { scope: 'single' } : undefined,
              );
            }}
            disabled={!summaryPreview}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              summaryPreview
                ? 'bg-[#14244B] hover:bg-[#1E3468] text-white cursor-pointer'
                : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
            }`}
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.saveCondition}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Extracted Event & Property Row Renderers
// ---------------------------------------------------------------------------

function EventClauseRow({
  lang,
  clause,
  fromNode,
  nodes,
  assetItems,
  onUpdate,
}: {
  lang: Language;
  clause: EventConditionClause;
  fromNode: BoardNode | undefined;
  nodes: BoardNode[];
  assetItems: AssetItem[];
  onUpdate: (next: EventConditionClause) => void;
}) {
  const spec = clause.eventId === 'custom' ? undefined : getEventSpec(clause.eventId);

  const handleSelectEvent = (nextSpec: EventSpec | null, customText?: string) => {
    if (!nextSpec) {
      onUpdate({
        ...clause,
        eventId: 'custom',
        customEventText: customText ?? '',
        targetMode: 'none',
        targetId: undefined,
        targetLabel: undefined,
        targetKind: undefined,
        distance: undefined,
      });
      return;
    }

    // Reconcile Subject A when switching between entity events and timer_scene / char_only
    const allowedSubjectCats = getAllowedSubjectCategories(nextSpec.subjectRole);
    const currentSubjAsset = clause.subjectAssetId
      ? assetItems.find((a) => a.id === clause.subjectAssetId)
      : undefined;

    let nextSubjectAssetId = clause.subjectAssetId;
    let nextSubjectLabel = clause.subjectLabel;
    let nextSubjectKind = clause.subjectKind;

    const needsSubjectReplacement =
      nextSpec.subjectRole === 'timer_scene'
        ? currentSubjAsset
          ? !allowedSubjectCats.includes(currentSubjAsset.categoryId)
          : clause.subjectKind !== 'scene'
        : currentSubjAsset
          ? !allowedSubjectCats.includes(currentSubjAsset.categoryId)
          : clause.subjectKind === 'scene';

    if (needsSubjectReplacement) {
      const primaryAsset = getUpstreamPrimaryAsset(fromNode, assetItems);
      const replacement =
        (primaryAsset && allowedSubjectCats.includes(primaryAsset.categoryId)
          ? primaryAsset
          : undefined) ??
        assetItems.find((a) => allowedSubjectCats.includes(a.categoryId));

      if (nextSpec.subjectRole === 'timer_scene') {
        nextSubjectAssetId = replacement?.id ?? 'timer';
        nextSubjectLabel = replacement?.name ?? (lang === 'zh' ? '倒计时' : 'Timer');
        nextSubjectKind = replacement ? 'asset' : 'scene';
      } else {
        nextSubjectAssetId = replacement?.id;
        nextSubjectLabel = replacement?.name ?? (lang === 'zh' ? '角色' : 'Character');
        nextSubjectKind = replacement ? 'asset' : 'custom';
      }
    }

    const keepTarget =
      nextSpec.targetMode !== 'none' &&
      nextSpec.targetRole === spec?.targetRole;

    onUpdate({
      ...clause,
      subjectAssetId: nextSubjectAssetId,
      subjectLabel: nextSubjectLabel,
      subjectKind: nextSubjectKind,
      eventId: nextSpec.id,
      customEventText: undefined,
      targetMode: nextSpec.targetMode,
      targetId: keepTarget ? clause.targetId : undefined,
      targetLabel: keepTarget ? clause.targetLabel : undefined,
      targetKind: keepTarget ? clause.targetKind : undefined,
      distance: undefined,
    });
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <InlineSubjectPicker
        lang={lang}
        clause={clause}
        spec={spec}
        assetItems={assetItems}
        onChange={(patch) => onUpdate({ ...clause, ...patch })}
      />

      <InlineEventPicker
        lang={lang}
        clause={clause}
        fromNode={fromNode}
        nodes={nodes}
        onSelectEvent={handleSelectEvent}
      />

      <InlineTargetPicker
        lang={lang}
        clause={clause}
        spec={spec}
        assetItems={assetItems}
        onChange={(patch) => onUpdate({ ...clause, ...patch })}
      />
    </div>
  );
}

function PropertyClauseRow({
  lang,
  clause,
  fromNode,
  scopedVariables,
  numericParameters,
  numberTokens,
  onUpdate,
}: {
  lang: Language;
  clause: PropertyConditionClause;
  fromNode: BoardNode | undefined;
  scopedVariables: ScopedStateVariable[];
  numericParameters: NumericFormulaSymbol[];
  numberTokens: { key: string; label: string }[];
  onUpdate: (next: PropertyConditionClause) => void;
}) {
  const b = COPY[lang].studio.board;
  const ec = b.edgeCond;

  const selectedEntry = scopedVariables.find((v) => v.variable.id === clause.propertyId);
  const propType = selectedEntry?.variable.type ?? clause.propertyType;
  const comparators = getComparatorsForType(propType);
  const activeComp = comparators.find((c) => c.value === clause.comparator) ?? comparators[0];

  const handlePickProperty = (entry: ScopedStateVariable) => {
    const t = entry.variable.type;
    const typeChanged = t !== propType;
    onUpdate({
      ...clause,
      propertyId: entry.variable.id,
      propertyType: t,
      comparator: typeChanged ? getDefaultComparatorForType(t) : activeComp.value,
      valueMode: typeChanged ? 'literal' : clause.valueMode,
      literalValue:
        t === 'choice'
          ? entry.variable.options?.[0] ?? String(entry.variable.initialValue ?? '')
          : t === 'number'
            ? typeChanged
              ? String(Number(entry.variable.initialValue) || 0)
              : clause.literalValue ?? '0'
            : typeChanged
              ? String(entry.variable.initialValue ?? '')
              : clause.literalValue ?? '',
      comparePropertyId: typeChanged ? undefined : clause.comparePropertyId,
      formulaExpression:
        t === 'number' ? clause.formulaExpression || entry.fullKey : undefined,
    });
  };

  const formulaEval =
    propType === 'number' && clause.valueMode === 'formula'
      ? evaluateNumberFormula(
          clause.formulaExpression ?? '',
          scopedVariables,
          numericParameters,
        )
      : null;

  const appendFormulaToken = (token: string) => {
    const cur = (clause.formulaExpression ?? '').trimEnd();
    onUpdate({
      ...clause,
      formulaExpression: cur ? `${cur} ${token}` : token,
    });
  };

  const hidesRhs = Boolean(activeComp.hidesRightValue);

  const valueModes: { mode: PropertyValueMode; label: string }[] =
    propType === 'number'
      ? [
          { mode: 'literal', label: ec.valModeNumber },
          { mode: 'property', label: ec.valModeProp },
          { mode: 'formula', label: ec.valModeFormula },
        ]
      : [
          { mode: 'literal', label: ec.valModeNumber },
          { mode: 'property', label: ec.valModeProp },
        ];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Block 1: Property */}
        <InlinePropertyPicker
          lang={lang}
          selectedId={clause.propertyId}
          fromNode={fromNode}
          scopedVariables={scopedVariables}
          onSelect={handlePickProperty}
        />

        {/* Block 2: Comparator (strictly by unit) */}
        {selectedEntry && (
          <select
            value={activeComp.value}
            onChange={(e) =>
              onUpdate({ ...clause, comparator: e.target.value as PropertyConditionClause['comparator'] })
            }
            aria-label="Comparator"
            className="h-7 px-2 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-[11px] font-bold text-[#047857] focus:outline-none cursor-pointer"
          >
            {comparators.map((c) => (
              <option key={c.value} value={c.value}>
                {lang === 'zh' ? c.labelZh : c.labelEn}
              </option>
            ))}
          </select>
        )}

        {/* Block 3: Comparison Value */}
        {selectedEntry && !hidesRhs && (
          <div className="inline-flex items-center gap-1 flex-wrap">
            {clause.valueMode === 'literal' && propType === 'number' && (
              <input
                type="number"
                step="any"
                value={clause.literalValue ?? '0'}
                onChange={(e) => onUpdate({ ...clause, literalValue: e.target.value })}
                className="h-7 w-20 px-2 rounded-lg bg-white border border-[#CBD5E1] font-mono tabular-nums text-[11px] font-semibold text-[#14244B] focus:outline-none focus:border-[#0284C7]"
              />
            )}

            {clause.valueMode === 'literal' && propType === 'choice' && (
              <select
                value={clause.literalValue ?? ''}
                onChange={(e) => onUpdate({ ...clause, literalValue: e.target.value })}
                className="h-7 px-2 rounded-lg bg-white border border-[#CBD5E1] text-[11px] font-semibold text-[#14244B] focus:outline-none cursor-pointer max-w-[140px]"
              >
                {(selectedEntry.variable.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {clause.valueMode === 'literal' && propType === 'text' && (
              <input
                type="text"
                value={clause.literalValue ?? ''}
                onChange={(e) => onUpdate({ ...clause, literalValue: e.target.value })}
                placeholder={ec.textValuePh}
                className="h-7 w-28 px-2 rounded-lg bg-white border border-[#CBD5E1] text-[11px] text-[#14244B] focus:outline-none focus:border-[#0284C7]"
              />
            )}

            {clause.valueMode === 'property' && (
              <InlinePropertyPicker
                lang={lang}
                selectedId={clause.comparePropertyId ?? ''}
                fromNode={fromNode}
                scopedVariables={scopedVariables}
                filterType={propType}
                placeholder={ec.propPick}
                onSelect={(rhs) => onUpdate({ ...clause, comparePropertyId: rhs.variable.id })}
              />
            )}

            {/* Compact Value / Property / Formula Mode Toggle */}
            <div className="inline-flex items-center p-0.5 rounded-md bg-[#E2E8F0]/70">
              {valueModes.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => onUpdate({ ...clause, valueMode: m.mode })}
                  className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    clause.valueMode === m.mode
                      ? 'bg-white text-[#14244B] shadow-2xs'
                      : 'text-[#64748B] hover:text-[#14244B]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Expanded Hybrid Formula Bar when Number Formula mode is active */}
      {selectedEntry && !hidesRhs && propType === 'number' && clause.valueMode === 'formula' && (
        <div className="p-2 rounded-lg bg-white border border-[#E2E8F0] space-y-1.5">
          <input
            type="text"
            value={clause.formulaExpression ?? ''}
            onChange={(e) => onUpdate({ ...clause, formulaExpression: e.target.value })}
            placeholder={b.propFormulaPh}
            className="w-full px-2 py-1 font-mono text-[11px] font-medium text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#0284C7]"
          />
          {numberTokens.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {numberTokens.map((tok) => (
                <button
                  key={tok.key}
                  type="button"
                  onClick={() => appendFormulaToken(tok.key)}
                  className="px-1.5 py-0.5 rounded bg-[#F8FAFC] border border-[#CBD5E1] hover:border-[#0284C7] text-[10px] font-mono text-[#14244B] cursor-pointer"
                >
                  {tok.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {NUMBER_FORMULA_OPS.map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => appendFormulaToken(op)}
                  className="w-5 h-5 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] font-mono text-[11px] font-semibold text-[#14244B] flex items-center justify-center cursor-pointer"
                >
                  {op}
                </button>
              ))}
            </div>
            {formulaEval && (
              <span
                className={`text-[10px] font-mono tabular-nums ${
                  formulaEval.ok ? 'text-[#047857]' : 'text-[#B91C1C]'
                }`}
              >
                {formulaEval.ok ? `= ${formulaEval.value}` : b.propFormulaInvalid}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
