import { Check, Minus, Plus, X } from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import { clampNumberValue, type ScopedStateVariable, type StateVariableValue } from '../properties/stateModel';

type Props = {
  lang: Language;
  scopedVariables: ScopedStateVariable[];
  onUpdatePlayValue: (variableId: string, value: StateVariableValue) => void;
};

export function StagePlayProperties({ lang, scopedVariables, onUpdatePlayValue }: Props) {
  const st = COPY[lang].studio.states;
  return (scopedVariables.length > 0 ? (
    <div className="stage-play-properties px-3.5 py-2 border-b border-[#E2E8F0] bg-[#F8FAFC] space-y-1.5 shrink-0 max-h-[132px] overflow-y-auto">
      <div className="text-[10.5px] font-bold text-[#64748B] flex items-center justify-between">
        <span>{st.playHudTitle}</span>
        <span className="font-mono tabular-nums font-normal">
          {scopedVariables.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {scopedVariables.map((entry) => {
          const { variable, playValue, isDirty } = entry;
          const hasProgress =
            variable.type === 'number' &&
            variable.hasMax &&
            typeof variable.maxValue === 'number' &&
            variable.maxValue > (variable.hasMin && typeof variable.minValue === 'number' ? variable.minValue : 0);
          const minBound =
            variable.hasMin && typeof variable.minValue === 'number'
              ? variable.minValue
              : 0;
          const pct = hasProgress
            ? Math.max(
                0,
                Math.min(
                  100,
                  ((Number(playValue) - minBound) /
                    (variable.maxValue! - minBound)) *
                    100,
                ),
              )
            : 0;

          return (
            <div
              key={variable.id}
              className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                isDirty
                  ? 'bg-[#FFFBEB] border-[#FDE68A]'
                  : 'bg-white border-[#E2E8F0]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-1">
                  {entry.scope === 'asset' && entry.assetName && (
                    <span className="text-[10.5px] text-[#64748B] truncate max-w-[78px]">
                      {entry.assetName} ·
                    </span>
                  )}
                  <span className="font-semibold text-[#14244B] truncate">
                    {variable.name}
                  </span>
                </div>

                {variable.type === 'number' && (
                  <div className="inline-flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdatePlayValue(
                          variable.id,
                          clampNumberValue(Number(playValue) - 1, variable),
                        )
                      }
                      aria-label={`Decrease ${variable.name}`}
                      className="w-4 h-4 rounded text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-2.5 h-2.5" aria-hidden="true" />
                    </button>
                    <span className="font-mono font-bold tabular-nums text-[#14244B]">
                      {Number(playValue)}
                      {variable.hasMax && typeof variable.maxValue === 'number' && (
                        <span className="text-[#94A3B8] font-normal">
                          /{variable.maxValue}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdatePlayValue(
                          variable.id,
                          clampNumberValue(Number(playValue) + 1, variable),
                        )
                      }
                      aria-label={`Increase ${variable.name}`}
                      className="w-4 h-4 rounded text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-2.5 h-2.5" aria-hidden="true" />
                    </button>
                  </div>
                )}

                {variable.type === 'boolean' && (
                  <button
                    type="button"
                    onClick={() => onUpdatePlayValue(variable.id, !Boolean(playValue))}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold cursor-pointer shrink-0 ${
                      Boolean(playValue)
                        ? 'bg-[#ECFDF5] text-[#047857]'
                        : 'bg-[#F1F5F9] text-[#475569]'
                    }`}
                  >
                    {Boolean(playValue) ? (
                      <Check className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <X className="w-3 h-3" aria-hidden="true" />
                    )}
                    <span>{Boolean(playValue) ? st.boolTrue : st.boolFalse}</span>
                  </button>
                )}

                {variable.type === 'choice' && (
                  <select
                    value={String(playValue ?? '')}
                    onChange={(e) => onUpdatePlayValue(variable.id, e.target.value)}
                    aria-label={variable.name}
                    className="max-w-[112px] px-1.5 py-0.5 text-[11px] font-semibold text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded focus:outline-none cursor-pointer"
                  >
                    {(variable.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {variable.type === 'text' && (
                  <span className="font-mono text-[11px] font-semibold text-[#334155] truncate max-w-[116px]">
                    {String(playValue ?? '') || '—'}
                  </span>
                )}
              </div>

              {hasProgress && (
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#4E9AE3] transition-all duration-150"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  ) : null);
}
