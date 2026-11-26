import {ProjectsView} from './ProjectsView';
import {emptyProject,type ProjectData} from '../features/studio/projectStore';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TopBar } from './TopBar';
import { HeroBoardCanvas } from '../features/start/HeroBoardCanvas';
import { ChooseStartView } from '../features/start/ChooseStartView';
import { StudioWorkspace } from '../features/studio/StudioWorkspace';
import type { Language } from '../shared/i18n';

type AppView = 'welcome' | 'choose-start' | 'studio' | 'projects';

export default function App() {
  const [project,setProject] = useState<ProjectData>(()=>emptyProject('Untitled game'));
  const [lang, setLang] = useState<Language>('en');
  const [view, setView] = useState<AppView>('welcome');

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  if(view==='projects') return <ProjectsView lang={lang} onBack={()=>setView('welcome')} onOpen={p=>{setProject(p);setView('studio');}}/>;

  // Full-bleed Studio Workspace uses its own compact studio top bar
  if (view === 'studio') {
    return (
      <StudioWorkspace
        key={project.id}
        initialProject={project}
        lang={lang}
        onChangeLang={setLang}
        onGoHome={() => setView('welcome')}
        onBackToChoose={() => setView('projects')}
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
        <div className="flex justify-center gap-3 py-4"><button className="px-5 py-2 rounded-xl bg-[#14244B] text-white" onClick={()=>{setProject(emptyProject(lang==='zh'?'未命名游戏':'Untitled game'));setView('studio');}}>{lang==='zh'?'新建游戏':'New game'}</button><button className="px-5 py-2 rounded-xl border bg-white" onClick={()=>setView('projects')}>{lang==='zh'?'我的游戏 · 继续设计':'My games · Continue'}</button></div>
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
                onStart={() => setView('projects')}
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
