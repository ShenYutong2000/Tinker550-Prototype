import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { AssetCategoryId } from '../asset-library/assetLibraryModel';
import { COPY, type Language } from '../../../shared/i18n';

export interface ScopeAssetOption {
  id: string;
  name: string;
  categoryId: AssetCategoryId;
}

interface ScopeComboboxProps {
  lang: Language;
  value: string;
  assetOptions: ScopeAssetOption[];
  onChange: (nextValue: string) => void;
  variant?: 'compact' | 'form';
  align?: 'left' | 'right';
  ariaLabel?: string;
  id?: string;
}

export function ScopeCombobox({
  lang,
  value,
  assetOptions,
  onChange,
  variant = 'compact',
  align = 'left',
  ariaLabel,
  id,
}: ScopeComboboxProps) {
  const s = COPY[lang].studio.states;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  const selectedLabel = useMemo(() => {
    if (value === 'global') return s.scopeGlobal;
    return assetOptions.find((a) => a.id === value)?.name ?? s.scopeGlobal;
  }, [assetOptions, s.scopeGlobal, value]);

  const trimmedQuery = query.trim().toLowerCase();

  const showGlobal = useMemo(() => {
    if (!trimmedQuery) return true;
    return (
      s.scopeGlobal.toLowerCase().includes(trimmedQuery) ||
      'global'.includes(trimmedQuery) ||
      '全局'.includes(trimmedQuery)
    );
  }, [s.scopeGlobal, trimmedQuery]);

  const filteredGroups = useMemo(() => {
    const rawGroups: {
      cat: AssetCategoryId;
      label: string;
      searchAliases: string;
      items: ScopeAssetOption[];
    }[] = [
      {
        cat: 'characters',
        label: s.groupCharacters,
        searchAliases: 'characters 角色',
        items: assetOptions.filter((a) => a.categoryId === 'characters'),
      },
      {
        cat: 'objects',
        label: s.groupObjects,
        searchAliases: 'objects 物品',
        items: assetOptions.filter((a) => a.categoryId === 'objects'),
      },
      {
        cat: 'backgrounds',
        label: s.groupBackgrounds,
        searchAliases: 'scenes backgrounds 场景 背景',
        items: assetOptions.filter((a) => a.categoryId === 'backgrounds'),
      },
    ];

    return rawGroups
      .map((grp) => {
        if (!trimmedQuery) return grp;
        const categoryMatched =
          grp.label.toLowerCase().includes(trimmedQuery) ||
          grp.searchAliases.includes(trimmedQuery);
        const matchedItems = categoryMatched
          ? grp.items
          : grp.items.filter((item) => item.name.toLowerCase().includes(trimmedQuery));
        return { ...grp, items: matchedItems };
      })
      .filter((grp) => grp.items.length > 0);
  }, [
    assetOptions,
    s.groupBackgrounds,
    s.groupCharacters,
    s.groupObjects,
    trimmedQuery,
  ]);

  const flatSelectableIds = useMemo(() => {
    const ids: string[] = [];
    if (showGlobal) ids.push('global');
    for (const grp of filteredGroups) {
      for (const item of grp.items) {
        ids.push(item.id);
      }
    }
    return ids;
  }, [filteredGroups, showGlobal]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${variant === 'form' ? 'w-full' : 'inline-flex'}`}
    >
      <button
        id={id}
        type="button"
        aria-label={ariaLabel ?? s.fieldScope}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={
          variant === 'form'
            ? 'w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-[#14244B] bg-[#F8FAFC] hover:bg-white border border-[#CBD5E1] rounded-lg focus:outline-none focus:bg-white focus:border-[#4E9AE3] focus:ring-2 focus:ring-[#4E9AE3]/20 transition-all cursor-pointer'
            : 'inline-flex items-center justify-between gap-1.5 min-w-[104px] max-w-[152px] px-2.5 py-1.5 text-xs font-semibold text-[#334155] bg-[#F8FAFC] hover:bg-[#F1F5F9] border-r border-[#CBD5E1] focus:outline-none transition-colors cursor-pointer'
        }
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#64748B] shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute top-full mt-1.5 z-[80] bg-white rounded-xl border border-[#CBD5E1] shadow-[0_16px_38px_rgba(15,23,42,0.18)] overflow-hidden ${
            variant === 'form'
              ? 'left-0 right-0'
              : align === 'right'
                ? 'right-0 w-56'
                : 'left-0 w-56'
          }`}
        >
          {/* Live Search Input */}
          <div className="p-2 border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <div className="relative flex items-center">
              <Search
                className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (flatSelectableIds.length > 0) {
                      handleSelect(flatSelectableIds[0]);
                    }
                  }
                }}
                placeholder={s.scopeSearchPlaceholder}
                aria-label={s.scopeSearchPlaceholder}
                className="w-full pl-8 pr-7 py-1.5 text-xs text-[#14244B] bg-white border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#4E9AE3] placeholder:text-[#94A3B8]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-1.5 w-5 h-5 rounded text-[#94A3B8] hover:text-[#14244B] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Searchable Grouped Options (Categories stay visible during search, unbolded) */}
          <div className="max-h-56 overflow-y-auto p-1.5 space-y-1">
            {showGlobal && (
              <button
                type="button"
                role="option"
                aria-selected={value === 'global'}
                onClick={() => handleSelect('global')}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  value === 'global'
                    ? 'bg-[#F0F9FF] text-[#14244B] font-semibold'
                    : 'text-[#14244B] font-medium hover:bg-[#F1F5F9]'
                }`}
              >
                <span className="truncate">{s.scopeGlobal}</span>
                {value === 'global' && (
                  <Check className="w-3.5 h-3.5 text-[#0369A1] shrink-0" aria-hidden="true" />
                )}
              </button>
            )}

            {filteredGroups.map((grp) => (
              <div key={grp.cat} className="pt-1 first:pt-0">
                <div className="px-2.5 py-1 text-[11px] font-normal text-[#94A3B8] select-none">
                  {grp.label}
                </div>
                <div className="space-y-0.5">
                  {grp.items.map((item) => {
                    const isSelected = value === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(item.id)}
                        className={`w-full flex items-center justify-between gap-2 pl-4 pr-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#F0F9FF] text-[#14244B] font-semibold'
                            : 'text-[#14244B] font-medium hover:bg-[#F1F5F9]'
                        }`}
                      >
                        <span className="truncate">{item.name}</span>
                        {isSelected && (
                          <Check
                            className="w-3.5 h-3.5 text-[#0369A1] shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {!showGlobal && filteredGroups.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-[#94A3B8]">
                {s.scopeNoMatch}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
