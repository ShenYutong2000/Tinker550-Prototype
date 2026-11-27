import type {ScopedStateVariable} from '../properties/stateModel';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  ArrowUpRight,
  Bold,
  Check,
  Database,
  Image as ImageIcon,
  Info,
  Italic,
  Lock,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Underline,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import { COPY, type Language } from '../../../shared/i18n';
import {
  FIXED_ASSET_CATEGORIES,
  INTERFACE_FONT_MAP,
  createAssetStateSlot,
  createDefaultTypography,
  generateAssetCandidates,
  generateAudioCandidates,
  type AssetItem,
  type AssetStateSlot,
  type AudioCandidate,
  type InterfaceFontId,
  type InterfaceMode,
  type InterfaceTypography,
} from './assetLibraryModel';
import {
  areVariableValuesEqual,
  coerceVariableValue,
  formatNumberRangeHint,
  formatVariableValue,
  type StateVariable,
  type StateVariableType,
  type StateVariableValue,
} from '../properties/stateModel';
import type { CardParameterItem } from '../design-board/studioModel';
import { createStageParameterProperty } from '../playtest/stageProject';
import { PropertyEditorModal } from '../properties/PropertyEditorModal';
import { VisualEffectsEditor } from './effects/VisualEffectsEditor';
import {
  EffectedMediaPreview,
  EffectedTextPreview,
} from './effects/VisualEffectsSvgFilter';
import type { VisualEffectType } from './effects/visualEffectsModel';

interface AssetEditorDrawerProps {
  scopedVariables:ScopedStateVariable[];
  lang: Language;
  asset: AssetItem;
  audioUnlocked: boolean;
  propertiesUnlocked: boolean;
  unlockedVisualEffects: VisualEffectType[];
  activeTab: 'looks' | 'properties';
  highlightPropertyId: string | null;
  playValues: Record<string, StateVariableValue>;
  leftOffsetPx: number;
  onChangeTab: (tab: 'looks' | 'properties') => void;
  onClose: () => void;
  onUpdateAsset: (assetId: string, updater: (prev: AssetItem) => AssetItem) => void;
  onDeleteAsset: (assetId: string) => void;
  onAddProperty: (assetId: string, variable: StateVariable) => void;
  onUpdateProperty: (assetId: string, variable: StateVariable) => void;
  onDeleteProperty: (assetId: string, variableId: string) => void;
  onOpenStateManager: () => void;
  onSaveDraft?: () => void;
  draftError?: string;
  stageParameters?: CardParameterItem[];
}

const TEXT_SWATCHES = ['#14244B', '#2563EB', '#059669', '#D97706', '#E11D48', '#FFFFFF'];

interface StateTabTheme {
  tabBg: string;
  frameBg: string;
  borderColor: string;
}

const STATE_TAB_THEMES: readonly StateTabTheme[] = [
  { tabBg: '#6B9CE8', frameBg: '#6B9CE8', borderColor: '#4E80D1' },
  { tabBg: '#DC7A9E', frameBg: '#DC7A9E', borderColor: '#C25F84' },
  { tabBg: '#E3A468', frameBg: '#E3A468', borderColor: '#C98A4D' },
  { tabBg: '#66B5B0', frameBg: '#66B5B0', borderColor: '#4B9A95' },
  { tabBg: '#9B82DC', frameBg: '#9B82DC', borderColor: '#7F66C2' },
  { tabBg: '#73B986', frameBg: '#73B986', borderColor: '#589D6B' },
];

