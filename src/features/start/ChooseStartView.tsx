import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Compass, Layers, Shuffle, Sparkles, X } from 'lucide-react';
import { COPY, type Language } from '../../shared/i18n';

interface ChooseStartViewProps {
  lang: Language;
  onSelectOwnIdea: () => void;
  onBack: () => void;
}

type OptionId = 'own-idea' | 'game-genre' | 'remix-game';

const OPTION_IMAGES: Record<OptionId, string> = {
  'own-idea': '/src/assets/images/start_own_idea_1795136431602.jpg',
  'game-genre': '/src/assets/images/start_game_genre_1795136428830.jpg',
  'remix-game': '/src/assets/images/start_remix_game_1795136457225.jpg',
};

const FALLBACK_STYLES: Record<
  OptionId,
  { bg: string; iconColor: string; Icon: typeof Sparkles }
> = {
  'own-idea': {
    bg: 'from-[#FEF3C7] via-[#FFFDF7] to-[#E0F2FE]',
    iconColor: 'text-[#14244B]',
    Icon: Sparkles,
  },
  'game-genre': {
    bg: 'from-[#CCFBF1] via-[#F8FAFC] to-[#E0F2FE]',
    iconColor: 'text-[#0F766E]',
    Icon: Layers,
  },
  'remix-game': {
    bg: 'from-[#FFE4E6] via-[#FFFDF9] to-[#FEF3C7]',
    iconColor: 'text-[#C83E2B]',
    Icon: Shuffle,
  },
};

export function ChooseStartView({
  lang,
  onSelectOwnIdea,
  onBack,
}: ChooseStartViewProps) {
  const t = COPY[lang].chooseStart;
  const [failedImages, setFailedImages] = useState<Partial<Record<OptionId, boolean>>>({});
  const [comingSoonNotice, setComingSoonNotice] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const showComingSoon = (optionTitle: string) => {
    setComingSoonNotice(optionTitle);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setComingSoonNotice(null);
      timerRef.current = null;
    }, 3400);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setComingSoonNotice(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCardClick = (id: OptionId, title: string) => {
    if (id === 'own-idea') {
      onSelectOwnIdea();
      return;
    }
    showComingSoon(title);
  };

  return (
    <div className="relative w-full max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
      {/* Quiet Top Back Link */}
      <div className="mb-6 sm:mb-8">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#475569] hover:text-[#14244B] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer py-1.5 pr-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>{t.backToWelcome}</span>
        </button>
      </div>

      {/* Centered Section Header (Faithful to Sketch: Headline + Clean Guidance) */}
      <header className="text-center max-w-2xl mx-auto">
        <h1 className="font-display font-bold text-[#14244B] text-[clamp(2.1rem,4.2vw,3.35rem)] leading-[1.1] tracking-[-0.015em] text-balance">
          {t.title}
        </h1>
        <p className="mt-3 text-base sm:text-lg text-[#475569] leading-relaxed">
          {t.subtitle}
        </p>
      </header>

      {/* Three Equal Visual Starting-Point Cards (Image -> Bold Big Title -> Short Description) */}
      <div className="mt-10 sm:mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
        {t.options.map((option) => {
          const isFailed = Boolean(failedImages[option.id]);
          const fallback = FALLBACK_STYLES[option.id];
          const FallbackIcon = fallback.Icon;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleCardClick(option.id, option.title)}
              className="group text-left bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_8px_28px_rgba(20,36,75,0.06)] hover:shadow-[0_18px_40px_rgba(20,36,75,0.11)] hover:border-[#14244B]/35 hover:-translate-y-1 active:translate-y-0 transition-all duration-200 overflow-hidden flex flex-col cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B] focus-visible:ring-offset-4"
            >
              {/* Top 4:3 Studio Illustration */}
              <div className="w-full aspect-[4/3] bg-[#FAF8F4] border-b border-[#E2E8F0]/80 overflow-hidden relative">
                {!isFailed ? (
                  <img
                    src={OPTION_IMAGES[option.id]}
                    alt={option.imageAlt}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [option.id]: true }))
                    }
                    className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.035] select-none"
                  />
                ) : (
                  <div
                    className={`w-full h-full bg-gradient-to-br ${fallback.bg} flex items-center justify-center`}
                  >
                    <FallbackIcon
                      className={`w-12 h-12 ${fallback.iconColor}`}
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>

              {/* Bottom Typography: Bold Display Title + Concise Description */}
              <div className="p-6 sm:p-7 flex-1 flex flex-col">
                <h2 className="font-display font-bold text-[22px] sm:text-2xl leading-snug text-[#14244B] text-balance">
                  {option.title}
                </h2>
                <p className="mt-2.5 text-sm sm:text-[15px] leading-relaxed text-[#475569]">
                  {option.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Compact Floating "Coming Soon" Notice for Entry 2 & 3 */}
      <AnimatePresence>
        {comingSoonNotice && (
          <motion.div
            key="coming-soon-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#14244B] text-white rounded-xl shadow-[0_14px_34px_rgba(20,36,75,0.26)] px-5 py-3 flex items-center gap-3 whitespace-nowrap"
          >
            <Compass
              className="w-4 h-4 text-[#FBC53D] shrink-0"
              aria-hidden="true"
            />
            <span className="font-display font-semibold text-base leading-none">
              {t.comingSoonTitle}
            </span>
            <button
              type="button"
              onClick={() => setComingSoonNotice(null)}
              aria-label={t.closeNotice}
              className="text-white/70 hover:text-white p-1 -mr-1 rounded-lg transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
