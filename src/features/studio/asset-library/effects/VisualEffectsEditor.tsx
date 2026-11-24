import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Wand2,
  X,
} from 'lucide-react';
import { COPY, type Language } from '../../../../shared/i18n';
import {
  VISUAL_EFFECT_GROUPS,
  createDefaultVisualEffect,
  isDynamicEffectType,
  type FadeEasing,
  type VisualEffectCategoryId,
  type VisualEffectItem,
  type VisualEffectType,
} from './visualEffectsModel';

interface VisualEffectsEditorProps {
  lang: Language;
  effects: VisualEffectItem[];
  unlockedEffects: VisualEffectType[];
  onChange: (next: VisualEffectItem[]) => void;
  onTriggerDynamicPreview: () => void;
}

const EFFECT_COLOR_SWATCHES = [
  '#4E9AE3',
  '#FBC53D',
  '#EF4444',
  '#10B981',
  '#A855F7',
  '#14244B',
];

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (next: number) => void;
}) {
  const formatted = step < 1 ? value.toFixed(1) : String(Math.round(value));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-[#475569] truncate">{label}</span>
        <span className="font-mono tabular-nums font-semibold text-[#14244B] shrink-0">
          {formatted}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-[#14244B] cursor-pointer"
      />
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-[#475569]">{label}</span>
        <span className="font-mono tabular-nums text-[10px] text-[#64748B] uppercase">
          {value}
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {EFFECT_COLOR_SWATCHES.map((hex) => {
          const active = value.toLowerCase() === hex.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              style={{ backgroundColor: hex }}
              aria-label={hex}
              className={`w-5 h-5 rounded-full border transition-transform cursor-pointer shrink-0 ${
                active
                  ? 'border-[#14244B] ring-2 ring-[#4E9AE3]/45 scale-110'
                  : 'border-[#CBD5E1] hover:scale-105'
              }`}
            />
          );
        })}
        <label className="relative w-5 h-5 rounded-full border border-dashed border-[#94A3B8] hover:border-[#14244B] flex items-center justify-center cursor-pointer overflow-hidden shrink-0">
          <span style={{ backgroundColor: value }} className="w-3 h-3 rounded-full" />
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}

/**
 * Figma-style additive Visual Effects panel mounted inside AssetEditorDrawer's Visual section.
 * - Starts overall locked (matching Audio's sealed lock bar) when `unlockedEffects` is empty.
 * - Once any effects are unlocked, opens a searchable 5-category picker where unlocked
 *   effects are selectable and still-locked effects show a lock icon.
 */
export function VisualEffectsEditor({
  lang,
  effects,
  unlockedEffects,
  onChange,
  onTriggerDynamicPreview,
}: VisualEffectsEditorProps) {
  const assetsCopy = COPY[lang].studio.assets;
  const t = assetsCopy.editor.effects;
  const tEn = COPY.en.studio.assets.editor.effects;
  const tZh = COPY.zh.studio.assets.editor.effects;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const [advancedOpenTypes, setAdvancedOpenTypes] = useState<Record<string, boolean>>({});

  const pickerContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const dynamicReplayTimerRef = useRef<number | null>(null);

  const unlockedSet = useMemo(() => new Set(unlockedEffects), [unlockedEffects]);
  const isSectionLocked = unlockedEffects.length === 0;

  useEffect(() => {
    if (!pickerOpen) {
      setSearchQuery('');
      return;
    }
    searchInputRef.current?.focus();

    const onPointerDown = (e: MouseEvent) => {
      if (
        pickerContainerRef.current &&
        !pickerContainerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [pickerOpen]);

  useEffect(() => {
    return () => {
      if (dynamicReplayTimerRef.current) {
        window.clearTimeout(dynamicReplayTimerRef.current);
      }
    };
  }, []);

  const scheduleDynamicReplay = (immediate = false) => {
    if (dynamicReplayTimerRef.current) {
      window.clearTimeout(dynamicReplayTimerRef.current);
      dynamicReplayTimerRef.current = null;
    }
    if (immediate) {
      onTriggerDynamicPreview();
      return;
    }
    dynamicReplayTimerRef.current = window.setTimeout(() => {
      onTriggerDynamicPreview();
    }, 220);
  };

  const categoryLabel = (
    id: VisualEffectCategoryId,
    dict: typeof t = t,
  ): string => {
    switch (id) {
      case 'transparency':
        return dict.catTransparency;
      case 'color':
        return dict.catColor;
      case 'style':
        return dict.catStyle;
      case 'glowShadow':
        return dict.catGlowShadow;
      case 'dynamic':
        return dict.catDynamic;
    }
  };

  const effectLabel = (type: VisualEffectType, dict: typeof t = t): string => {
    switch (type) {
      case 'opacity':
        return dict.effOpacity;
      case 'visibility':
        return dict.effVisibility;
      case 'brightness':
        return dict.effBrightness;
      case 'contrast':
        return dict.effContrast;
      case 'saturation':
        return dict.effSaturation;
      case 'hue':
        return dict.effHue;
      case 'grayscale':
        return dict.effGrayscale;
      case 'blur':
        return dict.effBlur;
      case 'pixelate':
        return dict.effPixelate;
      case 'glow':
        return dict.effGlow;
      case 'shadow':
        return dict.effShadow;
      case 'flash':
        return dict.effFlash;
      case 'fade':
        return dict.effFade;
      case 'pulse':
        return dict.effPulse;
      case 'shake':
        return dict.effShake;
    }
  };

  const effectSummary = (item: VisualEffectItem): string => {
    switch (item.type) {
      case 'opacity':
        return `${Math.round(item.value)}%`;
      case 'visibility':
        return item.visible ? t.visShow : t.visHide;
      case 'brightness':
      case 'contrast':
      case 'saturation':
      case 'grayscale':
        return `${Math.round(item.value)}%`;
      case 'hue':
        return `${Math.round(item.value)}°`;
      case 'blur':
        return `${item.radius.toFixed(1)}px`;
      case 'pixelate':
        return `${Math.round(item.pixelSize)}px`;
      case 'glow':
        return `${Math.round(item.radius)}px`;
      case 'shadow':
        return `${Math.round(item.opacity)}%`;
      case 'flash':
        return `${item.duration.toFixed(1)}s`;
      case 'fade':
        return `${Math.round(item.startOpacity)}→${Math.round(item.endOpacity)}%`;
      case 'pulse':
        return `${Math.round(item.scale)}%`;
      case 'shake':
        return `${item.duration.toFixed(1)}s`;
    }
  };

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return VISUAL_EFFECT_GROUPS.map((group) => {
      if (!q) return group;
      const catText = `${categoryLabel(group.categoryId, tEn)} ${categoryLabel(group.categoryId, tZh)}`.toLowerCase();
      if (catText.includes(q)) return group;

      const matchedTypes = group.types.filter((type) => {
        const searchable = `${type} ${effectLabel(type, tEn)} ${effectLabel(type, tZh)}`.toLowerCase();
        return searchable.includes(q);
      });
      return { ...group, types: matchedTypes };
    }).filter((g) => g.types.length > 0);
  }, [searchQuery, tEn, tZh]);

  // Overall sealed lock state (matches Audio's progressive unlock card)
  if (isSectionLocked) {
    return (
      <div className="pt-2.5 border-t border-[#E2E8F0]">
        <div
          aria-disabled="true"
          className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9] text-[#94A3B8] cursor-default"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Wand2 className="w-3.5 h-3.5 text-[#CBD5E1] shrink-0" aria-hidden="true" />
            <span className="text-xs font-medium text-[#94A3B8] truncate">
              {t.sectionTitle}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0 text-[11px] text-[#94A3B8]">
            <Lock className="w-3 h-3" aria-hidden="true" />
            <span className="whitespace-nowrap">{assetsCopy.lockedLabel}</span>
          </div>
        </div>
      </div>
    );
  }

  const handleAddOrFocusEffect = (type: VisualEffectType) => {
    if (!unlockedSet.has(type)) return;
    const existing = effects.find((e) => e.type === type);
    setPickerOpen(false);
    setExpandedTypes((prev) => ({ ...prev, [type]: true }));

    if (existing) {
      if (!existing.enabled) {
        onChange(
          effects.map((e) => (e.type === type ? { ...e, enabled: true } : e)),
        );
      }
      if (isDynamicEffectType(type)) scheduleDynamicReplay(true);
      return;
    }

    const next = [...effects, createDefaultVisualEffect(type)];
    onChange(next);
    if (isDynamicEffectType(type)) scheduleDynamicReplay(true);
  };

  const updateEffect = <T extends VisualEffectItem>(
    type: T['type'],
    patch: Partial<T>,
    immediateReplay = false,
  ) => {
    const next = effects.map((item) =>
      item.type === type ? ({ ...item, ...patch } as VisualEffectItem) : item,
    );
    onChange(next);
    if (isDynamicEffectType(type)) {
      scheduleDynamicReplay(immediateReplay);
    }
  };

  const handleToggleEnable = (item: VisualEffectItem) => {
    const nextEnabled = !item.enabled;
    onChange(
      effects.map((e) =>
        e.type === item.type ? { ...e, enabled: nextEnabled } : e,
      ),
    );
    if (nextEnabled && isDynamicEffectType(item.type)) {
      scheduleDynamicReplay(true);
    }
  };

  const handleRemoveEffect = (type: VisualEffectType) => {
    onChange(effects.filter((e) => e.type !== type));
  };

  const addedTypeSet = new Set(effects.map((e) => e.type));

  const renderAdvancedSection = (
    type: VisualEffectType,
    children: React.ReactNode,
  ) => {
    const isOpen = !!advancedOpenTypes[type];
    return (
      <div className="pt-1.5 border-t border-[#E2E8F0]/80">
        <button
          type="button"
          onClick={() =>
            setAdvancedOpenTypes((prev) => ({ ...prev, [type]: !prev[type] }))
          }
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#64748B] hover:text-[#14244B] transition-colors cursor-pointer"
        >
          {isOpen ? (
            <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
          )}
          <span>{t.advancedToggle}</span>
        </button>
        {isOpen && <div className="mt-2 space-y-2">{children}</div>}
      </div>
    );
  };

  const renderEffectControls = (item: VisualEffectItem) => {
    switch (item.type) {
      case 'opacity':
        return (
          <SliderRow
            label={t.paramOpacity}
            value={item.value}
            min={0}
            max={100}
            unit="%"
            onChange={(value) => updateEffect('opacity', { value })}
          />
        );

      case 'visibility':
        return (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[#475569]">{t.paramVisibility}</span>
            <div className="inline-flex items-center p-0.5 bg-white rounded-lg border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => updateEffect('visibility', { visible: true })}
                className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  item.visible
                    ? 'bg-[#14244B] text-white'
                    : 'text-[#64748B] hover:text-[#14244B]'
                }`}
              >
                {t.visShow}
              </button>
              <button
                type="button"
                onClick={() => updateEffect('visibility', { visible: false })}
                className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  !item.visible
                    ? 'bg-[#14244B] text-white'
                    : 'text-[#64748B] hover:text-[#14244B]'
                }`}
              >
                {t.visHide}
              </button>
            </div>
          </div>
        );

      case 'brightness':
        return (
          <SliderRow
            label={t.paramBrightness}
            value={item.value}
            min={0}
            max={200}
            unit="%"
            onChange={(value) => updateEffect('brightness', { value })}
          />
        );

      case 'contrast':
        return (
          <SliderRow
            label={t.paramContrast}
            value={item.value}
            min={0}
            max={200}
            unit="%"
            onChange={(value) => updateEffect('contrast', { value })}
          />
        );

      case 'saturation':
        return (
          <SliderRow
            label={t.paramSaturation}
            value={item.value}
            min={0}
            max={200}
            unit="%"
            onChange={(value) => updateEffect('saturation', { value })}
          />
        );

      case 'hue':
        return (
          <SliderRow
            label={t.paramHue}
            value={item.value}
            min={-180}
            max={180}
            unit="°"
            onChange={(value) => updateEffect('hue', { value })}
          />
        );

      case 'grayscale':
        return (
          <SliderRow
            label={t.paramGrayscale}
            value={item.value}
            min={0}
            max={100}
            unit="%"
            onChange={(value) => updateEffect('grayscale', { value })}
          />
        );

      case 'blur':
        return (
          <SliderRow
            label={t.paramRadius}
            value={item.radius}
            min={0}
            max={16}
            step={0.5}
            unit="px"
            onChange={(radius) => updateEffect('blur', { radius })}
          />
        );

      case 'pixelate':
        return (
          <SliderRow
            label={t.paramPixelSize}
            value={item.pixelSize}
            min={2}
            max={24}
            unit="px"
            onChange={(pixelSize) => updateEffect('pixelate', { pixelSize })}
          />
        );

      case 'glow':
        return (
          <div className="space-y-2.5">
            <ColorRow
              label={t.paramColor}
              value={item.color}
              onChange={(color) => updateEffect('glow', { color })}
            />
            <SliderRow
              label={t.paramIntensity}
              value={item.intensity}
              min={0}
              max={100}
              unit="%"
              onChange={(intensity) => updateEffect('glow', { intensity })}
            />
            <SliderRow
              label={t.paramRadius}
              value={item.radius}
              min={1}
              max={24}
              unit="px"
              onChange={(radius) => updateEffect('glow', { radius })}
            />
          </div>
        );

      case 'shadow':
        return (
          <div className="space-y-2.5">
            <ColorRow
              label={t.paramColor}
              value={item.color}
              onChange={(color) => updateEffect('shadow', { color })}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <SliderRow
                label={t.paramOffsetX}
                value={item.offsetX}
                min={-20}
                max={20}
                unit="px"
                onChange={(offsetX) => updateEffect('shadow', { offsetX })}
              />
              <SliderRow
                label={t.paramOffsetY}
                value={item.offsetY}
                min={-20}
                max={20}
                unit="px"
                onChange={(offsetY) => updateEffect('shadow', { offsetY })}
              />
            </div>
            <SliderRow
              label={t.paramBlur}
              value={item.blur}
              min={0}
              max={20}
              unit="px"
              onChange={(blur) => updateEffect('shadow', { blur })}
            />
            <SliderRow
              label={t.paramOpacity}
              value={item.opacity}
              min={0}
              max={100}
              unit="%"
              onChange={(opacity) => updateEffect('shadow', { opacity })}
            />
          </div>
        );

      case 'flash':
        return (
          <div className="space-y-2.5">
            <SliderRow
              label={t.paramFrequency}
              value={item.frequency}
              min={1}
              max={15}
              step={0.5}
              unit="Hz"
              onChange={(frequency) => updateEffect('flash', { frequency })}
            />
            <SliderRow
              label={t.paramDuration}
              value={item.duration}
              min={0.2}
              max={5}
              step={0.1}
              unit="s"
              onChange={(duration) => updateEffect('flash', { duration })}
            />
            <SliderRow
              label={t.paramCount}
              value={item.count}
              min={1}
              max={12}
              onChange={(count) => updateEffect('flash', { count })}
            />
          </div>
        );

      case 'fade': {
        const easingOpts: { id: FadeEasing; label: string }[] = [
          { id: 'linear', label: t.easeLinear },
          { id: 'ease-in', label: t.easeIn },
          { id: 'ease-out', label: t.easeOut },
          { id: 'ease-in-out', label: t.easeInOut },
        ];
        return (
          <div className="space-y-2.5">
            <SliderRow
              label={t.paramStartOpacity}
              value={item.startOpacity}
              min={0}
              max={100}
              unit="%"
              onChange={(startOpacity) => updateEffect('fade', { startOpacity })}
            />
            <SliderRow
              label={t.paramEndOpacity}
              value={item.endOpacity}
              min={0}
              max={100}
              unit="%"
              onChange={(endOpacity) => updateEffect('fade', { endOpacity })}
            />
            <SliderRow
              label={t.paramDuration}
              value={item.duration}
              min={0.2}
              max={5}
              step={0.1}
              unit="s"
              onChange={(duration) => updateEffect('fade', { duration })}
            />
            {renderAdvancedSection(
              'fade',
              <div className="space-y-1.5">
                <div className="text-[11px] text-[#475569]">{t.paramEasing}</div>
                <div className="grid grid-cols-2 gap-1">
                  {easingOpts.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateEffect('fade', { easing: opt.id }, true)}
                      className={`px-2 py-1 text-[11px] font-semibold rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                        item.easing === opt.id
                          ? 'bg-[#14244B] text-white border-[#14244B]'
                          : 'bg-white text-[#64748B] border-[#E2E8F0] hover:text-[#14244B]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>,
            )}
          </div>
        );
      }

      case 'pulse':
        return (
          <div className="space-y-2.5">
            <SliderRow
              label={t.paramScale}
              value={item.scale}
              min={60}
              max={160}
              unit="%"
              onChange={(scale) => updateEffect('pulse', { scale })}
            />
            <SliderRow
              label={t.paramFrequency}
              value={item.frequency}
              min={0.5}
              max={8}
              step={0.5}
              unit="Hz"
              onChange={(frequency) => updateEffect('pulse', { frequency })}
            />
            <SliderRow
              label={t.paramCount}
              value={item.count}
              min={1}
              max={10}
              onChange={(count) => updateEffect('pulse', { count })}
            />
          </div>
        );

      case 'shake':
        return (
          <div className="space-y-2.5">
            <SliderRow
              label={t.paramIntensity}
              value={item.intensity}
              min={1}
              max={18}
              unit="px"
              onChange={(intensity) => updateEffect('shake', { intensity })}
            />
            <SliderRow
              label={t.paramFrequency}
              value={item.frequency}
              min={4}
              max={40}
              unit="Hz"
              onChange={(frequency) => updateEffect('shake', { frequency })}
            />
            <SliderRow
              label={t.paramDuration}
              value={item.duration}
              min={0.2}
              max={4}
              step={0.1}
              unit="s"
              onChange={(duration) => updateEffect('shake', { duration })}
            />
          </div>
        );
    }
  };

  return (
    <div className="pt-2.5 border-t border-[#E2E8F0] space-y-2">
      {/* Header Row: Visual Effects + Reset + "+ Add Effect" */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Wand2 className="w-3.5 h-3.5 text-[#14244B] shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold text-[#14244B] truncate">
            {t.sectionTitle}
          </span>
          {effects.length > 0 && (
            <span className="text-[11px] font-mono tabular-nums text-[#64748B] shrink-0">
              · {effects.length}
            </span>
          )}
        </div>

        <div className="relative flex items-center gap-1.5 shrink-0" ref={pickerContainerRef}>
          {effects.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              title={t.resetAll}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span>{t.resetAll}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            aria-expanded={pickerOpen}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              pickerOpen
                ? 'bg-[#14244B] text-white border-[#14244B]'
                : 'bg-white text-[#14244B] border-[#CBD5E1] hover:border-[#14244B]'
            }`}
          >
            <Plus className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{t.addBtn}</span>
          </button>

          {/* Searchable 5-Category Additive Picker Popover */}
          {pickerOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-40 w-64 rounded-xl bg-white border border-[#E2E8F0] shadow-[0_12px_28px_rgba(15,23,42,0.14)] overflow-hidden">
              {/* Search Bar */}
              <div className="p-2 border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="relative flex items-center">
                  <Search
                    className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    aria-label={t.searchPlaceholder}
                    className="w-full pl-7 pr-6 py-1.5 text-xs text-[#14244B] bg-white border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#4E9AE3]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-1.5 w-4 h-4 rounded text-[#94A3B8] hover:text-[#14244B] flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filtered Category List */}
              <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
                {filteredGroups.length === 0 ? (
                  <div className="px-2 py-5 text-center text-xs text-[#94A3B8]">
                    {t.noMatch}
                  </div>
                ) : (
                  filteredGroups.map((group) => (
                    <div key={group.categoryId}>
                      <div className="px-2 pt-1.5 pb-0.5 text-[11px] font-normal text-[#64748B]">
                        {categoryLabel(group.categoryId)}
                      </div>
                      <div className="space-y-0.5">
                        {group.types.map((type) => {
                          const isUnlocked = unlockedSet.has(type);
                          const alreadyAdded = addedTypeSet.has(type);

                          if (!isUnlocked) {
                            return (
                              <div
                                key={type}
                                aria-disabled="true"
                                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs text-[#94A3B8] cursor-not-allowed select-none"
                              >
                                <span className="truncate">{effectLabel(type)}</span>
                                <Lock
                                  className="w-3 h-3 text-[#CBD5E1] shrink-0"
                                  aria-hidden="true"
                                />
                              </div>
                            );
                          }

                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => handleAddOrFocusEffect(type)}
                              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs text-[#14244B] hover:bg-[#F1F5F9] transition-colors text-left cursor-pointer"
                            >
                              <span
                                className={alreadyAdded ? 'font-semibold' : 'font-medium'}
                              >
                                {effectLabel(type)}
                              </span>
                              {alreadyAdded && (
                                <Check
                                  className="w-3.5 h-3.5 text-[#4E9AE3] shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Effect Stack (only shown once effects are added) */}
      {effects.length > 0 && (
        <div className="space-y-1.5">
          {effects.map((item) => {
            const isExpanded = expandedTypes[item.type] ?? true;
            return (
              <div
                key={item.type}
                className={`rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] transition-opacity ${
                  item.enabled ? 'opacity-100' : 'opacity-60'
                }`}
              >
                {/* Row Header */}
                <div className="flex items-center justify-between gap-1.5 px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTypes((prev) => ({
                        ...prev,
                        [item.type]: !isExpanded,
                      }))
                    }
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown
                        className="w-3.5 h-3.5 text-[#64748B] shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight
                        className="w-3.5 h-3.5 text-[#64748B] shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-xs font-semibold text-[#14244B] truncate">
                      {effectLabel(item.type)}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-[#64748B] shrink-0 ml-auto pr-1">
                      {effectSummary(item)}
                    </span>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleEnable(item)}
                      title={t.toggleEnable}
                      aria-label={t.toggleEnable}
                      className="w-6 h-6 rounded-md text-[#64748B] hover:text-[#14244B] hover:bg-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      {item.enabled ? (
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveEffect(item.type)}
                      title={t.removeEffect}
                      aria-label={t.removeEffect}
                      className="w-6 h-6 rounded-md text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Parameter Controls */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1.5 border-t border-[#E2E8F0]/80">
                    {renderEffectControls(item)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
