import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { AssetCategoryId } from '../asset-library/assetLibraryModel';
import { COPY, type Language } from '../../../shared/i18n';
import {
  clampNumberValue,
  createStateVariableId,
  type StateVariable,
  type StateVariableType,
  type StateVariableValue,
} from './stateModel';
import { ScopeCombobox } from './ScopeCombobox';

export type PropertyTargetScope =
  | { scope: 'global' }
  | { scope: 'asset'; assetId: string };

interface PropertyEditorModalProps {
  lang: Language;
  scopeLabel: string;
  initialVariable?: StateVariable | null;
  existingNames: string[];
  allowScopeSelect?: boolean;
  initialScopeKey?: string;
  assetOptions?: { id: string; name: string; categoryId: AssetCategoryId }[];
  existingNamesByScope?: Record<string, string[]>;
  onSave: (variable: StateVariable, targetScope: PropertyTargetScope) => void;
  onClose: () => void;
}

const VARIABLE_TYPES: StateVariableType[] = ['number', 'boolean', 'text', 'choice'];

export function PropertyEditorModal({
  lang,
  scopeLabel,
  initialVariable,
  existingNames,
  allowScopeSelect = false,
  initialScopeKey = 'global',
  assetOptions = [],
  existingNamesByScope,
  onSave,
  onClose,
}: PropertyEditorModalProps) {
  const s = COPY[lang].studio.states;
  const isEditing = Boolean(initialVariable);

  const [selectedScopeKey, setSelectedScopeKey] = useState<string>(initialScopeKey);
  const [name, setName] = useState(initialVariable?.name ?? '');
  const [type, setType] = useState<StateVariableType>(initialVariable?.type ?? 'number');

  const resolvedScopeLabel = useMemo(() => {
    if (!allowScopeSelect) return scopeLabel;
    if (selectedScopeKey === 'global') return s.scopeGlobal;
    return assetOptions.find((a) => a.id === selectedScopeKey)?.name ?? scopeLabel;
  }, [allowScopeSelect, assetOptions, s.scopeGlobal, scopeLabel, selectedScopeKey]);

  // Number state
  const [numInitial, setNumInitial] = useState<string>(() =>
    initialVariable?.type === 'number' ? String(initialVariable.initialValue) : '0',
  );
  const [hasMin, setHasMin] = useState<boolean>(Boolean(initialVariable?.hasMin));
  const [minStr, setMinStr] = useState<string>(() =>
    initialVariable?.hasMin && typeof initialVariable.minValue === 'number'
      ? String(initialVariable.minValue)
      : '0',
  );
  const [hasMax, setHasMax] = useState<boolean>(Boolean(initialVariable?.hasMax));
  const [maxStr, setMaxStr] = useState<string>(() =>
    initialVariable?.hasMax && typeof initialVariable.maxValue === 'number'
      ? String(initialVariable.maxValue)
      : '100',
  );

  // Boolean state
  const [boolInitial, setBoolInitial] = useState<boolean>(() =>
    initialVariable?.type === 'boolean' ? Boolean(initialVariable.initialValue) : false,
  );

  // Text state
  const [textInitial, setTextInitial] = useState<string>(() =>
    initialVariable?.type === 'text' ? String(initialVariable.initialValue ?? '') : '',
  );

  // Choice state
  const [choices, setChoices] = useState<string[]>(() => {
    if (initialVariable?.type === 'choice' && initialVariable.options?.length) {
      return [...initialVariable.options];
    }
    return lang === 'zh' ? ['选项一', '选项二'] : ['Option 1', 'Option 2'];
  });
  const [choiceDraft, setChoiceDraft] = useState('');
  const [choiceInitial, setChoiceInitial] = useState<string>(() => {
    if (initialVariable?.type === 'choice') {
      return String(initialVariable.initialValue ?? '');
    }
    return lang === 'zh' ? '选项一' : 'Option 1';
  });
  const [choiceOrdered, setChoiceOrdered] = useState<boolean>(
    Boolean(initialVariable?.ordered),
  );

  const [description, setDescription] = useState(initialVariable?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (type === 'choice' && choices.length > 0 && !choices.includes(choiceInitial)) {
      setChoiceInitial(choices[0]);
    }
  }, [type, choices, choiceInitial]);

  const handleAddChoice = () => {
    const trimmed = choiceDraft.trim();
    if (!trimmed) return;
    if (!choices.includes(trimmed)) {
      const next = [...choices, trimmed];
      setChoices(next);
      if (!choiceInitial) setChoiceInitial(trimmed);
    }
    setChoiceDraft('');
    setError(null);
  };

  const handleRemoveChoice = (opt: string) => {
    const next = choices.filter((c) => c !== opt);
    setChoices(next);
    if (choiceInitial === opt) {
      setChoiceInitial(next[0] ?? '');
    }
  };

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(s.errEmptyName);
      return;
    }

    const lower = trimmedName.toLowerCase();
    const activeExistingNames =
      allowScopeSelect && existingNamesByScope
        ? (existingNamesByScope[selectedScopeKey] ?? [])
        : existingNames;
    const isSameScopeAsInitial =
      !allowScopeSelect || selectedScopeKey === initialScopeKey;
    const conflict = activeExistingNames.some(
      (n) =>
        n.trim().toLowerCase() === lower &&
        (!initialVariable ||
          !isSameScopeAsInitial ||
          n.trim().toLowerCase() !== initialVariable.name.trim().toLowerCase()),
    );
    if (conflict) {
      setError(s.errDuplicateName);
      return;
    }

    let finalInitial: StateVariableValue = 0;
    let finalHasMin: boolean | undefined;
    let finalMin: number | undefined;
    let finalHasMax: boolean | undefined;
    let finalMax: number | undefined;
    let finalOptions: string[] | undefined;

    if (type === 'number') {
      const parsedMin = hasMin ? Number(minStr) : undefined;
      const parsedMax = hasMax ? Number(maxStr) : undefined;
      const cleanMin =
        hasMin && parsedMin !== undefined && Number.isFinite(parsedMin)
          ? parsedMin
          : 0;
      const cleanMax =
        hasMax && parsedMax !== undefined && Number.isFinite(parsedMax)
          ? parsedMax
          : 100;

      if (hasMin && hasMax && cleanMin > cleanMax) {
        setError(s.errMinMax);
        return;
      }

      finalHasMin = hasMin;
      finalMin = hasMin ? cleanMin : undefined;
      finalHasMax = hasMax;
      finalMax = hasMax ? cleanMax : undefined;

      const parsedInit = Number(numInitial);
      finalInitial = clampNumberValue(Number.isFinite(parsedInit) ? parsedInit : 0, {
        hasMin: finalHasMin,
        minValue: finalMin,
        hasMax: finalHasMax,
        maxValue: finalMax,
      });
    } else if (type === 'boolean') {
      finalInitial = boolInitial;
    } else if (type === 'text') {
      finalInitial = textInitial;
    } else {
      if (choices.length === 0) {
        setError(s.errNoChoices);
        return;
      }
      finalOptions = choices;
      finalInitial = choices.includes(choiceInitial) ? choiceInitial : choices[0];
    }

    const result: StateVariable = {
      id: initialVariable?.id ?? createStateVariableId(),
      name: trimmedName,
      type,
      initialValue: finalInitial,
      hasMin: finalHasMin,
      minValue: finalMin,
      hasMax: finalHasMax,
      maxValue: finalMax,
      options: finalOptions,
      ordered: type === 'choice' ? choiceOrdered : undefined,
      description: description.trim() || undefined,
    };

    const targetScope: PropertyTargetScope =
      !allowScopeSelect || selectedScopeKey === 'global'
        ? { scope: 'global' }
        : { scope: 'asset', assetId: selectedScopeKey };

    onSave(result, targetScope);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? s.modalEditTitle : s.modalAddTitle}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] bg-[#0F172A]/35 backdrop-blur-[1px] flex items-center justify-center p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[440px] bg-white rounded-2xl border border-[#CBD5E1] shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#14244B] text-white rounded-t-[15px] flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <h3 className="font-display text-sm font-bold truncate">
              {isEditing ? s.modalEditTitle : s.modalAddTitle}
            </h3>
            <span className="text-xs text-white/70 truncate">· {resolvedScopeLabel}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={s.cancelBtn}
            className="w-7 h-7 rounded-lg text-white/75 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body — Clean Construct-inspired aligned grid */}
        <div className="p-5 space-y-4">
          {/* Optional 0. Belongs to (Searchable Global or specific Asset picker) */}
          {allowScopeSelect && (
            <div className="grid grid-cols-[106px_1fr] items-center gap-3">
              <label
                htmlFor="prop-scope-select"
                className="text-xs font-semibold text-[#334155] text-right"
              >
                {s.fieldScope}
              </label>
              <ScopeCombobox
                id="prop-scope-select"
                lang={lang}
                value={selectedScopeKey}
                assetOptions={assetOptions}
                variant="form"
                ariaLabel={s.fieldScope}
                onChange={(next) => {
                  setSelectedScopeKey(next);
                  setError(null);
                }}
              />
            </div>
          )}

          {/* 1. Name */}
          <div className="grid grid-cols-[106px_1fr] items-center gap-3">
            <label
              htmlFor="prop-name-input"
              className="text-xs font-semibold text-[#334155] text-right"
            >
              {s.fieldName}
            </label>
            <input
              id="prop-name-input"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder={s.fieldNamePlaceholder}
              className="w-full px-3 py-2 text-xs font-medium text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:bg-white focus:border-[#4E9AE3] focus:ring-2 focus:ring-[#4E9AE3]/20 transition-all"
            />
          </div>

          {/* 2. Type */}
          <div className="grid grid-cols-[106px_1fr] items-center gap-3">
            <span className="text-xs font-semibold text-[#334155] text-right">
              {s.fieldType}
            </span>
            <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0]">
              {VARIABLE_TYPES.map((vt) => (
                <button
                  key={vt}
                  type="button"
                  onClick={() => {
                    setType(vt);
                    setError(null);
                  }}
                  className={`py-1.5 px-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    type === vt
                      ? 'bg-white text-[#14244B] shadow-xs'
                      : 'text-[#64748B] hover:text-[#14244B]'
                  }`}
                >
                  {typeLabel(vt)}
                </button>
              ))}
            </div>
          </div>

          {/* Choice-only Options Builder */}
          {type === 'choice' && (
            <div className="grid grid-cols-[106px_1fr] items-start gap-3">
              <span className="text-xs font-semibold text-[#334155] text-right pt-2">
                {s.choicesLabel}
              </span>
              <div className="space-y-2 min-w-0">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={choiceDraft}
                    onChange={(e) => setChoiceDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddChoice();
                      }
                    }}
                    placeholder={s.choicePlaceholder}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:bg-white focus:border-[#4E9AE3]"
                  />
                  <button
                    type="button"
                    onClick={handleAddChoice}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] text-xs font-semibold text-[#14244B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{s.addChoiceBtn}</span>
                  </button>
                </div>

                {choices.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {choices.map((opt) => (
                      <span
                        key={opt}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-md bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-[#14244B]"
                      >
                        <span className="max-w-[140px] truncate">{opt}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveChoice(opt)}
                          aria-label={`Remove ${opt}`}
                          className="w-4 h-4 rounded text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEE2E2] flex items-center justify-center cursor-pointer"
                        >
                          <X className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <label className="inline-flex items-center gap-2 pt-0.5 text-[11px] font-medium text-[#334155] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={choiceOrdered}
                    onChange={(e) => setChoiceOrdered(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-[#14244B] cursor-pointer"
                  />
                  <span>{s.choiceOrderedLabel}</span>
                </label>
              </div>
            </div>
          )}

          {/* 3. Initial value */}
          <div className="grid grid-cols-[106px_1fr] items-center gap-3">
            <label
              htmlFor="prop-initial-input"
              className="text-xs font-semibold text-[#334155] text-right"
            >
              {s.fieldInitial}
            </label>

            {type === 'number' && (
              <input
                id="prop-initial-input"
                type="number"
                step="any"
                value={numInitial}
                onChange={(e) => {
                  setNumInitial(e.target.value);
                  setError(null);
                }}
                className="w-full px-3 py-2 font-mono tabular-nums text-xs font-semibold text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:bg-white focus:border-[#4E9AE3]"
              />
            )}

            {type === 'boolean' && (
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setBoolInitial(true)}
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    boolInitial
                      ? 'bg-white text-[#047857] shadow-xs'
                      : 'text-[#64748B] hover:text-[#14244B]'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{s.boolTrue}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBoolInitial(false)}
                  className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    !boolInitial
                      ? 'bg-white text-[#475569] shadow-xs'
                      : 'text-[#64748B] hover:text-[#14244B]'
                  }`}
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{s.boolFalse}</span>
                </button>
              </div>
            )}

            {type === 'text' && (
              <input
                id="prop-initial-input"
                type="text"
                value={textInitial}
                onChange={(e) => setTextInitial(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:bg-white focus:border-[#4E9AE3]"
              />
            )}

            {type === 'choice' && (
              <select
                id="prop-initial-input"
                value={choiceInitial}
                onChange={(e) => setChoiceInitial(e.target.value)}
                disabled={choices.length === 0}
                className="w-full px-3 py-2 text-xs font-medium text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:bg-white focus:border-[#4E9AE3]"
              >
                {choices.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Number-only Optional Min & Max Checkboxes (revealed ONLY when ticked!) */}
          {type === 'number' && (
            <div className="grid grid-cols-[106px_1fr] items-start gap-3">
              <span aria-hidden="true" />
              <div className="space-y-2 pt-0.5">
                <div className="flex items-center gap-2.5 min-h-[32px]">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-[#334155] cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={hasMin}
                      onChange={(e) => {
                        setHasMin(e.target.checked);
                        setError(null);
                      }}
                      className="w-3.5 h-3.5 rounded accent-[#14244B] cursor-pointer"
                    />
                    <span>{s.enableMin}</span>
                  </label>
                  {hasMin && (
                    <input
                      type="number"
                      step="any"
                      value={minStr}
                      onChange={(e) => {
                        setMinStr(e.target.value);
                        setError(null);
                      }}
                      placeholder={s.minPlaceholder}
                      aria-label={s.enableMin}
                      className="w-24 px-2.5 py-1 font-mono tabular-nums text-xs font-semibold text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:bg-white focus:border-[#4E9AE3]"
                    />
                  )}
                </div>

                <div className="flex items-center gap-2.5 min-h-[32px]">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-[#334155] cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={hasMax}
                      onChange={(e) => {
                        setHasMax(e.target.checked);
                        setError(null);
                      }}
                      className="w-3.5 h-3.5 rounded accent-[#14244B] cursor-pointer"
                    />
                    <span>{s.enableMax}</span>
                  </label>
                  {hasMax && (
                    <input
                      type="number"
                      step="any"
                      value={maxStr}
                      onChange={(e) => {
                        setMaxStr(e.target.value);
                        setError(null);
                      }}
                      placeholder={s.maxPlaceholder}
                      aria-label={s.enableMax}
                      className="w-24 px-2.5 py-1 font-mono tabular-nums text-xs font-semibold text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:bg-white focus:border-[#4E9AE3]"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 4. Description (optional) */}
          <div className="grid grid-cols-[106px_1fr] items-start gap-3">
            <label
              htmlFor="prop-desc-input"
              className="text-xs font-semibold text-[#334155] text-right pt-2 leading-snug"
            >
              {s.fieldDescription}
            </label>
            <textarea
              id="prop-desc-input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={s.fieldDescriptionPlaceholder}
              className="w-full px-3 py-2 text-xs text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg resize-none focus:outline-none focus:bg-white focus:border-[#4E9AE3]"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="px-3 py-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C]"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] rounded-b-[15px] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-xs font-semibold text-[#475569] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {s.cancelBtn}
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-[#14244B] hover:bg-[#1E3468] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {s.okBtn}
          </button>
        </div>
      </form>
    </div>
  );
}