export function AssetEditorDrawer({
  scopedVariables,
  lang,
  asset,
  audioUnlocked,
  propertiesUnlocked,
  unlockedVisualEffects,
  activeTab,
  highlightPropertyId,
  playValues,
  leftOffsetPx,
  onChangeTab,
  onClose,
  onUpdateAsset,
  onDeleteAsset,
  onAddProperty,
  onUpdateProperty,
  onDeleteProperty,
  onOpenStateManager,
  onSaveDraft,
  draftError,
  stageParameters,
}: AssetEditorDrawerProps) {
  const t = COPY[lang].studio.assets;
  const ed = t.editor;
  const st = COPY[lang].studio.states;

  const categoryMeta =
    FIXED_ASSET_CATEGORIES.find((c) => c.id === asset.categoryId) ??
    FIXED_ASSET_CATEGORIES[0];

  const showPropertiesTab = (categoryMeta.supportsProperties || Boolean(asset.stagePreset)) && propertiesUnlocked;
  const effectiveTab: 'looks' | 'properties' = showPropertiesTab ? activeTab : 'looks';
  const properties = asset.properties ?? [];
  const availableStageParameters = stageParameters?.filter(parameter => !properties.some(property => property.stageParameterId === parameter.id)) ?? [];

  const activeStateIndex = Math.max(
    0,
    asset.states.findIndex((s) => s.id === asset.activeStateId),
  );
  const activeState: AssetStateSlot = asset.states[activeStateIndex] ?? asset.states[0];
  const activeStateTheme =
    STATE_TAB_THEMES[activeStateIndex % STATE_TAB_THEMES.length];

  const interfaceMode: InterfaceMode =
    categoryMeta.supportsInterfaceModes ? (asset.interfaceMode ?? 'text') : 'image';

  // Progressive disclosure: AI generation panels stay collapsed until user clicks "AI Generate"
  const [openAiChannel, setOpenAiChannel] = useState<'visual' | 'audio' | null>(null);
  const [isGeneratingVisual, setIsGeneratingVisual] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [genSeed, setGenSeed] = useState(1);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [dynamicReplayNonce, setDynamicReplayNonce] = useState(0);

  const [renamingStateId, setRenamingStateId] = useState<string | null>(null);
  const [stateDraftName, setStateDraftName] = useState('');
  const [propertyModal, setPropertyModal] = useState<{
    mode: 'add' | 'edit';
    variable?: StateVariable;
  } | null>(null);

  const visualInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const genTimerRef = useRef<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setOpenAiChannel(null);
    setRenamingStateId(null);
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPlayingAudioId(null);
    }
  }, [asset.id, activeState.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (propertyModal) {
          setPropertyModal(null);
        } else if (renamingStateId) {
          setRenamingStateId(null);
        } else if (openAiChannel) {
          setOpenAiChannel(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, renamingStateId, openAiChannel, propertyModal]);

  useEffect(() => {
    return () => {
      if (genTimerRef.current) window.clearTimeout(genTimerRef.current);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const updateActiveState = (updater: (slot: AssetStateSlot) => AssetStateSlot) => {
    onUpdateAsset(asset.id, (prev) => ({
      ...prev,
      states: prev.states.map((s) => (s.id === activeState.id ? updater(s) : s)),
    }));
  };

  // Visual AI Generation (Always generates 3 distinct visual options cleanly)
  const handleGenerateVisual = () => {
    const promptText = activeState.prompt.trim() || asset.name;
    setIsGeneratingVisual(true);
    const nextSeed = genSeed + 1;
    setGenSeed(nextSeed);

    if (genTimerRef.current) window.clearTimeout(genTimerRef.current);
    genTimerRef.current = window.setTimeout(() => {
      const nextCandidates = generateAssetCandidates(
        promptText,
        asset.categoryId,
        3,
        nextSeed,
      );
      updateActiveState((slot) => ({
        ...slot,
        candidates: nextCandidates,
      }));
      setIsGeneratingVisual(false);
    }, 240);
  };

  const handleSelectVisualCandidate = (candidateId: string, previewUrl: string) => {
    updateActiveState((slot) => ({
      ...slot,
      selectedCandidateId: candidateId,
      mediaKind: 'generated',
      mediaUrl: previewUrl,
      mediaFileName: undefined,
    }));
    setOpenAiChannel(null);
  };

  // Audio AI Generation (Always generates 3 playable WAV SFX options cleanly)
  const handleGenerateAudio = () => {
    const promptText = activeState.audioPrompt.trim() || asset.name;
    setIsGeneratingAudio(true);
    const nextSeed = genSeed + 1;
    setGenSeed(nextSeed);

    if (genTimerRef.current) window.clearTimeout(genTimerRef.current);
    genTimerRef.current = window.setTimeout(() => {
      const nextAudioCandidates = generateAudioCandidates(
        promptText,
        asset.categoryId,
        3,
        nextSeed,
      );
      updateActiveState((slot) => ({
        ...slot,
        audioCandidates: nextAudioCandidates,
      }));
      setIsGeneratingAudio(false);
    }, 240);
  };

  const handlePreviewAudioCandidate = (cand: AudioCandidate) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    const audio = new Audio(cand.audioUrl);
    previewAudioRef.current = audio;
    setPlayingAudioId(cand.id);
    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => setPlayingAudioId(null);
    void audio.play().catch(() => setPlayingAudioId(null));
  };

  const handleSelectAudioCandidate = (cand: AudioCandidate) => {
    const label = lang === 'zh' ? cand.labelZh : cand.labelEn;
    updateActiveState((slot) => ({
      ...slot,
      audioUrl: cand.audioUrl,
      audioFileName: `${asset.name} · ${label}`,
      selectedAudioCandidateId: cand.id,
    }));
    setOpenAiChannel(null);
  };

  // Real Local Uploads
  const handleVisualUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const input=event.target;
    const objectUrl = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    updateActiveState((slot) => ({
      ...slot,
      mediaKind: kind,
      mediaUrl: objectUrl,
      mediaFileName: file.name,
      selectedCandidateId: null,
    }));
    setOpenAiChannel(null);
    event.target.value = '';
  };

  const handleAudioUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const input=event.target;
    const objectUrl = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
    updateActiveState((slot) => ({
      ...slot,
      audioUrl: objectUrl,
      audioFileName: file.name,
      selectedAudioCandidateId: null,
    }));
    setOpenAiChannel(null);
    event.target.value = '';
  };

  // Multi-State Slot Handlers (Characters & Objects)
  const handleAddStateSlot = () => {
    const nextNum = asset.states.length + 1;
    const defaultLabel = `${ed.newStateDefault} ${nextNum}`;
    const nextSlot = createAssetStateSlot(
      defaultLabel,
      `${asset.name} ${defaultLabel}`,
      asset.categoryId,
      nextNum,
    );

    onUpdateAsset(asset.id, (prev) => ({
      ...prev,
      states: [...prev.states, nextSlot],
      activeStateId: nextSlot.id,
    }));
    setRenamingStateId(nextSlot.id);
    setStateDraftName(defaultLabel);
  };

  const handleCommitStateRename = (stateId: string) => {
    const trimmed = stateDraftName.trim();
    if (trimmed) {
      onUpdateAsset(asset.id, (prev) => ({
        ...prev,
        states: prev.states.map((s) => (s.id === stateId ? { ...s, name: trimmed } : s)),
      }));
    }
    setRenamingStateId(null);
  };

  const handleDeleteStateSlot = (stateId: string) => {
    if (asset.states.length <= 1) return;
    onUpdateAsset(asset.id, (prev) => {
      const remaining = prev.states.filter((s) => s.id !== stateId);
      const nextActive =
        prev.activeStateId === stateId ? remaining[0].id : prev.activeStateId;
      return {
        ...prev,
        states: remaining,
        activeStateId: nextActive,
      };
    });
  };

  const handleSetInterfaceMode = (mode: InterfaceMode) => {
    setOpenAiChannel(null);
    onUpdateAsset(asset.id, (prev) => ({
      ...prev,
      interfaceMode: mode,
      typography:
        mode === 'text' && !prev.typography
          ? createDefaultTypography(prev.name, lang)
          : prev.typography,
    }));
  };

  const updateTypography = (patch: Partial<InterfaceTypography>) => {
    onUpdateAsset(asset.id, (prev) => ({
      ...prev,
      typography: {
        ...(prev.typography ?? createDefaultTypography(prev.name, lang)),
        ...patch,
      },
    }));
  };

  const isInterfaceTextMode =
    categoryMeta.supportsInterfaceModes && interfaceMode === 'text';

  const typography: InterfaceTypography | null = isInterfaceTextMode
    ? (asset.typography ?? createDefaultTypography(asset.name, lang))
    : null;

  const revealMode = typography?.revealMode ?? 'instant';
  const typewriterSpeed = typography?.typewriterSpeed ?? 20;

  const propertyTypeLabel = (vt: StateVariableType) => {
    switch (vt) {
      case 'number':
        return st.typeNumber;
      case 'boolean':
        return st.typeBoolean;
      case 'text':
        return st.typeText;
      case 'choice':
        return st.typeChoice;
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-label={asset.name}
        style={{ left: `${leftOffsetPx}px` }}
        className="absolute top-3 bottom-3 z-50 w-[372px] max-w-[calc(100%-24px)] bg-white border border-[#E2E8F0] rounded-2xl shadow-xl flex flex-col overflow-hidden"
      >
        {/* Hidden Real Local File Inputs */}
        <input
          ref={visualInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleVisualUpload}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleAudioUpload}
        />

        {/* Drawer Header: Title + Top Dual Tabs (Looks & Audio | Properties) */}
        <div className="px-4 py-3 border-b border-[#E2E8F0] space-y-2.5 shrink-0">
          {onSaveDraft && <div>
            <h2 className="text-sm font-bold text-[#14244B]">{lang === 'zh' ? '保存为新素材' : 'Save as new asset'}</h2>
            <p className="text-xs text-slate-600 mt-1">{lang === 'zh' ? '确认后，选中的舞台对象会使用这个素材，并继续沿用原有规则。' : 'Save to use this asset on the selected stage object and keep its existing rule.'}</p>
          </div>}
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              value={asset.name}
              onChange={(e) =>
                onUpdateAsset(asset.id, (prev) => ({ ...prev, name: e.target.value }))
              }
              aria-label="Asset name"
              className="min-w-0 flex-1 font-display font-bold text-base text-[#14244B] bg-transparent hover:bg-[#F8FAFC] focus:bg-[#F8FAFC] border border-transparent focus:border-[#CBD5E1] rounded-lg px-1.5 py-0.5 -ml-1.5 focus:outline-none transition-colors truncate"
            />

            <div className="flex items-center gap-1 shrink-0">
              {!onSaveDraft && <button
                type="button"
                onClick={() => onDeleteAsset(asset.id)}
                title={ed.deleteAsset}
                aria-label={ed.deleteAsset}
                className="w-8 h-8 rounded-lg text-[#64748B] hover:text-[#E11D48] hover:bg-[#FFF1F2] flex items-center justify-center transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>}
              <button
                type="button"
                onClick={onClose}
                title={ed.close}
                aria-label={ed.close}
                className="w-8 h-8 rounded-lg text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Dual Top Tabs for Characters, Objects, Backgrounds when Properties are unlocked */}
          {showPropertiesTab && (
            <div
              role="tablist"
              className="grid grid-cols-2 gap-1 p-0.5 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={effectiveTab === 'looks'}
                onClick={() => onChangeTab('looks')}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  effectiveTab === 'looks'
                    ? 'bg-white text-[#14244B] shadow-xs'
                    : 'text-[#64748B] hover:text-[#14244B]'
                }`}
              >
                <Palette className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{ed.tabLooksAudio}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={effectiveTab === 'properties'}
                onClick={() => onChangeTab('properties')}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  effectiveTab === 'properties'
                    ? 'bg-white text-[#14244B] shadow-xs'
                    : 'text-[#64748B] hover:text-[#14244B]'
                }`}
              >
                <Database className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{ed.tabProperties}</span>
                {properties.length > 0 && (
                  <span className="font-mono text-[11px] tabular-nums opacity-70">
                    {properties.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Editor Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {effectiveTab === 'properties' ? (
            /* ============================================================
               TAB 2: ASSET-LEVEL PROPERTIES (Whole-asset state variables)
               ============================================================ */
            <section className="space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Database
                    className="w-3.5 h-3.5 text-[#14244B] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-semibold text-[#14244B] truncate">
                    {ed.tabProperties}
                  </span>
                  <div className="relative group inline-flex items-center shrink-0">
                    <button
                      type="button"
                      aria-label={ed.propertiesHint}
                      className="w-5 h-5 rounded-full text-[#94A3B8] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center transition-colors cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4E9AE3]"
                    >
                      <Info className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <div
                      role="tooltip"
                      className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-0 top-full mt-1.5 z-30 w-56 px-2.5 py-2 rounded-lg bg-[#14244B] text-white text-[11px] leading-relaxed font-normal shadow-[0_10px_24px_rgba(15,23,42,0.22)]"
                    >
                      {ed.propertiesHint}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPropertyModal({ mode: 'add' })}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#14244B] hover:bg-[#1E3468] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{ed.addPropertyBtn}</span>
                </button>
              </div>

              {!!availableStageParameters.length && <label className="grid gap-1 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-[#14244B]">
                {lang === 'zh' ? '添加玩法默认值' : 'Add a gameplay default'}
                <select value="" className="w-full rounded border border-slate-300 px-2 py-1.5" onChange={event => {
                  const parameter = availableStageParameters.find(item => item.id === event.target.value);
                  if (!parameter) return;
                  const variable = createStageParameterProperty(parameter, properties);
                  setPropertyModal({ mode: 'add', variable });
                }}>
                  <option value="">{lang === 'zh' ? '选择设计板参数' : 'Select a board parameter'}</option>
                  {availableStageParameters.map(parameter => <option key={parameter.id} value={parameter.id}>{parameter.name}</option>)}
                </select>
              </label>}
              {asset.stagePreset && !stageParameters?.length && <p className="text-xs text-slate-600">
                {lang === 'zh' ? '在 Design Board 的挑战卡上开放玩法参数后，就可以在这里为素材设置默认值。' : 'Expose a parameter on the Challenge card in Design Board to set its default for this asset.'}
              </p>}
              {properties.length === 0 ? (
                <div className="px-4 py-8 rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-center">
                  <p className="text-xs text-[#64748B]">{ed.emptyProperties}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {properties.map((variable) => {
                    const rangeHint = formatNumberRangeHint(variable);
                    const rawPlay =
                      variable.id in playValues
                        ? playValues[variable.id]
                        : variable.initialValue;
                    const playValue = coerceVariableValue(variable, rawPlay);
                    const isDirty = !areVariableValuesEqual(
                      variable.type,
                      playValue,
                      variable.initialValue,
                    );
                    const isHighlighted = highlightPropertyId === variable.id;

                    return (
                      <div
                        key={variable.id}
                        className={`p-3 rounded-xl border transition-all space-y-1.5 ${
                          isHighlighted
                            ? 'bg-[#F0F9FF] border-[#4E9AE3] ring-2 ring-[#4E9AE3]/35'
                            : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#CBD5E1]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[#14244B] truncate">
                              {variable.name}
                            </div>
                            <div className="text-[11px] text-[#64748B] flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span>{propertyTypeLabel(variable.type)}</span>
                              {variable.stageParameterId && <span className="text-[#1D4ED8] font-semibold">
                                {lang === 'zh' ? '舞台默认值' : 'Stage default'}
                              </span>}
                              {rangeHint && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">
                                    {rangeHint}
                                  </span>
                                </>
                              )}
                              {variable.type === 'choice' && variable.options && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">
                                    {variable.options.length} {st.choicesCount}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPropertyModal({ mode: 'edit', variable })}
                              title={st.editProp}
                              aria-label={st.editProp}
                              className="w-7 h-7 rounded-lg text-[#64748B] hover:text-[#14244B] hover:bg-white flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteProperty(asset.id, variable.id)}
                              title={st.deleteProp}
                              aria-label={st.deleteProp}
                              className="w-7 h-7 rounded-lg text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#E2E8F0]/80 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[11px] text-[#64748B] shrink-0">
                              {variable.stageParameterId ? (lang === 'zh' ? '默认值' : 'Default') : st.colInitial}
                            </span>
                            <span className="font-mono font-bold tabular-nums text-[#14244B] truncate">
                              {formatVariableValue(variable, variable.initialValue, lang)}
                            </span>
                          </div>

                          {isDirty && (
                            <div className="flex items-center gap-1 text-[11px] text-[#B45309] font-semibold shrink-0">
                              <span>{ed.playOverrideTag}:</span>
                              <span className="font-mono tabular-nums">
                                {formatVariableValue(variable, playValue, lang)}
                              </span>
                            </div>
                          )}
                        </div>

                        {variable.description && (
                          <p className="text-[11px] text-[#64748B] leading-snug">
                            {variable.description}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {!onSaveDraft && <button
                    type="button"
                    onClick={onOpenStateManager}
                    className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#CBD5E1] bg-white hover:border-[#14244B] text-xs font-semibold text-[#14244B] transition-colors cursor-pointer"
                  >
                    <span>{ed.openInStateManager}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>}
                </div>
              )}
            </section>
          ) : (
            /* ============================================================
               TAB 1: VISUAL & AUDIO (Color-coded State Folder Pages)
               ============================================================ */
            <div className={categoryMeta.supportsStates ? 'space-y-2' : 'space-y-5'}>
              {categoryMeta.supportsStates && (
                /* States Header */
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#14244B]">
                  <Shapes
                    className="w-3.5 h-3.5 text-[#14244B] shrink-0"
                    aria-hidden="true"
                  />
                  <span>{ed.statesLabel}</span>
                </div>
              )}

              <div>
                {categoryMeta.supportsStates && (
                  /* Color-Coded Folder Tabs Strip */
                  <div
                    role="tablist"
                    aria-label={ed.statesLabel}
                    className="relative z-10 flex items-end flex-wrap gap-1 px-2.5 -mb-[1px]"
                  >
                    {asset.states.map((slot, idx) => {
                      const isActive = slot.id === activeState.id;
                      const isRenaming = renamingStateId === slot.id;
                      const theme = STATE_TAB_THEMES[idx % STATE_TAB_THEMES.length];

                      return (
                        <div
                          key={slot.id}
                          role="tab"
                          aria-selected={isActive}
                          style={{
                            backgroundColor: theme.tabBg,
                            borderColor: theme.borderColor,
                          }}
                          className={`relative inline-flex items-center rounded-t-xl border border-b-0 transition-all shrink-0 ${
                            isActive
                              ? 'z-10 px-1.5 pt-1.5 pb-2 shadow-[0_-2px_6px_rgba(15,23,42,0.06)]'
                              : 'z-0 mb-[1px] opacity-90 hover:opacity-100'
                          }`}
                        >
                          {isActive ? (
                            <div className="inline-flex items-center gap-0.5 bg-white text-[#14244B] rounded-md border border-[#14244B]/15 px-1.5 py-0.5 shadow-2xs">
                              {isRenaming ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={stateDraftName}
                                  onChange={(e) => setStateDraftName(e.target.value)}
                                  onBlur={() => handleCommitStateRename(slot.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCommitStateRename(slot.id);
                                    if (e.key === 'Escape') setRenamingStateId(null);
                                  }}
                                  className="w-20 px-1 py-0 text-xs font-semibold text-[#14244B] bg-white rounded focus:outline-none"
                                />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onDoubleClick={() => {
                                      setRenamingStateId(slot.id);
                                      setStateDraftName(slot.name);
                                    }}
                                    className="px-0.5 text-xs font-semibold text-[#14244B] whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    {slot.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRenamingStateId(slot.id);
                                      setStateDraftName(slot.name);
                                    }}
                                    title={ed.renameState}
                                    aria-label={ed.renameState}
                                    className="w-4 h-4 rounded text-[#64748B] hover:text-[#14244B] hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
                                  >
                                    <Pencil className="w-2.5 h-2.5" aria-hidden="true" />
                                  </button>
                                  {asset.states.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStateSlot(slot.id)}
                                      title={ed.deleteState}
                                      aria-label={ed.deleteState}
                                      className="w-4 h-4 rounded text-[#64748B] hover:text-[#E11D48] hover:bg-[#FFF1F2] flex items-center justify-center cursor-pointer"
                                    >
                                      <X className="w-2.5 h-2.5" aria-hidden="true" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateAsset(asset.id, (prev) => ({
                                  ...prev,
                                  activeStateId: slot.id,
                                }))
                              }
                              className="px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {slot.name}
                            </button>
                          )}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={handleAddStateSlot}
                      title={ed.addStateTitle}
                      aria-label={ed.addStateBtn}
                      className="w-7 h-7 mb-1.5 ml-0.5 rounded-lg border border-dashed border-[#CBD5E1] text-[#64748B] hover:text-[#14244B] hover:border-[#14244B] hover:bg-[#F8FAFC] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}

                {/* Folder Frame (colored when multi-state, flat clean container otherwise) */}
                <div
                  style={
                    categoryMeta.supportsStates
                      ? {
                          backgroundColor: activeStateTheme.frameBg,
                          borderColor: activeStateTheme.borderColor,
                        }
                      : undefined
                  }
                  className={
                    categoryMeta.supportsStates
                      ? 'rounded-2xl border p-2 transition-colors duration-200 shadow-xs'
                      : ''
                  }
                >
                <div
                  className={
                    categoryMeta.supportsStates
                      ? 'bg-white rounded-xl border border-[#14244B]/12 p-3.5 space-y-5'
                      : 'space-y-5'
                  }
                >
                  {/* ============================================================
                      SECTION 1: VISUAL (or Interface "Visual Type": Text | Image)
                     ============================================================ */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#14244B]">
              {categoryMeta.supportsInterfaceModes ? (
                isInterfaceTextMode ? (
                  <Type className="w-3.5 h-3.5 text-[#14244B] shrink-0" aria-hidden="true" />
                ) : (
                  <ImageIcon
                    className="w-3.5 h-3.5 text-[#14244B] shrink-0"
                    aria-hidden="true"
                  />
                )
              ) : (
                <ImageIcon
                  className="w-3.5 h-3.5 text-[#14244B] shrink-0"
                  aria-hidden="true"
                />
              )}
              <span>
                {categoryMeta.supportsInterfaceModes
                  ? ed.visualTypeSection
                  : ed.visualSection}
              </span>
            </span>

            {categoryMeta.supportsInterfaceModes && (
              <div className="inline-flex items-center p-0.5 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => handleSetInterfaceMode('text')}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    interfaceMode === 'text'
                      ? 'bg-white text-[#14244B] shadow-xs'
                      : 'text-[#64748B] hover:text-[#14244B]'
                  }`}
                >
                  {ed.interfaceModeText}
                </button>
                <button
                  type="button"
                  onClick={() => handleSetInterfaceMode('image')}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    interfaceMode === 'image'
                      ? 'bg-white text-[#14244B] shadow-xs'
                      : 'text-[#64748B] hover:text-[#14244B]'
                  }`}
                >
                  {ed.interfaceModeImage}
                </button>
              </div>
            )}
          </div>

          {/* Live WYSIWYG Preview Box */}
          <div
            className={`rounded-xl border border-[#E2E8F0] overflow-hidden ${
              typography?.textColor === '#FFFFFF'
                ? 'bg-[#14244B]'
                : 'bg-[#F8FAFC] studio-dot-grid'
            }`}
          >
            {isInterfaceTextMode && typography ? (
              <EffectedTextPreview
                lang={lang}
                typography={typography}
                fallbackText={asset.name}
                effects={activeState.visualEffects}
                replayNonce={dynamicReplayNonce}
              />
            ) : (
              <EffectedMediaPreview
                lang={lang}
                mediaKind={activeState.mediaKind}
                mediaUrl={activeState.mediaUrl}
                alt={asset.name}
                effects={activeState.visualEffects}
                replayNonce={dynamicReplayNonce}
              />
            )}
          </div>

          {/* Unified AI Generate & Upload Bar below Preview (All visual cards & Interface Image mode) */}
          {!isInterfaceTextMode && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setOpenAiChannel((prev) => (prev === 'visual' ? null : 'visual'))
                }
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  openAiChannel === 'visual'
                    ? 'bg-[#14244B] text-white border-[#14244B]'
                    : 'bg-white text-[#334155] border-[#CBD5E1] hover:border-[#14244B] hover:text-[#14244B]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{ed.aiGenerate}</span>
              </button>
              <button
                type="button"
                onClick={() => visualInputRef.current?.click()}
                title={ed.uploadVisualTitle}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-[#CBD5E1] bg-white text-[#334155] hover:border-[#14244B] hover:text-[#14244B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{ed.upload}</span>
              </button>
            </div>
          )}

          {/* Interface Text Mode: Typography Controls (Font + B / I / U + Size + Color) */}
          {isInterfaceTextMode && typography && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-[#64748B]">
                  {ed.textContent}
                </label>
                <input
                  type="text"
                  value={typography.text}
                  onChange={(e) => updateTypography({ text: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#4E9AE3]"
                />
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2.5 items-end">
                <div className="space-y-1 min-w-0">
                  <label className="block text-[11px] font-medium text-[#64748B]">
                    {ed.fontFamily}
                  </label>
                  <select
                    value={typography.fontId}
                    onChange={(e) =>
                      updateTypography({ fontId: e.target.value as InterfaceFontId })
                    }
                    className="w-full px-2 py-1.5 text-xs text-[#14244B] bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#4E9AE3]"
                  >
                    {(Object.keys(INTERFACE_FONT_MAP) as InterfaceFontId[]).map((fid) => (
                      <option key={fid} value={fid}>
                        {lang === 'zh'
                          ? INTERFACE_FONT_MAP[fid].labelZh
                          : INTERFACE_FONT_MAP[fid].labelEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 shrink-0">
                  <div className="text-[11px] font-medium text-[#64748B]">{ed.fontStyle}</div>
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        updateTypography({
                          fontWeight: typography.fontWeight === 700 ? 500 : 700,
                        })
                      }
                      aria-pressed={typography.fontWeight === 700}
                      title={ed.weightBold}
                      aria-label={ed.weightBold}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                        typography.fontWeight === 700
                          ? 'bg-[#14244B] text-white border-[#14244B]'
                          : 'bg-[#F8FAFC] text-[#475569] border-[#CBD5E1] hover:text-[#14244B]'
                      }`}
                    >
                      <Bold className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateTypography({ italic: !typography.italic })}
                      aria-pressed={typography.italic}
                      title={ed.italic}
                      aria-label={ed.italic}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                        typography.italic
                          ? 'bg-[#14244B] text-white border-[#14244B]'
                          : 'bg-[#F8FAFC] text-[#475569] border-[#CBD5E1] hover:text-[#14244B]'
                      }`}
                    >
                      <Italic className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateTypography({ underline: !typography.underline })
                      }
                      aria-pressed={typography.underline}
                      title={ed.underline}
                      aria-label={ed.underline}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                        typography.underline
                          ? 'bg-[#14244B] text-white border-[#14244B]'
                          : 'bg-[#F8FAFC] text-[#475569] border-[#CBD5E1] hover:text-[#14244B]'
                      }`}
                    >
                      <Underline className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[#64748B]">{ed.fontSize}</span>
                  <span className="font-mono tabular-nums text-[#14244B] font-semibold">
                    {typography.fontSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={44}
                  value={typography.fontSize}
                  onChange={(e) => updateTypography({ fontSize: Number(e.target.value) })}
                  className="w-full accent-[#14244B] cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-[#64748B]">{ed.textColor}</div>
                <div className="flex items-center gap-1.5">
                  {TEXT_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => updateTypography({ textColor: hex })}
                      style={{ backgroundColor: hex }}
                      aria-label={hex}
                      className={`w-6 h-6 rounded-md border cursor-pointer transition-transform ${
                        typography.textColor.toLowerCase() === hex.toLowerCase()
                          ? 'ring-2 ring-[#4E9AE3] ring-offset-1 border-[#14244B]/30 scale-105'
                          : 'border-[#CBD5E1]'
                      }`}
                    />
                  ))}
                  <input
                    type="color"
                    value={typography.textColor}
                    onChange={(e) => updateTypography({ textColor: e.target.value })}
                    aria-label={ed.textColor}
                    className="w-6 h-6 rounded border border-[#CBD5E1] cursor-pointer bg-transparent p-0"
                  />
                </div>
              </div>

              {/* Text Reveal: Instant | Typewriter (+ Speed slider when Typewriter) */}
              <div className="pt-2.5 border-t border-[#E2E8F0] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[#64748B]">
                    {ed.textReveal}
                  </span>
                  <div className="inline-flex items-center p-0.5 bg-[#F1F5F9] rounded-lg border border-[#E2E8F0]">
                    <button
                      type="button"
                      onClick={() => updateTypography({ revealMode: 'instant' })}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        revealMode === 'instant'
                          ? 'bg-white text-[#14244B] shadow-xs'
                          : 'text-[#64748B] hover:text-[#14244B]'
                      }`}
                    >
                      {ed.revealInstant}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateTypography({
                          revealMode: 'typewriter',
                          typewriterSpeed: typography.typewriterSpeed ?? 20,
                        });
                        setDynamicReplayNonce((n) => n + 1);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        revealMode === 'typewriter'
                          ? 'bg-white text-[#14244B] shadow-xs'
                          : 'text-[#64748B] hover:text-[#14244B]'
                      }`}
                    >
                      {ed.revealTypewriter}
                    </button>
                  </div>
                </div>

                {revealMode === 'typewriter' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-[#64748B]">
                        {ed.typewriterSpeed}
                      </span>
                      <span className="font-mono tabular-nums text-[#14244B] font-semibold">
                        {typewriterSpeed} {ed.charsPerSec}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={60}
                      step={1}
                      value={typewriterSpeed}
                      onChange={(e) =>
                        updateTypography({ typewriterSpeed: Number(e.target.value) })
                      }
                      className="w-full accent-[#14244B] cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* On-Demand Visual AI Drawer (Clean: prompt + Generate -> 3 options, no 1/2/3 selector) */}
          {!isInterfaceTextMode && openAiChannel === 'visual' && (
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={activeState.prompt}
                  onChange={(e) =>
                    updateActiveState((slot) => ({ ...slot, prompt: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerateVisual();
                  }}
                  placeholder={ed.promptPlaceholder}
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs text-[#14244B] bg-white border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#4E9AE3]"
                />
                <button
                  type="button"
                  onClick={handleGenerateVisual}
                  disabled={isGeneratingVisual}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#14244B] hover:bg-[#1E3366] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isGeneratingVisual ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{isGeneratingVisual ? ed.generatingBtn : ed.generateBtn}</span>
                </button>
              </div>

              {activeState.candidates.length > 0 && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="text-[11px] text-[#64748B]">{ed.pickLook}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {activeState.candidates.map((cand) => {
                      const isSelected =
                        activeState.mediaKind === 'generated' &&
                        activeState.selectedCandidateId === cand.id;
                      return (
                        <button
                          key={cand.id}
                          type="button"
                          onClick={() =>
                            handleSelectVisualCandidate(cand.id, cand.previewUrl)
                          }
                          className={`rounded-xl border p-1.5 bg-white transition-all cursor-pointer text-left ${
                            isSelected
                              ? 'border-[#14244B] ring-1 ring-[#14244B]'
                              : 'border-[#E2E8F0] hover:border-[#94A3B8]'
                          }`}
                        >
                          <div className="aspect-square rounded-lg overflow-hidden bg-[#F8FAFC] flex items-center justify-center">
                            <img
                              src={cand.previewUrl}
                              alt={lang === 'zh' ? cand.styleLabelZh : cand.styleLabelEn}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-1 px-0.5">
                            <span className="text-[10px] font-medium text-[#475569] truncate">
                              {lang === 'zh' ? cand.styleLabelZh : cand.styleLabelEn}
                            </span>
                            {isSelected && (
                              <Check
                                className="w-3 h-3 text-[#14244B] shrink-0"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {asset.categoryId==='interface' && <section className="p-4 rounded-xl bg-sky-50 border border-sky-200 space-y-3">
            <h3 className="font-bold">{lang==='zh'?'显示数据 · 随游戏更新':'Display data · Live during play'}</h3>
            <p className="text-xs text-slate-600">{lang==='zh'?'预览使用开局值，运行时显示当前值。这里不修改属性。':'Preview uses the starting value; Play shows the current value. This display does not change the property.'}</p>
            <label className="block text-sm">{lang==='zh'?'读取哪个属性':'Read property'}<select className="w-full bg-white border rounded p-2" value={asset.displayBinding?.variableId??''} onChange={e=>onUpdateAsset(asset.id,a=>({...a,displayBinding:{style:'bar',max:100,x:5,y:5,color:'#22c55e',...a.displayBinding,variableId:e.target.value}}))}><option value="">{lang==='zh'?'不绑定':'Not bound'}</option>{scopedVariables.map(v=><option key={v.variable.id} value={v.variable.id}>{v.fullKey}</option>)}</select></label>
            {asset.displayBinding && <>
            <label className="block text-sm">{lang==='zh'?'显示方式':'Display style'}<select className="w-full bg-white border rounded p-2" value={asset.displayBinding.style} onChange={e=>onUpdateAsset(asset.id,a=>({...a,displayBinding:{...a.displayBinding!,style:e.target.value as 'bar'|'text'}}))}><option value="bar">{lang==='zh'?'血条 / 进度条':'Bar'}</option><option value="text">{lang==='zh'?'数字 / 文字':'Text'}</option></select></label>
            {(['max','x','y'] as const).map(key=><label key={key} className="block text-sm">{key==='max'?(lang==='zh'?'满格值':'Full bar value'):key==='x'?(lang==='zh'?'水平位置（%）':'Horizontal position (%)'):(lang==='zh'?'垂直位置（%）':'Vertical position (%)')}<input type="number" min={key==='max'?1:0} max={key==='max'?undefined:80} value={asset.displayBinding![key]} className="w-full border rounded p-2" onChange={e=>onUpdateAsset(asset.id,a=>({...a,displayBinding:{...a.displayBinding!,[key]:key==='max'?Math.max(1,Number(e.target.value)||1):Math.max(0,Math.min(80,Number(e.target.value)||0))}}))}/></label>)}
            </>}
          </section>}
          <p className="text-xs text-slate-500">{lang==='zh'?'这里编辑默认外观。运行中的特效请添加「视觉变化」Outcome。':'Edit the default appearance here. Add a Visual outcome for effects during play.'}</p>
        </section>

        {/* ============================================================
            SECTION 2: AUDIO (WYSIWYG Sealed Lock until unlocked by intent)
           ============================================================ */}
        <section className="space-y-3 pt-4 border-t border-[#E2E8F0]">
          {!audioUnlocked ? (
            <div
              aria-disabled="true"
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9] text-[#94A3B8] cursor-default"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Volume2 className="w-3.5 h-3.5 text-[#CBD5E1] shrink-0" aria-hidden="true" />
                <span className="text-xs font-medium text-[#94A3B8]">
                  {ed.audioSection}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-[11px] text-[#94A3B8]">
                <Lock className="w-3 h-3" aria-hidden="true" />
                <span className="whitespace-nowrap">{t.lockedLabel}</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#14244B]">
                  <Volume2
                    className="w-3.5 h-3.5 text-[#14244B] shrink-0"
                    aria-hidden="true"
                  />
                  <span>{ed.audioSection}</span>
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenAiChannel((prev) => (prev === 'audio' ? null : 'audio'))
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      openAiChannel === 'audio'
                        ? 'bg-[#14244B] text-white border-[#14244B]'
                        : 'bg-white text-[#334155] border-[#CBD5E1] hover:border-[#14244B] hover:text-[#14244B]'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                    <span>{ed.aiGenerate}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    title={ed.uploadAudioTitle}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-[#CBD5E1] bg-white text-[#334155] hover:border-[#14244B] hover:text-[#14244B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" aria-hidden="true" />
                    <span>{ed.upload}</span>
                  </button>
                </div>
              </div>

              {activeState.audioUrl && (
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Volume2
                        className="w-3.5 h-3.5 text-[#4E9AE3] shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-xs font-medium text-[#14244B] truncate">
                        {activeState.audioFileName || ed.audioAttached}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveState((slot) => ({
                          ...slot,
                          audioUrl: undefined,
                          audioFileName: undefined,
                          selectedAudioCandidateId: null,
                        }))
                      }
                      title={ed.removeAudio}
                      aria-label={ed.removeAudio}
                      className="w-6 h-6 rounded text-[#64748B] hover:text-[#E11D48] flex items-center justify-center cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <audio src={activeState.audioUrl} controls className="w-full h-8" />
                </div>
              )}

              {openAiChannel === 'audio' && (
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={activeState.audioPrompt}
                      onChange={(e) =>
                        updateActiveState((slot) => ({
                          ...slot,
                          audioPrompt: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleGenerateAudio();
                      }}
                      placeholder={ed.audioPromptPlaceholder}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs text-[#14244B] bg-white border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#4E9AE3]"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateAudio}
                      disabled={isGeneratingAudio}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#14244B] hover:bg-[#1E3366] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isGeneratingAudio ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      <span>{isGeneratingAudio ? ed.generatingBtn : ed.generateBtn}</span>
                    </button>
                  </div>

                  {activeState.audioCandidates.length > 0 && (
                    <div className="space-y-1.5 pt-0.5">
                      <div className="text-[11px] text-[#64748B]">{ed.pickSound}</div>
                      <div className="space-y-1.5">
                        {activeState.audioCandidates.map((cand) => {
                          const isSelected =
                            activeState.selectedAudioCandidateId === cand.id;
                          const isPlaying = playingAudioId === cand.id;
                          return (
                            <div
                              key={cand.id}
                              className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border bg-white ${
                                isSelected
                                  ? 'border-[#14244B] ring-1 ring-[#14244B]'
                                  : 'border-[#E2E8F0]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handlePreviewAudioCandidate(cand)}
                                  title={ed.playPreview}
                                  aria-label={ed.playPreview}
                                  className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                                    isPlaying
                                      ? 'bg-[#4E9AE3] text-white'
                                      : 'bg-[#F1F5F9] text-[#14244B] hover:bg-[#E2E8F0]'
                                  }`}
                                >
                                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-[#14244B] truncate">
                                    {lang === 'zh' ? cand.labelZh : cand.labelEn}
                                  </div>
                                  <div className="text-[10px] font-mono tabular-nums text-[#94A3B8]">
                                    {cand.durationSec.toFixed(2)}s
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleSelectAudioCandidate(cand)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-[#F1F5F9] hover:bg-[#14244B] text-[#14244B] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                {isSelected && (
                                  <Check className="w-3 h-3" aria-hidden="true" />
                                )}
                                <span>{ed.applyAudio}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        {onSaveDraft && <div className="shrink-0 border-t border-[#E2E8F0] px-4 py-3">
          {draftError && <p className="mb-2 text-xs text-red-700" role="alert">{draftError}</p>}
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {lang === 'zh' ? '取消' : 'Cancel'}
            </button>
            <button type="button" onClick={onSaveDraft} disabled={!asset.name.trim()}
              className="rounded-lg bg-[#14244B] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {lang === 'zh' ? '保存并应用' : 'Save and apply'}
            </button>
          </div>
        </div>}
      </div>

      {propertyModal && (
        <PropertyEditorModal
          lang={lang}
          scopeLabel={asset.name}
          initialVariable={propertyModal.variable}
          existingNames={properties.map((p) => p.name)}
          onClose={() => setPropertyModal(null)}
          onSave={(variable) => {
            if (propertyModal.mode === 'add') {
              onAddProperty(asset.id, variable);
            } else {
              onUpdateProperty(asset.id, variable);
            }
            setPropertyModal(null);
          }}
        />
      )}
    </>
  );
}
