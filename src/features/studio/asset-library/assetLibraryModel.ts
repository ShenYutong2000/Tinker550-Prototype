import type { Language } from '../../../shared/i18n';
import type { StateVariable } from '../properties/stateModel';
import type { VisualEffectItem } from './effects/visualEffectsModel';

export type AssetCategoryId =
  | 'characters'
  | 'objects'
  | 'backgrounds'
  | 'interface'
  | 'effects';

export type MediaKind = 'generated' | 'image' | 'video';

export type InterfaceMode = 'text' | 'image';

export type InterfaceFontId = 'fredoka' | 'jakarta' | 'mono' | 'serif';

export type TextRevealMode = 'instant' | 'typewriter';

export interface InterfaceTypography {
  text: string;
  fontId: InterfaceFontId;
  fontSize: number; // 14 - 44
  fontWeight: 500 | 700;
  italic: boolean;
  underline: boolean;
  textColor: string;
  revealMode?: TextRevealMode;
  typewriterSpeed?: number; // characters per second (5 - 60)
}

export interface AssetCandidate {
  id: string;
  styleLabelEn: string;
  styleLabelZh: string;
  previewUrl: string;
}

export interface AudioCandidate {
  id: string;
  labelEn: string;
  labelZh: string;
  durationSec: number;
  audioUrl: string;
}

export interface AssetStateSlot {
  id: string;
  name: string;
  // Visual channel (Image / Video via AI or Upload)
  prompt: string;
  mediaKind: MediaKind;
  mediaUrl: string;
  mediaFileName?: string;
  candidates: AssetCandidate[];
  selectedCandidateId: string | null;
  visualEffects?: VisualEffectItem[];
  // Audio channel (Optional SFX via AI or Upload)
  audioPrompt: string;
  audioUrl?: string;
  audioFileName?: string;
  audioCandidates: AudioCandidate[];
  selectedAudioCandidateId: string | null;
}

export interface AssetSubFolder {
  id: string;
  categoryId: AssetCategoryId;
  name: string;
  isAiCreated?: boolean;
}

export interface AssetItem {
  id: string;
  categoryId: AssetCategoryId;
  folderId: string | null; // null = directly under fixed category root
  name: string;
  states: AssetStateSlot[]; // Always >= 1; multi-slot UI activates for characters & objects
  activeStateId: string;
  properties?: StateVariable[]; // Asset-level data properties (characters, objects, backgrounds)
  interfaceMode?: InterfaceMode; // Only used when categoryId === 'interface'
  typography?: InterfaceTypography;
  isAiCreated?: boolean;
}

export interface FixedCategoryMeta {
  id: AssetCategoryId;
  labelEn: string;
  labelZh: string;
  supportsStates: boolean;
  supportsProperties: boolean;
  supportsInterfaceModes: boolean;
  accentColor: string;
}

export const FIXED_ASSET_CATEGORIES: readonly FixedCategoryMeta[] = [
  {
    id: 'characters',
    labelEn: 'Characters',
    labelZh: '角色',
    supportsStates: true,
    supportsProperties: true,
    supportsInterfaceModes: false,
    accentColor: '#2563EB',
  },
  {
    id: 'objects',
    labelEn: 'Objects',
    labelZh: '物品',
    supportsStates: true,
    supportsProperties: true,
    supportsInterfaceModes: false,
    accentColor: '#D97706',
  },
  {
    id: 'backgrounds',
    labelEn: 'Backgrounds',
    labelZh: '背景',
    supportsStates: false,
    supportsProperties: true,
    supportsInterfaceModes: false,
    accentColor: '#059669',
  },
  {
    id: 'interface',
    labelEn: 'Interface',
    labelZh: '游戏界面',
    supportsStates: false,
    supportsProperties: false,
    supportsInterfaceModes: true,
    accentColor: '#4338CA',
  },
  {
    id: 'effects',
    labelEn: 'Effects',
    labelZh: '特效',
    supportsStates: false,
    supportsProperties: false,
    supportsInterfaceModes: false,
    accentColor: '#E11D48',
  },
] as const;

export const INTERFACE_FONT_MAP: Record<
  InterfaceFontId,
  { labelEn: string; labelZh: string; cssFamily: string }
