import { Plus, Trash2 } from 'lucide-react';
import { COPY, type Language } from '../../../../shared/i18n';
import { createParameterId, type CardParameterItem } from '../studioModel';

interface RelatedParametersEditorProps {
  lang: Language;
  parameters: CardParameterItem[];
  isOptional?: boolean;
  onChange: (next: CardParameterItem[]) => void;
}

export function RelatedParametersEditor({
  lang,
  parameters,
  isOptional = false,
  onChange,
}: RelatedParametersEditorProps) {
  const b = COPY[lang].studio.board;

  const updateParam = (id: string, patch: Partial<CardParameterItem>) => {
    onChange(parameters.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removeParam = (id: string) => {
    onChange(parameters.filter((p) => p.id !== id));
  };

  const addParam = () => {
    const newItem: CardParameterItem = {
      id: createParameterId(),
      name: lang === 'zh' ? '新参数' : 'Parameter',
      value: 1,
      unit: '',
      min: 0,
      max: 100,
      step: 1,
    };
    onChange([...parameters, newItem]);
  };

  return (
    <div onPointerDown={(e) => e.stopPropagation()} className="space-y-2">
      {parameters.length === 0 ? (
        <p className="text-[11px] text-[#64748B] leading-snug">
          {isOptional ? b.paramEmptyOptional : b.waitingForText}
        </p>
      ) : (
        <div className="space-y-2">
          {parameters.map((param) => {
            const min = typeof param.min === 'number' ? param.min : 0;
            const max = typeof param.max === 'number' ? param.max : Math.max(20, param.value * 2);
            const step = typeof param.step === 'number' && param.step > 0 ? param.step : 1;
            const sliderVal = Math.max(min, Math.min(max, Number.isFinite(param.value) ? param.value : 0));

            return (
              <div key={param.id} className="space-y-1 pb-1.5 border-b border-black/5 last:border-b-0 last:pb-0">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={param.name}
                    onChange={(e) => updateParam(param.id, { name: e.target.value })}
                    placeholder={b.paramNamePh}
                    aria-label={b.paramNamePh}
                    className="flex-1 min-w-0 px-2 py-1 text-[11px] font-medium text-[#14244B] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#4E9AE3]"
                  />
                  <input
                    type="number"
                    step="any"
                    value={Number.isFinite(param.value) ? param.value : 0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      updateParam(param.id, { value: Number.isFinite(v) ? v : 0 });
                    }}
                    aria-label={param.name}
                    className="w-16 px-1.5 py-1 text-right font-mono tabular-nums text-[11px] font-semibold text-[#14244B] bg-white border border-[#CBD5E1] rounded-md focus:outline-none focus:border-[#4E9AE3]"
                  />
                  <input
                    type="text"
                    value={param.unit ?? ''}
                    onChange={(e) => updateParam(param.id, { unit: e.target.value })}
                    placeholder={b.paramUnitPh}
                    aria-label={b.paramUnitPh}
                    className="w-12 px-1.5 py-1 text-[10px] text-[#64748B] bg-white border border-[#E2E8F0] rounded-md focus:outline-none focus:border-[#4E9AE3]"
                  />
                  <button
                    type="button"
                    onClick={() => removeParam(param.id)}
                    aria-label={`Remove ${param.name}`}
                    className="w-6 h-6 rounded-md text-[#94A3B8] hover:text-[#DC2626] hover:bg-[#FEE2E2] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>

                {/* Tactile range slider synced with number input */}
                <label className="flex items-center gap-1 text-[11px] text-[#475569]">
                  <input type="checkbox" checked={Boolean(param.exposeOnStage)} onChange={e => updateParam(param.id, { exposeOnStage: e.target.checked })} />
                  {lang === 'zh' ? '在舞台实例上开放' : 'Expose on stage instances'}
                </label>
                {param.exposeOnStage && <p className="text-[10px] text-[#64748B]">
                  {lang === 'zh' ? '这里设置规则默认值。素材和个别实例可以有自己的取值。' : 'This is the rule default. Assets and individual instances can supply their own values.'}
                </p>}
                <div className="flex items-center gap-2 px-0.5">
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={sliderVal}
                    onChange={(e) => updateParam(param.id, { value: Number(e.target.value) })}
                    aria-label={`${param.name} slider`}
                    className="flex-1 h-1.5 accent-[#14244B] cursor-pointer"
                  />
                  <span className="font-mono tabular-nums text-[10px] text-[#64748B] shrink-0">
                    {param.value}
                    {param.unit ? ` ${param.unit}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={addParam}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-[#334155] hover:text-[#14244B] hover:bg-black/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Plus className="w-3 h-3" aria-hidden="true" />
        <span>{b.paramAdd}</span>
      </button>
    </div>
  );
}
