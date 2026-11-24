export type VisualEffectCategoryId =
  | 'transparency'
  | 'color'
  | 'style'
  | 'glowShadow'
  | 'dynamic';

export type VisualEffectType =
  | 'opacity'
  | 'visibility'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'hue'
  | 'grayscale'
  | 'blur'
  | 'pixelate'
  | 'glow'
  | 'shadow'
  | 'flash'
  | 'fade'
  | 'pulse'
  | 'shake';

export type FadeEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export type VisualEffectItem =
  | { type: 'opacity'; enabled: boolean; value: number }
  | { type: 'visibility'; enabled: boolean; visible: boolean }
  | { type: 'brightness'; enabled: boolean; value: number }
  | { type: 'contrast'; enabled: boolean; value: number }
  | { type: 'saturation'; enabled: boolean; value: number }
  | { type: 'hue'; enabled: boolean; value: number }
  | { type: 'grayscale'; enabled: boolean; value: number }
  | { type: 'blur'; enabled: boolean; radius: number }
  | { type: 'pixelate'; enabled: boolean; pixelSize: number }
  | {
      type: 'glow';
      enabled: boolean;
      color: string;
      intensity: number;
      radius: number;
    }
  | {
      type: 'shadow';
      enabled: boolean;
      color: string;
      offsetX: number;
      offsetY: number;
      blur: number;
      opacity: number;
    }
  | {
      type: 'flash';
      enabled: boolean;
      frequency: number;
      duration: number;
      count: number;
    }
  | {
      type: 'fade';
      enabled: boolean;
      startOpacity: number;
      endOpacity: number;
      duration: number;
      easing: FadeEasing;
    }
  | {
      type: 'pulse';
      enabled: boolean;
      scale: number;
      frequency: number;
      count: number;
    }
  | {
      type: 'shake';
      enabled: boolean;
      intensity: number;
      frequency: number;
      duration: number;
    };

export const VISUAL_EFFECT_GROUPS: readonly {
  categoryId: VisualEffectCategoryId;
  types: readonly VisualEffectType[];
}[] = [
  {
    categoryId: 'transparency',
    types: ['opacity', 'visibility'],
  },
  {
    categoryId: 'color',
    types: ['brightness', 'contrast', 'saturation', 'hue', 'grayscale'],
  },
  {
    categoryId: 'style',
    types: ['blur', 'pixelate'],
  },
  {
    categoryId: 'glowShadow',
    types: ['glow', 'shadow'],
  },
  {
    categoryId: 'dynamic',
    types: ['flash', 'fade', 'pulse', 'shake'],
  },
];

export const DYNAMIC_EFFECT_TYPES: ReadonlySet<VisualEffectType> = new Set([
  'flash',
  'fade',
  'pulse',
  'shake',
]);

export function isDynamicEffectType(type: VisualEffectType): boolean {
  return DYNAMIC_EFFECT_TYPES.has(type);
}

/**
 * Bilingual keyword rules for intent-driven progressive unlocking of individual
 * visual effects based on student-authored Design Board cards.
 */
const EFFECT_UNLOCK_KEYWORDS: Record<VisualEffectType, RegExp> = {
  opacity: /\b(opacity|transparent|transparency|translucent|alpha|ghost)\b|透明|半透明/i,
  visibility: /\b(visibility|visible|invisible|hide|hidden|disappear|vanish)\b|可见|隐藏|消失|隐身/i,
  brightness: /\b(brightness|bright|brighten|dim|darken)\b|亮度|变亮|变暗|明暗/i,
  contrast: /\b(contrast)\b|对比度/i,
  saturation: /\b(saturation|saturate|vivid)\b|饱和度|鲜艳/i,
  hue: /\b(hue|rainbow|color shift)\b|色相|色调/i,
  grayscale: /\b(grayscale|greyscale|black and white|monochrome)\b|黑白|去色|灰度/i,
  blur: /\b(blur|blurry|fuzzy|out of focus)\b|模糊|虚化/i,
  pixelate: /\b(pixelate|pixel|8-bit|8bit|retro)\b|像素/i,
  glow: /\b(glow|glowing|shine|shining|aura|luminous|neon)\b|发光|光晕|闪耀/i,
  shadow: /\b(shadow|drop shadow)\b|阴影|影子/i,
  flash: /\b(flash|blink|flicker)\b|闪烁|一闪/i,
  fade: /\b(fade|fade in|fade out)\b|渐显|渐隐|淡入|淡出/i,
  pulse: /\b(pulse|heartbeat|throb|breathe)\b|脉冲|呼吸|放大缩小/i,
  shake: /\b(shake|shaking|vibrate|quake|tremble|hit recoil)\b|震动|抖动|摇晃/i,
};

