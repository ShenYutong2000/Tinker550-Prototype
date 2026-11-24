import { useState } from 'react';
import { COPY, type Language } from '../shared/i18n';

interface TopBarProps {
  lang: Language;
  onChangeLang: (lang: Language) => void;
  onLogoClick: () => void;
}

export function TopBar({ lang, onChangeLang, onLogoClick }: TopBarProps) {
  const [logoError, setLogoError] = useState(false);
  const t = COPY[lang];

  return (
    <header className="w-full border-b border-[#E2E8F0]/80 bg-white/90 backdrop-blur-sm sticky top-0 z-20">
      <div className="max-w-[1320px] mx-auto px-5 sm:px-8 lg:px-12 h-16 sm:h-[72px] flex items-center justify-between gap-8">
        {/* Zone 1: Brand Mark (single clean interactive element) */}
        <button
          type="button"
          onClick={onLogoClick}
          className="flex items-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B] focus-visible:ring-offset-2 rounded-lg cursor-pointer"
          aria-label="Tinker 550 Home"
        >
          {!logoError ? (
            <img
              src="/assets/aistudio/image_8e7dab7b.png"
              alt={t.brandAlt}
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="h-10 sm:h-11 w-auto object-contain mix-blend-multiply select-none"
            />
          ) : (
            <span className="font-display text-2xl font-bold tracking-tight text-[#14244B] whitespace-nowrap shrink-0">
              Tinker 550
            </span>
          )}
        </button>

        {/* Zone 2: Minimal language segmented switch */}
        <div
          role="group"
          aria-label="Language switcher"
          className="inline-flex items-center p-1 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0] shrink-0"
        >
          <button
            type="button"
            onClick={() => onChangeLang('en')}
            aria-pressed={lang === 'en'}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B] ${
              lang === 'en'
                ? 'bg-white text-[#14244B] shadow-xs'
                : 'text-[#475569] hover:text-[#14244B]'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => onChangeLang('zh')}
            aria-pressed={lang === 'zh'}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14244B] ${
              lang === 'zh'
                ? 'bg-white text-[#14244B] shadow-xs'
                : 'text-[#475569] hover:text-[#14244B]'
            }`}
          >
            中文
          </button>
        </div>
      </div>
    </header>
  );
}