> = {
  fredoka: {
    labelEn: 'Fredoka (Playful)',
    labelZh: 'Fredoka 圆润标题',
    cssFamily: '"Fredoka", "Noto Sans SC", sans-serif',
  },
  jakarta: {
    labelEn: 'Jakarta Sans (Clean)',
    labelZh: 'Jakarta 无衬线',
    cssFamily: '"Plus Jakarta Sans", "Noto Sans SC", sans-serif',
  },
  mono: {
    labelEn: 'IBM Mono (Arcade)',
    labelZh: 'IBM 等宽街机',
    cssFamily: '"IBM Plex Mono", monospace',
  },
  serif: {
    labelEn: 'Georgia (Storybook)',
    labelZh: '衬线故事体',
    cssFamily: 'Georgia, "Noto Serif SC", serif',
  },
};

export function createDefaultTypography(name: string, lang: Language): InterfaceTypography {
  return {
    text: name || (lang === 'zh' ? '开始游戏' : 'Start Game'),
    fontId: 'fredoka',
    fontSize: 26,
    fontWeight: 700,
    italic: false,
    underline: false,
    textColor: '#14244B',
    revealMode: 'instant',
    typewriterSpeed: 20,
  };
}

// ---------------------------------------------------------------------------
// Zero-Token Visual Candidate Generator (1–3 distinct vector game-art styles)
// ---------------------------------------------------------------------------

type VisualMotif =
  | 'cat'
  | 'bird'
  | 'slime'
  | 'robot'
  | 'star'
  | 'potion'
  | 'key'
  | 'meadow'
  | 'night'
  | 'castle'
  | 'sparkle'
  | 'explosion'
  | 'ui'
  | 'generic';

function detectMotif(prompt: string, categoryId: AssetCategoryId): VisualMotif {
  const p = prompt.toLowerCase();
  if (/cat|kitten|tabby|猫|喵/.test(p)) return 'cat';
  if (/bird|owl|wing|duck|鸟|雀|鹰/.test(p)) return 'bird';
  if (/slime|blob|monster|enemy|史莱姆|怪|敌/.test(p)) return 'slime';
  if (/robot|bot|mech|机器人|机甲/.test(p)) return 'robot';
  if (/star|coin|gem|gold|星|金币|宝石|宝/.test(p)) return 'star';
  if (/potion|heart|apple|food|药水|爱心|果/.test(p)) return 'potion';
  if (/key|door|chest|switch|钥匙|机关|宝箱/.test(p)) return 'key';
  if (/night|space|moon|galaxy|夜|太空|星空|月/.test(p)) return 'night';
  if (/castle|tower|city|room|城|塔|屋|房/.test(p)) return 'castle';
  if (/meadow|forest|grass|tree|hill|草|森|树|地|山/.test(p)) return 'meadow';
  if (/boom|explo|fire|hit|crash|爆|火|撞|击/.test(p)) return 'explosion';
  if (/spark|glow|magic|flash|reward|闪|光|魔法|奖/.test(p)) return 'sparkle';
  if (/button|score|hud|dialog|menu|icon|按钮|分数|对话|栏|图标/.test(p)) return 'ui';

  if (categoryId === 'characters') return 'cat';
  if (categoryId === 'objects') return 'star';
  if (categoryId === 'backgrounds') return 'meadow';
  if (categoryId === 'interface') return 'ui';
  return 'sparkle';
}

const STYLE_PALETTES = [
  {
    id: 'flat',
    labelEn: 'Studio Flat',
    labelZh: '扁平插画',
    bg: '#F0F7FF',
    accent: '#F59E0B',
    secondary: '#4E9AE3',
    ink: '#14244B',
    soft: '#DBEAFE',
    strokeWidth: 3.5,
  },
  {
    id: 'craft',
    labelEn: 'Warm Craft',
    labelZh: '暖色积木',
    bg: '#FFFBEB',
    accent: '#F05440',
    secondary: '#48B5A3',
    ink: '#1E293B',
    soft: '#FEF3C7',
    strokeWidth: 4.5,
  },
  {
    id: 'sticker',
    labelEn: 'Sticker Ink',
    labelZh: '贴纸描边',
    bg: '#F0FDF4',
    accent: '#6366F1',
    secondary: '#FBC53D',
    ink: '#0F172A',
    soft: '#DCFCE7',
    strokeWidth: 5,
  },
] as const;

