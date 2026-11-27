import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Lock, Plus, Search, Trash2 } from 'lucide-react';
import { COPY, type Language } from '../../../../shared/i18n';
import {
  evaluateBooleanFormula,
  evaluateNumberFormula,
  formatVariableValue,
  type NumericFormulaSymbol,
  type ScopedStateVariable,
} from '../../properties/stateModel';
import {
  createOutcomeRuleId,
  type OutcomePropertyOp,
  type OutcomePropertyRule,
} from '../studioModel';

interface RelatedPropertiesEditorProps {
  lang: Language;
  rules: OutcomePropertyRule[];
  scopedVariables: ScopedStateVariable[];
  numericParameters: NumericFormulaSymbol[];
  onChange: (next: OutcomePropertyRule[]) => void;
  onEnableChoiceOrdering?: (entry: ScopedStateVariable) => void;
}

const NUMBER_OPS = ['+', '-', '*', '/', '(', ')'] as const;
const BOOLEAN_OPS = ['AND', 'OR', 'NOT', '>', '<', '>=', '<=', '==', '!=', '(', ')'] as const;

function defaultRuleForEntry(entry: ScopedStateVariable): OutcomePropertyRule {
  const { variable } = entry;
  if (variable.type === 'number') {
    return {
      id: createOutcomeRuleId(),
      variableId: variable.id,
      op: 'formula',
      formula: `${entry.fullKey} - 1`,
      numberValue: Number(variable.initialValue) || 0,
      randomMin: 1,
      randomMax: 5,
    };
  }
  if (variable.type === 'boolean') {
    return {
      id: createOutcomeRuleId(),
      variableId: variable.id,
      op: 'set',
      booleanValue: true,
      formula: entry.fullKey,
    };
  }
  if (variable.type === 'choice') {
    const first = variable.options?.[0] ?? String(variable.initialValue ?? '');
    return {
      id: createOutcomeRuleId(),
      variableId: variable.id,
      op: 'set',
      choiceValue: first,
      stepDirection: 'next',
      stepWrap: 'stay',
    };
  }
  return {
    id: createOutcomeRuleId(),
    variableId: variable.id,
    op: 'set',
    textValue: '',
  };
}

interface PropertyPickerProps {
  lang: Language;
  selectedVariableId: string;
  scopedVariables: ScopedStateVariable[];
  onSelect: (entry: ScopedStateVariable) => void;
}

