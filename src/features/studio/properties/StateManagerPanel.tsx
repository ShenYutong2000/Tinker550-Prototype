import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Crosshair,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { AssetCategoryId, AssetItem } from '../asset-library/assetLibraryModel';
import { COPY, type Language } from '../../../shared/i18n';
import {
  assetCategorySupportsProperties,
  clampNumberValue,
  findVariableReferences,
  formatNumberRangeHint,
  type ScopedStateVariable,
  type StateVariable,
  type StateVariableType,
  type StateVariableValue,
} from './stateModel';
import type { BoardEdge, BoardNode } from '../design-board/studioModel';
import { PropertyEditorModal } from './PropertyEditorModal';
import { ScopeCombobox } from './ScopeCombobox';

type FilterTab = 'all' | 'global' | 'assets';

interface StateManagerPanelProps {
  lang: Language;
  assetItems: AssetItem[];
  scopedVariables: ScopedStateVariable[];
  nodes: BoardNode[];
  edges: BoardEdge[];
  onClose: () => void;
  onAddGlobalVariable: (variable: StateVariable) => void;
  onAddAssetProperty: (assetId: string, variable: StateVariable) => void;
  onUpdateVariable: (
    scope: 'global' | 'asset',
    assetId: string | undefined,
    variable: StateVariable,
  ) => void;
  onMoveVariableScope: (
    fromScope: 'global' | 'asset',
    fromAssetId: string | undefined,
    toScope: 'global' | 'asset',
    toAssetId: string | undefined,
    variable: StateVariable,
  ) => void;
  onDeleteVariable: (
    scope: 'global' | 'asset',
    assetId: string | undefined,
    variableId: string,
  ) => void;
  onUpdatePlayValue: (variableId: string, value: StateVariableValue) => void;
  onApplyPlayToInitial: (entry: ScopedStateVariable) => void;
  onResetPlayValue: (variableId: string) => void;
  onResetAllPlayValues: () => void;
  onJumpToAssetProperty: (assetId: string, variableId: string) => void;
  onLocateBoardReference: (target: { nodeId?: string; edgeId?: string }) => void;
}

