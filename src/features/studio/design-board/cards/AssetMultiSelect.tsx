import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import {
  FIXED_ASSET_CATEGORIES,
  type AssetCategoryId,
  type AssetItem,
} from '../../asset-library/assetLibraryModel';
import { COPY, type Language } from '../../../../shared/i18n';

interface AssetMultiSelectProps {
  lang: Language;
  assetItems: AssetItem[];
  selectedIds: string[];
  preferredCategories?: AssetCategoryId[];
  onChange: (nextIds: string[]) => void;
}

const ALL_CATEGORIES: AssetCategoryId[] = [
  'characters',
  'objects',
  'backgrounds',
  'interface',
  'effects',
];

export function AssetMultiSelect({
  lang,
  assetItems,
  selectedIds,
  preferredCategories,
  onChange,
}: AssetMultiSelectProps) {
  const b = COPY[lang].studio.board;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      setQuery('');
    }
  }, [open]);

  const categoryLabel = (cat: AssetCategoryId): string => {
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
    if (!preferredCategories || preferredCategories.length === 0) return ALL_CATEGORIES;
    const prefSet = new Set(preferredCategories);
    return [
      ...preferredCategories,
      ...ALL_CATEGORIES.filter((c) => !prefSet.has(c)),
    ];
  }, [preferredCategories]);

  const selectedAssets = useMemo(
    () =>
      selectedIds
        .map((id) => assetItems.find((a) => a.id === id))
        .filter((a): a is AssetItem => Boolean(a)),
    [assetItems, selectedIds],
  );

  const groupedFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orderedCategories
      .map((cat) => {
        const catName = categoryLabel(cat);
        const matchesCat = q.length > 0 && catName.toLowerCase().includes(q);
        const items = assetItems.filter((a) => {
          if (a.categoryId !== cat) return false;
          if (!q || matchesCat) return true;
          return a.name.toLowerCase().includes(q);
        });
        return { categoryId: cat, label: catName, items };
      })
      .filter((g) => g.items.length > 0);
  }, [assetItems, orderedCategories, query, lang]);

  const toggleAsset = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const renderThumb = (asset: AssetItem) => {
    const activeState =
      asset.states.find((s) => s.id === asset.activeStateId) ?? asset.states[0];
    if (activeState?.mediaUrl && activeState.mediaKind !== 'video') {
      return (
        <img
          src={activeState.mediaUrl}
          alt={asset.name}
          referrerPolicy="no-referrer"
          className="w-4 h-4 rounded object-contain bg-white border border-[#E2E8F0] shrink-0"
        />
      );
    }
    const categoryAccent =
      FIXED_ASSET_CATEGORIES.find((c) => c.id === asset.categoryId)?.accentColor ??
      '#CBD5E1';
    return (
      <span
        aria-hidden="true"
        className="w-3.5 h-3.5 rounded-sm border border-black/10 shrink-0"
        style={{ backgroundColor: asset.typography?.textColor ?? categoryAccent }}
      />
    );
  };

  return (
    <div
      ref={rootRef}
      onPointerDown={(e) => e.stopPropagation()}
      className="relative space-y-1.5"
    >
      {/* Selected assets list */}
      {selectedAssets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedAssets.map((asset) => (
            <span
              key={asset.id}
              className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-md bg-white border border-[#CBD5E1] text-[11px] font-medium text-[#14244B] max-w-full"
            >
              {renderThumb(asset)}
              <span className="truncate max-w-[116px]">{asset.name}</span>
              <span className="text-[10px] font-normal text-[#94A3B8] shrink-0">
                · {categoryLabel(asset.categoryId)}
              </span>
              <button
                type="button"
                onClick={() => toggleAsset(asset.id)}
                aria-label={`Remove ${asset.name}`}
                className="w-4 h-4 rounded text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEE2E2] flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-2.5 h-2.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Picker Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#CBD5E1] hover:border-[#94A3B8] text-[11px] font-medium text-[#334155] flex items-center justify-between gap-2 transition-colors cursor-pointer"
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <Plus className="w-3 h-3 text-[#64748B] shrink-0" aria-hidden="true" />
          <span className="truncate">{b.assetBindAdd}</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#64748B] shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Searchable Categorized Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[60] bg-white rounded-xl border border-[#CBD5E1] shadow-[0_14px_34px_rgba(15,23,42,0.16)] overflow-hidden">
          <div className="p-2 border-b border-[#F1F5F9]">
            <div className="relative">
              <Search
                className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={b.assetSearchPh}
                className="w-full pl-7 pr-2.5 py-1.5 text-[11px] text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg focus:outline-none focus:bg-white focus:border-[#4E9AE3]"
              />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto py-1">
            {groupedFiltered.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-[#94A3B8]">
                {b.assetNoMatch}
              </div>
            ) : (
              groupedFiltered.map((group) => (
                <div key={group.categoryId} className="mb-1 last:mb-0">
                  {/* Unbolded category header preserved during search */}
                  <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-normal text-[#64748B] select-none">
                    {group.label}
                  </div>
                  {group.items.map((asset) => {
                    const checked = selectedIds.includes(asset.id);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => toggleAsset(asset.id)}
                        className={`w-full px-2.5 py-1.5 text-left text-[11px] flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          checked
                            ? 'bg-[#EFF6FF] text-[#14244B] font-semibold'
                            : 'text-[#334155] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          {renderThumb(asset)}
                          <span className="truncate">{asset.name}</span>
                        </span>
                        {checked && (
                          <Check className="w-3.5 h-3.5 text-[#2563EB] shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
