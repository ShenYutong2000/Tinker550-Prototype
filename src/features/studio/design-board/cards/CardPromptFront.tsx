import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import {
  FIXED_ASSET_CATEGORIES,
  type AssetCategoryId,
  type AssetItem,
} from '../../asset-library/assetLibraryModel';
import { COPY, type Language } from '../../../../shared/i18n';
import type { ScopedStateVariable } from '../../properties/stateModel';
import {
  createDefaultPromptInput,
  getNodeAssetIds,
  type BoardNode,
  type CardFieldConfig,
  type CardPromptInput,
} from '../studioModel';

interface CardPromptFrontProps {
  lang: Language;
  node: BoardNode;
  assetItems: AssetItem[];
  scopedVariables: ScopedStateVariable[];
  autoFocus?: boolean;
  onUpdateNode: (
    id: string,
    patch: Partial<Pick<BoardNode, 'title' | 'note' | 'assetId' | 'assetIds' | 'promptInput'>>,
  ) => void;
  onUpdateNodeField: <K extends keyof CardFieldConfig>(
    id: string,
    key: K,
    value: CardFieldConfig[K],
  ) => void;
}

const ALL_ASSET_CATS: AssetCategoryId[] = [
  'characters',
  'objects',
  'backgrounds',
  'interface',
  'effects',
];

function renderMiniAssetThumb(asset: AssetItem) {
  const activeState =
    asset.states.find((s) => s.id === asset.activeStateId) ?? asset.states[0];
  if (activeState?.mediaUrl && activeState.mediaKind !== 'video') {
    return (
      <img
        src={activeState.mediaUrl}
        alt={asset.name}
        referrerPolicy="no-referrer"
        className="w-3.5 h-3.5 rounded object-contain bg-white border border-[#E2E8F0] shrink-0"
      />
    );
  }
  const accent =
    FIXED_ASSET_CATEGORIES.find((c) => c.id === asset.categoryId)?.accentColor ??
    '#CBD5E1';
  return (
    <span
      aria-hidden="true"
      className="w-3 h-3 rounded-sm border border-black/10 shrink-0"
      style={{ backgroundColor: asset.typography?.textColor ?? accent }}
    />
  );
}

interface FrontAssetPickerProps {
  lang: Language;
  assetItems: AssetItem[];
  preferredCategories: AssetCategoryId[];
  restrictToCategories?: AssetCategoryId[];
  valueLabel: string;
  selectedAssetId?: string;
  placeholder: string;
  accentBorderClass: string;
  accentFocusBorderClass: string;
  accentRowHoverClass: string;
  accentTextClass: string;
  allowClear?: boolean;
  onSelectAsset: (asset: AssetItem) => void;
  onSelectCustom: (text: string) => void;
  onClear?: () => void;
}