export function StateManagerPanel({
  lang,
  assetItems,
  scopedVariables,
  nodes,
  edges,
  onClose,
  onAddGlobalVariable,
  onAddAssetProperty,
  onUpdateVariable,
  onMoveVariableScope,
  onDeleteVariable,
  onUpdatePlayValue,
  onApplyPlayToInitial,
  onResetPlayValue,
  onResetAllPlayValues,
  onJumpToAssetProperty,
  onLocateBoardReference,
}: StateManagerPanelProps) {
  const s = COPY[lang].studio.states;

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [addScopeKey, setAddScopeKey] = useState<string>('global');
  const [modalState, setModalState] = useState<{
    mode: 'add' | 'edit';
    initialScopeKey: string;
    entry?: ScopedStateVariable;
  } | null>(null);

  const eligibleAssets = useMemo(
    () =>
      assetItems
        .filter((a) => assetCategorySupportsProperties(a.categoryId))
        .map((a) => ({ id: a.id, name: a.name, categoryId: a.categoryId })),
    [assetItems],
  );

  const effectiveAddScopeKey = useMemo(() => {
    if (addScopeKey === 'global') return 'global';
    return eligibleAssets.some((a) => a.id === addScopeKey) ? addScopeKey : 'global';
  }, [addScopeKey, eligibleAssets]);

  const globalList = useMemo(
    () => scopedVariables.filter((v) => v.scope === 'global'),
    [scopedVariables],
  );
  const assetList = useMemo(
    () => scopedVariables.filter((v) => v.scope === 'asset'),
    [scopedVariables],
  );
  const dirtyCount = useMemo(
    () => scopedVariables.filter((v) => v.isDirty).length,
    [scopedVariables],
  );

  const groupedSections = useMemo(() => {
    const sections: {
      id: string;
      label: string;
      items: ScopedStateVariable[];
    }[] = [];

    if (activeTab === 'all' || activeTab === 'global') {
      if (globalList.length > 0) {
        sections.push({
          id: 'global',
          label: s.groupGlobal,
          items: globalList,
        });
      }
    }

    if (activeTab === 'all' || activeTab === 'assets') {
      const byCategory: { cat: AssetCategoryId; label: string }[] = [
        { cat: 'characters', label: s.groupCharacters },
        { cat: 'objects', label: s.groupObjects },
        { cat: 'backgrounds', label: s.groupBackgrounds },
      ];
      for (const { cat, label } of byCategory) {
        const items = assetList.filter((v) => v.assetCategoryId === cat);
        if (items.length > 0) {
          sections.push({ id: cat, label, items });
        }
      }
    }

    return sections;
  }, [activeTab, assetList, globalList, s]);

  const typeLabel = (t: StateVariableType) => {
    switch (t) {
      case 'number':
        return s.typeNumber;
      case 'boolean':
        return s.typeBoolean;
      case 'text':
        return s.typeText;
      case 'choice':
        return s.typeChoice;
    }
  };

  const categoryShortLabel = (cat?: AssetCategoryId) => {
    if (cat === 'characters') return s.groupCharacters;
    if (cat === 'objects') return s.groupObjects;
    if (cat === 'backgrounds') return s.groupBackgrounds;
    return '';
  };

  const existingNamesByScope = useMemo(() => {
    const map: Record<string, string[]> = {
      global: globalList.map((e) => e.variable.name),
    };
    for (const a of eligibleAssets) {
      map[a.id] = [];
    }
    for (const e of assetList) {
      if (!e.assetId) continue;
      if (!map[e.assetId]) map[e.assetId] = [];
      map[e.assetId].push(e.variable.name);
    }
    return map;
  }, [assetList, eligibleAssets, globalList]);

  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    if (tab === 'global') {
      setAddScopeKey('global');
    } else if (tab === 'assets' && effectiveAddScopeKey === 'global' && eligibleAssets[0]) {
      setAddScopeKey(eligibleAssets[0].id);
    }
  };

  const handleInlineInitialChange = (
    entry: ScopedStateVariable,
    nextVal: StateVariableValue,
  ) => {
    const cleanVal =
      entry.variable.type === 'number'
        ? clampNumberValue(Number(nextVal), entry.variable)
        : nextVal;
    onUpdateVariable(entry.scope, entry.assetId, {
      ...entry.variable,
      initialValue: cleanVal,
    });
  };

  const renderInitialEditor = (entry: ScopedStateVariable) => {
    const { variable } = entry;

    if (variable.type === 'number') {
      const val = Number(variable.initialValue);
      return (
        <input
          type="number"
          step="any"
          value={Number.isFinite(val) ? val : 0}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed)) {
              handleInlineInitialChange(entry, parsed);
            }
          }}
          aria-label={`${variable.name} ${s.colInitial}`}
          className="w-20 px-2 py-1 font-mono tabular-nums text-xs font-semibold text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] focus:border-[#4E9AE3] focus:bg-white rounded-md focus:outline-none"
        />
      );
    }

    if (variable.type === 'boolean') {
      const truthy = Boolean(variable.initialValue);
      return (
        <button
          type="button"
          onClick={() => handleInlineInitialChange(entry, !truthy)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            truthy
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]'
              : 'bg-[#F8FAFC] border-[#CBD5E1] text-[#475569]'
          }`}
        >
          {truthy ? (
            <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
          ) : (
            <X className="w-3 h-3 shrink-0" aria-hidden="true" />
          )}
          <span>{truthy ? s.boolTrue : s.boolFalse}</span>
        </button>
      );
    }

    if (variable.type === 'choice') {
      const opts = variable.options ?? [];
      return (
        <select
          value={String(variable.initialValue ?? '')}
          onChange={(e) => handleInlineInitialChange(entry, e.target.value)}
          aria-label={`${variable.name} ${s.colInitial}`}
          className="max-w-[116px] px-2 py-1 text-xs font-medium text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] focus:border-[#4E9AE3] focus:bg-white rounded-md focus:outline-none"
        >
          {opts.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type="text"
        value={String(variable.initialValue ?? '')}
        onChange={(e) => handleInlineInitialChange(entry, e.target.value)}
        aria-label={`${variable.name} ${s.colInitial}`}
        className="w-28 max-w-full px-2 py-1 text-xs font-medium text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] focus:border-[#4E9AE3] focus:bg-white rounded-md focus:outline-none"
      />
    );
  };

  const renderPlayModeEditor = (entry: ScopedStateVariable) => {
    const { variable, playValue, isDirty } = entry;

    const showNumberSlider =
      variable.type === 'number' &&
      variable.hasMin &&
      variable.hasMax &&
      typeof variable.minValue === 'number' &&
      typeof variable.maxValue === 'number' &&
      variable.maxValue > variable.minValue;

    return (
      <div
        className={`rounded-lg p-1.5 -m-1 transition-colors space-y-1.5 ${
          isDirty ? 'bg-[#FFFBEB] ring-1 ring-[#FDE68A]' : ''
        }`}
      >
        {/* Live Sandbox Control */}
        {variable.type === 'number' && (() => {
          const num = Number(playValue);
          const safeNum = Number.isFinite(num) ? num : 0;
          const step =
            showNumberSlider && (variable.maxValue! - variable.minValue!) <= 2
              ? 0.1
              : 1;
          return (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePlayValue(
                      variable.id,
                      clampNumberValue(Number((safeNum - step).toFixed(2)), variable),
                    )
                  }
                  aria-label="Decrease"
                  className="w-6 h-6 rounded-md bg-white border border-[#CBD5E1] text-[#475569] hover:text-[#14244B] hover:border-[#14244B] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Minus className="w-3 h-3" aria-hidden="true" />
                </button>
                <input
                  type="number"
                  step="any"
                  value={safeNum}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    if (Number.isFinite(parsed)) {
                      onUpdatePlayValue(
                        variable.id,
                        clampNumberValue(parsed, variable),
                      );
                    }
                  }}
                  aria-label={`${variable.name} ${s.colPlayMode}`}
                  className="w-16 px-1.5 py-1 font-mono tabular-nums text-xs font-bold text-center text-[#14244B] bg-white border border-[#CBD5E1] focus:border-[#4E9AE3] rounded-md focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdatePlayValue(
                      variable.id,
                      clampNumberValue(Number((safeNum + step).toFixed(2)), variable),
                    )
                  }
                  aria-label="Increase"
                  className="w-6 h-6 rounded-md bg-white border border-[#CBD5E1] text-[#475569] hover:text-[#14244B] hover:border-[#14244B] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
              {showNumberSlider && (
                <input
                  type="range"
                  min={variable.minValue}
                  max={variable.maxValue}
                  step={step}
                  value={safeNum}
                  onChange={(e) =>
                    onUpdatePlayValue(
                      variable.id,
                      clampNumberValue(Number(e.target.value), variable),
                    )
                  }
                  aria-label={`${variable.name} slider`}
                  className="w-full max-w-[144px] h-1.5 accent-[#14244B] cursor-pointer block"
                />
              )}
            </div>
          );
        })()}

        {variable.type === 'boolean' && (() => {
          const truthy = Boolean(playValue);
          return (
            <button
              type="button"
              onClick={() => onUpdatePlayValue(variable.id, !truthy)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                truthy
                  ? 'bg-[#ECFDF5] border-[#10B981] text-[#047857]'
                  : 'bg-white border-[#CBD5E1] text-[#475569] hover:border-[#14244B]'
              }`}
            >
              {truthy ? (
                <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
              ) : (
                <X className="w-3 h-3 shrink-0" aria-hidden="true" />
              )}
              <span>{truthy ? s.boolTrue : s.boolFalse}</span>
            </button>
          );
        })()}

        {variable.type === 'choice' && (
          <select
            value={String(playValue ?? '')}
            onChange={(e) => onUpdatePlayValue(variable.id, e.target.value)}
            aria-label={`${variable.name} ${s.colPlayMode}`}
            className="max-w-[132px] px-2 py-1 text-xs font-semibold text-[#14244B] bg-white border border-[#CBD5E1] focus:border-[#4E9AE3] rounded-md focus:outline-none"
          >
            {(variable.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}

        {variable.type === 'text' && (
          <input
            type="text"
            value={String(playValue ?? '')}
            onChange={(e) => onUpdatePlayValue(variable.id, e.target.value)}
            aria-label={`${variable.name} ${s.colPlayMode}`}
            className="w-32 max-w-full px-2 py-1 text-xs font-semibold text-[#14244B] bg-white border border-[#CBD5E1] focus:border-[#4E9AE3] rounded-md focus:outline-none"
          />
        )}

        {/* Commit / Reset actions when Play Mode diverges from Initial */}
        {isDirty && (
          <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
            <button
              type="button"
              onClick={() => onApplyPlayToInitial(entry)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#14244B] hover:bg-[#1E3468] text-white text-[10.5px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-2.5 h-2.5" aria-hidden="true" />
              <span>{s.applyToInitial}</span>
            </button>
            <button
              type="button"
              onClick={() => onResetPlayValue(variable.id)}
              title={s.resetPlayValue}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#475569] text-[10.5px] font-medium transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />
              <span>{s.resetPlayValue}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Floating panel anchored strictly over Design Board (keeps right Play window 100% visible!) */}
      <div
        role="dialog"
        aria-label={s.title}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-3 left-3 right-3 bottom-16 z-40 bg-white/98 backdrop-blur-xs rounded-2xl border border-[#CBD5E1] shadow-[0_20px_50px_rgba(20,36,75,0.18)] flex flex-col overflow-hidden pointer-events-auto"
      >
        {/* Header Bar */}
        <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            <h2 className="font-display text-sm font-bold text-[#14244B] whitespace-nowrap">
              {s.title}
            </h2>
            <span className="font-mono text-xs tabular-nums text-[#64748B]">
              · {scopedVariables.length}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {dirtyCount > 0 && (
              <button
                type="button"
                onClick={onResetAllPlayValues}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-semibold text-[#475569] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>{s.resetAllPlay}</span>
              </button>
            )}

            {/* Searchable Scope Selector + Add Property Split Control */}
            <div className="inline-flex items-center rounded-lg border border-[#CBD5E1] bg-white shrink-0">
              <div className="rounded-l-lg">
                <ScopeCombobox
                  lang={lang}
                  value={effectiveAddScopeKey}
                  assetOptions={eligibleAssets}
                  variant="compact"
                  align="right"
                  ariaLabel={s.fieldScope}
                  onChange={setAddScopeKey}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setModalState({
                    mode: 'add',
                    initialScopeKey: effectiveAddScopeKey,
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-r-[7px] bg-[#14244B] hover:bg-[#1E3468] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{s.addPropertyBtn}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              title={s.close}
              aria-label={s.close}
              className="w-8 h-8 rounded-lg text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Filter Tabs Row */}
        <div className="px-4 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between gap-3 shrink-0">
          <div className="inline-flex items-center gap-1 p-0.5 bg-[#E2E8F0]/65 rounded-lg">
            {(
              [
                { id: 'all' as const, label: s.tabAll, count: scopedVariables.length },
                { id: 'global' as const, label: s.tabGlobal, count: globalList.length },
                { id: 'assets' as const, label: s.tabAssets, count: assetList.length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-[#14244B] shadow-xs'
                    : 'text-[#64748B] hover:text-[#14244B]'
                }`}
              >
                <span>{tab.label}</span>
                <span className="font-mono text-[11px] tabular-nums opacity-70">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 4-Column Table Body */}
        <div className="flex-1 min-h-0 overflow-auto">
          {groupedSections.length === 0 ? (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center p-8 text-center">
              <div className="font-display text-sm font-bold text-[#14244B]">
                {activeTab === 'global'
                  ? s.emptyGlobal
                  : activeTab === 'assets'
                    ? s.emptyAssets
                    : s.emptyAll}
              </div>
              <button
                type="button"
                onClick={() =>
                  setModalState({
                    mode: 'add',
                    initialScopeKey: effectiveAddScopeKey,
                  })
                }
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#14244B] hover:bg-[#1E3468] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{s.addPropertyBtn}</span>
              </button>
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-white border-b border-[#E2E8F0]">
                <tr className="text-[11px] font-semibold text-[#64748B]">
                  <th className="py-2.5 pl-4 pr-3 w-[32%]">{s.colName}</th>
                  <th className="py-2.5 px-3 w-[16%]">{s.colType}</th>
                  <th className="py-2.5 px-3 w-[23%]">{s.colInitial}</th>
                  <th className="py-2.5 pl-3 pr-4 w-[29%]">{s.colPlayMode}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {groupedSections.map((section) => (
                  <SectionGroupRows
                    key={section.id}
                    section={section}
                    lang={lang}
                    nodes={nodes}
                    edges={edges}
                    typeLabel={typeLabel}
                    categoryShortLabel={categoryShortLabel}
                    renderInitialEditor={renderInitialEditor}
                    renderPlayModeEditor={renderPlayModeEditor}
                    onEdit={(entry) =>
                      setModalState({
                        mode: 'edit',
                        initialScopeKey:
                          entry.scope === 'asset' && entry.assetId
                            ? entry.assetId
                            : 'global',
                        entry,
                      })
                    }
                    onDelete={(entry) =>
                      onDeleteVariable(entry.scope, entry.assetId, entry.variable.id)
                    }
                    onJumpToAssetProperty={onJumpToAssetProperty}
                    onLocateBoardReference={onLocateBoardReference}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Shared Add / Edit Property Modal */}
      {modalState && (
        <PropertyEditorModal
          lang={lang}
          scopeLabel={
            modalState.initialScopeKey === 'global'
              ? s.scopeGlobal
              : (eligibleAssets.find((a) => a.id === modalState.initialScopeKey)?.name ??
                s.scopeGlobal)
          }
          initialVariable={modalState.mode === 'edit' ? modalState.entry?.variable : null}
          existingNames={existingNamesByScope[modalState.initialScopeKey] ?? []}
          allowScopeSelect
          initialScopeKey={modalState.initialScopeKey}
          assetOptions={eligibleAssets}
          existingNamesByScope={existingNamesByScope}
          onClose={() => setModalState(null)}
          onSave={(variable, targetScope) => {
            if (modalState.mode === 'add') {
              if (targetScope.scope === 'global') {
                onAddGlobalVariable(variable);
              } else {
                onAddAssetProperty(targetScope.assetId, variable);
              }
            } else if (modalState.entry) {
              const prev = modalState.entry;
              const prevKey =
                prev.scope === 'asset' && prev.assetId ? prev.assetId : 'global';
              const nextKey =
                targetScope.scope === 'asset' ? targetScope.assetId : 'global';
              if (prevKey === nextKey) {
                onUpdateVariable(prev.scope, prev.assetId, variable);
              } else {
                onMoveVariableScope(
                  prev.scope,
                  prev.assetId,
                  targetScope.scope,
                  targetScope.scope === 'asset' ? targetScope.assetId : undefined,
                  variable,
                );
              }
            }
            setModalState(null);
          }}
        />
      )}
    </>
  );
}

interface SectionGroupRowsProps {
  section: { id: string; label: string; items: ScopedStateVariable[] };
  lang: Language;
  nodes: BoardNode[];
  edges: BoardEdge[];
  typeLabel: (t: StateVariableType) => string;
  categoryShortLabel: (cat?: AssetCategoryId) => string;
  renderInitialEditor: (entry: ScopedStateVariable) => React.ReactNode;
  renderPlayModeEditor: (entry: ScopedStateVariable) => React.ReactNode;
  onEdit: (entry: ScopedStateVariable) => void;
  onDelete: (entry: ScopedStateVariable) => void;
  onJumpToAssetProperty: (assetId: string, variableId: string) => void;
  onLocateBoardReference: (target: { nodeId?: string; edgeId?: string }) => void;
}

function SectionGroupRows({
  section,
  lang,
  nodes,
  edges,
  typeLabel,
  categoryShortLabel,
  renderInitialEditor,
  renderPlayModeEditor,
  onEdit,
  onDelete,
  onJumpToAssetProperty,
  onLocateBoardReference,
}: SectionGroupRowsProps) {
  const s = COPY[lang].studio.states;

  return (
    <>
      <tr className="bg-[#F8FAFC]/90">
        <td
          colSpan={4}
          className="py-1.5 px-4 text-[11px] font-normal text-[#64748B] border-b border-[#E2E8F0]"
        >
          {section.label}
          <span className="ml-1.5 font-mono font-normal text-[#94A3B8] tabular-nums">
            · {section.items.length}
          </span>
        </td>
      </tr>

      {section.items.map((entry) => {
        const { variable } = entry;
        const rangeHint = formatNumberRangeHint(variable);
        const refs = findVariableReferences(entry, nodes, edges);
        const firstNodeId = refs.nodeIds[0];
        const firstEdgeId = refs.edgeIds[0];

        return (
          <tr
            key={variable.id}
            className="align-top hover:bg-[#F8FAFC]/60 transition-colors"
          >
            {/* Column 1: Variable Name + Owner / Card Locator */}
            <td className="py-3 pl-4 pr-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#14244B] truncate">
                    {variable.name}
                  </span>
                </div>

                {variable.description && (
                  <p className="text-[11px] text-[#64748B] leading-snug line-clamp-2">
                    {variable.description}
                  </p>
                )}

                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 pt-0.5 text-[11px]">
                  {entry.scope === 'global' ? (
                    <span className="text-[#64748B]">{s.scopeGlobal}</span>
                  ) : (
                    entry.assetId && (
                      <button
                        type="button"
                        onClick={() => onJumpToAssetProperty(entry.assetId!, variable.id)}
                        title={s.jumpToAsset}
                        className="inline-flex items-center gap-0.5 font-semibold text-[#0369A1] hover:text-[#14244B] hover:underline transition-colors cursor-pointer"
                      >
                        <span>
                          {categoryShortLabel(entry.assetCategoryId)} · {entry.assetName}
                        </span>
                        <ArrowUpRight className="w-3 h-3 shrink-0" aria-hidden="true" />
                      </button>
                    )
                  )}

                  {firstNodeId && (
                    <>
                      <span aria-hidden="true" className="text-[#CBD5E1]">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onLocateBoardReference({ nodeId: firstNodeId })}
                        className="inline-flex items-center gap-0.5 font-medium text-[#475569] hover:text-[#14244B] hover:underline transition-colors cursor-pointer"
                      >
                        <Crosshair className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>
                          {s.locateCard}
                          {refs.nodeIds.length > 1 ? ` (${refs.nodeIds.length})` : ''}
                        </span>
                      </button>
                    </>
                  )}

                  {firstEdgeId && (
                    <>
                      <span aria-hidden="true" className="text-[#CBD5E1]">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onLocateBoardReference({ edgeId: firstEdgeId })}
                        className="inline-flex items-center gap-0.5 font-medium text-[#475569] hover:text-[#14244B] hover:underline transition-colors cursor-pointer"
                      >
                        <Crosshair className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>
                          {s.locateEdge}
                          {refs.edgeIds.length > 1 ? ` (${refs.edgeIds.length})` : ''}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </td>

            {/* Column 2: Type (+ range or options count) */}
            <td className="py-3 px-3">
              <div className="space-y-0.5">
                <div className="text-xs font-medium text-[#334155]">
                  {typeLabel(variable.type)}
                </div>
                {rangeHint && (
                  <div className="font-mono text-[11px] tabular-nums text-[#64748B]">
                    {rangeHint}
                  </div>
                )}
                {variable.type === 'choice' && variable.options && (
                  <div className="text-[11px] text-[#64748B] tabular-nums">
                    {variable.options.length} {s.choicesCount}
                  </div>
                )}
              </div>
            </td>

            {/* Column 3: Initial / Default Value + Edit/Delete */}
            <td className="py-3 px-3">
              <div className="flex items-center gap-1.5">
                {renderInitialEditor(entry)}
                <button
                  type="button"
                  onClick={() => onEdit(entry)}
                  title={s.editProp}
                  aria-label={s.editProp}
                  className="w-6 h-6 rounded-md text-[#94A3B8] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Pencil className="w-3 h-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(entry)}
                  title={s.deleteProp}
                  aria-label={s.deleteProp}
                  className="w-6 h-6 rounded-md text-[#94A3B8] hover:text-[#DC2626] hover:bg-[#FEF2F2] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
            </td>

            {/* Column 4: Play Mode (Sandbox Override + Apply/Reset) */}
            <td className="py-3 pl-3 pr-4">{renderPlayModeEditor(entry)}</td>
          </tr>
        );
      })}
    </>
  );
}
