import type { CSSProperties } from 'react';
import { MessageSquareQuote } from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import { buildCssFilterString, getOutcomeVisualEffects, getStaticOpacity, isHiddenByEffect } from '../asset-library/effects/visualEffectsModel';
import type { AssetItem } from '../asset-library/assetLibraryModel';
import type { BoardNode } from '../design-board/studioModel';
import { resolveDialogueContent, resolvePlaybackSettings, resolveSubtitlePosition } from './boardPlayEngine';
import type { StageRun } from './sceneRuntime';
import { anchoredPosition, VIEW_HEIGHT, VIEW_WIDTH, type Placement } from './stageProject';

interface Props {
  lang: Language;
  narration?: BoardNode;
  dialogue?: BoardNode;
  subtitle?: Placement;
  portrait?: AssetItem;
  run?: StageRun;
  hint: boolean;
}

export function StageCutscene({ lang, narration, dialogue, subtitle, portrait, run, hint }: Props) {
  if (subtitle?.isHidden || run?.finished) return null;
  const zh = lang === 'zh';
  const position = subtitle && anchoredPosition(subtitle);
  const placementStyle: CSSProperties | undefined = subtitle && position ? {
    left: subtitle.anchor?.endsWith('right') ? 'auto' : position.x / VIEW_WIDTH * 100 + '%',
    right: subtitle.anchor?.endsWith('right') ? subtitle.x / VIEW_WIDTH * 100 + '%' : 'auto',
    top: subtitle.anchor?.startsWith('top') ? position.y / VIEW_HEIGHT * 100 + '%' : 'auto',
    bottom: subtitle.anchor?.startsWith('top') ? 'auto' : subtitle.y / VIEW_HEIGHT * 100 + '%',
    width: Math.min(100, subtitle.width / VIEW_WIDTH * 100) + '%',
    transform: 'rotate(' + subtitle.rotation + 'deg)',
    transformOrigin: (subtitle.anchor?.endsWith('right') ? 'right' : 'left') + ' ' +
      (subtitle.anchor?.startsWith('top') ? 'top' : 'bottom'),
  } : undefined;
  const dialogueText = dialogue && resolveDialogueContent(dialogue);
  const slot = portrait && (portrait.states.find(item => item.id === portrait.activeStateId) ?? portrait.states[0]);
  const effects = getOutcomeVisualEffects(slot?.visualEffects, portrait && run?.visualOutcomes[portrait.id], run?.time ?? 0);
  const portraitUrl = slot?.mediaKind !== 'video' ? slot?.mediaUrl : undefined;
  const narrationPlayback = narration && resolvePlaybackSettings(narration);
  const dialoguePlayback = dialogue && resolvePlaybackSettings(dialogue);

  return <>
    {narration?.note.trim() && <div style={placementStyle}
      className={'absolute pointer-events-none inset-x-3 flex flex-col items-center gap-1.5 ' +
        (resolveSubtitlePosition(narration) === 'top' ? 'top-2.5' : 'bottom-2.5')}>
      <div className="w-full px-3.5 py-2 rounded-lg bg-[#090F22]/82 backdrop-blur-xs text-center border border-white/10 shadow-lg">
        <p className="text-[12.5px] leading-snug text-white font-medium tracking-wide">{narration.note}</p>
      </div>
      {hint && narrationPlayback && <span className="text-[10px] font-semibold text-white/80 tracking-wide">
        {narrationPlayback.mode === 'auto'
          ? (zh ? '自动播放 · ' + narrationPlayback.durationSec + ' 秒后继续' : 'Auto-playing · ' + narrationPlayback.durationSec + 's')
          : narrationPlayback.mode === 'key'
            ? (zh ? '按 ' + (narrationPlayback.key || 'Space') + ' 键继续' : 'Press ' + (narrationPlayback.key || 'Space') + ' to continue')
            : COPY[lang].studio.play.tapToContinue}
      </span>}
    </div>}
    {dialogueText?.body && <div className="absolute pointer-events-none inset-x-2.5 bottom-2.5" style={placementStyle}>
      <div className="flex items-end gap-2.5 p-2.5 rounded-xl bg-[#0F172A]/90 backdrop-blur-xs border border-[#F43F5E]/60 shadow-lg">
        {portraitUrl ? !isHiddenByEffect(effects) &&
          <div className="relative w-11 h-11 rounded-lg bg-white/95 p-1 shrink-0 border border-white/20 flex items-center justify-center overflow-hidden">
            <img src={portraitUrl} alt={dialogueText.speaker || 'Character'} referrerPolicy="no-referrer"
              style={{ opacity: getStaticOpacity(effects), filter: buildCssFilterString(effects) || undefined }}
              className="w-full h-full object-contain" />
          </div> : <div className="w-11 h-11 rounded-lg bg-[#FFF1F2] flex items-center justify-center shrink-0">
            <MessageSquareQuote className="w-5 h-5 text-[#BE123C]" aria-hidden="true" />
          </div>}
        <div className="min-w-0 flex-1">
          {dialogueText.speaker && <div className="text-[11px] font-bold text-[#FDA4AF] leading-tight truncate">{dialogueText.speaker}</div>}
          <p className="mt-0.5 text-[12px] leading-snug text-white font-medium">{dialogueText.body}</p>
          {hint && dialoguePlayback && <div className="mt-1 text-right text-[10px] font-semibold text-[#FBC53D]">
            {dialoguePlayback.mode === 'auto' ? dialoguePlayback.durationSec + 's ▸'
              : dialoguePlayback.mode === 'key' ? (dialoguePlayback.key || 'Space') + ' ▸' : zh ? '点击继续 ▸' : 'Click ▸'}
          </div>}
        </div>
      </div>
    </div>}
  </>;
}