function FrontAssetPicker({
  lang,
  assetItems,
  preferredCategories,
  restrictToCategories,
  valueLabel,
  selectedAssetId,
  placeholder,
  accentBorderClass,
  accentFocusBorderClass,
  accentRowHoverClass,
  accentTextClass,
  allowClear = false,
  onSelectAsset,
  onSelectCustom,
  onClear,
}: FrontAssetPickerProps) {
  const b = COPY[lang].studio.board;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setQuery('');
    }
  }, [open]);

  const categoryLabel = (cat: AssetCategoryId) => {
    switch (cat) {
      case 'characters':
        return b.assetCatCharacters;
      case 'objects':
        return b.assetCatObjects;
      case 'backgrounds':
        return b.assetCatBackgrounds;
      case 'interface':
        return b.assetCatInterface;
      case 'effects':
        return b.assetCatEffects;
    }
  };

  const orderedCategories = useMemo(() => {
    if (restrictToCategories && restrictToCategories.length > 0) {
      return restrictToCategories;
    }
    const prefSet = new Set(preferredCategories);
    return [
      ...preferredCategories,
      ...ALL_ASSET_CATS.filter((c) => !prefSet.has(c)),
    ];
  }, [preferredCategories, restrictToCategories]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orderedCategories
      .map((cat) => {
        const label = categoryLabel(cat);
        const matchCat = q.length > 0 && label.toLowerCase().includes(q);
        const items = assetItems.filter((a) => {
          if (a.categoryId !== cat) return false;
          if (!q || matchCat) return true;
          return a.name.toLowerCase().includes(q);
        });
        return { categoryId: cat, label, items };
      })
      .filter((g) => g.items.length > 0);
  }, [assetItems, orderedCategories, query, lang]);

  const selectedAsset = selectedAssetId
    ? assetItems.find((a) => a.id === selectedAssetId)
    : undefined;

  const trimmedQuery = query.trim();
  const hasExactMatch =
    trimmedQuery.length > 0 &&
    groups.some((g) =>
      g.items.some((item) => item.name.toLowerCase() === trimmedQuery.toLowerCase()),
    );

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0">
      <div
        className={`w-full px-2 py-1.5 rounded-lg bg-white border ${accentBorderClass} text-[11px] flex items-center justify-between gap-1.5 transition-colors`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer"
        >
          {selectedAsset && renderMiniAssetThumb(selectedAsset)}
          <span
            className={`truncate ${
              valueLabel.trim()
                ? 'font-semibold text-[#14244B]'
                : 'font-normal text-[#94A3B8]'
            }`}
          >
            {valueLabel.trim() || placeholder}
          </span>
        </button>

        {allowClear && valueLabel.trim() && onClear && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            aria-label="Clear selection"
            className="w-4 h-4 rounded text-[#94A3B8] hover:text-[#475569] hover:bg-black/5 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-2.5 h-2.5" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle options"
          className="text-[#64748B] hover:text-[#14244B] flex items-center justify-center shrink-0 cursor-pointer"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[60] bg-white rounded-xl border border-[#CBD5E1] shadow-[0_14px_34px_rgba(15,23,42,0.16)] overflow-hidden">
          <div className="p-1.5 border-b border-[#F1F5F9]">
            <div className="relative">
              <Search
                className="w-3 h-3 text-[#94A3B8] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && trimmedQuery) {
                    e.preventDefault();
                    const allowedSet = new Set(orderedCategories);
                    const exact = assetItems.find(
                      (a) =>
                        allowedSet.has(a.categoryId) &&
                        a.name.toLowerCase() === trimmedQuery.toLowerCase(),
                    );
                    if (exact) {
                      onSelectAsset(exact);
                    } else {
                      onSelectCustom(trimmedQuery);
                    }
                    setOpen(false);
                    setQuery('');
                  }
                }}
                placeholder={placeholder}
                className={`w-full pl-6 pr-2 py-1 text-[11px] text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white ${accentFocusBorderClass}`}
              />
            </div>
          </div>

          <div className="max-h-44 overflow-y-auto py-1">
            {groups.map((group) => (
              <div key={group.categoryId} className="mb-1 last:mb-0">
                <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-normal text-[#64748B]">
                  {group.label}
                </div>
                {group.items.map((asset) => {
                  const isSelected =
                    selectedAssetId === asset.id ||
                    (!selectedAssetId &&
                      valueLabel.trim().toLowerCase() === asset.name.toLowerCase());
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => {
                        onSelectAsset(asset);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`w-full px-2.5 py-1 text-left text-[11px] flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? `${accentRowHoverClass} ${accentTextClass} font-semibold`
                          : `text-[#334155] ${accentRowHoverClass}`
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        {renderMiniAssetThumb(asset)}
                        <span className="truncate">{asset.name}</span>
                      </span>
                      {isSelected && <Check className="w-3 h-3 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}

            {trimmedQuery && !hasExactMatch && (
              <button
                type="button"
                onClick={() => {
                  onSelectCustom(trimmedQuery);
                  setOpen(false);
                  setQuery('');
                }}
                className={`w-full px-2.5 py-1.5 text-left text-[11px] ${accentTextClass} ${accentRowHoverClass} font-medium cursor-pointer border-t border-[#F1F5F9]`}
              >
                + “{trimmedQuery}”
              </button>
            )}

            {groups.length === 0 && !trimmedQuery && (
              <div className="px-3 py-3 text-center text-[11px] text-[#94A3B8]">
                {b.assetNoMatch}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CardPromptFront({
  lang,
  node,
  assetItems,
  scopedVariables,
  autoFocus,
  onUpdateNode,
}: CardPromptFrontProps) {
  const b = COPY[lang].studio.board;
  const s = COPY[lang].studio.states;
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Dialogue speaker dropdown state
  const [speakerOpen, setSpeakerOpen] = useState(false);
  const [speakerQuery, setSpeakerQuery] = useState('');
  const speakerRef = useRef<HTMLDivElement | null>(null);

  // Outcome searchable target (Assets + Properties) dropdown state
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetQuery, setTargetQuery] = useState('');
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoFocus) {
      requestAnimationFrame(() => firstInputRef.current?.focus());
    }
  }, [autoFocus]);

  useEffect(() => {
    if (!speakerOpen && !targetOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (speakerOpen && speakerRef.current && !speakerRef.current.contains(target)) {
        setSpeakerOpen(false);
      }
      if (targetOpen && targetRef.current && !targetRef.current.contains(target)) {
        setTargetOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [speakerOpen, targetOpen]);

  const characters = useMemo(
    () => assetItems.filter((a) => a.categoryId === 'characters'),
    [assetItems],
  );

  const filteredSpeakers = useMemo(() => {
    const q = speakerQuery.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter((c) => c.name.toLowerCase().includes(q));
  }, [characters, speakerQuery]);

  const prompt: CardPromptInput =
    node.promptInput ?? createDefaultPromptInput(node.kind) ?? { mode: 'template' };

  const patchPrompt = (patch: Partial<CardPromptInput>) => {
    const next: CardPromptInput = { ...prompt, ...patch };
    onUpdateNode(node.id, { promptInput: next });
  };

  /**
   * Swaps a front-slot asset binding cleanly: removes `prevAssetId` if replaced,
   * and binds `nextAssetId` while preserving all other bound assets.
   */
  const swapSlotAsset = (prevAssetId: string | undefined, nextAssetId: string | undefined) => {
    let list = getNodeAssetIds(node);
    if (prevAssetId && prevAssetId !== nextAssetId) {
      list = list.filter((id) => id !== prevAssetId);
    }
    if (nextAssetId && !list.includes(nextAssetId)) {
      list = [...list, nextAssetId];
    }
    return list;
  };

  const categoryLabel = (cat: AssetCategoryId) => {
    switch (cat) {
      case 'characters':
        return b.assetCatCharacters;
      case 'objects':
        return b.assetCatObjects;
      case 'backgrounds':
        return b.assetCatBackgrounds;
      case 'interface':
        return b.assetCatInterface;
      case 'effects':
        return b.assetCatEffects;
    }
  };

  const outcomeGroups = useMemo(() => {
    const q = targetQuery.trim().toLowerCase();

    const varItems = scopedVariables.filter((v) => {
      if (!q) return true;
      return (
        v.fullKey.toLowerCase().includes(q) ||
        v.variable.name.toLowerCase().includes(q) ||
        b.assetCatProperties.toLowerCase().includes(q)
      );
    });

    const outcomeAssetCats: AssetCategoryId[] = ['characters', 'objects'];
    const assetGroups = outcomeAssetCats
      .map((cat) => {
        const label = categoryLabel(cat);
        const matchCat = q.length > 0 && label.toLowerCase().includes(q);
        const items = assetItems.filter((a) => {
          if (a.categoryId !== cat) return false;
          if (!q || matchCat) return true;
          return a.name.toLowerCase().includes(q);
        });
        return { key: cat, label, items };
      })
      .filter((g) => g.items.length > 0);

    return { varItems, assetGroups };
  }, [assetItems, b.assetCatProperties, scopedVariables, targetQuery, lang]);

  // 1. NARRATION — direct narration text input
  if (node.kind === 'narration') {
    return (
      <div onPointerDown={(e) => e.stopPropagation()} className="px-3 py-2.5">
        <textarea
          ref={(el) => {
            firstInputRef.current = el;
          }}
          rows={3}
          value={node.note}
          onChange={(e) => onUpdateNode(node.id, { note: e.target.value })}
          placeholder={b.narrationPlaceholder}
          className="w-full text-[12px] leading-relaxed text-[#14244B] placeholder:text-[#94A3B8] bg-white/70 border border-black/10 focus:border-[#F59E0B] focus:bg-white rounded-lg px-2.5 py-1.5 resize-none focus:outline-none transition-colors"
        />
      </div>
    );
  }

  // 2. DIALOGUE — speaker picker (auto-binds Character asset) + dialogue text input
  if (node.kind === 'dialogue') {
    const currentSpeakerAsset = characters.find(
      (c) => c.name.trim().toLowerCase() === node.title.trim().toLowerCase(),
    );

    return (
      <div onPointerDown={(e) => e.stopPropagation()} className="px-3 py-2.5 space-y-2">
        {/* Speaker Name Picker */}
        <div ref={speakerRef} className="relative">
          <button
            type="button"
            onClick={() => setSpeakerOpen((v) => !v)}
            className="w-full px-2.5 py-1.5 rounded-lg bg-white/85 border border-black/10 hover:border-[#F43F5E]/60 text-[11px] flex items-center justify-between gap-2 transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-normal text-[#94A3B8] shrink-0">
                {b.speakerLabel}
              </span>
              {currentSpeakerAsset && renderMiniAssetThumb(currentSpeakerAsset)}
              <span
                className={`truncate ${
                  node.title.trim() ? 'font-semibold text-[#14244B]' : 'text-[#94A3B8]'
                }`}
              >
                {node.title.trim() || b.speakerPlaceholder}
              </span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[#64748B] shrink-0" aria-hidden="true" />
          </button>

          {speakerOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 z-[60] bg-white rounded-xl border border-[#CBD5E1] shadow-[0_14px_34px_rgba(15,23,42,0.16)] overflow-hidden">
              <div className="p-1.5 border-b border-[#F1F5F9]">
                <input
                  type="text"
                  autoFocus
                  value={speakerQuery}
                  onChange={(e) => setSpeakerQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && speakerQuery.trim()) {
                      e.preventDefault();
                      const match = characters.find(
                        (c) => c.name.toLowerCase() === speakerQuery.trim().toLowerCase(),
                      );
                      onUpdateNode(node.id, {
                        title: match ? match.name : speakerQuery.trim(),
                        assetIds: match
                          ? swapSlotAsset(currentSpeakerAsset?.id, match.id)
                          : getNodeAssetIds(node),
                      });
                      setSpeakerOpen(false);
                      setSpeakerQuery('');
                    }
                  }}
                  placeholder={b.speakerCustomPlaceholder}
                  className="w-full px-2 py-1 text-[11px] text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white focus:border-[#F43F5E]"
                />
              </div>

              <div className="max-h-40 overflow-y-auto py-1">
                <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-normal text-[#64748B]">
                  {b.assetCatCharacters}
                </div>
                {filteredSpeakers.map((char) => {
                  const selected = node.title.trim() === char.name;
                  return (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => {
                        onUpdateNode(node.id, {
                          title: char.name,
                          assetIds: swapSlotAsset(currentSpeakerAsset?.id, char.id),
                        });
                        setSpeakerOpen(false);
                        setSpeakerQuery('');
                      }}
                      className={`w-full px-2.5 py-1.5 text-left text-[11px] flex items-center justify-between gap-2 cursor-pointer ${
                        selected
                          ? 'bg-[#FFF1F2] text-[#BE123C] font-semibold'
                          : 'text-[#334155] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        {renderMiniAssetThumb(char)}
                        <span className="truncate">{char.name}</span>
                      </span>
                      {selected && <Check className="w-3 h-3 shrink-0" />}
                    </button>
                  );
                })}
                {speakerQuery.trim() &&
                  !filteredSpeakers.some(
                    (c) => c.name.toLowerCase() === speakerQuery.trim().toLowerCase(),
                  ) && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateNode(node.id, { title: speakerQuery.trim() });
                        setSpeakerOpen(false);
                        setSpeakerQuery('');
                      }}
                      className="w-full px-2.5 py-1.5 text-left text-[11px] text-[#BE123C] hover:bg-[#FFF1F2] font-medium cursor-pointer"
                    >
                      + “{speakerQuery.trim()}”
                    </button>
                  )}
              </div>
            </div>
          )}
        </div>

        {/* Dialogue Line Textbox */}
        <textarea
          ref={(el) => {
            firstInputRef.current = el;
          }}
          rows={2}
          value={node.note}
          onChange={(e) => onUpdateNode(node.id, { note: e.target.value })}
          placeholder={b.dialoguePlaceholder}
          className="w-full text-[12px] leading-relaxed text-[#14244B] placeholder:text-[#94A3B8] bg-white/75 border border-black/10 focus:border-[#F43F5E] focus:bg-white rounded-lg px-2.5 py-1.5 resize-none focus:outline-none transition-colors"
        />
      </div>
    );
  }

  // 3. CHALLENGE — guiding question + 2 switchable fill-in templates (with Asset Pickers!) OR custom text
  if (node.kind === 'challenge') {
    const isCustom = prompt.mode === 'custom';
    const tpl = prompt.challengeTemplate ?? 'obstacle-action';

    return (
      <div onPointerDown={(e) => e.stopPropagation()} className="px-3 py-2.5 space-y-2">
        <p className="text-[11px] font-medium text-[#3730A3] leading-snug">
          {b.challengeQuestion}
        </p>

        {/* Template / Custom Mode Switcher */}
        <div className="flex items-center gap-1 p-0.5 bg-white/70 rounded-lg border border-[#C7D2FE]">
          <button
            type="button"
            onClick={() => patchPrompt({ mode: 'template', challengeTemplate: 'obstacle-action' })}
            className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
              !isCustom && tpl === 'obstacle-action'
                ? 'bg-[#4338CA] text-white'
                : 'text-[#4338CA]/80 hover:text-[#312E81]'
            }`}
          >
            {b.challengeTplObstacle}
          </button>
          <button
            type="button"
            onClick={() => patchPrompt({ mode: 'template', challengeTemplate: 'scene-limit' })}
            className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-semibold transition-colors whitespace-nowrap truncate cursor-pointer ${
              !isCustom && tpl === 'scene-limit'
                ? 'bg-[#4338CA] text-white'
                : 'text-[#4338CA]/80 hover:text-[#312E81]'
            }`}
          >
            {b.challengeTplScene}
          </button>
          <button
            type="button"
            onClick={() => patchPrompt({ mode: 'custom' })}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isCustom
                ? 'bg-[#4338CA] text-white'
                : 'text-[#4338CA]/80 hover:text-[#312E81]'
            }`}
          >
            {b.modeCustom}
          </button>
        </div>

        {isCustom ? (
          <textarea
            ref={(el) => {
              firstInputRef.current = el;
            }}
            rows={2}
            value={node.note}
            onChange={(e) => onUpdateNode(node.id, { note: e.target.value })}
            placeholder={b.challengeCustomPh}
            className="w-full text-[12px] leading-relaxed text-[#14244B] placeholder:text-[#94A3B8] bg-white/85 border border-[#C7D2FE] focus:border-[#6366F1] rounded-lg px-2.5 py-1.5 resize-none focus:outline-none"
          />
        ) : tpl === 'obstacle-action' ? (
          <div className="space-y-1.5">
            {/* Searchable Obstacle Asset Picker (Objects & Characters only) */}
            <FrontAssetPicker
              lang={lang}
              assetItems={assetItems}
              preferredCategories={['objects', 'characters']}
              restrictToCategories={['objects', 'characters']}
              valueLabel={prompt.obstacle ?? ''}
              selectedAssetId={prompt.obstacleAssetId}
              placeholder={b.challengeObstaclePh}
              accentBorderClass="border-[#C7D2FE] hover:border-[#6366F1]"
              accentFocusBorderClass="focus:border-[#6366F1]"
              accentRowHoverClass="hover:bg-[#EEF2FF]"
              accentTextClass="text-[#4338CA]"
              allowClear
              onSelectAsset={(asset) => {
                onUpdateNode(node.id, {
                  promptInput: {
                    ...prompt,
                    mode: 'template',
                    challengeTemplate: 'obstacle-action',
                    obstacle: asset.name,
                    obstacleAssetId: asset.id,
                  },
                  assetIds: swapSlotAsset(prompt.obstacleAssetId, asset.id),
                });
              }}
              onSelectCustom={(text) => {
                onUpdateNode(node.id, {
                  promptInput: {
                    ...prompt,
                    mode: 'template',
                    challengeTemplate: 'obstacle-action',
                    obstacle: text,
                    obstacleAssetId: undefined,
                  },
                  assetIds: swapSlotAsset(prompt.obstacleAssetId, undefined),
                });
              }}
              onClear={() => {
                onUpdateNode(node.id, {
                  promptInput: {
                    ...prompt,
                    obstacle: '',
                    obstacleAssetId: undefined,
                  },
                  assetIds: swapSlotAsset(prompt.obstacleAssetId, undefined),
                });
              }}
            />

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#4338CA] shrink-0">
                {b.challengeIsWord}
              </span>
              <input
                ref={(el) => {
                  firstInputRef.current = el;
                }}
                type="text"
                value={prompt.obstacleAction ?? ''}
                onChange={(e) => patchPrompt({ obstacleAction: e.target.value })}
                placeholder={b.challengeDoingPh}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] font-medium text-[#14244B] placeholder:text-[#94A3B8] bg-white border border-[#C7D2FE] focus:border-[#6366F1] rounded-lg focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* Searchable Scene Asset Picker (Scenes only) */}
            <FrontAssetPicker
              lang={lang}
              assetItems={assetItems}
              preferredCategories={['backgrounds']}
              restrictToCategories={['backgrounds']}
              valueLabel={prompt.sceneName ?? ''}
              selectedAssetId={prompt.sceneAssetId}
              placeholder={b.challengeScenePh}
              accentBorderClass="border-[#C7D2FE] hover:border-[#6366F1]"
              accentFocusBorderClass="focus:border-[#6366F1]"
              accentRowHoverClass="hover:bg-[#EEF2FF]"
              accentTextClass="text-[#4338CA]"
              allowClear
              onSelectAsset={(asset) => {
                onUpdateNode(node.id, {
                  promptInput: {
                    ...prompt,
                    mode: 'template',
                    challengeTemplate: 'scene-limit',
                    sceneName: asset.name,
                    sceneAssetId: asset.id,
                  },
                  assetIds: swapSlotAsset(prompt.sceneAssetId, asset.id),
                });
              }}
              onSelectCustom={(text) => {
                onUpdateNode(node.id, {
                  promptInput: {
                    ...prompt,
                    mode: 'template',
                    challengeTemplate: 'scene-limit',
                    sceneName: text,
                    sceneAssetId: undefined,
                  },
                  assetIds: swapSlotAsset(prompt.sceneAssetId, undefined),
                });
              }}
              onClear={() => {
                onUpdateNode(node.id, {
                  promptInput: {
                    ...prompt,
                    sceneName: '',
                    sceneAssetId: undefined,
                  },
                  assetIds: swapSlotAsset(prompt.sceneAssetId, undefined),
                });
              }}
            />

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#4338CA] shrink-0">
                {b.challengeHasWord}
              </span>
              <input
                ref={(el) => {
                  firstInputRef.current = el;
                }}
                type="text"
                value={prompt.sceneLimit ?? ''}
                onChange={(e) => patchPrompt({ sceneLimit: e.target.value })}
                placeholder={b.challengeLimitPh}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] font-medium text-[#14244B] placeholder:text-[#94A3B8] bg-white border border-[#C7D2FE] focus:border-[#6366F1] rounded-lg focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // 4. ACTION — guiding question + searchable [Character optional] picker + [concrete move] OR custom text
  if (node.kind === 'action') {
    const isCustom = prompt.mode === 'custom';

    return (
      <div onPointerDown={(e) => e.stopPropagation()} className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-[#0369A1] leading-snug">
            {b.actionQuestion}
          </p>
          <button
            type="button"
            onClick={() => patchPrompt({ mode: isCustom ? 'template' : 'custom' })}
            className="text-[10px] font-semibold text-[#0369A1] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isCustom ? b.modeTemplate : b.modeCustom}
          </button>
        </div>

        {isCustom ? (
          <textarea
            ref={(el) => {
              firstInputRef.current = el;
            }}
            rows={2}
            value={node.note}
            onChange={(e) => onUpdateNode(node.id, { note: e.target.value })}
            placeholder={b.actionCustomPh}
            className="w-full text-[12px] leading-relaxed text-[#14244B] placeholder:text-[#94A3B8] bg-white/85 border border-[#BAE6FD] focus:border-[#0EA5E9] rounded-lg px-2.5 py-1.5 resize-none focus:outline-none"
          />
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[#0369A1] shrink-0">{b.actionPrefix}</span>
              <FrontAssetPicker
                lang={lang}
                assetItems={assetItems}
                preferredCategories={['characters']}
                restrictToCategories={['characters']}
                valueLabel={prompt.actorName ?? ''}
                selectedAssetId={prompt.actorAssetId}
                placeholder={b.actionActorPh}
                accentBorderClass="border-[#BAE6FD] hover:border-[#0EA5E9]"
                accentFocusBorderClass="focus:border-[#0EA5E9]"
                accentRowHoverClass="hover:bg-[#F0F9FF]"
                accentTextClass="text-[#0369A1]"
                allowClear
                onSelectAsset={(asset) => {
                  onUpdateNode(node.id, {
                    promptInput: {
                      ...prompt,
                      mode: 'template',
                      actorName: asset.name,
                      actorAssetId: asset.id,
                    },
                    assetIds: swapSlotAsset(prompt.actorAssetId, asset.id),
                  });
                }}
                onSelectCustom={(text) => {
                  onUpdateNode(node.id, {
                    promptInput: {
                      ...prompt,
                      mode: 'template',
                      actorName: text,
                      actorAssetId: undefined,
                    },
                    assetIds: swapSlotAsset(prompt.actorAssetId, undefined),
                  });
                }}
                onClear={() => {
                  onUpdateNode(node.id, {
                    promptInput: {
                      ...prompt,
                      actorName: '',
                      actorAssetId: undefined,
                    },
                    assetIds: swapSlotAsset(prompt.actorAssetId, undefined),
                  });
                }}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[#0369A1] shrink-0">{b.actionToWord}</span>
              <input
                ref={(el) => {
                  firstInputRef.current = el;
                }}
                type="text"
                value={prompt.playerAction ?? ''}
                onChange={(e) => patchPrompt({ playerAction: e.target.value })}
                placeholder={b.actionVerbPh}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] font-medium text-[#14244B] placeholder:text-[#94A3B8] bg-white border border-[#BAE6FD] focus:border-[#0EA5E9] rounded-lg focus:outline-none"
              />
            </div>

            <p className="text-[10px] text-[#64748B] leading-snug">{b.actionConcreteHint}</p>
          </div>
        )}
      </div>
    );
  }

  // 5. OUTCOME — guiding question + searchable Asset/Property target picker + change input OR custom text
  if (node.kind === 'outcome') {
    const isCustom = prompt.mode === 'custom';
    const prevTargetAssetId =
      prompt.outcomeTargetKind === 'asset'
        ? prompt.outcomeTargetRef
        : prompt.outcomeTargetKind === 'variable'
          ? scopedVariables.find((v) => v.variable.id === prompt.outcomeTargetRef)?.assetId
          : undefined;

    const selectOutcomeVariable = (entry: ScopedStateVariable) => {
      onUpdateNode(node.id, {
        promptInput: {
          ...prompt,
          mode: 'template',
          outcomeTargetLabel: entry.fullKey,
          outcomeTargetKind: 'variable',
          outcomeTargetRef: entry.variable.id,
        },
        assetIds: swapSlotAsset(prevTargetAssetId, entry.assetId),
      });
      setTargetOpen(false);
      setTargetQuery('');
    };

    const selectOutcomeAsset = (asset: AssetItem) => {
      onUpdateNode(node.id, {
        promptInput: {
          ...prompt,
          mode: 'template',
          outcomeTargetLabel: asset.name,
          outcomeTargetKind: 'asset',
          outcomeTargetRef: asset.id,
        },
        assetIds: swapSlotAsset(prevTargetAssetId, asset.id),
      });
      setTargetOpen(false);
      setTargetQuery('');
    };

    const selectedOutcomeAsset =
      prompt.outcomeTargetKind === 'asset' && prompt.outcomeTargetRef
        ? assetItems.find((a) => a.id === prompt.outcomeTargetRef)
        : undefined;

    return (
      <div onPointerDown={(e) => e.stopPropagation()} className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-[#047857] leading-snug">
            {b.outcomeQuestion}
          </p>
          <button
            type="button"
            onClick={() => patchPrompt({ mode: isCustom ? 'template' : 'custom' })}
            className="text-[10px] font-semibold text-[#047857] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isCustom ? b.modeTemplate : b.modeCustom}
          </button>
        </div>

        {isCustom ? (
          <textarea
            ref={(el) => {
              firstInputRef.current = el;
            }}
            rows={2}
            value={node.note}
            onChange={(e) => onUpdateNode(node.id, { note: e.target.value })}
            placeholder={b.outcomeCustomPh}
            className="w-full text-[12px] leading-relaxed text-[#14244B] placeholder:text-[#94A3B8] bg-white/85 border border-[#A7F3D0] focus:border-[#10B981] rounded-lg px-2.5 py-1.5 resize-none focus:outline-none"
          />
        ) : (
          <div className="space-y-1.5">
            {/* Searchable Object / Property Target Picker */}
            <div ref={targetRef} className="relative">
              <div className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#A7F3D0] hover:border-[#10B981] text-[11px] flex items-center justify-between gap-1.5 transition-colors">
                <button
                  type="button"
                  onClick={() => setTargetOpen((v) => !v)}
                  className="flex-1 min-w-0 inline-flex items-center gap-1.5 text-left cursor-pointer"
                >
                  {selectedOutcomeAsset && renderMiniAssetThumb(selectedOutcomeAsset)}
                  <span
                    className={`truncate ${
                      prompt.outcomeTargetLabel?.trim()
                        ? 'font-semibold text-[#14244B]'
                        : 'text-[#94A3B8]'
                    }`}
                  >
                    {prompt.outcomeTargetLabel?.trim() || b.outcomeTargetPh}
                  </span>
                </button>
                {prompt.outcomeTargetLabel?.trim() && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateNode(node.id, {
                        promptInput: {
                          ...prompt,
                          outcomeTargetLabel: '',
                          outcomeTargetKind: undefined,
                          outcomeTargetRef: undefined,
                        },
                        assetIds: swapSlotAsset(prevTargetAssetId, undefined),
                      });
                    }}
                    aria-label="Clear target"
                    className="w-4 h-4 rounded text-[#94A3B8] hover:text-[#475569] hover:bg-black/5 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTargetOpen((v) => !v)}
                  aria-label="Toggle target options"
                  className="text-[#64748B] hover:text-[#14244B] flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${targetOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {targetOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-[60] bg-white rounded-xl border border-[#CBD5E1] shadow-[0_14px_34px_rgba(15,23,42,0.16)] overflow-hidden">
                  <div className="p-1.5 border-b border-[#F1F5F9]">
                    <div className="relative">
                      <Search
                        className="w-3 h-3 text-[#94A3B8] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        autoFocus
                        value={targetQuery}
                        onChange={(e) => setTargetQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && targetQuery.trim()) {
                            e.preventDefault();
                            onUpdateNode(node.id, {
                              promptInput: {
                                ...prompt,
                                outcomeTargetLabel: targetQuery.trim(),
                                outcomeTargetKind: 'custom',
                                outcomeTargetRef: undefined,
                              },
                              assetIds: swapSlotAsset(prevTargetAssetId, undefined),
                            });
                            setTargetOpen(false);
                            setTargetQuery('');
                          }
                        }}
                        placeholder={b.outcomeTargetPh}
                        className="w-full pl-6 pr-2 py-1 text-[11px] text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white focus:border-[#10B981]"
                      />
                    </div>
                  </div>

                  <div className="max-h-52 overflow-y-auto py-1">
                    {/* Group 1: Properties */}
                    {outcomeGroups.varItems.length > 0 && (
                      <div className="mb-1.5">
                        <div className="px-2.5 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-[#047857] bg-[#F8FAFC] border-y border-[#F1F5F9] first:border-t-0">
                          {b.assetCatProperties}
                        </div>
                        {outcomeGroups.varItems.map((entry) => {
                          const isSelected =
                            prompt.outcomeTargetKind === 'variable' &&
                            prompt.outcomeTargetRef === entry.variable.id;
                          return (
                            <button
                              key={entry.variable.id}
                              type="button"
                              onClick={() => selectOutcomeVariable(entry)}
                              className={`w-full px-2.5 py-1 text-left text-[11px] hover:bg-[#ECFDF5] flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? 'bg-[#ECFDF5] text-[#047857] font-semibold'
                                  : 'text-[#14244B]'
                              }`}
                            >
                              <span className="truncate font-medium">{entry.fullKey}</span>
                              <span className="inline-flex items-center gap-1 shrink-0">
                                <span className="text-[10px] font-normal text-[#64748B]">
                                  {entry.variable.type === 'number'
                                    ? s.typeNumber
                                    : entry.variable.type === 'boolean'
                                      ? s.typeBoolean
                                      : entry.variable.type === 'choice'
                                        ? s.typeChoice
                                        : s.typeText}
                                </span>
                                {isSelected && <Check className="w-3 h-3 text-[#047857]" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Group 2: Characters & Objects */}
                    {outcomeGroups.assetGroups.length > 0 && (
                      <div className="mb-1 last:mb-0">
                        <div className="px-2.5 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-[#334155] bg-[#F8FAFC] border-y border-[#F1F5F9] first:border-t-0">
                          {lang === 'zh' ? '角色与物品' : 'Characters & Objects'}
                        </div>
                        {outcomeGroups.assetGroups.map((group) => (
                          <div key={group.key} className="mb-1 last:mb-0">
                            <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-normal text-[#64748B]">
                              {group.label}
                            </div>
                            {group.items.map((asset) => {
                              const isSelected =
                                prompt.outcomeTargetKind === 'asset' &&
                                prompt.outcomeTargetRef === asset.id;
                              return (
                                <button
                                  key={asset.id}
                                  type="button"
                                  onClick={() => selectOutcomeAsset(asset)}
                                  className={`w-full px-2.5 py-1 text-left text-[11px] hover:bg-[#ECFDF5] flex items-center justify-between gap-1.5 cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#ECFDF5] text-[#047857] font-semibold'
                                      : 'text-[#334155]'
                                  }`}
                                >
                                  <span className="inline-flex items-center gap-1.5 min-w-0">
                                    {renderMiniAssetThumb(asset)}
                                    <span className="truncate">{asset.name}</span>
                                  </span>
                                  {isSelected && <Check className="w-3 h-3 shrink-0 text-[#047857]" />}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}

                    {targetQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateNode(node.id, {
                            promptInput: {
                              ...prompt,
                              outcomeTargetLabel: targetQuery.trim(),
                              outcomeTargetKind: 'custom',
                              outcomeTargetRef: undefined,
                            },
                            assetIds: swapSlotAsset(prevTargetAssetId, undefined),
                          });
                          setTargetOpen(false);
                          setTargetQuery('');
                        }}
                        className="w-full px-2.5 py-1.5 text-left text-[11px] text-[#047857] hover:bg-[#ECFDF5] font-medium cursor-pointer border-t border-[#F1F5F9]"
                      >
                        + “{targetQuery.trim()}”
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-[#047857] shrink-0">
                {b.outcomeWillWord}
              </span>
              <input
                ref={(el) => {
                  firstInputRef.current = el;
                }}
                type="text"
                value={prompt.outcomeChange ?? ''}
                onChange={(e) => patchPrompt({ outcomeChange: e.target.value })}
                placeholder={b.outcomeChangePh}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] font-medium text-[#14244B] placeholder:text-[#94A3B8] bg-white border border-[#A7F3D0] focus:border-[#10B981] rounded-lg focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
