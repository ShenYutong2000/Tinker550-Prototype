import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TopBar } from './TopBar';
import { HeroBoardCanvas } from '../features/start/HeroBoardCanvas';
import { ChooseStartView } from '../features/start/ChooseStartView';
import { StudioWorkspace } from '../features/studio/StudioWorkspace';
import type { Language } from '../shared/i18n';

type AppView = 'welcome' | 'choose-start' | 'studio';

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [view, setView] = useState<AppView>('welcome');

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  // Full-bleed Studio Workspace uses its own compact studio top bar
  if (view === 'studio') {
    return (
      <StudioWorkspace
        lang={lang}
        onChangeLang={setLang}
        onGoHome={() => setView('welcome')}
        onBackToChoose={() => setView('choose-start')}
      />
    );
  }

  return (
    <div className="min-h-screen studio-dot-grid flex flex-col">
      <TopBar
        lang={lang}
        onChangeLang={setLang}
        onLogoClick={() => setView('welcome')}
      />

      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {view === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1"
            >
              <HeroBoardCanvas
                lang={lang}
                onStart={() => setView('choose-start')}
              />
            </motion.div>
          )}

          {view === 'choose-start' && (
            <motion.div
              key="choose-start"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 flex items-center"
            >
              <ChooseStartView
                lang={lang}
                onSelectOwnIdea={() => setView('studio')}
                onBack={() => setView('welcome')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
