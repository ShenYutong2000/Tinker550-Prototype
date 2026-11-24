import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Code2,
  HelpCircle,
  Layers,
  Play,
  Sparkles,
} from 'lucide-react';
import { COPY, type Language } from '../../shared/i18n';

interface HeroBoardCanvasProps {
  lang: Language;
  onStart: () => void;
}

const BEAT_DURATION_MS = 2500;

export function HeroBoardCanvas({ lang, onStart }: HeroBoardCanvasProps) {
  const t = COPY[lang];
  const [catError, setCatError] = useState(false);

  const [beatIndex, setBeatIndex] = useState(0);

  // Smooth, natural continuous playback across all 4 headline beats (pauses only if prefers-reduced-motion)
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setBeatIndex((prev) => (prev + 1) % t.headlineBeats.length);
    }, BEAT_DURATION_MS);

    return () => window.clearInterval(timer);
  }, [t.headlineBeats.length]);

  const currentBeat = t.headlineBeats[beatIndex];

  return (
    <div className="relative w-full min-h-[calc(100vh-72px)] flex items-center justify-center overflow-hidden px-5 sm:px-8 py-10">
      {/* Desktop Ambient Miro-Style Board Connectors (Static, Clean, Poised) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
        className="hidden xl:block absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <marker
            id="miro-arrow-blue"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#4E9AE3" fillOpacity="0.55" />
          </marker>
          <marker
            id="miro-arrow-coral"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#F05440" fillOpacity="0.55" />
          </marker>
        </defs>

        {/* Left flow: Assets -> Guidance */}
        <path
          d="M 95 162 Q 62 303 105 444"
          fill="none"
          stroke="#4E9AE3"
          strokeWidth="2"
          strokeDasharray="6 6"
          strokeOpacity="0.38"
          markerEnd="url(#miro-arrow-blue)"
        />

        {/* Right flow: Design Board Rule -> <> Play */}
        <path
          d="M 905 162 Q 938 303 895 444"
          fill="none"
          stroke="#F05440"
          strokeWidth="2"
          strokeDasharray="6 6"
          strokeOpacity="0.38"
          markerEnd="url(#miro-arrow-coral)"
        />
      </svg>

      {/* Desktop Ambient Miro Board Cards (Framing Outer Edges Cleanly, No Weird Dragging) */}
      <div
        aria-hidden="true"
        className="hidden xl:block absolute inset-0 pointer-events-none select-none"
      >
        {/* Top-Left: Assets Card */}
        <div
          style={{
            left: '9.5%',
            top: '27%',
            transform: 'translate(-50%, -50%) rotate(-2deg)',
          }}
          className="absolute w-[184px] bg-white/95 rounded-2xl border border-[#E2E8F0] shadow-[0_8px_24px_rgba(20,36,75,0.05)] p-3.5"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#B45309]">
            <Layers className="w-3.5 h-3.5 text-[#EAB308]" />
            <span>{t.cards.assetsKicker}</span>
          </div>
          <div className="my-2.5 grid grid-cols-3 gap-1.5">
            <div className="h-8 rounded-lg bg-[#FEF3C7] border border-[#FBC53D]/40 flex items-center justify-center">
              <span className="w-3.5 h-2 rounded-t-full bg-[#FBC53D]" />
            </div>
            <div className="h-8 rounded-lg bg-[#E0F2FE] border border-[#4E9AE3]/35 flex items-center justify-center">
              <span className="w-3 h-3 rounded-xs bg-[#4E9AE3]" />
            </div>
            <div className="h-8 rounded-lg bg-[#CCFBF1] border border-[#48B5A3]/35 flex items-center justify-center">
              <span className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-[#48B5A3]" />
            </div>
          </div>
          <div className="text-[13px] font-semibold text-[#14244B] leading-tight">
            {t.cards.assetsTitle}
          </div>
          <div className="mt-0.5 text-[11px] text-[#64748B]">{t.cards.assetsMeta}</div>
        </div>

        {/* Bottom-Left: Guidance Card */}
        <div
          style={{
            left: '10.5%',
            top: '74%',
            transform: 'translate(-50%, -50%) rotate(1.8deg)',
          }}
          className="absolute w-[192px] bg-white/95 rounded-2xl border border-[#E2E8F0] shadow-[0_8px_24px_rgba(20,36,75,0.05)] p-3.5"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#2563EB]">
            <HelpCircle className="w-3.5 h-3.5 text-[#4E9AE3]" />
            <span>{t.cards.guidanceKicker}</span>
          </div>
          <p className="my-2.5 text-[11px] leading-snug text-[#334155] bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] px-2.5 py-2">
            “{t.cards.guidanceSample}”
          </p>
          <div className="text-[13px] font-semibold text-[#14244B] leading-tight">
            {t.cards.guidanceTitle}
          </div>
          <div className="mt-0.5 text-[11px] text-[#64748B]">{t.cards.guidanceMeta}</div>
        </div>

        {/* Top-Right: Design Board Rule Card */}
        <div
          style={{
            left: '90.5%',
            top: '27%',
            transform: 'translate(-50%, -50%) rotate(2deg)',
          }}
          className="absolute w-[196px] bg-white/95 rounded-2xl border border-[#E2E8F0] shadow-[0_8px_24px_rgba(20,36,75,0.05)] p-3.5"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#0F766E]">
            <Sparkles className="w-3.5 h-3.5 text-[#48B5A3]" />
            <span>{t.cards.ruleKicker}</span>
          </div>
          <div className="my-2.5 flex items-center justify-between gap-1 font-mono text-[11px] text-[#14244B]">
            <span className="px-2 py-1 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] font-medium">
              Goal
            </span>
            <ArrowRight className="w-3 h-3 text-[#94A3B8] shrink-0" />
            <span className="px-2 py-1 rounded-md bg-[#F0FDFA] border border-[#48B5A3]/45 text-[#0F766E] font-semibold">
              +10 pts
            </span>
          </div>
          <div className="text-[13px] font-semibold text-[#14244B] leading-tight">
            {t.cards.ruleTitle}
          </div>
          <div className="mt-0.5 text-[11px] text-[#64748B]">{t.cards.ruleMeta}</div>
        </div>

        {/* Bottom-Right: <> Play Preview Card */}
        <div
          style={{
            left: '89.5%',
            top: '74%',
            transform: 'translate(-50%, -50%) rotate(-1.8deg)',
          }}
          className="absolute w-[192px] bg-white/95 rounded-2xl border border-[#E2E8F0] shadow-[0_8px_24px_rgba(20,36,75,0.05)] p-3.5"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold font-mono text-[#C83E2B]">
            <Code2 className="w-3.5 h-3.5 text-[#F05440]" />
            <span>{t.cards.playKicker}</span>
          </div>
          <div className="my-2.5 h-12 rounded-lg bg-[#14244B] flex items-center justify-center">
            <div className="flex items-center gap-1.5 text-white text-xs font-semibold">
              <Play className="w-3.5 h-3.5 fill-current text-[#FBC53D]" />
              <span>Playtest</span>
            </div>
          </div>
          <div className="text-[13px] font-semibold text-[#14244B] leading-tight">
            {t.cards.playTitle}
          </div>
          <div className="mt-0.5 text-[11px] text-[#64748B]">{t.cards.playMeta}</div>
        </div>
      </div>

      {/* CENTER HERO: [Enlarged Cat on Left] + [Natural Looping 2-Line Headline on Right] + [Start Creating Below] */}
      <section
        aria-label="Welcome to Tinker 550"
        className="relative z-20 w-full max-w-[780px] mx-auto px-4 sm:px-6 py-8 rounded-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(248, 250, 252, 0.96) 76%, rgba(248, 250, 252, 0) 100%)',
        }}
      >
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10">
          {/* Left: Enlarged Friendly Cat Mascot */}
          <div className="shrink-0">
            {!catError ? (
              <img
                src="/assets/aistudio/image_3fb512a9.png"
                alt={t.catAlt}
                referrerPolicy="no-referrer"
                draggable={false}
                onError={() => setCatError(true)}
                className="w-44 h-44 sm:w-52 sm:h-52 md:w-56 md:h-56 lg:w-64 lg:h-64 object-contain mix-blend-multiply select-none"
              />
            ) : (
              <div className="w-48 h-48 rounded-3xl bg-[#FEF3C7] border border-[#FBC53D] flex items-center justify-center font-display text-2xl font-bold text-[#14244B]">
                Cat
              </div>
            )}
          </div>

          {/* Right: Naturally Playing 2-Line Fredoka Headline + Subtitle */}
          <div className="flex-1 min-w-0 text-center md:text-left">
            <div className="min-h-[116px] sm:min-h-[136px] md:min-h-[156px] flex items-center justify-center md:justify-start">
              <AnimatePresence mode="wait">
                <motion.h1
                  key={`${lang}-${beatIndex}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                  aria-live="polite"
                  className="font-display font-bold text-[#14244B] text-[clamp(2.15rem,4.1vw,3.4rem)] leading-[1.12] tracking-[-0.015em]"
                >
                  <span className="block">{currentBeat.line1}</span>
                  <span className="block">{currentBeat.line2}</span>
                </motion.h1>
              </AnimatePresence>
            </div>

            {/* Quiet Clickable 4-Step Progress Hairlines */}
            <div
              role="group"
              aria-label="Headline sequence"
              className="mt-3 flex items-center justify-center md:justify-start gap-1.5"
            >
              {t.headlineBeats.map((beat, idx) => {
                const isActive = idx === beatIndex;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setBeatIndex(idx)}
                    aria-label={`${t.beatAria} ${idx + 1}: ${beat.line1} ${beat.line2}`}
                    aria-current={isActive ? 'step' : undefined}
                    className="py-2 px-0.5 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B] rounded"
                  >
                    <span
                      className={`block h-[3px] rounded-full transition-all duration-200 ${
                        isActive
                          ? 'w-9 bg-[#14244B]'
                          : 'w-5 bg-[#CBD5E1] group-hover:bg-[#94A3B8]'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-base sm:text-[17px] leading-relaxed text-[#475569] max-w-[44ch] mx-auto md:mx-0">
              {t.subtitle}
            </p>
          </div>
        </div>

        {/* Single Dominant Focal Action Button Centered Below */}
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={onStart}
            className="group inline-flex items-center justify-center gap-3 px-11 py-4 min-w-[244px] rounded-2xl bg-[#14244B] hover:bg-[#1E3468] active:scale-[0.985] text-white font-display font-semibold text-xl sm:text-[22px] tracking-wide shadow-[0_14px_32px_rgba(20,36,75,0.22)] transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B] focus-visible:ring-offset-4"
          >
            <span>{t.startCta}</span>
            <ArrowRight
              className="w-5 h-5 transition-transform duration-150 group-hover:translate-x-1"
              aria-hidden="true"
            />
          </button>
        </div>
      </section>
    </div>
  );
}
