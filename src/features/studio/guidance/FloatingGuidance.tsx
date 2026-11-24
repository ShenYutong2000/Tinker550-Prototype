import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import {
  getGuidancePrompt,
  type BoardNode,
  type OnboardingChecklist,
  type SpotlightStage,
} from '../design-board/studioModel';

interface FloatingGuidanceProps {
  lang: Language;
  stage: SpotlightStage;
  checklist: OnboardingChecklist;
  nodes: BoardNode[];
  onSkipSpotlight: () => void;
}

export function FloatingGuidance({
  lang,
  stage,
  checklist,
  nodes,
  onSkipSpotlight,
}: FloatingGuidanceProps) {
  const t = COPY[lang].studio.guidance;
  const [minimized, setMinimized] = useState(false);
  const [catError, setCatError] = useState(false);

  const prompt = getGuidancePrompt(stage, checklist, nodes, lang);
  const states = [
    checklist.addedFirstCard,
    checklist.connectedCards,
    checklist.testedInPlay,
  ];
  const completedCount = states.filter(Boolean).length;
  const isSpotlight = stage !== 'free';

  if (minimized && !isSpotlight) {
    return (
      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-40">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-2 bg-white/95 backdrop-blur-xs rounded-xl border border-[#E2E8F0] shadow-[0_8px_24px_rgba(20,36,75,0.1)] hover:border-[#14244B]/40 text-xs font-semibold text-[#14244B] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
        >
          {!catError && (
            <img
              src="/assets/aistudio/image_3fb512a9.png"
              alt={COPY[lang].catAlt}
              referrerPolicy="no-referrer"
              onError={() => setCatError(true)}
              className="w-5 h-5 object-contain mix-blend-multiply"
            />
          )}
          <span>{t.label}</span>
          <span className="font-mono text-[#475569] tabular-nums">
            {completedCount}/{states.length}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute top-3.5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-24px)] max-w-[680px]">
      <div
        role="region"
        aria-label={t.label}
        className={`pointer-events-auto bg-white rounded-2xl border transition-all duration-200 px-4 sm:px-5 py-3.5 ${
          isSpotlight
            ? 'border-[#14244B]/25 shadow-[0_18px_46px_rgba(20,36,75,0.22)] ring-2 ring-[#FBC53D]/70'
            : 'border-[#E2E8F0] shadow-[0_10px_30px_rgba(20,36,75,0.1)]'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Friendly Cat visual messenger — strictly non-conversational, zero chat input */}
            {!catError && (
              <img
                src="/assets/aistudio/image_3fb512a9.png"
                alt={COPY[lang].catAlt}
                referrerPolicy="no-referrer"
                onError={() => setCatError(true)}
                className="w-11 h-11 object-contain mix-blend-multiply shrink-0 select-none mt-0.5"
              />
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-display font-bold text-sm sm:text-[15px] text-[#14244B]">
                  {prompt.title}
                </span>
              </div>
              <p className="mt-1 text-xs sm:text-[13px] text-[#475569] leading-relaxed">
                {prompt.body}
              </p>
            </div>
          </div>

          {/* Right action: Skip spotlight or minimize when in free mode */}
          <div className="flex items-center gap-1 shrink-0">
            {isSpotlight ? (
              <button
                type="button"
                onClick={onSkipSpotlight}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#475569] hover:text-[#14244B] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
              >
                <span>{t.skipSpotlight}</span>
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMinimized(true)}
                title={t.hideCard}
                aria-label={t.hideCard}
                className="w-7 h-7 rounded-lg text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Built-in Compact Onboarding Check-Off Row (Replaces Bottom-Right Unlock Box) */}
        <div className="mt-3 pt-2.5 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs">
          <ol className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {t.steps.map((stepLabel, idx) => {
              const done = states[idx];
              return (
                <li
                  key={idx}
                  className={`inline-flex items-center gap-1.5 ${
                    done ? 'text-[#0F766E] font-semibold' : 'text-[#64748B]'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${
                      done
                        ? 'bg-[#0F766E] border-[#0F766E] text-white'
                        : 'bg-white border-[#CBD5E1] text-[#64748B]'
                    }`}
                  >
                    {done ? (
                      <Check className="w-2.5 h-2.5" aria-hidden="true" />
                    ) : (
                      <span className="font-mono text-[10px] leading-none">
                        {idx + 1}
                      </span>
                    )}
                  </span>
                  <span>{stepLabel}</span>
                </li>
              );
            })}
          </ol>

          <span className="font-mono text-[11px] font-semibold tabular-nums text-[#14244B] shrink-0">
            {completedCount}/{states.length}
          </span>
        </div>
      </div>
    </div>
  );
}