function buildMotifSvg(motif: VisualMotif, variantIndex: number): string {
  const pal = STYLE_PALETTES[variantIndex % STYLE_PALETTES.length];
  const sw = pal.strokeWidth;
  const tilt = variantIndex === 0 ? 0 : variantIndex === 1 ? -4 : 4;

  let body = '';

  switch (motif) {
    case 'cat':
      body = `
        <g transform="rotate(${tilt} 100 100)">
          <polygon points="56,74 68,36 90,64" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="${sw}" stroke-linejoin="round"/>
          <polygon points="144,74 132,36 110,64" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="${sw}" stroke-linejoin="round"/>
          <ellipse cx="100" cy="106" rx="48" ry="42" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="${sw}"/>
          <ellipse cx="100" cy="116" rx="28" ry="20" fill="#FFFDF7"/>
          <circle cx="82" cy="98" r="5.5" fill="${pal.ink}"/>
          <circle cx="118" cy="98" r="5.5" fill="${pal.ink}"/>
          <circle cx="84" cy="96" r="2" fill="#FFFFFF"/>
          <circle cx="120" cy="96" r="2" fill="#FFFFFF"/>
          <polygon points="95,109 105,109 100,115" fill="${pal.ink}"/>
          <path d="M90 119 Q100 127 110 119" fill="none" stroke="${pal.ink}" stroke-width="3" stroke-linecap="round"/>
          <path d="M52 106 L34 102 M52 114 L34 116 M148 106 L166 102 M148 114 L166 116" stroke="${pal.ink}" stroke-width="2.6" stroke-linecap="round"/>
        </g>`;
      break;
    case 'bird':
      body = `
        <g transform="rotate(${tilt} 100 100)">
          <ellipse cx="96" cy="108" rx="42" ry="34" fill="${pal.secondary}" stroke="${pal.ink}" stroke-width="${sw}"/>
          <path d="M54 114 Q74 88 106 112 Q80 132 54 114 Z" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="${sw}" stroke-linejoin="round"/>
          <polygon points="136,98 160,106 136,114" fill="#FBC53D" stroke="${pal.ink}" stroke-width="${sw}" stroke-linejoin="round"/>
          <circle cx="118" cy="96" r="5.5" fill="${pal.ink}"/>
          <circle cx="120" cy="94" r="2" fill="#FFFFFF"/>
          <path d="M84 142 L80 158 M104 142 L108 158" stroke="${pal.ink}" stroke-width="3.5" stroke-linecap="round"/>
        </g>`;
      break;
    case 'slime':
      body = `
        <g transform="rotate(${tilt} 100 100)">
          <path d="M46 134 C46 78, 72 58, 100 58 C128 58, 154 78, 154 134 C154 148, 46 148, 46 134 Z" fill="${pal.secondary}" stroke="${pal.ink}" stroke-width="${sw}"/>
          <ellipse cx="78" cy="84" rx="10" ry="6" fill="#FFFFFF" opacity="0.65" transform="rotate(-24 78 84)"/>
          <circle cx="82" cy="108" r="6" fill="${pal.ink}"/>
          <circle cx="118" cy="108" r="6" fill="${pal.ink}"/>
          <path d="M90 122 Q100 129 110 122" fill="none" stroke="${pal.ink}" stroke-width="3" stroke-linecap="round"/>
        </g>`;
      break;
    case 'robot':
      body = `
        <g transform="rotate(${tilt} 100 100)">
          <line x1="100" y1="36" x2="100" y2="58" stroke="${pal.ink}" stroke-width="${sw}" stroke-linecap="round"/>
          <circle cx="100" cy="34" r="8" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="${sw}"/>
          <rect x="56" y="58" width="88" height="72" rx="16" fill="${pal.secondary}" stroke="${pal.ink}" stroke-width="${sw}"/>
          <rect x="70" y="76" width="60" height="26" rx="8" fill="#14244B"/>
          <circle cx="86" cy="89" r="5" fill="#FBC53D"/>
          <circle cx="114" cy="89" r="5" fill="#FBC53D"/>
          <rect x="78" y="112" width="44" height="8" rx="4" fill="#FFFFFF"/>
        </g>`;
      break;
    case 'star':
      body = `
        <g transform="rotate(${tilt} 100 100)">
          <polygon points="100,36 118,76 162,80 128,108 138,152 100,128 62,152 72,108 38,80 82,76" fill="#FBC53D" stroke="${pal.ink}" stroke-width="${sw}" stroke-linejoin="round"/>
          <circle cx="90" cy="96" r="4.5" fill="${pal.ink}"/>
          <circle cx="110" cy="96" r="4.5" fill="${pal.ink}"/>
          <path d="M94 109 Q100 115 106 109" fill="none" stroke="${pal.ink}" stroke-width="2.8" stroke-linecap="round"/>
        </g>`;
      break;
    case 'potion':
      body = `
        <g transform="rotate(${tilt} 100 100)">
          <rect x="86" y="42" width="28" height="16" rx="4" fill="#D97706" stroke="${pal.ink}" stroke-width="${sw}"/>
          <path d="M88 58 L88 78 L58 124 C50 138, 60 154, 76 154 L124 154 C140 154, 150 138, 142 124 L112 78 L112 58 Z" fill="#FFFFFF" stroke="${pal.ink}" stroke-width="${sw}" stroke-linejoin="round"/>
          <path d="M70 112 L130 112 L140 126 C146 138, 138 150, 124 150 L76 150 C62 150, 54 138, 60 126 Z" fill="${pal.accent}"/>
          <circle cx="92" cy="132" r="5" fill="#FFFFFF" opacity="0.7"/>
          <circle cx="110" cy="124" r="3.5" fill="#FFFFFF" opacity="0.7"/>
        </g>`;
      break;
    case 'key':
      body = `
        <g transform="rotate(${tilt - 18} 100 100)">
          <circle cx="72" cy="100" r="26" fill="#FBC53D" stroke="${pal.ink}" stroke-width="${sw}"/>
          <circle cx="72" cy="100" r="10" fill="${pal.bg}" stroke="${pal.ink}" stroke-width="${sw}"/>
          <rect x="96" y="92" width="60" height="16" rx="6" fill="#FBC53D" stroke="${pal.ink}" stroke-width="${sw}"/>
          <rect x="132" y="108" width="12" height="18" rx="3" fill="#FBC53D" stroke="${pal.ink}" stroke-width="${sw}"/>
          <rect x="114" y="108" width="10" height="12" rx="3" fill="#FBC53D" stroke="${pal.ink}" stroke-width="${sw}"/>
        </g>`;
      break;
    case 'meadow':
      body = `
        <rect x="0" y="0" width="200" height="200" fill="${variantIndex === 1 ? '#FEF3C7' : '#DBEAFE'}"/>
        <circle cx="${variantIndex === 2 ? 148 : 54}" cy="52" r="22" fill="#FBC53D"/>
        <ellipse cx="144" cy="54" rx="22" ry="10" fill="#FFFFFF" opacity="0.9"/>
        <path d="M0 132 Q54 96 112 126 T200 118 L200 200 L0 200 Z" fill="${pal.secondary}"/>
        <path d="M0 150 Q78 124 148 148 T200 144 L200 200 L0 200 Z" fill="#10B981"/>
        <rect x="44" y="114" width="10" height="28" rx="3" fill="#92400E"/>
        <circle cx="49" cy="102" r="20" fill="#059669" stroke="${pal.ink}" stroke-width="3"/>`;
      break;
    case 'night':
      body = `
        <rect x="0" y="0" width="200" height="200" fill="#14244B"/>
        <circle cx="144" cy="54" r="22" fill="#FEF08A"/>
        <circle cx="154" cy="48" r="18" fill="#14244B"/>
        <circle cx="44" cy="42" r="3" fill="#FFFFFF"/>
        <circle cx="88" cy="34" r="2.5" fill="#FBC53D"/>
        <circle cx="62" cy="76" r="2.5" fill="#FFFFFF"/>
        <circle cx="114" cy="68" r="3" fill="#FFFFFF"/>
        <path d="M0 142 Q64 110 124 138 T200 128 L200 200 L0 200 Z" fill="#1E3A8A"/>
        <path d="M0 164 Q80 146 200 168 L200 200 L0 200 Z" fill="#0F172A"/>`;
      break;
    case 'castle':
      body = `
        <rect x="0" y="0" width="200" height="200" fill="${pal.soft}"/>
        <rect x="52" y="84" width="96" height="74" fill="#E2E8F0" stroke="${pal.ink}" stroke-width="${sw}"/>
        <rect x="46" y="64" width="26" height="94" fill="#CBD5E1" stroke="${pal.ink}" stroke-width="${sw}"/>
        <rect x="128" y="64" width="26" height="94" fill="#CBD5E1" stroke="${pal.ink}" stroke-width="${sw}"/>
        <polygon points="44,64 59,36 74,64" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="${sw}" stroke-linejoin="round"/>
        <polygon points="126,64 141,36 156,64" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="${sw}" stroke-linejoin="round"/>
        <path d="M86 158 L86 126 A14 14 0 0 1 114 126 L114 158 Z" fill="${pal.ink}"/>`;
      break;
    case 'explosion':
      body = `
        <g transform="rotate(${tilt * 2} 100 100)">
          <polygon points="100,26 116,66 158,46 136,88 176,104 134,120 152,162 110,138 96,176 82,136 42,156 64,116 26,98 66,84 48,44 88,66" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="${sw}" stroke-linejoin="round"/>
          <polygon points="100,56 110,82 138,76 120,100 138,124 110,118 100,144 90,118 62,124 80,100 62,76 90,82" fill="#FEF08A"/>
        </g>`;
      break;
    case 'sparkle':
      body = `
        <g transform="rotate(${tilt} 100 100)">
          <path d="M100 32 Q108 92 168 100 Q108 108 100 168 Q92 108 32 100 Q92 92 100 32 Z" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="${sw}" stroke-linejoin="round"/>
          <path d="M150 42 Q153 56 167 59 Q153 62 150 76 Q147 62 133 59 Q147 56 150 42 Z" fill="${pal.secondary}" stroke="${pal.ink}" stroke-width="2.5"/>
          <circle cx="54" cy="54" r="7" fill="#FBC53D" stroke="${pal.ink}" stroke-width="2.5"/>
        </g>`;
      break;
    case 'ui':
      body = `
        <rect x="30" y="68" width="140" height="64" rx="16" fill="${pal.ink}"/>
        <rect x="30" y="62" width="140" height="62" rx="16" fill="${pal.secondary}" stroke="${pal.ink}" stroke-width="${sw}"/>
        <rect x="54" y="86" width="92" height="14" rx="7" fill="#FFFFFF"/>`;
      break;
    default:
      body = `
        <g transform="rotate(${tilt} 100 100)">
          <rect x="52" y="52" width="96" height="96" rx="22" fill="${pal.secondary}" stroke="${pal.ink}" stroke-width="${sw}"/>
          <circle cx="100" cy="100" r="24" fill="${pal.accent}" stroke="${pal.ink}" stroke-width="${sw}"/>
        </g>`;
      break;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <rect width="200" height="200" rx="24" fill="${pal.bg}"/>
    ${body}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function generateAssetCandidates(
  prompt: string,
  categoryId: AssetCategoryId,
  count: 1 | 2 | 3 = 3,
  seedOffset = 0,
): AssetCandidate[] {
  const motif = detectMotif(prompt, categoryId);
  const results: AssetCandidate[] = [];

  for (let i = 0; i < count; i += 1) {
    const styleIdx = (i + seedOffset) % STYLE_PALETTES.length;
    const pal = STYLE_PALETTES[styleIdx];
    results.push({
      id: `cand-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      styleLabelEn: pal.labelEn,
      styleLabelZh: pal.labelZh,
      previewUrl: buildMotifSvg(motif, styleIdx),
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Zero-Token Real Playable Game SFX Synthesizer (16-bit PCM WAV data URLs)
// ---------------------------------------------------------------------------

type SfxStyle = 'chime' | 'jump' | 'click' | 'impact' | 'sparkle';

function detectSfxStyle(prompt: string, categoryId: AssetCategoryId): SfxStyle {
  const p = prompt.toLowerCase();
  if (/jump|hop|bounce|spring|cat|跳|弹|猫|喵/.test(p)) return 'jump';
  if (/boom|hit|crash|thud|punch|爆|撞|击|重/.test(p)) return 'impact';
  if (/click|tap|button|menu|ui|按|点|界面/.test(p)) return 'click';
  if (/spark|magic|power|glow|闪|魔|光/.test(p)) return 'sparkle';
  if (/coin|star|reward|win|score|星|币|奖|分/.test(p)) return 'chime';

  if (categoryId === 'interface') return 'click';
  if (categoryId === 'effects') return 'sparkle';
  if (categoryId === 'characters') return 'jump';
  return 'chime';
}

function encodeWavBase64(samples: Float32Array, sampleRate: number): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function synthesizeGameSfx(
  style: SfxStyle,
  variantIndex: number,
): { audioUrl: string; durationSec: number } {
  const sampleRate = 22050;
  const pitchShift = variantIndex === 0 ? 1 : variantIndex === 1 ? 1.18 : 0.86;
  const durationSec = style === 'click' ? 0.16 : style === 'jump' ? 0.34 : 0.48;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(totalSamples);

  let phase = 0;
  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const progress = t / durationSec;
    const env = Math.sin(Math.min(1, progress * 12) * (Math.PI / 2)) * Math.pow(1 - progress, 1.8);

    let freq = 520 * pitchShift;
    let wave = 0;

    if (style === 'jump') {
      freq = (280 + 540 * Math.pow(progress, 0.75)) * pitchShift;
      phase += (2 * Math.PI * freq) / sampleRate;
      wave = Math.sin(phase) * 0.65 + Math.sin(phase * 2) * 0.2;
    } else if (style === 'click') {
      freq = (740 - 260 * progress) * pitchShift;
      phase += (2 * Math.PI * freq) / sampleRate;
      wave = Math.sin(phase) * 0.75;
    } else if (style === 'impact') {
      freq = (170 - 115 * progress) * pitchShift;
      phase += (2 * Math.PI * freq) / sampleRate;
      const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      wave = Math.sin(phase) * 0.6 + noise * 0.28 * (1 - progress);
    } else if (style === 'sparkle') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const step = Math.min(notes.length - 1, Math.floor(progress * notes.length));
      freq = notes[step] * pitchShift;
      phase += (2 * Math.PI * freq) / sampleRate;
      wave = Math.sin(phase) * 0.55 + Math.sin(phase * 2) * 0.25;
    } else {
      // chime
      const notes = [587.33, 880];
      const step = progress < 0.42 ? 0 : 1;
      freq = notes[step] * pitchShift;
      phase += (2 * Math.PI * freq) / sampleRate;
      wave = Math.sin(phase) * 0.65 + Math.sin(phase * 3) * 0.12;
    }

    samples[i] = wave * env * 0.55;
  }

  return {
    audioUrl: encodeWavBase64(samples, sampleRate),
    durationSec,
  };
}

const AUDIO_VARIANT_META = [
  { labelEn: 'Crisp Tone', labelZh: '清脆版' },
  { labelEn: 'Bright Pop', labelZh: '明快版' },
  { labelEn: 'Warm Soft', labelZh: '柔和版' },
] as const;

export function generateAudioCandidates(
  prompt: string,
  categoryId: AssetCategoryId,
  count: 1 | 2 | 3 = 3,
  seedOffset = 0,
): AudioCandidate[] {
  const style = detectSfxStyle(prompt, categoryId);
  const results: AudioCandidate[] = [];

  for (let i = 0; i < count; i += 1) {
    const vIdx = (i + seedOffset) % AUDIO_VARIANT_META.length;
    const meta = AUDIO_VARIANT_META[vIdx];
    const synth = synthesizeGameSfx(style, vIdx);
    results.push({
      id: `aud-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      labelEn: meta.labelEn,
      labelZh: meta.labelZh,
      durationSec: synth.durationSec,
      audioUrl: synth.audioUrl,
    });
  }
  return results;
}

export function createAssetStateSlot(
  name: string,
  prompt: string,
  categoryId: AssetCategoryId,
  seedOffset = 0,
): AssetStateSlot {
  const candidates = generateAssetCandidates(prompt, categoryId, 3, seedOffset);
  return {
    id: `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    prompt,
    mediaKind: 'generated',
    mediaUrl: candidates[0].previewUrl,
    candidates,
    selectedCandidateId: candidates[0].id,
    audioPrompt: '',
    audioCandidates: [],
    selectedAudioCandidateId: null,
  };
}

export interface InitialAssetLibraryData {
  folders: AssetSubFolder[];
  items: AssetItem[];
  unlockedCategories: Record<AssetCategoryId, boolean>;
}

export function createInitialAssetLibrary(lang: Language): InitialAssetLibraryData {
  const isZh = lang === 'zh';

  const folders: AssetSubFolder[] = [
    {
      id: 'folder-forest-friends',
      categoryId: 'characters',
      name: isZh ? '森林伙伴' : 'Forest Friends',
    },
    {
      id: 'folder-collectibles',
      categoryId: 'objects',
      name: isZh ? '可收集物' : 'Collectibles',
    },
  ];

  const catState = createAssetStateSlot(
    isZh ? '默认' : 'Default',
    isZh ? '友善的橘色小猫主角' : 'Friendly orange cat hero',
    'characters',
    0,
  );
  const birdState = createAssetStateSlot(
    isZh ? '默认' : 'Default',
    isZh ? '轻盈的小蓝鸟伙伴' : 'Cheerful blue forest bird',
    'characters',
    1,
  );
  const starState = createAssetStateSlot(
    isZh ? '默认' : 'Default',
    isZh ? '闪亮的金色星星道具' : 'Glowing golden collectible star',
    'objects',
    0,
  );
  const sparkState = createAssetStateSlot(
    isZh ? '默认' : 'Default',
    isZh ? '滚落的炽热火花障碍物' : 'Rolling fiery bridge spark obstacle',
    'objects',
    1,
  );
  const meadowState = createAssetStateSlot(
    isZh ? '默认' : 'Default',
    isZh ? '阳光森林草地背景' : 'Sunny forest meadow background',
    'backgrounds',
    0,
  );
  const buttonState = createAssetStateSlot(
    isZh ? '默认' : 'Default',
    isZh ? '圆润的游戏开始按钮图标' : 'Rounded game start button graphic',
    'interface',
    0,
  );
  const scoreState = createAssetStateSlot(
    isZh ? '默认' : 'Default',
    isZh ? '清晰的顶部得分文字' : 'Crisp score HUD text',
    'interface',
    1,
  );
  const sparkleState = createAssetStateSlot(
    isZh ? '默认' : 'Default',
    isZh ? '获得奖励时的星光闪耀特效' : 'Reward sparkle burst effect',
    'effects',
    0,
  );

  const items: AssetItem[] = [
    {
      id: 'asset-cat',
      categoryId: 'characters',
      folderId: 'folder-forest-friends',
      name: isZh ? '小猫' : 'Cat',
      states: [catState],
      activeStateId: catState.id,
    },
    {
      id: 'asset-bird',
      categoryId: 'characters',
      folderId: 'folder-forest-friends',
      name: isZh ? '小鸟' : 'Bird',
      states: [birdState],
      activeStateId: birdState.id,
    },
    {
      id: 'asset-star',
      categoryId: 'objects',
      folderId: 'folder-collectibles',
      name: isZh ? '金色星星' : 'Golden Star',
      states: [starState],
      activeStateId: starState.id,
    },
    {
      id: 'asset-spark',
      categoryId: 'objects',
      folderId: 'folder-collectibles',
      name: isZh ? '滚落火花' : 'Rolling Spark',
      states: [sparkState],
      activeStateId: sparkState.id,
    },
    {
      id: 'asset-meadow',
      categoryId: 'backgrounds',
      folderId: null,
      name: isZh ? '阳光草地' : 'Sunny Meadow',
      states: [meadowState],
      activeStateId: meadowState.id,
    },
    {
      id: 'asset-score-hud',
      categoryId: 'interface',
      folderId: null,
      name: isZh ? '分数文字' : 'Score Text',
      states: [scoreState],
      activeStateId: scoreState.id,
      interfaceMode: 'text',
      typography: {
        text: isZh ? '得分 050' : 'SCORE 050',
        fontId: 'fredoka',
        fontSize: 28,
        fontWeight: 700,
        italic: false,
        underline: false,
        textColor: '#14244B',
        revealMode: 'instant',
        typewriterSpeed: 20,
      },
    },
    {
      id: 'asset-start-btn',
      categoryId: 'interface',
      folderId: null,
      name: isZh ? '开始按钮图' : 'Start Button',
      states: [buttonState],
      activeStateId: buttonState.id,
      interfaceMode: 'image',
      typography: createDefaultTypography(isZh ? '开始游戏' : 'Start Game', lang),
    },
    {
      id: 'asset-sparkle',
      categoryId: 'effects',
      folderId: null,
      name: isZh ? '星光爆发' : 'Sparkle Burst',
      states: [sparkleState],
      activeStateId: sparkleState.id,
    },
  ];

  // All 5 categories unlocked by default in the base template;
  // unlockedCategories remains wired for intent-driven progressive reveal during onboarding.
  return {
    folders,
    items,
    unlockedCategories: {
      characters: true,
      objects: true,
      backgrounds: true,
      interface: true,
      effects: true,
    },
  };
}