function PropertyPicker({
  lang,
  selectedVariableId,
  scopedVariables,
  onSelect,
}: PropertyPickerProps) {
  const b = COPY[lang].studio.board;
  const s = COPY[lang].studio.states;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery('');
  }, [open]);

  const selected = scopedVariables.find((v) => v.variable.id === selectedVariableId);

  const typeLabel = (t: ScopedStateVariable['variable']['type']) => {
    if (t === 'number') return s.typeNumber;
    if (t === 'boolean') return s.typeBoolean;
    if (t === 'choice') return s.typeChoice;
    return s.typeText;
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const defs = [
      { key: 'global', label: s.groupGlobal },
      { key: 'characters', label: s.groupCharacters },
      { key: 'objects', label: s.groupObjects },
      { key: 'backgrounds', label: s.groupBackgrounds },
    ];
    return defs
      .map((g) => {
        const matchGroup = q.length > 0 && g.label.toLowerCase().includes(q);
        const items = scopedVariables.filter((v) => {
          const belongs =
            g.key === 'global'
              ? v.scope === 'global'
              : v.scope === 'asset' && v.assetCategoryId === g.key;
          if (!belongs) return false;
          if (!q || matchGroup) return true;
          return (
            v.fullKey.toLowerCase().includes(q) ||
            v.variable.name.toLowerCase().includes(q)
          );
        });
        return { ...g, items };
      })
      .filter((g) => g.items.length > 0);
  }, [query, s, scopedVariables]);

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2 py-1 rounded-md bg-white border border-[#CBD5E1] hover:border-[#94A3B8] text-[11px] flex items-center justify-between gap-1.5 cursor-pointer"
      >
        <span className="truncate font-semibold text-[#14244B]">
          {selected ? selected.fullKey : b.propPickTarget}
        </span>
        {selected && (
          <span className="text-[10px] font-normal text-[#64748B] shrink-0">
            · {typeLabel(selected.variable.type)}
          </span>
        )}
        <ChevronDown className="w-3 h-3 text-[#64748B] shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[65] bg-white rounded-xl border border-[#CBD5E1] shadow-[0_14px_34px_rgba(15,23,42,0.16)] overflow-hidden">
          <div className="p-1.5 border-b border-[#F1F5F9]">
            <div className="relative">
              <Search
                className="w-3 h-3 text-[#94A3B8] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={b.propSearchPh}
                className="w-full pl-6 pr-2 py-1 text-[11px] text-[#14244B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md focus:outline-none focus:bg-white focus:border-[#4E9AE3]"
              />
            </div>
          </div>

          <div className="max-h-44 overflow-y-auto py-1">
            {groups.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] text-[#94A3B8]">
                {b.assetNoMatch}
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.key} className="mb-1 last:mb-0">
                  <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-normal text-[#64748B]">
                    {group.label}
                  </div>
                  {group.items.map((entry) => {
                    const isSelected = entry.variable.id === selectedVariableId;
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
                            ? 'bg-[#EFF6FF] text-[#14244B] font-semibold'
                            : 'text-[#334155] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <span className="truncate">{entry.fullKey}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-normal text-[#64748B] shrink-0">
                          <span>{typeLabel(entry.variable.type)}</span>
                          {isSelected && <Check className="w-3 h-3 text-[#2563EB]" />}
                        </span>
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

export function RelatedPropertiesEditor({
  lang,
  rules,
  scopedVariables,
  numericParameters,
  onChange,
  onEnableChoiceOrdering,
}: RelatedPropertiesEditorProps) {
  const b = COPY[lang].studio.board;
  const s = COPY[lang].studio.states;

  const targets = useMemo(() => scopedVariables.filter(entry => !entry.variable.stageParameterId), [scopedVariables]);
  const numberTokens = useMemo(() => {
    const vars = scopedVariables
      .filter((v) => v.variable.type === 'number')
      .map((v) => ({ key: v.fullKey, label: v.fullKey }));
    const params = numericParameters.map((p) => ({ key: p.key, label: p.key }));
    return [...vars, ...params];
  }, [scopedVariables, numericParameters]);

  const booleanFormulaTokens = useMemo(() => {
    return scopedVariables
      .filter((v) => v.variable.type === 'boolean' || v.variable.type === 'number')
      .map((v) => ({ key: v.fullKey, type: v.variable.type }));
  }, [scopedVariables]);

  const updateRule = (id: string, patch: Partial<OutcomePropertyRule>) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const replaceRuleTarget = (ruleId: string, entry: ScopedStateVariable) => {
    const fresh = defaultRuleForEntry(entry);
    onChange(rules.map((r) => (r.id === ruleId ? { ...fresh, id: ruleId } : r)));
  };

  const removeRule = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  const addRule = () => {
    const first = targets[0];
    if (!first) return;
    onChange([...rules, defaultRuleForEntry(first)]);
  };

  const appendFormulaToken = (rule: OutcomePropertyRule, token: string) => {
    const current = (rule.formula ?? '').trimEnd();
    const next = current ? `${current} ${token}` : token;
    updateRule(rule.id, { formula: next });
  };

  if (targets.length === 0 && rules.length === 0) {
    return (
      <p onPointerDown={(e) => e.stopPropagation()} className="text-[11px] text-[#64748B] leading-snug">
        {b.propNoneAvailable}
      </p>
    );
  }

  return (
    <div onPointerDown={(e) => e.stopPropagation()} className="space-y-2.5">
      {rules.map((rule) => {
        const target = targets.find((v) => v.variable.id === rule.variableId);
        const varType = target?.variable.type;

        const opButtons: { op: OutcomePropertyOp; label: string; locked?: boolean }[] =
          varType === 'number'
            ? [
                { op: 'set', label: b.propOpSet },
                { op: 'formula', label: b.propOpFormula },
                { op: 'random', label: b.propOpRandom },
                { op: 'reset', label: b.propOpReset },
              ]
            : varType === 'boolean'
              ? [
                  { op: 'set', label: b.propOpSet },
                  { op: 'toggle', label: b.propOpToggle },
                  { op: 'formula', label: b.propOpFormula },
                  { op: 'reset', label: b.propOpReset },
                ]
              : varType === 'choice'
                ? [
                    { op: 'set', label: b.propOpSetChoice },
                    { op: 'random', label: b.propOpRandomChoice },
                    { op: 'reset', label: b.propOpReset },
                    {
                      op: 'step',
                      label: b.propOpStep,
                      locked: !target?.variable.ordered,
                    },
                  ]
                : [
                    { op: 'set', label: b.propOpSetText },
                    { op: 'clear', label: b.propOpClear },
                    { op: 'reset', label: b.propOpReset },
                    { op: 'append', label: b.propOpAppend },
                  ];

        const numberFormulaEval =
          varType === 'number' && rule.op === 'formula'
            ? evaluateNumberFormula(rule.formula ?? '', scopedVariables, numericParameters)
            : null;

        const boolFormulaEval =
          varType === 'boolean' && rule.op === 'formula'
            ? evaluateBooleanFormula(rule.formula ?? '', scopedVariables, numericParameters)
            : null;

        return (
          <div
            key={rule.id}
            className="space-y-2 pb-2.5 border-b border-black/10 last:border-b-0 last:pb-0"
          >
            {/* Row 1: Target Property Selector + Delete */}
            <div className="flex items-center gap-1.5">
              <PropertyPicker
                lang={lang}
                selectedVariableId={rule.variableId}
                scopedVariables={targets}
                onSelect={(entry) => replaceRuleTarget(rule.id, entry)}
              />
              <button
                type="button"
                onClick={() => removeRule(rule.id)}
                aria-label="Remove property rule"
                className="w-6 h-6 rounded-md text-[#94A3B8] hover:text-[#DC2626] hover:bg-[#FEE2E2] flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>

            {target && (
              <>
                {/* Row 2: Type-specific 4 Operation Tabs */}
                <div className="grid grid-cols-2 gap-1">
                  {opButtons.map((btn) => {
                    const active = rule.op === btn.op;
                    return (
                      <button
                        key={btn.op}
                        type="button"
                        disabled={btn.locked}
                        onClick={() => updateRule(rule.id, { op: btn.op })}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap truncate ${
                          btn.locked
                            ? 'bg-black/[0.03] text-[#94A3B8] cursor-not-allowed'
                            : active
                              ? 'bg-[#14244B] text-white cursor-pointer'
                              : 'bg-white border border-[#E2E8F0] text-[#475569] hover:border-[#94A3B8] cursor-pointer'
                        }`}
                      >
                        {btn.locked && <Lock className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />}
                        <span className="truncate">{btn.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Choice ordering unlock helper */}
                {varType === 'choice' && !target.variable.ordered && (
                  <div className="flex items-center justify-between gap-2 text-[10px] text-[#64748B]">
                    <span className="leading-snug">{b.propOrderRequired}</span>
                    {onEnableChoiceOrdering && (
                      <button
                        type="button"
                        onClick={() => onEnableChoiceOrdering(target)}
                        className="text-[#0369A1] hover:underline font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {b.propEnableOrderBtn}
                      </button>
                    )}
                  </div>
                )}

                {/* Row 3: Operation-specific Input Controls */}
                {/* NUMBER */}
                {varType === 'number' && rule.op === 'set' && (
                  <input
                    type="number"
                    step="any"
                    value={rule.numberValue ?? 0}
                    onChange={(e) =>
                      updateRule(rule.id, { numberValue: Number(e.target.value) || 0 })
                    }
                    className="w-full px-2.5 py-1.5 font-mono tabular-nums text-xs font-semibold text-[#14244B] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#4E9AE3]"
                  />
                )}

                {varType === 'number' && rule.op === 'random' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-md px-2 py-1">
                      <span className="text-[10px] text-[#64748B] shrink-0">{b.propRandomMin}</span>
                      <input
                        type="number"
                        step="any"
                        value={rule.randomMin ?? 1}
                        onChange={(e) =>
                          updateRule(rule.id, { randomMin: Number(e.target.value) })
                        }
                        className="w-full min-w-0 text-right font-mono tabular-nums text-[11px] font-semibold text-[#14244B] focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 bg-white border border-[#CBD5E1] rounded-md px-2 py-1">
                      <span className="text-[10px] text-[#64748B] shrink-0">{b.propRandomMax}</span>
                      <input
                        type="number"
                        step="any"
                        value={rule.randomMax ?? 5}
                        onChange={(e) =>
                          updateRule(rule.id, { randomMax: Number(e.target.value) })
                        }
                        className="w-full min-w-0 text-right font-mono tabular-nums text-[11px] font-semibold text-[#14244B] focus:outline-none"
                      />
                    </label>
                  </div>
                )}

                {varType === 'number' && rule.op === 'formula' && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={rule.formula ?? ''}
                      onChange={(e) => updateRule(rule.id, { formula: e.target.value })}
                      placeholder={b.propFormulaPh}
                      className="w-full px-2.5 py-1.5 font-mono text-[11px] font-medium text-[#14244B] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#4E9AE3]"
                    />
                    {/* Clickable variables & parameters */}
                    {numberTokens.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {numberTokens.map((tok) => (
                          <button
                            key={tok.key}
                            type="button"
                            onClick={() => appendFormulaToken(rule, tok.key)}
                            className="px-1.5 py-0.5 rounded bg-white border border-[#CBD5E1] hover:border-[#4E9AE3] text-[10px] font-mono text-[#14244B] transition-colors cursor-pointer"
                          >
                            {tok.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Clickable operators */}
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        {NUMBER_OPS.map((opChar) => (
                          <button
                            key={opChar}
                            type="button"
                            onClick={() => appendFormulaToken(rule, opChar)}
                            className="w-5 h-5 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] font-mono text-[11px] font-semibold text-[#14244B] flex items-center justify-center cursor-pointer"
                          >
                            {opChar}
                          </button>
                        ))}
                      </div>
                      {numberFormulaEval && (
                        <span
                          className={`text-[10px] font-mono tabular-nums ${
                            numberFormulaEval.ok ? 'text-[#047857]' : 'text-[#B91C1C]'
                          }`}
                        >
                          {numberFormulaEval.ok
                            ? `= ${numberFormulaEval.value}`
                            : b.propFormulaInvalid}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* BOOLEAN */}
                {varType === 'boolean' && rule.op === 'set' && (
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-white border border-[#CBD5E1] rounded-md">
                    <button
                      type="button"
                      onClick={() => updateRule(rule.id, { booleanValue: true })}
                      className={`py-1 rounded text-[11px] font-semibold cursor-pointer ${
                        rule.booleanValue !== false
                          ? 'bg-[#047857] text-white'
                          : 'text-[#64748B] hover:text-[#14244B]'
                      }`}
                    >
                      {s.boolTrue}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateRule(rule.id, { booleanValue: false })}
                      className={`py-1 rounded text-[11px] font-semibold cursor-pointer ${
                        rule.booleanValue === false
                          ? 'bg-[#475569] text-white'
                          : 'text-[#64748B] hover:text-[#14244B]'
                      }`}
                    >
                      {s.boolFalse}
                    </button>
                  </div>
                )}

                {varType === 'boolean' && rule.op === 'toggle' && (
                  <p className="text-[10px] text-[#64748B]">{b.propToggleHint}</p>
                )}

                {varType === 'boolean' && rule.op === 'formula' && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={rule.formula ?? ''}
                      onChange={(e) => updateRule(rule.id, { formula: e.target.value })}
                      placeholder={b.propBoolFormulaPh}
                      className="w-full px-2.5 py-1.5 font-mono text-[11px] font-medium text-[#14244B] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#4E9AE3]"
                    />
                    {booleanFormulaTokens.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {booleanFormulaTokens.map((tok) => (
                          <button
                            key={tok.key}
                            type="button"
                            onClick={() => appendFormulaToken(rule, tok.key)}
                            className="px-1.5 py-0.5 rounded bg-white border border-[#CBD5E1] hover:border-[#4E9AE3] text-[10px] font-mono text-[#14244B] cursor-pointer"
                          >
                            {tok.key}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {BOOLEAN_OPS.map((opTok) => (
                        <button
                          key={opTok}
                          type="button"
                          onClick={() => appendFormulaToken(rule, opTok)}
                          className="px-1.5 py-0.5 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] font-mono text-[10px] font-semibold text-[#14244B] cursor-pointer"
                        >
                          {opTok}
                        </button>
                      ))}
                    </div>
                    {boolFormulaEval && (
                      <div
                        className={`text-[10px] font-mono ${
                          boolFormulaEval.ok ? 'text-[#047857]' : 'text-[#B91C1C]'
                        }`}
                      >
                        {boolFormulaEval.ok
                          ? `= ${boolFormulaEval.value ? s.boolTrue : s.boolFalse}`
                          : b.propFormulaInvalid}
                      </div>
                    )}
                  </div>
                )}

                {/* CHOICE */}
                {varType === 'choice' && rule.op === 'set' && (
                  <select
                    value={rule.choiceValue ?? target.variable.options?.[0] ?? ''}
                    onChange={(e) => updateRule(rule.id, { choiceValue: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-[11px] font-medium text-[#14244B] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#4E9AE3]"
                  >
                    {(target.variable.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {varType === 'choice' && rule.op === 'random' && (
                  <p className="text-[10px] text-[#64748B]">{b.propRandomChoiceHint}</p>
                )}

                {varType === 'choice' && rule.op === 'step' && target.variable.ordered && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1 p-0.5 bg-white border border-[#CBD5E1] rounded-md">
                      <button
                        type="button"
                        onClick={() => updateRule(rule.id, { stepDirection: 'previous' })}
                        className={`py-1 rounded text-[10px] font-semibold cursor-pointer ${
                          rule.stepDirection === 'previous'
                            ? 'bg-[#14244B] text-white'
                            : 'text-[#64748B] hover:text-[#14244B]'
                        }`}
                      >
                        {b.propStepPrev}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRule(rule.id, { stepDirection: 'next' })}
                        className={`py-1 rounded text-[10px] font-semibold cursor-pointer ${
                          rule.stepDirection !== 'previous'
                            ? 'bg-[#14244B] text-white'
                            : 'text-[#64748B] hover:text-[#14244B]'
                        }`}
                      >
                        {b.propStepNext}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-[#64748B] shrink-0">
                        {b.propStepEndLabel}
                      </span>
                      <div className="inline-flex items-center p-0.5 bg-white border border-[#CBD5E1] rounded-md">
                        <button
                          type="button"
                          onClick={() => updateRule(rule.id, { stepWrap: 'stay' })}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap cursor-pointer ${
                            rule.stepWrap !== 'loop'
                              ? 'bg-[#14244B] text-white'
                              : 'text-[#64748B]'
                          }`}
                        >
                          {b.propStepStay}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateRule(rule.id, { stepWrap: 'loop' })}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap cursor-pointer ${
                            rule.stepWrap === 'loop'
                              ? 'bg-[#14244B] text-white'
                              : 'text-[#64748B]'
                          }`}
                        >
                          {b.propStepLoop}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TEXT */}
                {varType === 'text' && (rule.op === 'set' || rule.op === 'append') && (
                  <input
                    type="text"
                    value={rule.textValue ?? ''}
                    onChange={(e) => updateRule(rule.id, { textValue: e.target.value })}
                    placeholder={rule.op === 'append' ? b.propAppendPh : b.propTextPh}
                    className="w-full px-2.5 py-1.5 text-[11px] font-medium text-[#14244B] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#4E9AE3]"
                  />
                )}

                {varType === 'text' && rule.op === 'clear' && (
                  <p className="text-[10px] text-[#64748B]">{b.propClearHint}</p>
                )}

                {/* RESET (shared across all 4 types) */}
                {rule.op === 'reset' && (
                  <p className="text-[10px] text-[#64748B]">
                    {b.propResetHint}{' '}
                    <span className="font-mono text-[#14244B]">
                      ({formatVariableValue(target.variable, target.variable.initialValue, lang)})
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}

      {rules.length===0 && <button
        type="button"
        onClick={addRule}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-[#047857] hover:bg-[#D1FAE5]/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Plus className="w-3 h-3" aria-hidden="true" />
        <span>{b.propAddRule}</span>
      </button>}
    </div>
  );
}