export function detectUnlockedVisualEffectsFromText(
  texts: string[],
): VisualEffectType[] {
  if (texts.length === 0) return [];
  const combined = texts.join('\n');
  if (!combined.trim()) return [];

  const unlocked: VisualEffectType[] = [];
  for (const group of VISUAL_EFFECT_GROUPS) {
    for (const type of group.types) {
      if (EFFECT_UNLOCK_KEYWORDS[type].test(combined)) {
        unlocked.push(type);
      }
    }
  }
  return unlocked;
}

export function createDefaultVisualEffect(type: VisualEffectType): VisualEffectItem {
  switch (type) {
    case 'opacity':
      return { type: 'opacity', enabled: true, value: 65 };
    case 'visibility':
      return { type: 'visibility', enabled: true, visible: false };
    case 'brightness':
      return { type: 'brightness', enabled: true, value: 125 };
    case 'contrast':
      return { type: 'contrast', enabled: true, value: 135 };
    case 'saturation':
      return { type: 'saturation', enabled: true, value: 150 };
    case 'hue':
      return { type: 'hue', enabled: true, value: 45 };
    case 'grayscale':
      return { type: 'grayscale', enabled: true, value: 100 };
    case 'blur':
      return { type: 'blur', enabled: true, radius: 3 };
    case 'pixelate':
      return { type: 'pixelate', enabled: true, pixelSize: 6 };
    case 'glow':
      return { type: 'glow', enabled: true, color: '#FBC53D', intensity: 75, radius: 10 };
    case 'shadow':
      return {
        type: 'shadow',
        enabled: true,
        color: '#0F172A',
        offsetX: 4,
        offsetY: 6,
        blur: 6,
        opacity: 45,
      };
    case 'flash':
      return { type: 'flash', enabled: true, frequency: 6, duration: 1.2, count: 4 };
    case 'fade':
      return {
        type: 'fade',
        enabled: true,
        startOpacity: 15,
        endOpacity: 100,
        duration: 1.0,
        easing: 'ease-out',
      };
    case 'pulse':
      return { type: 'pulse', enabled: true, scale: 120, frequency: 2.5, count: 3 };
    case 'shake':
      return { type: 'shake', enabled: true, intensity: 7, frequency: 22, duration: 0.7 };
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(full, 16);
  const r = Number.isFinite(num) ? (num >> 16) & 255 : 15;
  const g = Number.isFinite(num) ? (num >> 8) & 255 : 23;
  const b = Number.isFinite(num) ? num & 255 : 42;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

export function getEnabledEffects(effects?: VisualEffectItem[]): VisualEffectItem[] {
  if (!effects || effects.length === 0) return [];
  return effects.filter((e) => e.enabled);
}

export function isHiddenByEffect(effects?: VisualEffectItem[]): boolean {
  const vis = getEnabledEffects(effects).find((e) => e.type === 'visibility');
  return vis ? !vis.visible : false;
}

export function getStaticOpacity(effects?: VisualEffectItem[]): number {
  const op = getEnabledEffects(effects).find((e) => e.type === 'opacity');
  if (!op) return 1;
  return Math.max(0, Math.min(1, op.value / 100));
}

export function getPixelateSize(effects?: VisualEffectItem[]): number | null {
  const px = getEnabledEffects(effects).find((e) => e.type === 'pixelate');
  if (!px || px.pixelSize <= 1) return null;
  return Math.round(px.pixelSize);
}

export function hasActiveDynamicEffects(effects?: VisualEffectItem[]): boolean {
  return getEnabledEffects(effects).some((e) => DYNAMIC_EFFECT_TYPES.has(e.type));
}

export function getDynamicEffectsMaxDuration(effects?: VisualEffectItem[]): number {
  let maxDur = 0;
  for (const eff of getEnabledEffects(effects)) {
    if (eff.type === 'flash') {
      const byCount = eff.frequency > 0 ? eff.count / eff.frequency : eff.duration;
      maxDur = Math.max(maxDur, Math.min(eff.duration, Math.max(0.2, byCount)));
    } else if (eff.type === 'fade') {
      maxDur = Math.max(maxDur, Math.max(0.15, eff.duration));
    } else if (eff.type === 'pulse') {
      const dur = eff.frequency > 0 ? eff.count / eff.frequency : 1.2;
      maxDur = Math.max(maxDur, Math.max(0.2, dur));
    } else if (eff.type === 'shake') {
      maxDur = Math.max(maxDur, Math.max(0.15, eff.duration));
    }
  }
  return maxDur;
}

export function applyFadeEasing(t: number, easing: FadeEasing): number {
  const x = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'linear':
      return x;
    case 'ease-in':
      return x * x;
    case 'ease-out':
      return 1 - (1 - x) * (1 - x);
    case 'ease-in-out':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }
}

export interface DynamicEffectFrame {
  opacityMul: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  isActive: boolean;
}

export const NEUTRAL_DYNAMIC_FRAME: DynamicEffectFrame = {
  opacityMul: 1,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  isActive: false,
};

/**
 * Deterministic time-based evaluator shared by Asset Editor preview and Play 2D stage.
 * When `loop` is true (Play stage), each dynamic cycle repeats cleanly with a brief pause.
 */
export function evaluateDynamicEffects(
  effects: VisualEffectItem[] | undefined,
  elapsedSec: number,
  loop = false,
): DynamicEffectFrame {
  const enabled = getEnabledEffects(effects);
  const maxDur = getDynamicEffectsMaxDuration(enabled);
  if (maxDur <= 0) return NEUTRAL_DYNAMIC_FRAME;

  const t = loop ? elapsedSec % (maxDur + 0.55) : elapsedSec;

  let opacityMul = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let isActive = false;

  for (const eff of enabled) {
    if (eff.type === 'flash') {
      const cycleSpan = eff.frequency > 0 ? eff.count / eff.frequency : eff.duration;
      const activeDur = Math.min(eff.duration, Math.max(0.1, cycleSpan));
      if (t >= 0 && t <= activeDur) {
        isActive = true;
        const phase = Math.sin(t * eff.frequency * Math.PI * 2);
        opacityMul *= phase >= 0 ? 1 : 0.14;
      }
    } else if (eff.type === 'fade') {
      const dur = Math.max(0.1, eff.duration);
      const rawProgress = Math.max(0, Math.min(1, t / dur));
      if (t <= dur) isActive = true;
      const eased = applyFadeEasing(rawProgress, eff.easing);
      const val =
        (eff.startOpacity + (eff.endOpacity - eff.startOpacity) * eased) / 100;
      opacityMul *= Math.max(0, Math.min(1, val));
    } else if (eff.type === 'pulse') {
      const dur = eff.frequency > 0 ? eff.count / eff.frequency : 1;
      if (t >= 0 && t <= dur) {
        isActive = true;
        const wave = 0.5 - 0.5 * Math.cos(t * eff.frequency * Math.PI * 2);
        const targetScale = eff.scale / 100;
        scale *= 1 + (targetScale - 1) * wave;
      }
    } else if (eff.type === 'shake') {
      const dur = Math.max(0.1, eff.duration);
      if (t >= 0 && t <= dur) {
        isActive = true;
        const decay = 1 - (t / dur) * 0.35;
        offsetX += Math.sin(t * eff.frequency * Math.PI * 2) * eff.intensity * decay;
        offsetY +=
          Math.cos(t * eff.frequency * Math.PI * 1.6) * eff.intensity * 0.45 * decay;
      }
    }
  }

  return {
    opacityMul,
    scale,
    offsetX,
    offsetY,
    isActive,
  };
}

export function buildCssFilterString(effects?: VisualEffectItem[]): string {
  const parts: string[] = [];
  for (const eff of getEnabledEffects(effects)) {
    switch (eff.type) {
      case 'brightness':
        parts.push(`brightness(${(eff.value / 100).toFixed(2)})`);
        break;
      case 'contrast':
        parts.push(`contrast(${(eff.value / 100).toFixed(2)})`);
        break;
      case 'saturation':
        parts.push(`saturate(${(eff.value / 100).toFixed(2)})`);
        break;
      case 'hue':
        parts.push(`hue-rotate(${Math.round(eff.value)}deg)`);
        break;
      case 'grayscale':
        parts.push(`grayscale(${(eff.value / 100).toFixed(2)})`);
        break;
      case 'blur':
        if (eff.radius > 0) parts.push(`blur(${eff.radius.toFixed(1)}px)`);
        break;
      case 'glow': {
        const alpha = Math.max(0.08, Math.min(1, eff.intensity / 100));
        const glowColor = hexToRgba(eff.color, alpha);
        const r = Math.max(1, eff.radius);
        parts.push(`drop-shadow(0 0 ${r.toFixed(1)}px ${glowColor})`);
        if (eff.intensity > 55) {
          parts.push(`drop-shadow(0 0 ${(r * 0.55).toFixed(1)}px ${glowColor})`);
        }
        break;
      }
      case 'shadow': {
        const alpha = Math.max(0, Math.min(1, eff.opacity / 100));
        const shadowColor = hexToRgba(eff.color, alpha);
        parts.push(
          `drop-shadow(${eff.offsetX}px ${eff.offsetY}px ${eff.blur}px ${shadowColor})`,
        );
        break;
      }
      default:
        break;
    }
  }
  return parts.join(' ');
}

export function getStaticEffectsFingerprint(effects?: VisualEffectItem[]): string {
  const staticOnly = getEnabledEffects(effects).filter(
    (e) => !DYNAMIC_EFFECT_TYPES.has(e.type),
  );
  if (staticOnly.length === 0) return '';
  return JSON.stringify(staticOnly);
}

/**
 * Bakes static visual effects (Pixelate + CSS filters: Color, Blur, Glow, Shadow)
 * onto a padded offscreen canvas for smooth 60fps Play stage rendering.
 */
export function bakeStaticEffectsToCanvas(
  img: HTMLImageElement,
  effects?: VisualEffectItem[],
): { canvas: HTMLCanvasElement; padRatio: number } | null {
  const enabled = getEnabledEffects(effects).filter(
    (e) => !DYNAMIC_EFFECT_TYPES.has(e.type) && e.type !== 'visibility' && e.type !== 'opacity',
  );
  if (enabled.length === 0) return null;

  const baseSize = 140;
  const pad = 28;
  const totalSize = baseSize + pad * 2;

  const work = document.createElement('canvas');
  work.width = baseSize;
  work.height = baseSize;
  const wCtx = work.getContext('2d');
  if (!wCtx) return null;

  const pixelSize = getPixelateSize(enabled);
  if (pixelSize && pixelSize > 1) {
    const smallDim = Math.max(6, Math.round(baseSize / (pixelSize * 0.75)));
    const tiny = document.createElement('canvas');
    tiny.width = smallDim;
    tiny.height = smallDim;
    const tCtx = tiny.getContext('2d');
    if (tCtx) {
      tCtx.drawImage(img, 0, 0, smallDim, smallDim);
      wCtx.imageSmoothingEnabled = false;
      wCtx.drawImage(tiny, 0, 0, smallDim, smallDim, 0, 0, baseSize, baseSize);
      wCtx.imageSmoothingEnabled = true;
    } else {
      wCtx.drawImage(img, 0, 0, baseSize, baseSize);
    }
  } else {
    wCtx.drawImage(img, 0, 0, baseSize, baseSize);
  }

  const out = document.createElement('canvas');
  out.width = totalSize;
  out.height = totalSize;
  const oCtx = out.getContext('2d');
  if (!oCtx) return null;

  const cssFilter = buildCssFilterString(enabled);
  oCtx.save();
  if (cssFilter) {
    oCtx.filter = cssFilter;
  }
  oCtx.drawImage(work, pad, pad);
  oCtx.restore();

  return { canvas: out, padRatio: pad / baseSize };
}

/**
 * Draws a sprite onto the 2D Play canvas with full static + dynamic Visual Effects support.
 */
export function drawSpriteWithEffects(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  baked: { canvas: HTMLCanvasElement; padRatio: number } | null,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  effects: VisualEffectItem[] | undefined,
  timeSec: number,
  rotateRad = 0,
  baseAlpha = 1,
) {
  if (isHiddenByEffect(effects)) return;

  const staticOpacity = getStaticOpacity(effects);
  const dyn = evaluateDynamicEffects(effects, timeSec, true);
  const finalAlpha = Math.max(0, Math.min(1, baseAlpha * staticOpacity * dyn.opacityMul));
  if (finalAlpha <= 0.005) return;

  ctx.save();
  ctx.globalAlpha *= finalAlpha;
  ctx.translate(centerX + dyn.offsetX, centerY + dyn.offsetY);
  if (rotateRad !== 0) ctx.rotate(rotateRad);
  if (dyn.scale !== 1) ctx.scale(dyn.scale, dyn.scale);

  if (baked) {
    const padW = width * baked.padRatio;
    const padH = height * baked.padRatio;
    ctx.drawImage(
      baked.canvas,
      -width / 2 - padW,
      -height / 2 - padH,
      width + padW * 2,
      height + padH * 2,
    );
  } else {
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
  }

  ctx.restore();
}
