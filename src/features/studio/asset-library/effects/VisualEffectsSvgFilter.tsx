import { useEffect, useRef, useState } from 'react';
import { EyeOff, Play, Square } from 'lucide-react';
import { COPY, type Language } from '../../../../shared/i18n';
import {
  INTERFACE_FONT_MAP,
  type AssetStateSlot,
  type InterfaceTypography,
} from '../assetLibraryModel';
import {
  NEUTRAL_DYNAMIC_FRAME,
  buildCssFilterString,
  evaluateDynamicEffects,
  getDynamicEffectsMaxDuration,
  getPixelateSize,
  getStaticOpacity,
  hasActiveDynamicEffects,
  isHiddenByEffect,
  type DynamicEffectFrame,
  type VisualEffectItem,
} from './visualEffectsModel';

interface EffectedMediaPreviewProps {
  lang: Language;
  mediaKind: AssetStateSlot['mediaKind'];
  mediaUrl: string;
  alt: string;
  effects?: VisualEffectItem[];
  replayNonce?: number;
}

/**
 * Live WYSIWYG preview box inside AssetEditorDrawer.
 * Applies CSS static effects + crisp Pixelate canvas live, and provides a
 * replay button (plus auto-replay on edits) for dynamic effects.
 */
export function EffectedMediaPreview({
  lang,
  mediaKind,
  mediaUrl,
  alt,
  effects,
  replayNonce = 0,
}: EffectedMediaPreviewProps) {
  const effCopy = COPY[lang].studio.assets.editor.effects;

  const [isPlayingDynamic, setIsPlayingDynamic] = useState(false);
  const [dynFrame, setDynFrame] = useState<DynamicEffectFrame>(NEUTRAL_DYNAMIC_FRAME);
  const [pixelCanvasFailed, setPixelCanvasFailed] = useState(false);

  const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<number>(0);
  const lastReplayNonceRef = useRef<number>(replayNonce);
  const effectsRef = useRef(effects);
  effectsRef.current = effects;

  const hasDynamic = hasActiveDynamicEffects(effects);
  const hiddenByEffect = isHiddenByEffect(effects);
  const staticOpacity = getStaticOpacity(effects);
  const pixelSize = mediaKind !== 'video' ? getPixelateSize(effects) : null;

  // Auto-replay dynamic effects whenever the user adds or tweaks one
  useEffect(() => {
    if (replayNonce > lastReplayNonceRef.current) {
      lastReplayNonceRef.current = replayNonce;
      if (hasActiveDynamicEffects(effectsRef.current)) {
        playStartRef.current = performance.now();
        setIsPlayingDynamic(true);
      }
    }
  }, [replayNonce]);

  // Stop playback if all dynamic effects are removed or disabled
  useEffect(() => {
    if (!hasDynamic && isPlayingDynamic) {
      setIsPlayingDynamic(false);
      setDynFrame(NEUTRAL_DYNAMIC_FRAME);
    }
  }, [hasDynamic, isPlayingDynamic]);

  // requestAnimationFrame loop for dynamic effect preview playback
  useEffect(() => {
    if (!isPlayingDynamic) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setDynFrame(NEUTRAL_DYNAMIC_FRAME);
      return;
    }

    playStartRef.current = performance.now();

    const tick = (now: number) => {
      const currentEffects = effectsRef.current;
      const maxDur = getDynamicEffectsMaxDuration(currentEffects);
      if (maxDur <= 0) {
        setIsPlayingDynamic(false);
        setDynFrame(NEUTRAL_DYNAMIC_FRAME);
        return;
      }
      const elapsedSec = (now - playStartRef.current) / 1000;
      if (elapsedSec > maxDur + 0.08) {
        setIsPlayingDynamic(false);
        setDynFrame(NEUTRAL_DYNAMIC_FRAME);
        return;
      }
      setDynFrame(evaluateDynamicEffects(currentEffects, elapsedSec, false));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlayingDynamic, replayNonce]);

  // Crisp offscreen downscale/upscale for Pixelate effect on images
  useEffect(() => {
    setPixelCanvasFailed(false);
    if (!pixelSize || pixelSize <= 1 || mediaKind === 'video' || !mediaUrl) return;

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const canvas = pixelCanvasRef.current;
      if (!canvas) return;
      const natW = img.naturalWidth || 160;
      const natH = img.naturalHeight || 160;
      const maxDim = 152;
      const ratio = Math.min(maxDim / natW, maxDim / natH, 1.5);
      const drawW = Math.max(24, Math.round(natW * ratio));
      const drawH = Math.max(24, Math.round(natH * ratio));
      canvas.width = drawW;
      canvas.height = drawH;

      const smallW = Math.max(6, Math.round(drawW / (pixelSize * 0.8)));
      const smallH = Math.max(6, Math.round(drawH / (pixelSize * 0.8)));
      const tiny = document.createElement('canvas');
      tiny.width = smallW;
      tiny.height = smallH;
      const tCtx = tiny.getContext('2d');
      const ctx = canvas.getContext('2d');
      if (!tCtx || !ctx) {
        setPixelCanvasFailed(true);
        return;
      }
      tCtx.drawImage(img, 0, 0, smallW, smallH);
      ctx.clearRect(0, 0, drawW, drawH);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tiny, 0, 0, smallW, smallH, 0, 0, drawW, drawH);
    };
    img.onerror = () => {
      if (!cancelled) setPixelCanvasFailed(true);
    };
    img.src = mediaUrl;

    return () => {
      cancelled = true;
    };
  }, [mediaUrl, mediaKind, pixelSize]);

  const cssFilter = buildCssFilterString(effects) || undefined;

  const computedOpacity = hiddenByEffect
    ? 0.22
    : Math.max(0, Math.min(1, staticOpacity * dynFrame.opacityMul));

  const computedTransform =
    dynFrame.offsetX !== 0 || dynFrame.offsetY !== 0 || dynFrame.scale !== 1
      ? `translate(${dynFrame.offsetX.toFixed(1)}px, ${dynFrame.offsetY.toFixed(1)}px) scale(${dynFrame.scale.toFixed(3)})`
      : undefined;

  const handleTogglePlay = () => {
    if (isPlayingDynamic) {
      setIsPlayingDynamic(false);
    } else {
      playStartRef.current = performance.now();
      setIsPlayingDynamic(true);
    }
  };

  return (
    <div className="relative h-44 flex items-center justify-center p-3 overflow-hidden">
      <div
        style={{
          opacity: computedOpacity,
          filter: cssFilter,
          transform: computedTransform,
        }}
        className="max-h-full max-w-full flex items-center justify-center will-change-transform"
      >
        {mediaKind === 'video' ? (
          <video
            src={mediaUrl}
            controls
            muted
            loop
            playsInline
            style={pixelSize ? { imageRendering: 'pixelated' } : undefined}
            className="max-h-36 max-w-full rounded-lg object-contain"
          />
        ) : pixelSize && !pixelCanvasFailed ? (
          <canvas
            ref={pixelCanvasRef}
            aria-label={alt}
            className="max-h-36 max-w-full rounded-xl object-contain"
          />
        ) : (
          <img
            src={mediaUrl}
            alt={alt}
            referrerPolicy="no-referrer"
            className="max-h-36 max-w-full rounded-xl object-contain"
          />
        )}
      </div>

      {/* Ghosted indicator when Visibility is set to Hide */}
      {hiddenByEffect && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#14244B]/85 text-white text-[11px] font-semibold shadow-xs whitespace-nowrap">
            <EyeOff className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{effCopy.hiddenBadge}</span>
          </span>
        </div>
      )}

      {/* Dynamic Effect Replay Button */}
      {hasDynamic && (
        <button
          type="button"
          onClick={handleTogglePlay}
          className={`absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            isPlayingDynamic
              ? 'bg-[#14244B] text-white border-[#14244B]'
              : 'bg-white/95 text-[#14244B] border-[#CBD5E1] hover:border-[#14244B]'
          }`}
        >
          {isPlayingDynamic ? (
            <>
              <Square className="w-2.5 h-2.5 fill-current shrink-0" aria-hidden="true" />
              <span>{effCopy.previewStop}</span>
            </>
          ) : (
            <>
              <Play className="w-2.5 h-2.5 fill-current shrink-0" aria-hidden="true" />
              <span>{effCopy.previewPlay}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

interface EffectedTextPreviewProps {
  lang: Language;
  typography: InterfaceTypography;
  fallbackText: string;
  effects?: VisualEffectItem[];
  replayNonce?: number;
}

/**
 * Live WYSIWYG Interface Text preview supporting both Typewriter reveal and
 * static/dynamic Visual Effects seamlessly in one unified preview box.
 */
export function EffectedTextPreview({
  lang,
  typography,
  fallbackText,
  effects,
  replayNonce = 0,
}: EffectedTextPreviewProps) {
  const ed = COPY[lang].studio.assets.editor;
  const effCopy = ed.effects;

  const fullText = typography.text || fallbackText;
  const revealMode = typography.revealMode ?? 'instant';
  const typewriterSpeed = Math.max(5, Math.min(60, typography.typewriterSpeed ?? 20));
  const isTypewriter = revealMode === 'typewriter';
  const hasDynamic = hasActiveDynamicEffects(effects);
  const canReplay = isTypewriter || hasDynamic;

  const [isPlaying, setIsPlaying] = useState(false);
  const [typedCharCount, setTypedCharCount] = useState<number | null>(null);
  const [dynFrame, setDynFrame] = useState<DynamicEffectFrame>(NEUTRAL_DYNAMIC_FRAME);
  const [localReplayNonce, setLocalReplayNonce] = useState(0);

  const rafRef = useRef<number | null>(null);
  const lastExternalReplayRef = useRef(replayNonce);
  const effectsRef = useRef(effects);
  effectsRef.current = effects;

  // Trigger playback when external replayNonce increments (adding/tweaking dynamic effect or switching to typewriter)
  useEffect(() => {
    if (replayNonce > lastExternalReplayRef.current) {
      lastExternalReplayRef.current = replayNonce;
      if (isTypewriter || hasActiveDynamicEffects(effectsRef.current)) {
        setLocalReplayNonce((n) => n + 1);
        setIsPlaying(true);
      }
    }
  }, [replayNonce, isTypewriter]);

  // Auto-replay typewriter whenever text or speed changes in Typewriter mode
  useEffect(() => {
    if (isTypewriter) {
      setLocalReplayNonce((n) => n + 1);
      setIsPlaying(true);
    } else {
      setTypedCharCount(null);
      if (!hasActiveDynamicEffects(effectsRef.current)) {
        setIsPlaying(false);
      }
    }
  }, [isTypewriter, typewriterSpeed, fullText]);

  // Stop if neither typewriter nor dynamic effect is active
  useEffect(() => {
    if (!canReplay && isPlaying) {
      setIsPlaying(false);
      setTypedCharCount(null);
      setDynFrame(NEUTRAL_DYNAMIC_FRAME);
    }
  }, [canReplay, isPlaying]);

  // Unified RAF loop for Typewriter + Dynamic Visual Effects
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setTypedCharCount(null);
      setDynFrame(NEUTRAL_DYNAMIC_FRAME);
      return;
    }

    const glyphs = Array.from(fullText);
    const typeDur = isTypewriter && glyphs.length > 0 ? glyphs.length / typewriterSpeed : 0;
    const dynDur = getDynamicEffectsMaxDuration(effectsRef.current);
    const totalDur = Math.max(typeDur, dynDur);

    if (totalDur <= 0) {
      setIsPlaying(false);
      return;
    }

    const startTime = performance.now();
    if (isTypewriter) setTypedCharCount(0);

    const tick = (now: number) => {
      const elapsedSec = (now - startTime) / 1000;
      const curEffects = effectsRef.current;
      const curDynDur = getDynamicEffectsMaxDuration(curEffects);
      const curTotal = Math.max(typeDur, curDynDur);

      if (isTypewriter) {
        const shown = Math.min(glyphs.length, Math.floor(elapsedSec * typewriterSpeed));
        setTypedCharCount(shown);
      } else {
        setTypedCharCount(null);
      }

      if (curDynDur > 0) {
        setDynFrame(evaluateDynamicEffects(curEffects, elapsedSec, false));
      } else {
        setDynFrame(NEUTRAL_DYNAMIC_FRAME);
      }

      if (elapsedSec > curTotal + 0.08) {
        setIsPlaying(false);
        setTypedCharCount(null);
        setDynFrame(NEUTRAL_DYNAMIC_FRAME);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, localReplayNonce, fullText, isTypewriter, typewriterSpeed]);

  const glyphs = Array.from(fullText);
  const visibleCount =
    isTypewriter && typedCharCount !== null
      ? Math.min(glyphs.length, typedCharCount)
      : glyphs.length;
  const displayedText = isTypewriter
    ? glyphs.slice(0, visibleCount).join('')
    : fullText;
  const isTyping = isTypewriter && isPlaying && visibleCount < glyphs.length;

  const hiddenByEffect = isHiddenByEffect(effects);
  const staticOpacity = getStaticOpacity(effects);
  const cssFilter = buildCssFilterString(effects) || undefined;
  const computedOpacity = hiddenByEffect
    ? 0.22
    : Math.max(0, Math.min(1, staticOpacity * dynFrame.opacityMul));
  const computedTransform =
    dynFrame.offsetX !== 0 || dynFrame.offsetY !== 0 || dynFrame.scale !== 1
      ? `translate(${dynFrame.offsetX.toFixed(1)}px, ${dynFrame.offsetY.toFixed(1)}px) scale(${dynFrame.scale.toFixed(3)})`
      : undefined;

  const handleToggleReplay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setLocalReplayNonce((n) => n + 1);
      setIsPlaying(true);
    }
  };

  return (
    <div className="relative h-32 px-5 flex items-center justify-center overflow-hidden">
      <div
        style={{
          opacity: computedOpacity,
          filter: cssFilter,
          transform: computedTransform,
        }}
        className="max-w-full flex items-center justify-center will-change-transform"
      >
        <span
          style={{
            fontFamily: INTERFACE_FONT_MAP[typography.fontId].cssFamily,
            fontSize: `${typography.fontSize}px`,
            fontWeight: typography.fontWeight,
            fontStyle: typography.italic ? 'italic' : 'normal',
            textDecoration: typography.underline ? 'underline' : 'none',
            textUnderlineOffset: '4px',
            color: typography.textColor,
          }}
          className="text-center leading-tight max-w-full truncate"
        >
          {displayedText}
          {isTyping && (
            <span
              className="inline-block w-[2px] h-[0.88em] align-middle ml-0.5 bg-current animate-pulse"
              aria-hidden="true"
            />
          )}
        </span>
      </div>

      {/* Ghosted indicator when Visibility is set to Hide */}
      {hiddenByEffect && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#14244B]/85 text-white text-[11px] font-semibold shadow-xs whitespace-nowrap">
            <EyeOff className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{effCopy.hiddenBadge}</span>
          </span>
        </div>
      )}

      {/* Unified Replay / Stop Button for Typewriter & Dynamic Effects */}
      {canReplay && (
        <button
          type="button"
          onClick={handleToggleReplay}
          className={`absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            isPlaying
              ? 'bg-[#14244B] text-white border-[#14244B]'
              : 'bg-white/95 text-[#14244B] border-[#CBD5E1] hover:border-[#14244B]'
          }`}
        >
          {isPlaying ? (
            <>
              <Square className="w-2.5 h-2.5 fill-current shrink-0" aria-hidden="true" />
              <span>{effCopy.previewStop}</span>
            </>
          ) : (
            <>
              <Play className="w-2.5 h-2.5 fill-current shrink-0" aria-hidden="true" />
              <span>{hasDynamic ? effCopy.previewPlay : ed.replayReveal}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
